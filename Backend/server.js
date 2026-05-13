const express = require('express');
const cors = require('cors');
const path = require('path');
const { readDB, writeDB } = require('./db');

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

app.put('/api/spices/:id', (req, res) => {
  try {
    const db = readDB();
    const { price } = req.body;
    const id = parseInt(req.params.id);
    const spice = db.spices.find(s => s.id === id);
    if (spice) {
      spice.price = price;
      writeDB(db);
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
    const { initials, name, city, phone } = req.body;
    const newRetailer = {
      id: db.retailers.length > 0 ? Math.max(...db.retailers.map(r => r.id)) + 1 : 1,
      initials, name, city, phone, orders: 0, outstanding: 0, last_order: 'Never'
    };
    db.retailers.push(newRetailer);
    writeDB(db);
    res.json({ id: newRetailer.id, success: true });
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

// Start Server
app.listen(PORT, () => {
  console.log(`SpiceLity Backend running on http://localhost:${PORT}`);
});
