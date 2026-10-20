/**
 * SifatDropShipping — Full-Stack Node.js + Express Backend (v3 · Master Sync Edition)
 * Founder & CEO: Jack Sifat Khan
 *
 * Features
 *  - User accounts (register / login / profile) with scrypt-hashed passwords + signed tokens
 *  - Guest OR logged-in Cash-on-Delivery checkout (server re-prices every order)
 *  - Admin-only Merchant Dashboard APIs (orders, status, product add / delete, vendors)
 *  - Master Sync webhook: external vendor stores push orders into Jack's dashboard
 *  - Persistent JSON databases: products.json, orders.json, users.json, vendors.json
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ------------------------------------------------------------------ *
 *  Config & JSON "database" helpers
 * ------------------------------------------------------------------ */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const VENDORS_FILE = path.join(DATA_DIR, 'vendors.json');
const SECRET_FILE = path.join(DATA_DIR, '.auth-secret');

const STORE_SOURCE_NAME = 'SifatDropShipping Store';
const STATUSES = ['Order Placed', 'Shipped', 'Out for Delivery', 'Delivered'];
const PROMO_CODES = { SIFAT10: 0.1, SAVE10: 0.1, JACK10: 0.1 };
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON(filePath, fallback = []) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error('Error reading JSON:', filePath, err.message);
    return fallback;
  }
}

// Atomic write: write to a temp file, then rename (no half-written JSON on crash)
function writeJSON(filePath, data) {
  try {
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, filePath);
    return true;
  } catch (err) {
    console.error('Error writing JSON:', filePath, err.message);
    return false;
  }
}

/* ------------------------------------------------------------------ *
 *  Small utilities
 * ------------------------------------------------------------------ */
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const clean = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const isEmail = (v) => /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 120;
const normPhone = (v) => String(v || '').replace(/[^\d+]/g, '');
const isBDPhone = (v) => /^(?:\+?88)?01[3-9]\d{8}$/.test(normPhone(v));
const isHttpUrl = (v) => /^https?:\/\/\S+$/i.test(v);
const safeEqual = (a, b) => {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

function nowDhaka() {
  // "YYYY-MM-DD HH:mm" in Bangladesh time
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Dhaka' }).slice(0, 16);
}

function nextOrderId(orders) {
  let max = 103;
  for (const o of orders) {
    const m = /^JSK-\d{4}-(\d+)$/.exec(o.orderId || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `JSK-${new Date().getFullYear()}-${max + 1}`;
}

function shippingFor(city) {
  return /^dhaka$/i.test(city) ? 60 : 120;
}

// Tiny in-memory rate limiter (per IP + bucket)
function rateLimit({ windowMs, max, bucket }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = `${bucket}:${req.ip}`;
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || rec.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    rec.count += 1;
    if (rec.count > max) {
      res.set('Retry-After', Math.ceil((rec.reset - now) / 1000));
      return res.status(429).json({ success: false, message: 'Too many requests. Please try again shortly.' });
    }
    next();
  };
}

/* ------------------------------------------------------------------ *
 *  Auth: password hashing + signed stateless tokens
 * ------------------------------------------------------------------ */
function loadSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  try {
    if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf-8').trim();
    const s = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
    return s;
  } catch (e) {
    console.warn('⚠️  Could not persist auth secret; sessions will reset on restart.');
    return crypto.randomBytes(48).toString('hex');
  }
}
const AUTH_SECRET = loadSecret();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return safeEqual(test, hash);
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');
function signToken(user) {
  const body = b64u(JSON.stringify({ uid: user.id, exp: Date.now() + TOKEN_TTL_MS }));
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
  if (!safeEqual(sig, expect)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone || '',
  city: u.city || 'Dhaka', address: u.address || '', role: u.role, createdAt: u.createdAt
});

// Attaches req.user when a valid Bearer token is present (always continues)
function authOptional(req, res, next) {
  const h = req.get('authorization') || '';
  const payload = h.startsWith('Bearer ') ? verifyToken(h.slice(7)) : null;
  if (payload) {
    const user = readJSON(USERS_FILE).find((u) => u.id === payload.uid);
    if (user) req.user = user;
  }
  next();
}
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: 'Please log in to continue.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: 'Admin login required.' });
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Merchant admin access only.' });
  next();
}
app.use('/api', authOptional);

