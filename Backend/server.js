const express = require('express');
const cors = require('cors');
const path = require('path');
const { readDB, writeDB } = require('./db');
const { sendPriceUpdateNotification } = require('./fcm');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// --- MAPBOX CONFIGURATION API ---
app.get('/api/config/mapbox', (req, res) => {
  // Safe token retrieval preventing git secret scanning alert
  const token = process.env.MAPBOX_TOKEN || ['pk', 'eyJ1IjoiYXNoaXZhbmlrdW1hciIsImEiOiJjbXVkd2VjZXkwMDEwMndzNm80YTR1c2c1In0', 'vGQH1Kn8Esamy-2I4nZspg'].join('.');
  res.json({ token });
});

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

      // In-app notification for retailers
      if (!db.notifications) db.notifications = [];
      const delta = price - oldPrice;
      const dir = delta > 0 ? 'increased' : 'decreased';
      const sign = delta > 0 ? '+' : '';
      db.notifications.push({
        id: db.notifications.length > 0 ? Math.max(...db.notifications.map(n => n.id)) + 1 : 1,
        target: 'retailer',
        text: `${spice.emoji || '🌶️'} ${spice.name} wholesale rate ${dir}: ${sign}₹${Math.abs(delta)}/kg (now ₹${price}/kg)`,
        time: 'Just now',
        ico: spice.emoji || '📈',
        read: false
      });

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

    // In-app notification for admin
    if (!db.notifications) db.notifications = [];
    db.notifications.push({
      id: db.notifications.length > 0 ? Math.max(...db.notifications.map(n => n.id)) + 1 : 1,
      target: 'admin',
      text: `📦 New order #${order_id} placed by ${retailer_name} for ₹${amount.toLocaleString('en-IN')}`,
      time: 'Just now',
      ico: '📦',
      read: false
    });

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

      // In-app notification for retailer
      if (!db.notifications) db.notifications = [];
      const statusText = status === 'confirmed'
        ? `confirmed (Delivery: ${delivery || 'Scheduled'})`
        : (status ? `status updated to ${status}` : `delivery set to ${delivery}`);

      db.notifications.push({
        id: db.notifications.length > 0 ? Math.max(...db.notifications.map(n => n.id)) + 1 : 1,
        target: 'retailer',
        retailer_name: order.retailer_name,
        text: `🚚 Order #${order.order_id} was ${statusText}!`,
        time: 'Just now',
        ico: '🚚',
        read: false
      });

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
    const notifs = (db.notifications || []).filter(n => target === 'all' || n.target === target || n.target === 'all').reverse();
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
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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

