const express = require('express');
const cors = require('cors');
const path = require('path');
const { readDB, writeDB } = require('./db');
const { sendPriceUpdateNotification } = require('./fcm');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// --- SPICES API ---
app.get('/api/spices', (req, res) => {
  try {
    const db = readDB();
    res.json(db.spices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/spices/:id', async (req, res) => {
  try {
    const db = readDB();
    const { price } = req.body;
    const id = parseInt(req.params.id);
    const spice = db.spices.find(s => s.id === id);
    if (spice) {
      const oldPrice = spice.price;      // capture before overwriting
      spice.price = price;
      writeDB(db);

      // Fire-and-forget: push notification to all 'retailers' topic subscribers.
      // sendPriceUpdateNotification never throws — failures are logged internally.
      sendPriceUpdateNotification(spice, oldPrice);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- RETAILERS API ---
app.get('/api/retailers', (req, res) => {
  try {
    const db = readDB();
    res.json(db.retailers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/retailers', (req, res) => {
  try {
    const db = readDB();
    const { initials, name, city, phone, password } = req.body;
    const newRetailer = {
      id: db.retailers.length > 0 ? Math.max(...db.retailers.map(r => r.id)) + 1 : 1,
      initials, name, city, phone, password: password || '', orders: 0, outstanding: 0, last_order: 'Never'
    };
    db.retailers.push(newRetailer);
    writeDB(db);
    res.json({ id: newRetailer.id, success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Completely purge a retailer and scrub all associated data (orders, messages, logs) to prevent orphan records
app.delete('/api/retailers/:id', (req, res) => {
  try {
    const db = readDB();
    const id = parseInt(req.params.id);
    
    // Find the retailer first to get their exact name for scrub matches
    const retailerIndex = db.retailers.findIndex(r => r.id === id);
    if (retailerIndex === -1) {
      return res.status(404).json({ success: false, message: 'Retailer not found' });
    }
    
    const retailer = db.retailers[retailerIndex];
    const rName = retailer.name; // exact full name, e.g. "Ramesh Sharma"
    
    // Also parse owner name and shop name just in case there are variations
    const ownerMatch = rName.match(/\(([^)]+)\)$/);
    const ownerName = ownerMatch ? ownerMatch[1].trim() : '';
    const shopName = ownerMatch ? rName.replace(ownerMatch[0], '').trim() : '';

    // 1. Delete the retailer document
    db.retailers.splice(retailerIndex, 1);
    
    // 2. WIPE all orders associated with this retailer's names
    db.orders = db.orders.filter(o => {
      const oName = (o.retailer_name || '').toLowerCase();
      const match = oName.includes(rName.toLowerCase()) || 
                    (ownerName && oName.includes(ownerName.toLowerCase())) ||
                    (shopName && oName.includes(shopName.toLowerCase()));
      return !match;
    });

    // 3. WIPE all messages (sent or received) associated with this retailer name
    db.messages = db.messages.filter(m => {
      const mName = (m.retailer_name || '').toLowerCase();
      const match = mName.includes(rName.toLowerCase()) ||
                    (ownerName && mName.includes(ownerName.toLowerCase())) ||
                    (shopName && mName.includes(shopName.toLowerCase()));
      return !match;
    });

    // 4. Save clean database back to disk
    writeDB(db);
    
    res.json({ success: true, message: 'Retailer and all associated data scrubbed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update retailer password after registration
app.put('/api/retailers/:id/password', (req, res) => {
  try {
    const db = readDB();
    const id = parseInt(req.params.id);
    const { password } = req.body;
    const retailer = db.retailers.find(r => r.id === id);
    if (retailer) { retailer.password = password; writeDB(db); }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login with name + password
app.post('/api/login', (req, res) => {
  try {
    const db = readDB();
    const { name, password } = req.body;
    const retailer = db.retailers.find(r =>
      r.name.toLowerCase().includes(name.toLowerCase()) && r.password === password
    );
    if (retailer) {
      // Parse shop name out of the stored "Shop Name (Owner Name)" format
      const shopMatch = retailer.name.match(/^(.+?)\s*\(/);
      const shopName = shopMatch ? shopMatch[1].trim() : retailer.name;
      res.json({
        success: true,
        role: 'retailer',
        id: retailer.id,
        name: retailer.name.replace(/\s*\(.*\)$/, '').trim() || retailer.name, // owner name
        shop: shopName,
        city: retailer.city || '',
        phone: retailer.phone || ''
      });
    } else {
      res.status(401).json({ success: false, message: 'Invalid name or password' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- ORDERS API ---
app.get('/api/orders', (req, res) => {
  try {
    const db = readDB();
    res.json(db.orders.slice().reverse()); // return descending
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders', (req, res) => {
  try {
    const db = readDB();
    const { order_id, retailer_name, city, product_details, amount, status, date, time } = req.body;
    const newOrder = {
      id: db.orders.length > 0 ? Math.max(...db.orders.map(o => o.id)) + 1 : 1,
      order_id, retailer_name, city, product_details, amount, status, date, time
    };
    db.orders.push(newOrder);
    
    const ret = db.retailers.find(r => r.name === retailer_name);
    if (ret) {
      ret.orders += 1;
      ret.last_order = date;
    }
    writeDB(db);
    res.json({ id: newOrder.id, success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/orders/:id', (req, res) => {
  try {
    const db = readDB();
    const { status, delivery } = req.body;
    const id = parseInt(req.params.id);
    const order = db.orders.find(o => o.id === id);
    if (order) {
      if (status) order.status = status;
      if (delivery) order.delivery = delivery;
      writeDB(db);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- NOTIFICATIONS API ---
app.get('/api/notifications/:target', (req, res) => {
  try {
    const db = readDB();
    const { target } = req.params;
    const notifs = db.notifications.filter(n => n.target === target || n.target === 'all').reverse();
    res.json(notifs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications', (req, res) => {
  try {
    const db = readDB();
    const { target, text, time, ico } = req.body;
    const newNotif = {
      id: db.notifications.length > 0 ? Math.max(...db.notifications.map(n => n.id)) + 1 : 1,
      target, text, time, ico, read: false
    };
    db.notifications.push(newNotif);
    writeDB(db);
    res.json({ success: true, notification: newNotif });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/notifications/:id/read', (req, res) => {
  try {
    const db = readDB();
    const id = parseInt(req.params.id);
    const notif = db.notifications.find(n => n.id === id);
    if (notif) {
      notif.read = true;
      writeDB(db);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/notifications/read-all/:target', (req, res) => {
  try {
    const db = readDB();
    const { target } = req.params;
    db.notifications.forEach(n => {
      if (n.target === target || n.target === 'all') {
        n.read = true;
      }
    });
    writeDB(db);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- MESSAGES API ---
app.get('/api/messages', (req, res) => {
  try {
    const db = readDB();
    res.json(db.messages || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/messages/:retailer_name', (req, res) => {
  try {
    const db = readDB();
    const name = req.params.retailer_name.toLowerCase();
    const msgs = db.messages.filter(m => m.retailer_name.toLowerCase() === name);
    res.json(msgs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/messages', (req, res) => {
  try {
    const db = readDB();
    const { sender, receiver, retailer_name, text } = req.body;
    
    const now = new Date();
    const time = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const date = now.getDate() + ' ' + months[now.getMonth()];

    const newMsg = {
      id: db.messages.length > 0 ? Math.max(...db.messages.map(m => m.id)) + 1 : 1,
      sender, receiver, retailer_name, text, time, date, read: false
    };
    db.messages.push(newMsg);
    writeDB(db);
    res.json({ success: true, message: newMsg });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/messages/read/:retailer_name', (req, res) => {
  try {
    const db = readDB();
    const name = req.params.retailer_name.toLowerCase();
    const role = req.query.role; // Optional: specify who is marking it as read

    db.messages.forEach(m => {
      if (m.retailer_name.toLowerCase() === name) {
        if (!role || (role === 'admin' && m.sender === 'retailer') || (role === 'retailer' && m.sender === 'admin')) {
          m.read = true;
        }
      }
    });

    writeDB(db);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/messages/read-all', (req, res) => {
  try {
    const db = readDB();
    const role = req.query.role;

    db.messages.forEach(m => {
      if (!role || (role === 'admin' && m.sender === 'retailer') || (role === 'retailer' && m.sender === 'admin')) {
        m.read = true;
      }
    });

    writeDB(db);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start Server wrapped with WebSockets and MySQL Chat Endpoints
const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const { saveMessage, getChatHistory, getAdminSidebarList, markMessagesAsRead } = require('./db');

// Create native HTTP server wrapping the Express app
const server = http.createServer(app);

// Initialize WebSocket server without binding directly to a port yet (we handle upgrades manually)
const wss = new WebSocket.Server({ noServer: true });

// In-memory client registry: userId (number) -> socket
const clients = new Map();

/**
 * Validates a JWT/mock token and extracts user ID, role, and name.
 * Supports standard 3-part base64 encoded JWT structure, as well as a fallback "id-role-name" simple string.
 * @param {string} token 
 * @returns {object|null} The verified user payload or null.
 */
function verifyToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      return {
        id: parseInt(payload.id),
        role: payload.role,
        name: payload.name
      };
    }
    
    // Fallback: simple token structure "id-role-name" for manual/direct tests
    const [idStr, role, name] = token.split('-');
    if (idStr && role) {
      return {
        id: parseInt(idStr),
        role,
        name: name || 'User'
      };
    }
  } catch (error) {
    console.error('[WS Auth Error] Token verification failed:', error);
  }
  return null;
}

// Handle HTTP connection upgrades to WebSockets
server.on('upgrade', (request, socket, head) => {
  try {
    const parsedUrl = url.parse(request.url, true);
    const token = parsedUrl.query.token;
    
    const user = verifyToken(token);
    if (!user) {
      console.warn(`[WS Auth Failed] Unauthorized connection attempt from ${request.socket.remoteAddress}`);
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, user);
    });
  } catch (err) {
    console.error('[WS Upgrade Error]:', err);
    socket.destroy();
  }
});

// WebSocket Connection Lifecycle
wss.on('connection', (ws, request, user) => {
  console.log(`[WS Connected] User ID: ${user.id}, Role: ${user.role}, Name: ${user.name}`);
  
  // Register client socket
  clients.set(user.id, ws);
  
  // Send connection acknowledgment to client
  ws.send(JSON.stringify({
    type: 'connection_established',
    user: { id: user.id, role: user.role, name: user.name }
  }));
  
  // Handle incoming message events
  ws.on('message', async (messageBuffer) => {
    try {
      const messageStr = messageBuffer.toString('utf8');
      const payload = JSON.parse(messageStr);
      const { receiverId, text } = payload;
      
      if (receiverId === undefined || receiverId === null || !text) {
        ws.send(JSON.stringify({ type: 'error', message: 'Missing receiverId or text payload' }));
        return;
      }
      
      const senderId = user.id;
      const textTrim = text.trim();
      if (!textTrim) return;
      
      // Save message immediately to the MySQL DB
      const messageId = await saveMessage(senderId, parseInt(receiverId), textTrim);
      
      const outgoingPayload = {
        id: messageId,
        senderId,
        receiverId: parseInt(receiverId),
        text: textTrim,
        createdAt: new Date().toISOString(),
        isRead: false
      };
      
      // Send acknowledgment back to sender
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'ack',
          ...outgoingPayload
        }));
      }
      
      // Check registry for active socket of receiver and deliver
      const receiverSocket = clients.get(parseInt(receiverId));
      if (receiverSocket && receiverSocket.readyState === WebSocket.OPEN) {
        receiverSocket.send(JSON.stringify({
          type: 'message',
          ...outgoingPayload
        }));
      } else {
        // Fallback console log indicating offline recipient push notification hook
        console.log(`[Push Fallback] Recipient ${receiverId} offline. Trigger FCM push notification to target user: "${textTrim.substring(0, 50)}..."`);
      }
      
    } catch (err) {
      console.error('[WS Message Error] Error handling payload:', err);
      ws.send(JSON.stringify({ type: 'error', message: 'Error processing message payload' }));
    }
  });
  
  // Handle socket closure to prevent memory leaks
  ws.on('close', (code, reason) => {
    console.log(`[WS Closed] User ID: ${user.id}, Code: ${code}, Reason: ${reason}`);
    clients.delete(user.id);
  });
  
  // Handle socket errors
  ws.on('error', (error) => {
    console.error(`[WS Socket Error] User ID: ${user.id}:`, error);
    clients.delete(user.id);
  });
});

// --- HTTP REST API ENDPOINTS FOR MYSQL CHAT ---

// Get chat history between a specific user and the admin (adminId defaults to 0)
app.get('/api/chat/history/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const adminId = 0; // Standard Admin ID constant
    const history = await getChatHistory(userId, adminId);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chat history', details: error.message });
  }
});

// Get admin's dynamic sidebar list of conversation threads
app.get('/api/chat/sidebar', async (req, res) => {
  try {
    const adminId = 0; // Standard Admin ID constant
    const sidebarList = await getAdminSidebarList(adminId);
    res.json(sidebarList);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch admin chat sidebar', details: error.message });
  }
});

// Mark all incoming messages from a user to admin as read
app.put('/api/chat/read/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const adminId = 0; // Standard Admin ID constant
    await markMessagesAsRead(userId, adminId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark messages as read', details: error.message });
  }
});

// Start native HTTP server (replaces app.listen to listen on http + ws)
server.listen(PORT, () => {
  console.log(`SpiceLity Backend running on http://localhost:${PORT}`);
});