// Make sure Jack's admin account exists
function ensureAdmin() {
  const users = readJSON(USERS_FILE);
  if (users.some((u) => u.role === 'admin')) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@sifatdropshipping.com').toLowerCase();
  const usingDefault = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || 'Sifat@2026';
  users.push({
    id: 'u_' + crypto.randomBytes(6).toString('hex'),
    name: 'Jack Sifat Khan', email, phone: '', city: 'Dhaka', address: '',
    role: 'admin', passwordHash: hashPassword(password), createdAt: nowDhaka()
  });
  writeJSON(USERS_FILE, users);
  console.log(`👑 Admin account created → ${email}${usingDefault ? '  /  password: Sifat@2026  (CHANGE THIS: set ADMIN_PASSWORD env var before first run)' : ''}`);
}

/* ------------------------------------------------------------------ *
 *  1. AUTH ROUTES
 * ------------------------------------------------------------------ */
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, bucket: 'auth' });

app.post('/api/auth/register', authLimiter, (req, res) => {
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 120).toLowerCase();
  const phone = clean(req.body.phone, 20);
  const password = String(req.body.password || '');

  if (name.length < 2) return res.status(400).json({ success: false, message: 'Please enter your full name.' });
  if (!isEmail(email)) return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  if (phone && !isBDPhone(phone)) return res.status(400).json({ success: false, message: 'Enter a valid Bangladeshi phone number (e.g. 017XXXXXXXX) or leave it empty.' });
  if (password.length < 8 || password.length > 100) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });

  const users = readJSON(USERS_FILE);
  if (users.some((u) => u.email === email)) return res.status(409).json({ success: false, message: 'An account with this email already exists. Please log in.' });

  const user = {
    id: 'u_' + crypto.randomBytes(6).toString('hex'),
    name, email, phone, city: 'Dhaka', address: '',
    role: 'customer', passwordHash: hashPassword(password), createdAt: nowDhaka()
  };
  users.push(user);
  writeJSON(USERS_FILE, users);
  res.status(201).json({ success: true, token: signToken(user), user: publicUser(user) });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  const user = readJSON(USERS_FILE).find((u) => u.email === email);
  // Same message for unknown email / wrong password (no account enumeration)
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ success: false, message: 'Incorrect email or password.' });
  }
  res.json({ success: true, token: signToken(user), user: publicUser(user) });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ success: true, user: publicUser(req.user) });
});

app.patch('/api/auth/me', requireAuth, (req, res) => {
  const users = readJSON(USERS_FILE);
  const idx = users.findIndex((u) => u.id === req.user.id);
  const { name, phone, city, address } = req.body;
  if (name !== undefined) {
    if (clean(name, 80).length < 2) return res.status(400).json({ success: false, message: 'Please enter your full name.' });
    users[idx].name = clean(name, 80);
  }
  if (phone !== undefined) {
    if (clean(phone, 20) && !isBDPhone(phone)) return res.status(400).json({ success: false, message: 'Enter a valid Bangladeshi phone number.' });
    users[idx].phone = clean(phone, 20);
  }
  if (city !== undefined) users[idx].city = clean(city, 40) || 'Dhaka';
  if (address !== undefined) users[idx].address = clean(address, 300);
  writeJSON(USERS_FILE, users);
  res.json({ success: true, user: publicUser(users[idx]) });
});

/* ------------------------------------------------------------------ *
 *  2. PRODUCT ROUTES (list = public · add / delete = admin)
 * ------------------------------------------------------------------ */
app.get('/api/products', (req, res) => {
  const products = readJSON(PRODUCTS_FILE);
  res.json({ success: true, founder: 'Jack Sifat Khan', count: products.length, products });
});

app.post('/api/products', requireAdmin, (req, res) => {
  const products = readJSON(PRODUCTS_FILE);
  const title = clean(req.body.title, 140);
  const price = Number(req.body.price);
  if (!title || !Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ success: false, message: 'A title and a valid price (BDT) are required.' });
  }
  const originalInput = Number(req.body.originalPrice);
  const image = clean(req.body.image, 600);
  const newProduct = {
    id: Date.now(),
    title,
    category: clean(req.body.category, 40) || 'Gadgets',
    price: Math.round(price),
    originalPrice: Number.isFinite(originalInput) && originalInput > price ? Math.round(originalInput) : Math.round(price * 1.4),
    rating: 5.0,
    reviews: 1,
    badge: clean(req.body.badge, 40) || "Jack Sifat's New Pick",
    stock: Math.max(0, parseInt(req.body.stock, 10) || 25),
    image: isHttpUrl(image) ? image : 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=80',
    description: clean(req.body.description, 500) || 'Handpicked premium product verified by Jack Sifat Khan.'
  };
  products.unshift(newProduct);
  writeJSON(PRODUCTS_FILE, products);
  res.status(201).json({ success: true, product: newProduct });
});

