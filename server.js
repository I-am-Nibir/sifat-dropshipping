/**
 * SifatDropShipping - Full-Stack Node.js + Express Backend Server
 * Founder & CEO: Jack Sifat Khan
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');

// Helper functions to read/write JSON DB
function readJSON(filePath, fallback = []) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading JSON:', filePath, err);
    return fallback;
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing JSON:', filePath, err);
    return false;
  }
}

// 1. GET all products
app.get('/api/products', (req, res) => {
  const products = readJSON(PRODUCTS_FILE);
  res.json({ success: true, founder: 'Jack Sifat Khan', count: products.length, products });
});

// 2. POST new product (Merchant Dashboard)
app.post('/api/products', (req, res) => {
  const products = readJSON(PRODUCTS_FILE);
  const { title, category, price, originalPrice, image, badge, description } = req.body;
  if (!title || !price) {
    return res.status(400).json({ success: false, message: 'Title and price (BDT) are required.' });
  }
  const newProduct = {
    id: Date.now(),
    title,
    category: category || 'Gadgets',
    price: Number(price),
    originalPrice: Number(originalPrice) || Math.round(Number(price) * 1.4),
    rating: 5.0,
    reviews: 1,
    badge: badge || "Jack Sifat's New Pick",
    stock: 25,
    image: image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=80',
    description: description || 'Handpicked premium product verified by Jack Sifat Khan.'
  };
  products.unshift(newProduct);
  writeJSON(PRODUCTS_FILE, products);
  res.status(201).json({ success: true, product: newProduct });
});

// 3. GET all orders & analytics (Merchant Dashboard)
app.get('/api/orders', (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  const totalRevenue = orders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
  const deliveredCount = orders.filter(o => o.status === 'Delivered').length;
  res.json({
    success: true,
    merchant: 'Jack Sifat Khan',
    totalOrders: orders.length,
    totalRevenue,
    deliveredCount,
    orders
  });
});

// 4. GET single order by ID (Live Order Tracking)
app.get('/api/orders/:orderId', (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  const cleanId = req.params.orderId.replace(/^#/, '').trim().toUpperCase();
  const found = orders.find(o => o.orderId.toUpperCase() === cleanId);
  if (!found) {
    return res.status(404).json({ success: false, message: 'Order ID not found in SifatDropShipping system.' });
  }
  res.json({ success: true, order: found });
});

// 5. POST create new Cash on Delivery Order
app.post('/api/orders', (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  const { customerName, phone, city, address, items, subtotal, discount, shipping, total } = req.body;
  if (!customerName || !phone || !address || !items || !items.length) {
    return res.status(400).json({ success: false, message: 'Please provide complete customer and cart details.' });
  }
  const randomSuffix = Math.floor(104 + Math.random() * 895);
  const orderId = `JSK-2026-${randomSuffix}`;
  const now = new Date();
  const createdAt = now.toISOString().slice(0, 16).replace('T', ' ');

  const newOrder = {
    orderId,
    customerName,
    phone,
    city: city || 'Dhaka',
    address,
    items,
    subtotal: Number(subtotal) || 0,
    discount: Number(discount) || 0,
    shipping: Number(shipping) || 60,
    total: Number(total) || 0,
    status: 'Order Placed',
    step: 1,
    createdAt
  };

  orders.unshift(newOrder);
  writeJSON(ORDERS_FILE, orders);
  res.status(201).json({ success: true, message: 'Order confirmed by Jack Sifat Khan team!', order: newOrder });
});

// 6. PATCH update order status (Merchant Admin control)
app.patch('/api/orders/:orderId/status', (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  const cleanId = req.params.orderId.replace(/^#/, '').trim().toUpperCase();
  const { status } = req.body;
  const stepMap = {
    'Order Placed': 1,
    'Shipped': 2,
    'Out for Delivery': 3,
    'Delivered': 4
  };
  const idx = orders.findIndex(o => o.orderId.toUpperCase() === cleanId);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }
  orders[idx].status = status || 'Shipped';
  orders[idx].step = stepMap[status] || 2;
  writeJSON(ORDERS_FILE, orders);
  res.json({ success: true, order: orders[idx] });
});

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 SifatDropShipping Full-Stack Server is LIVE!`);
  console.log(`👑 Founder & CEO: Jack Sifat Khan`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
