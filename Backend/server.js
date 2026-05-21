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

// Start Server
app.listen(PORT, () => {
  console.log(`SpiceLity Backend running on http://localhost:${PORT}`);
});