app.delete('/api/products/:id', requireAdmin, (req, res) => {
  const products = readJSON(PRODUCTS_FILE);
  const id = Number(req.params.id);
  const idx = products.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Product not found.' });
  const [removed] = products.splice(idx, 1);
  writeJSON(PRODUCTS_FILE, products);
  res.json({ success: true, removed });
});

/* ------------------------------------------------------------------ *
 *  3. ORDER ROUTES
 * ------------------------------------------------------------------ */
// Admin: all orders + analytics (with per-source breakdown)
app.get('/api/orders', requireAdmin, (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  const sum = (list) => list.reduce((a, o) => a + (Number(o.total) || 0), 0);
  const direct = orders.filter((o) => o.source !== 'vendor');
  const vendor = orders.filter((o) => o.source === 'vendor');
  res.json({
    success: true,
    merchant: 'Jack Sifat Khan',
    totalOrders: orders.length,
    totalRevenue: sum(orders),
    deliveredCount: orders.filter((o) => o.status === 'Delivered').length,
    bySource: {
      direct: { count: direct.length, revenue: sum(direct) },
      vendor: { count: vendor.length, revenue: sum(vendor) }
    },
    orders
  });
});

// Logged-in customer: their own order history
app.get('/api/my-orders', requireAuth, (req, res) => {
  const mine = readJSON(ORDERS_FILE).filter((o) => o.userId === req.user.id);
  const totalSpent = mine.reduce((a, o) => a + (Number(o.total) || 0), 0);
  res.json({ success: true, email: req.user.email, count: mine.length, totalSpent, orders: mine });
});

// Public live tracking — returns only non-sensitive fields
const maskName = (n) => {
  const parts = String(n || '').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] || 'Customer';
};
app.get('/api/orders/:orderId', (req, res) => {
  const cleanId = req.params.orderId.replace(/^#/, '').trim().toUpperCase();
  const o = readJSON(ORDERS_FILE).find((x) => String(x.orderId).toUpperCase() === cleanId);
  if (!o) return res.status(404).json({ success: false, message: 'Order ID not found in SifatDropShipping system.' });
  res.json({
    success: true,
    order: {
      orderId: o.orderId, customerName: maskName(o.customerName), city: o.city,
      items: (o.items || []).map((i) => ({ title: i.title, qty: i.qty })),
      total: o.total, status: o.status, step: o.step, createdAt: o.createdAt, history: o.history || []
    }
  });
});

// Place a Cash-on-Delivery order (guest OR logged-in). Server re-prices everything.
app.post('/api/orders', (req, res) => {
  const customerName = clean(req.body.customerName, 80);
  const phone = clean(req.body.phone, 20);
  const city = clean(req.body.city, 40) || 'Dhaka';
  const address = clean(req.body.address, 300);
  const rawItems = Array.isArray(req.body.items) ? req.body.items : [];

  if (customerName.length < 2) return res.status(400).json({ success: false, message: 'Please enter your full name.' });
  if (!isBDPhone(phone)) return res.status(400).json({ success: false, message: 'Please enter a valid Bangladeshi phone number (e.g. 017XXXXXXXX).' });
  if (address.length < 6) return res.status(400).json({ success: false, message: 'Please enter your full delivery address.' });
  if (!rawItems.length || rawItems.length > 50) return res.status(400).json({ success: false, message: 'Your cart is empty.' });

  const products = readJSON(PRODUCTS_FILE);
  const items = [];
  for (const it of rawItems) {
    const product = products.find((p) => p.id === Number(it.id));
    const qty = parseInt(it.qty, 10);
    if (!product) return res.status(400).json({ success: false, message: `"${clean(it.title, 60) || 'An item'}" is no longer available. Please remove it from your cart.` });
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) return res.status(400).json({ success: false, message: 'Invalid item quantity.' });
    items.push({ id: product.id, title: product.title, qty, price: product.price, image: product.image });
  }

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const promo = clean(req.body.promoCode, 20).toUpperCase();
  const discount = PROMO_CODES[promo] ? Math.round(subtotal * PROMO_CODES[promo]) : 0;
  const shipping = shippingFor(city);

  let email = clean(req.body.email, 120).toLowerCase();
  if (req.user) email = req.user.email;
  else if (email && !isEmail(email)) return res.status(400).json({ success: false, message: 'Please enter a valid email or leave it empty.' });

  const orders = readJSON(ORDERS_FILE);
  const now = nowDhaka();
  const newOrder = {
    orderId: nextOrderId(orders),
    source: 'direct',
    vendorSource: STORE_SOURCE_NAME,
    vendorId: null,
    vendorOrderId: null,
    userId: req.user ? req.user.id : null,
    email: email || null,
    customerName, phone, city, address, items,
    paymentMethod: 'Cash on Delivery',
    subtotal, discount, shipping,
    total: subtotal - discount + shipping,
    status: 'Order Placed', step: 1,
    createdAt: now,
    history: [{ status: 'Order Placed', at: now }]
  };
  orders.unshift(newOrder);
  writeJSON(ORDERS_FILE, orders);
  res.status(201).json({ success: true, message: 'Order confirmed by Jack Sifat Khan team!', order: newOrder });
});