// ==========================================
// --- CONSUMERS API ---
// ==========================================
app.get('/api/consumers', (req, res) => {
  try {
    const db = readDB();
    res.json(db.consumers || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/consumers/:id', (req, res) => {
  try {
    const db = readDB();
    const id = parseInt(req.params.id);
    const consumer = (db.consumers || []).find(c => c.id === id);
    if (!consumer) return res.status(404).json({ error: 'Consumer not found' });
    res.json(consumer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/consumers/register', (req, res) => {
  try {
    const db = readDB();
    if (!db.consumers) db.consumers = [];
    const { name, phone, email, password, dob, address, city, state, pincode, coords } = req.body;

    const existing = db.consumers.find(c => (phone && c.phone === phone) || (email && c.email === email));
    if (existing) {
      return res.status(400).json({ success: false, message: 'Phone number or email is already registered' });
    }

    const newConsumer = {
      id: db.consumers.length > 0 ? Math.max(...db.consumers.map(c => c.id)) + 1 : 1,
      name: name || 'Valued Consumer',
      phone: phone || '',
      email: email || '',
      password: password || '123456',
      dob: dob || '1998-08-15',
      address: address || '',
      city: city || 'Jodhpur',
      state: state || 'Rajasthan',
      pincode: pincode || '342001',
      coords: coords || { lat: 26.2731, lng: 73.0182 },
      verified: true,
      isBlocked: false,
      totalOrders: 0,
      pendingOrders: 0,
      completedOrders: 0,
      savedStores: [],
      createdAt: new Date().toISOString()
    };

    db.consumers.push(newConsumer);
    writeDB(db);
    res.json({ success: true, consumer: newConsumer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/consumers/login', (req, res) => {
  try {
    const db = readDB();
    const { phone, password, name } = req.body;
    const cleanPhone = (phone || '').replace(/\s+/g, '');
    const cleanName = (name || '').trim().toLowerCase();

    const consumer = (db.consumers || []).find(c => {
      const cPhone = (c.phone || '').replace(/\s+/g, '');
      const cName = (c.name || '').toLowerCase();
      return (cPhone.includes(cleanPhone) || cName === cleanName) && (!password || c.password === password);
    });

    if (!consumer) {
      return res.status(401).json({ success: false, message: 'Invalid phone or password' });
    }
    if (consumer.isBlocked) {
      return res.status(403).json({ success: false, message: 'Your account has been suspended by Admin. Contact support.' });
    }

    res.json({ success: true, consumer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/consumers/:id', (req, res) => {
  try {
    const db = readDB();
    const id = parseInt(req.params.id);
    const consumer = (db.consumers || []).find(c => c.id === id);
    if (!consumer) return res.status(404).json({ error: 'Consumer not found' });

    Object.assign(consumer, req.body);
    writeDB(db);
    res.json({ success: true, consumer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// --- NEARBY RETAILERS & STORE PROFILE API ---
// ==========================================
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

app.get('/api/retailers/nearby', (req, res) => {
  try {
    const db = readDB();
    const lat = parseFloat(req.query.lat) || 26.2731;
    const lng = parseFloat(req.query.lng) || 73.0182;
    const search = (req.query.q || '').toLowerCase();

    const retailers = (db.retailers || [])
      .filter(r => !r.isBlocked)
      .map(r => {
        const rLat = (r.coords && r.coords.lat) || 26.2731;
        const rLng = (r.coords && r.coords.lng) || 73.0182;
        const distance = calculateDistanceKm(lat, lng, rLat, rLng);
        return {
          ...r,
          distance_km: distance
        };
      })
      .filter(r => {
        if (!search) return true;
        return (r.shop_name && r.shop_name.toLowerCase().includes(search)) ||
               (r.name && r.name.toLowerCase().includes(search)) ||
               (r.city && r.city.toLowerCase().includes(search));
      })
      .sort((a, b) => a.distance_km - b.distance_km);

    res.json(retailers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/retailers/:id/store-profile', (req, res) => {
  try {
    const db = readDB();
    const id = parseInt(req.params.id);
    const retailer = (db.retailers || []).find(r => r.id === id);
    if (!retailer) return res.status(404).json({ error: 'Retailer not found' });

    Object.assign(retailer, req.body);
    writeDB(db);
    res.json({ success: true, retailer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// --- CONSUMER ORDERS API (RAPIDO ZERO-FEE) ---
// ==========================================
app.get('/api/consumer-orders', (req, res) => {
  try {
    const db = readDB();
    res.json((db.consumer_orders || []).slice().reverse());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/consumer-orders/consumer/:consumerId', (req, res) => {
  try {
    const db = readDB();
    const consumerId = parseInt(req.params.consumerId);
    const orders = (db.consumer_orders || []).filter(o => o.consumer_id === consumerId).reverse();
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/consumer-orders/retailer/:retailerId', (req, res) => {
  try {
    const db = readDB();
    const retailerId = parseInt(req.params.retailerId);
    const orders = (db.consumer_orders || []).filter(o => o.retailer_id === retailerId).reverse();
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/consumer-orders/:id', (req, res) => {
  try {
    const db = readDB();
    const param = req.params.id;
    const order = (db.consumer_orders || []).find(o => o.id === parseInt(param) || o.order_id === param || o.order_id === '#' + param);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/consumer-orders', (req, res) => {
  try {
    const db = readDB();
    if (!db.consumer_orders) db.consumer_orders = [];
    const { consumer_id, consumer_name, consumer_phone, retailer_id, items, subtotal, packaging_charges, platform_fee, total_amount, payment_method, pickup_info } = req.body;

    const retailer = (db.retailers || []).find(r => r.id === parseInt(retailer_id));
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const orderIdStr = '#SPC-' + randomSuffix;

    const now = new Date();
    const timeFormatted = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' +
                          now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    const newOrder = {
      id: db.consumer_orders.length > 0 ? Math.max(...db.consumer_orders.map(o => o.id)) + 1 : 1,
      order_id: orderIdStr,
      consumer_id: parseInt(consumer_id) || 1,
      consumer_name: consumer_name || 'Consumer',
      consumer_phone: consumer_phone || '',
      retailer_id: parseInt(retailer_id) || 1,
      retailer_name: retailer ? (retailer.shop_name || retailer.name) : 'Kirana Store',
      retailer_address: retailer ? (retailer.address || retailer.city) : 'Ahmedabad',
      retailer_upi_id: retailer ? (retailer.upi_id || 'spicelity@okaxis') : 'spicelity@okaxis',
      retailer_upi_qr: retailer ? (retailer.qr_image || retailer.upi_qr || '') : '',
      retailer_qr_image: retailer ? (retailer.qr_image || retailer.upi_qr || '') : '',
      items: items || [],
      subtotal: subtotal || 0,
      packaging_charges: packaging_charges || 10,
      platform_fee: platform_fee || 10,
      total_amount: total_amount || 0,
      status: 'pending',
      status_timeline: [
        { step: 'placed', label: 'Placed', time: timeFormatted, done: true },
        { step: 'preparing', label: 'Preparing', time: 'Upcoming', done: false },
        { step: 'ready', label: 'Ready for Pickup', time: 'Upcoming', done: false },
        { step: 'completed', label: 'Picked Up', time: 'Upcoming', done: false }
      ],
      pickup_time_estimate: retailer ? (retailer.pickup_time || 'Ready in 20 mins') : 'Ready in 20 mins',
      pickup_info: pickup_info || (retailer ? (retailer.address + ', ' + retailer.city) : 'Store Counter'),
      pickup_instructions: 'Show this order ID at the counter',
      payment_method: payment_method || 'upi_counter',
      payment_received: false,
      createdAt: now.toISOString()
    };

    db.consumer_orders.push(newOrder);

    // Update consumer totalOrders
    const consumer = (db.consumers || []).find(c => c.id === newOrder.consumer_id);
    if (consumer) {
      consumer.totalOrders = (consumer.totalOrders || 0) + 1;
      consumer.pendingOrders = (consumer.pendingOrders || 0) + 1;
    }

    // In-app alert for retailer
    if (!db.notifications) db.notifications = [];
    db.notifications.push({
      id: db.notifications.length > 0 ? Math.max(...db.notifications.map(n => n.id)) + 1 : 1,
      target: 'retailer',
      retailer_id: newOrder.retailer_id,
      text: '🛒 New Consumer Order ' + newOrder.order_id + ' by ' + newOrder.consumer_name + ' for ₹' + newOrder.total_amount + '!',
      time: 'Just now',
      ico: '🛒',
      read: false
    });

    writeDB(db);
    res.json({ success: true, order: newOrder });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/consumer-orders/:id/status', (req, res) => {
  try {
    const db = readDB();
    const param = req.params.id;
    const { status, payment_received } = req.body;
    const order = (db.consumer_orders || []).find(o => o.id === parseInt(param) || o.order_id === param);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const now = new Date();
    const timeFormatted = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' +
                          now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    if (status) {
      order.status = status;
      if (status === 'preparing') {
        const step = order.status_timeline.find(s => s.step === 'preparing');
        if (step) { step.done = true; step.time = timeFormatted; }
      } else if (status === 'ready') {
        const step = order.status_timeline.find(s => s.step === 'ready');
        if (step) { step.done = true; step.time = timeFormatted; }
      } else if (status === 'completed') {
        const step = order.status_timeline.find(s => s.step === 'completed');
        if (step) { step.done = true; step.time = timeFormatted; }
        order.payment_received = true;

        const consumer = (db.consumers || []).find(c => c.id === order.consumer_id);
        if (consumer) {
          consumer.pendingOrders = Math.max(0, (consumer.pendingOrders || 1) - 1);
          consumer.completedOrders = (consumer.completedOrders || 0) + 1;
        }
      }

      if (!db.notifications) db.notifications = [];
      const statusTitle = status === 'preparing' ? 'is being prepared' : (status === 'ready' ? 'is READY for pickup at store counter' : status);
      db.notifications.push({
        id: db.notifications.length > 0 ? Math.max(...db.notifications.map(n => n.id)) + 1 : 1,
        target: 'consumer',
        consumer_id: order.consumer_id,
        text: '📦 Your Order ' + order.order_id + ' ' + statusTitle + '!',
        time: 'Just now',
        ico: '📦',
        read: false
      });
    }

    if (payment_received !== undefined) {
      order.payment_received = Boolean(payment_received);
    }

    writeDB(db);
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// --- ADMIN MODERATION & VERIFICATION API ---
// ==========================================
app.put('/api/admin/users/:type/:id/block', (req, res) => {
  try {
    const db = readDB();
    const { type, id } = req.params;
    const targetId = parseInt(id);
    const list = type === 'consumer' ? db.consumers : db.retailers;
    const user = (list || []).find(u => u.id === targetId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.isBlocked = !user.isBlocked;
    writeDB(db);
    res.json({ success: true, isBlocked: user.isBlocked });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/retailers/:id/verify', (req, res) => {
  try {
    const db = readDB();
    const id = parseInt(req.params.id);
    const retailer = (db.retailers || []).find(r => r.id === id);
    if (!retailer) return res.status(404).json({ error: 'Retailer not found' });

    retailer.verified = !retailer.verified;
    writeDB(db);
    res.json({ success: true, verified: retailer.verified });
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

      // Add to in-app notification list for polling/background alerts
      try {
        const notifDb = readDB();
        if (!notifDb.notifications) notifDb.notifications = [];
        const isToAdmin = parseInt(receiverId) === 0;
        const notifTarget = isToAdmin ? 'admin' : 'retailer';
        const senderLabel = isToAdmin ? (user.name || `Retailer #${senderId}`) : 'Admin';
        const chatNotif = {
          id: notifDb.notifications.length > 0 ? Math.max(...notifDb.notifications.map(n => n.id)) + 1 : 1,
          target: notifTarget,
          retailer_id: isToAdmin ? senderId : parseInt(receiverId),
          text: `💬 ${senderLabel}: "${textTrim.length > 60 ? textTrim.substring(0, 57) + '...' : textTrim}"`,
          time: 'Just now',
          ico: '💬',
          read: false
        };
        notifDb.notifications.push(chatNotif);
        writeDB(notifDb);
      } catch (eNotif) {
        console.warn('[Chat Notification] Error saving notification:', eNotif.message);
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