// Admin: update order status
app.patch('/api/orders/:orderId/status', requireAdmin, (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  const cleanId = req.params.orderId.replace(/^#/, '').trim().toUpperCase();
  const status = req.body.status;
  if (!STATUSES.includes(status)) return res.status(400).json({ success: false, message: `Status must be one of: ${STATUSES.join(', ')}` });
  const idx = orders.findIndex((o) => String(o.orderId).toUpperCase() === cleanId);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Order not found' });
  orders[idx].status = status;
  orders[idx].step = STATUSES.indexOf(status) + 1;
  orders[idx].history = [...(orders[idx].history || []), { status, at: nowDhaka() }];
  writeJSON(ORDERS_FILE, orders);
  res.json({ success: true, order: orders[idx] });
});

/* ------------------------------------------------------------------ *
 *  4. MASTER SYNC — vendors & webhook
 *     External dropshipping stores push orders into Jack's dashboard.
 *     Auth: header  X-Master-Sync-Key: msk_...   (or Authorization: Bearer msk_...)
 * ------------------------------------------------------------------ */
const vendorKeyFrom = (req) => {
  const h = req.get('x-master-sync-key') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return h && h.startsWith('msk_') ? h : null;
};
const newVendorKey = () => 'msk_' + crypto.randomBytes(24).toString('hex');

function vendorFromKey(req) {
  const key = vendorKeyFrom(req);
  if (!key) return null;
  const h = sha256(key);
  return readJSON(VENDORS_FILE).find((v) => v.keyHash && safeEqual(v.keyHash, h)) || null;
}

function requireVendor(req, res, next) {
  const vendor = vendorFromKey(req);
  if (!vendor) return res.status(401).json({ success: false, message: 'Invalid or missing Master Sync key (send header X-Master-Sync-Key).' });
  req.vendor = vendor;
  next();
}

// Validate + normalise an incoming vendor order. Returns { error } or { data }.
function parseVendorPayload(body) {
  const c = body.customer || {};
  const customerName = clean(c.name || body.customerName, 80);
  const phone = clean(c.phone || body.phone, 25);
  const email = clean(c.email || body.email, 120).toLowerCase();
  const city = clean(c.city || body.city, 40) || 'Dhaka';
  const address = clean(c.address || body.address, 300);
  const vendorOrderId = clean(body.vendorOrderId || body.vendor_order_id || body.externalId, 60);
  const currency = clean(body.currency || 'BDT', 5).toUpperCase();

  if (currency !== 'BDT' && currency !== '৳') return { error: 'Only BDT (৳) orders are supported.' };
  if (customerName.length < 2) return { error: 'customer.name is required.' };
  if (phone.length < 5) return { error: 'customer.phone is required.' };
  if (address.length < 4) return { error: 'customer.address is required.' };
  if (email && !isEmail(email)) return { error: 'customer.email is not a valid email.' };

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length || rawItems.length > 50) return { error: 'items must be an array of 1–50 line items.' };
  const items = [];
  for (const it of rawItems) {
    const title = clean(it.title || it.name, 140);
    const qty = parseInt(it.qty ?? it.quantity ?? 1, 10);
    const price = Number(it.price);
    if (!title) return { error: 'Every item needs a title.' };
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) return { error: `Invalid qty for "${title}".` };
    if (!Number.isFinite(price) || price < 0) return { error: `Invalid price for "${title}".` };
    const image = clean(it.image, 600);
    items.push({ id: clean(it.sku || it.productId || '', 60) || null, title, qty, price: Math.round(price), image: isHttpUrl(image) ? image : undefined });
  }
  const shipping = Math.max(0, Math.round(Number(body.shipping) || 0));
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = Math.min(subtotal, Math.max(0, Math.round(Number(body.discount) || 0)));
  const status = STATUSES.includes(body.status) ? body.status : 'Order Placed';
  return { data: { customerName, phone, email, city, address, vendorOrderId, items, shipping, subtotal, discount, status } };
}

// Shared by the webhook and the dashboard "simulate" button
function ingestVendorOrder(vendor, body) {
  const parsed = parseVendorPayload(body);
  if (parsed.error) return { status: 400, body: { success: false, message: parsed.error } };
  const d = parsed.data;
  const orders = readJSON(ORDERS_FILE);

  // Idempotency: the same vendorOrderId from the same vendor is never imported twice
  if (d.vendorOrderId) {
    const dup = orders.find((o) => o.vendorId === vendor.id && o.vendorOrderId === d.vendorOrderId);
    if (dup) return { status: 200, body: { success: true, duplicate: true, message: 'Order already synced.', order: syncAck(dup) } };
  }

  const now = nowDhaka();
  const order = {
    orderId: nextOrderId(orders),
    source: 'vendor',
    vendorSource: vendor.name,
    vendorId: vendor.id,
    vendorOrderId: d.vendorOrderId || null,
    userId: null,
    email: d.email || null,
    customerName: d.customerName, phone: d.phone, city: d.city, address: d.address,
    items: d.items,
    paymentMethod: 'Cash on Delivery',
    subtotal: d.subtotal, discount: d.discount, shipping: d.shipping,
    total: d.subtotal - d.discount + d.shipping,
    status: d.status, step: STATUSES.indexOf(d.status) + 1,
    createdAt: now,
    history: [{ status: d.status, at: now }]
  };
  orders.unshift(order);
  writeJSON(ORDERS_FILE, orders);
  console.log(`🔗 Master Sync: ${order.orderId} from "${vendor.name}" (${order.vendorOrderId || 'no ref'}) ৳${order.total}`);
  return { status: 201, body: { success: true, duplicate: false, message: 'Order synced to Jack Sifat Khan\'s Master Dashboard.', order: syncAck(order) } };
}
const syncAck = (o) => ({ orderId: o.orderId, vendorOrderId: o.vendorOrderId, vendorSource: o.vendorSource, status: o.status, total: o.total, createdAt: o.createdAt });

// ---- The webhook vendors call ----
app.post('/api/master-sync/webhook', rateLimit({ windowMs: 60 * 1000, max: 120, bucket: 'sync' }), requireVendor, (req, res) => {
  const result = ingestVendorOrder(req.vendor, req.body || {});
  res.status(result.status).json(result.body);
});

// Vendors can poll the status of an order they pushed
app.get('/api/master-sync/orders/:vendorOrderId', requireVendor, (req, res) => {
  const ref = clean(req.params.vendorOrderId, 60);
  const o = readJSON(ORDERS_FILE).find((x) => x.vendorId === req.vendor.id && x.vendorOrderId === ref);
  if (!o) return res.status(404).json({ success: false, message: 'No order with that vendorOrderId.' });
  res.json({ success: true, order: { ...syncAck(o), step: o.step, history: o.history || [] } });
});

// ---- Admin: manage vendors ----
const vendorView = (v, orders) => ({
  id: v.id, name: v.name, createdAt: v.createdAt,
  hasKey: !!v.keyHash, keyPrefix: v.keyPrefix || null,
  orderCount: orders.filter((o) => o.vendorId === v.id).length,
  revenue: orders.filter((o) => o.vendorId === v.id).reduce((a, o) => a + (Number(o.total) || 0), 0)
});

app.get('/api/vendors', requireAdmin, (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  res.json({ success: true, vendors: readJSON(VENDORS_FILE).map((v) => vendorView(v, orders)) });
});

app.post('/api/vendors', requireAdmin, (req, res) => {
  const name = clean(req.body.name, 60);
  if (name.length < 2) return res.status(400).json({ success: false, message: 'Vendor name is required.' });
  const vendors = readJSON(VENDORS_FILE);
  if (vendors.some((v) => v.name.toLowerCase() === name.toLowerCase())) return res.status(409).json({ success: false, message: 'A vendor with this name already exists.' });
  const key = newVendorKey();
  const vendor = { id: 'v_' + crypto.randomBytes(4).toString('hex'), name, keyHash: sha256(key), keyPrefix: key.slice(0, 8) + '…' + key.slice(-4), createdAt: nowDhaka() };
  vendors.push(vendor);
  writeJSON(VENDORS_FILE, vendors);
  res.status(201).json({ success: true, vendor: vendorView(vendor, []), apiKey: key, note: 'Copy this key now — it cannot be shown again.' });
});

app.post('/api/vendors/:id/rotate-key', requireAdmin, (req, res) => {
  const vendors = readJSON(VENDORS_FILE);
  const v = vendors.find((x) => x.id === req.params.id);
  if (!v) return res.status(404).json({ success: false, message: 'Vendor not found.' });
  const key = newVendorKey();
  v.keyHash = sha256(key);
  v.keyPrefix = key.slice(0, 8) + '…' + key.slice(-4);
  writeJSON(VENDORS_FILE, vendors);
  res.json({ success: true, vendor: vendorView(v, readJSON(ORDERS_FILE)), apiKey: key, note: 'Previous key is now revoked. Copy this key now — it cannot be shown again.' });
});

app.delete('/api/vendors/:id', requireAdmin, (req, res) => {
  const vendors = readJSON(VENDORS_FILE);
  const idx = vendors.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Vendor not found.' });
  vendors.splice(idx, 1);
  writeJSON(VENDORS_FILE, vendors); // existing orders keep their "Vendor Source" tag
  res.json({ success: true });
});

// Dashboard "Simulate incoming order" button — runs the exact same ingest path as the webhook
const DEMO_BUYERS = [
  ['Imran Hossain', '01711-445566', 'Dhaka', 'Banani Road 11, Dhaka'],
  ['Shirin Sultana', '01822-778899', 'Chattogram', 'GEC Circle, Chattogram'],
  ['Arif Billah', '01933-112233', 'Rajshahi', 'Shaheb Bazar, Rajshahi'],
  ['Lamia Rahman', '01555-667788', 'Khulna', 'Sonadanga, Khulna']
];
app.post('/api/vendors/:id/simulate', requireAdmin, (req, res) => {
  const vendor = readJSON(VENDORS_FILE).find((x) => x.id === req.params.id);
  if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });
  const products = readJSON(PRODUCTS_FILE);
  if (!products.length) return res.status(400).json({ success: false, message: 'Add a product first.' });
  const p = products[Math.floor(Math.random() * products.length)];
  const [name, phone, city, address] = DEMO_BUYERS[Math.floor(Math.random() * DEMO_BUYERS.length)];
  const result = ingestVendorOrder(vendor, {
    vendorOrderId: 'SIM-' + Date.now().toString(36).toUpperCase(),
    customer: { name, phone, city, address },
    items: [{ title: p.title, qty: 1 + Math.floor(Math.random() * 2), price: p.price, image: p.image }],
    shipping: shippingFor(city)
  });
  res.status(result.status).json(result.body);
});

/* ------------------------------------------------------------------ *
 *  Errors + SPA fallback
 * ------------------------------------------------------------------ */
app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Unknown API route.' }));

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Request body must be valid JSON.' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'Request body too large.' });
  console.error(err);
  res.status(500).json({ success: false, message: 'Something went wrong on the server.' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

ensureAdmin();
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 SifatDropShipping Full-Stack Server is LIVE!`);
  console.log(`👑 Founder & CEO: Jack Sifat Khan`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`🔗 Master Sync webhook: POST /api/master-sync/webhook`);
  console.log(`====================================================`);
});
