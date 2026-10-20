/**
 * SifatDropShipping - Full-Stack Frontend Core (Storefront, Cart, Checkout, Live Tracking)
 * Founder & CEO: Jack Sifat Khan
 *
 * Script order (see index.html): founder-photo.js → fallback-data.js → app.js → auth.js → admin.js
 */

const STATUS_STEPS = ['Order Placed', 'Shipped', 'Out for Delivery', 'Delivered'];
const CATEGORIES = ['All', 'Gadgets', 'Fashion', 'Beauty', 'Home & Living', 'Fitness'];

let state = {
  products: [],
  orders: [],            // admin view (all orders)
  cart: safeParse(safeGet('jsk_cart_v2'), []),
  selectedCategory: 'All',
  searchQuery: '',
  sortBy: 'featured',
  promoCode: '',
  discountRate: 0,
  shippingCost: 60,
  backendOnline: false,
  token: safeGet('jsk_token'),
  user: null,            // logged-in user (from /api/auth/me)
  trackedId: null
};

/* ------------------------------ helpers ------------------------------ */
function safeParse(raw, fallback) {
  try { const v = JSON.parse(raw); return v ?? fallback; } catch (e) { return fallback; }
}
function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function safeDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

// Escape any text that is inserted into innerHTML (customer / vendor / product text is untrusted)
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Format currency in Bangladeshi Taka (৳)
function formatBDT(amount) {
  return '৳' + Number(amount || 0).toLocaleString('en-IN');
}

// Fetch wrapper: JSON in/out, attaches the login token, throws Error(message) with .status on API errors.
// A network failure throws a TypeError (status undefined) → callers treat that as "backend offline".
async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok || !data) {
    const err = new Error((data && data.message) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function copyText(text, okMsg) {
  const done = () => showToast(okMsg || 'Copied!', 'success');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { showToast('Press Ctrl+C to copy', 'error'); }
  ta.remove();
}

/* ------------------------------ boot ------------------------------ */
document.addEventListener('DOMContentLoaded', async () => {
  initFounderPhotos();
  initTypewriter();
  initScrollReveal();
  await loadProducts();
  await initAuth();            // auth.js — restores session, decides what the header/dashboard show
  renderCategories();
  renderProducts();
  updateCartUI();
  initLiveSalesPopup();
  initTrackingPoll();
  initAdminPanel();            // admin.js — loads dashboard data if allowed
});

/* ------------------------------ founder photo ------------------------------ */
// Set Jack Sifat Khan's uploaded photo across all image slots
function initFounderPhotos() {
  const savedCustom = safeGet('jsk_custom_founder_photo');
  const photoSrc = savedCustom || '/assets/images/sifat.jpg';
  document.querySelectorAll('.jsk-founder-photo').forEach(img => {
    img.src = photoSrc;
    img.onerror = function() {
      this.onerror = null;
      this.src = DEFAULT_SIFAT_PHOTO;
    };
  });
}

// Allow instant custom photo swap if desired
function handleFounderPhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    safeSet('jsk_custom_founder_photo', dataUrl);
    document.querySelectorAll('.jsk-founder-photo').forEach(img => {
      img.src = dataUrl;
    });
    showToast("Jack Sifat Khan's Founder Photo Updated!", "success");
  };
  reader.readAsDataURL(file);
}

/* ------------------------------ typewriter / reveal ------------------------------ */
// Animated Typewriter in Hero Section
function initTypewriter() {
  const phrases = [
    "Curated Personally by Jack Sifat Khan",
    "Bangladesh's #1 Next-Gen Dropshipping Hub",
    "100% Authentic Products in BDT (৳)",
    "Fastest Cash on Delivery Across 64 Districts"
  ];
  let i = 0, j = 0, isDeleting = false;
  const el = document.getElementById('typewriter-text');
  if (!el) return;

  function loop() {
    const current = phrases[i];
    el.textContent = isDeleting ? current.substring(0, j--) : current.substring(0, j++);
    let speed = isDeleting ? 35 : 70;

    if (!isDeleting && j === current.length + 1) {
      speed = 2000;
      isDeleting = true;
    } else if (isDeleting && j === 0) {
      isDeleting = false;
      i = (i + 1) % phrases.length;
      speed = 400;
    }
    setTimeout(loop, speed);
  }
  loop();
}

// Scroll Reveal Observer
function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal-up').forEach(el => observer.observe(el));
}

/* ------------------------------ data loading ------------------------------ */
// Load Products from Express Backend API (or Local Fallback)
async function loadProducts() {
  try {
    const data = await api('/api/products');
    state.products = data.products;
    state.backendOnline = true;
  } catch (e) {
    const localProds = safeParse(safeGet('jsk_products_fallback'), null);
    state.products = localProds || FALLBACK_PRODUCTS;
    state.backendOnline = false;
  }
  updateBackendBadge(state.backendOnline);
  syncCartWithCatalog();
}

// Drop / refresh cart lines whose product was removed or re-priced by the merchant
function syncCartWithCatalog() {
  const before = state.cart.length;
  state.cart = state.cart.reduce((acc, line) => {
    const p = state.products.find(x => x.id === line.id);
    if (p) acc.push({ id: p.id, title: p.title, price: p.price, image: p.image, qty: Math.max(1, Math.min(99, line.qty | 0)) });
    return acc;
  }, []);
  saveCart();
  if (state.cart.length < before && document.readyState !== 'loading') {
    showToast('Some items were removed — no longer available.', 'error');
  }
}

function updateBackendBadge(isOnline) {
  const badge = document.getElementById('backend-status-badge');
  if (!badge) return;
  if (isOnline) {
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block mr-1.5"></span>Full-Stack Node API Live`;
    badge.className = "px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 flex items-center";
  } else {
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400 inline-block mr-1.5"></span>Standalone Browser Mode`;
    badge.className = "px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-700 border border-amber-500/30 flex items-center";
  }
}

/* ------------------------------ storefront ------------------------------ */
function renderCategories() {
  const container = document.getElementById('category-pills');
  if (!container) return;
  container.innerHTML = CATEGORIES.map(cat => {
    const active = state.selectedCategory === cat;
    return `
      <button data-cat="${esc(cat)}" onclick="selectCategory(this.dataset.cat)"
        class="px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-300 whitespace-nowrap ${
          active
            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30 scale-105'
            : 'bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-600 border border-slate-200'
        }">
        ${esc(cat)}
      </button>
    `;
  }).join('');
}

function selectCategory(cat) {
  state.selectedCategory = cat;
  renderCategories();
  renderProducts();
}

function handleSearch(val) {
  state.searchQuery = val.trim().toLowerCase();
  renderProducts();
}

function handleSort(val) {
  state.sortBy = val;
  renderProducts();
}

// Render Product Grid with 3D Hover Cards & Fly-to-Cart
function renderProducts() {
  const grid = document.getElementById('product-grid');
  const countEl = document.getElementById('product-count-label');
  if (!grid) return;

  let filtered = state.products.filter(p => {
    const matchCat = state.selectedCategory === 'All' || p.category === state.selectedCategory;
    const matchSearch = !state.searchQuery ||
      p.title.toLowerCase().includes(state.searchQuery) ||
      String(p.category).toLowerCase().includes(state.searchQuery);
    return matchCat && matchSearch;
  });

  if (state.sortBy === 'price-asc') filtered.sort((a, b) => a.price - b.price);
  if (state.sortBy === 'price-desc') filtered.sort((a, b) => b.price - a.price);
  if (state.sortBy === 'rating') filtered.sort((a, b) => b.rating - a.rating);

  if (countEl) countEl.textContent = `Showing ${filtered.length} Curated Products`;

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="col-span-full bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm">
        <i class="fa-solid fa-box-open text-5xl text-slate-300 mb-4"></i>
        <h3 class="text-xl font-bold text-slate-800">No matching products found</h3>
        <p class="text-slate-500 mt-1">Try resetting your search filter to see Jack Sifat Khan's collection.</p>
        <button onclick="selectCategory('All'); document.getElementById('search-input').value=''; handleSearch('');"
          class="mt-5 px-6 py-2.5 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 transition">
          Reset All Filters
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const savePct = p.originalPrice > p.price ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;
    return `
      <div class="product-card-3d bg-white rounded-3xl border border-slate-100 overflow-hidden flex flex-col justify-between group relative">
        <div>
          <!-- Image Wrapper -->
          <div class="relative h-64 overflow-hidden bg-slate-100">
            <img id="prod-img-${p.id}" src="${esc(p.image)}" alt="${esc(p.title)}"
              class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" />
            <div class="absolute inset-0 bg-gradient-to-t from-slate-900/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

            <!-- Top Badges -->
            <div class="absolute top-3.5 left-3.5 flex flex-col gap-1.5">
              <span class="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-blue-600 text-white shadow-md">
                <i class="fa-solid fa-crown mr-1 text-amber-300"></i>${esc(p.badge || "Jack Sifat's Pick")}
              </span>
              ${savePct ? `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500 text-white w-max shadow">-${savePct}% OFF</span>` : ''}
            </div>

            <!-- Quick View Button -->
            <button onclick="openQuickView(${p.id})"
              class="absolute bottom-3 right-3 bg-white/95 hover:bg-blue-600 hover:text-white text-slate-800 px-3.5 py-2 rounded-full text-xs font-bold shadow-lg translate-y-10 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 flex items-center gap-1.5">
              <i class="fa-regular fa-eye"></i> Quick View
            </button>
          </div>

          <!-- Content -->
          <div class="p-5">
            <div class="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span class="font-semibold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-md">${esc(p.category)}</span>
              <span class="flex items-center gap-1 text-amber-500 font-bold">
                <i class="fa-solid fa-star"></i> ${esc(p.rating)} <span class="text-slate-400 font-normal">(${esc(p.reviews)})</span>
              </span>
            </div>
            <h3 onclick="openQuickView(${p.id})" class="font-bold text-slate-800 text-base leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors cursor-pointer">
              ${esc(p.title)}
            </h3>
          </div>
        </div>

        <!-- Price & Add to Cart Footer -->
        <div class="px-5 pb-5 pt-2 border-t border-slate-50 flex items-center justify-between">
          <div>
            <span class="text-xs text-slate-400 line-through block">${formatBDT(p.originalPrice)}</span>
            <span class="text-xl font-extrabold text-slate-900">${formatBDT(p.price)}</span>
          </div>
          <button onclick="addToCart(${p.id}, event)"
            class="btn-shine bg-slate-900 hover:bg-blue-600 text-white px-4 py-2.5 rounded-2xl text-xs font-bold transition-all duration-300 flex items-center gap-2 shadow-md hover:shadow-blue-500/30 active:scale-95">
            <i class="fa-solid fa-cart-plus"></i> Add to Cart
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/* ------------------------------ cart ------------------------------ */
// Fly-to-Cart Animation + Add Item
function addToCart(productId, event) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  // Trigger Flying Image Animation if button clicked
  const imgEl = document.getElementById(`prod-img-${productId}`);
  const cartBtn = document.getElementById('header-cart-btn');
  if (imgEl && cartBtn) {
    const imgRect = imgEl.getBoundingClientRect();
    const cartRect = cartBtn.getBoundingClientRect();
    const clone = document.createElement('img');
    clone.src = product.image;
    clone.className = 'flying-img';
    clone.style.width = '80px';
    clone.style.height = '80px';
    clone.style.left = `${imgRect.left + imgRect.width / 2 - 40}px`;
    clone.style.top = `${imgRect.top + imgRect.height / 2 - 40}px`;
    document.body.appendChild(clone);

    requestAnimationFrame(() => {
      clone.style.left = `${cartRect.left + 10}px`;
      clone.style.top = `${cartRect.top + 10}px`;
      clone.style.width = '22px';
      clone.style.height = '22px';
      clone.style.opacity = '0.2';
      clone.style.transform = 'rotate(360deg)';
    });

    setTimeout(() => {
      clone.remove();
      cartBtn.classList.add('scale-125', 'ring-4', 'ring-blue-400');
      setTimeout(() => cartBtn.classList.remove('scale-125', 'ring-4', 'ring-blue-400'), 300);
    }, 750);
  }

  const existing = state.cart.find(item => item.id === productId);
  if (existing) {
    existing.qty = Math.min(99, existing.qty + 1);
  } else {
    state.cart.push({ id: product.id, title: product.title, price: product.price, image: product.image, qty: 1 });
  }

  saveCart();
  updateCartUI();
  showToast(`Added "${product.title.slice(0, 26)}..." to Bag!`, 'success');
}

function changeQty(productId, delta) {
  const idx = state.cart.findIndex(i => i.id === productId);
  if (idx === -1) return;
  state.cart[idx].qty = Math.min(99, state.cart[idx].qty + delta);
  if (state.cart[idx].qty <= 0) state.cart.splice(idx, 1);
  saveCart();
  updateCartUI();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(i => i.id !== productId);
  saveCart();
  updateCartUI();
}

function saveCart() {
  safeSet('jsk_cart_v2', JSON.stringify(state.cart));
}

function applyPromoCode() {
  const input = document.getElementById('promo-input');
  if (!input) return;
  const code = input.value.trim().toUpperCase();
  if (code === 'SIFAT10' || code === 'SAVE10' || code === 'JACK10') {
    state.promoCode = code;
    state.discountRate = 0.10;
    showToast(`Promo ${code} applied! 10% Discount unlocked by Jack Sifat Khan!`, 'success');
  } else {
    state.promoCode = '';
    state.discountRate = 0;
    showToast('Invalid code! Use SIFAT10 or SAVE10 for 10% OFF.', 'error');
  }
  updateCartUI();
}

function setShippingZone(cost) {
  state.shippingCost = Number(cost);
  updateCartUI();
  const { total } = getCartTotals();
  const el = document.getElementById('checkout-payable-total');
  if (el) el.textContent = formatBDT(total);
}

function getCartTotals() {
  const subtotal = state.cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const discount = Math.round(subtotal * state.discountRate);
  const shipping = state.cart.length > 0 ? state.shippingCost : 0;
  const total = subtotal - discount + shipping;
  return { subtotal, discount, shipping, total };
}

function updateCartUI() {
  const totalQty = state.cart.reduce((s, i) => s + i.qty, 0);
  document.querySelectorAll('.cart-badge-count').forEach(el => { el.textContent = totalQty; });

  const itemsContainer = document.getElementById('cart-items-list');
  if (!itemsContainer) return;

  if (state.cart.length === 0) {
    itemsContainer.innerHTML = `
      <div class="text-center py-16">
        <div class="w-20 h-20 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center mx-auto mb-4 text-3xl">
          <i class="fa-solid fa-bag-shopping"></i>
        </div>
        <h4 class="font-bold text-slate-800 text-lg">Your Shopping Bag is Empty</h4>
        <p class="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Explore Jack Sifat Khan's curated dropshipping deals and add items to your cart.</p>
      </div>
    `;
  } else {
    itemsContainer.innerHTML = state.cart.map(item => `
      <div class="flex items-center gap-3.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
        <img src="${esc(item.image)}" alt="" class="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
        <div class="flex-1 min-w-0">
          <h5 class="text-xs font-bold text-slate-800 truncate">${esc(item.title)}</h5>
          <p class="text-sm font-extrabold text-blue-600 mt-0.5">${formatBDT(item.price * item.qty)}</p>
          <div class="flex items-center gap-2 mt-2">
            <button onclick="changeQty(${item.id}, -1)" class="w-6 h-6 rounded-lg bg-white border border-slate-200 text-xs font-bold hover:bg-slate-100">-</button>
            <span class="text-xs font-bold px-1">${item.qty}</span>
            <button onclick="changeQty(${item.id}, 1)" class="w-6 h-6 rounded-lg bg-white border border-slate-200 text-xs font-bold hover:bg-slate-100">+</button>
          </div>
        </div>
        <button onclick="removeFromCart(${item.id})" aria-label="Remove" class="text-slate-400 hover:text-rose-500 p-1.5">
          <i class="fa-solid fa-trash-can text-sm"></i>
        </button>
      </div>
    `).join('');
  }

  const { subtotal, discount, shipping, total } = getCartTotals();
  document.getElementById('cart-subtotal').textContent = formatBDT(subtotal);
  document.getElementById('cart-discount').textContent = '-' + formatBDT(discount);
  document.getElementById('cart-shipping').textContent = formatBDT(shipping);
  document.getElementById('cart-total').textContent = formatBDT(total);
}

// Toggle Slide-Over Cart Drawer
function toggleCartDrawer(open) {
  const drawer = document.getElementById('cart-drawer');
  const backdrop = document.getElementById('cart-backdrop');
  if (!drawer || !backdrop) return;
  if (open) {
    backdrop.classList.remove('hidden');
    setTimeout(() => drawer.classList.remove('translate-x-full'), 10);
  } else {
    drawer.classList.add('translate-x-full');
    setTimeout(() => backdrop.classList.add('hidden'), 300);
  }
}

/* ------------------------------ quick view ------------------------------ */
function openQuickView(productId) {
  const p = state.products.find(x => x.id === productId);
  if (!p) return;
  const modal = document.getElementById('quickview-modal');
  const content = document.getElementById('quickview-body');
  content.innerHTML = `
    <div class="grid md:grid-cols-2 gap-6 items-center">
      <div class="rounded-2xl overflow-hidden bg-slate-100 h-72 md:h-80">
        <img src="${esc(p.image)}" alt="${esc(p.title)}" class="w-full h-full object-cover" />
      </div>
      <div>
        <span class="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">${esc(p.badge || "Jack Sifat's Pick")}</span>
        <h3 class="text-2xl font-extrabold text-slate-900 mt-3">${esc(p.title)}</h3>
        <div class="flex items-center gap-2 mt-2 text-amber-500 text-sm font-bold">
          <i class="fa-solid fa-star"></i> ${esc(p.rating)} (${esc(p.reviews)} verified buyers in Bangladesh)
        </div>
        <p class="text-slate-600 text-sm mt-4 leading-relaxed">${esc(p.description)}</p>
        <div class="mt-5 flex items-baseline gap-3">
          <span class="text-3xl font-extrabold text-blue-600">${formatBDT(p.price)}</span>
          <span class="text-base text-slate-400 line-through">${formatBDT(p.originalPrice)}</span>
        </div>
        <div class="mt-6 flex gap-3">
          <button onclick="addToCart(${p.id}); closeQuickView(); toggleCartDrawer(true);"
            class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-2xl shadow-lg shadow-blue-500/30 transition">
            <i class="fa-solid fa-bolt mr-1.5"></i> Buy Now (Cash on Delivery)
          </button>
        </div>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

function closeQuickView() {
  document.getElementById('quickview-modal').classList.add('hidden');
}

/* ------------------------------ checkout (guest OR logged-in) ------------------------------ */
function openCheckoutModal() {
  if (state.cart.length === 0) {
    showToast('Add at least 1 product to checkout!', 'error');
    return;
  }
  toggleCartDrawer(false);
  prefillCheckoutFromUser();   // auth.js — fills name/phone/email/address + identity banner
  const { total } = getCartTotals();
  document.getElementById('checkout-payable-total').textContent = formatBDT(total);
  document.getElementById('checkout-modal').classList.remove('hidden');
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').classList.add('hidden');
}

// Submit Cash on Delivery Order (Saves to Node.js Backend + Confetti)
async function submitCODOrder(e) {
  e.preventDefault();
  const btn = document.getElementById('checkout-submit-btn');
  const customerName = document.getElementById('cust-name').value.trim();
  const phone = document.getElementById('cust-phone').value.trim();
  const city = document.getElementById('cust-city').value;
  const address = document.getElementById('cust-address').value.trim();
  const email = document.getElementById('cust-email').value.trim();

  state.shippingCost = city === 'Dhaka' ? 60 : 120;
  const { subtotal, discount, shipping, total } = getCartTotals();

  const payload = {
    customerName, phone, city, address, email,
    promoCode: state.promoCode,
    items: state.cart.map(i => ({ id: i.id, qty: i.qty, title: i.title }))
  };

  btn.disabled = true;
  let createdOrder = null;
  try {
    const data = await api('/api/orders', { method: 'POST', body: payload });
    createdOrder = data.order;
  } catch (err) {
    if (err.status) {           // server answered with a validation error → show it, keep the cart
      btn.disabled = false;
      showToast(err.message, 'error');
      if (/no longer available/i.test(err.message)) { await loadProducts(); renderProducts(); updateCartUI(); }
      return;
    }
    // network error → Standalone Browser Mode fallback
  }

  if (!createdOrder) {
    const localId = 'JSK-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    createdOrder = {
      orderId: localId, source: 'direct', vendorSource: 'SifatDropShipping Store',
      customerName, phone, email: email || null, city, address,
      items: state.cart.map(i => ({ id: i.id, title: i.title, qty: i.qty, price: i.price, image: i.image })),
      subtotal, discount, shipping, total,
      status: 'Order Placed', step: 1, createdAt: now, history: [{ status: 'Order Placed', at: now }]
    };
    state.orders.unshift(createdOrder);
    safeSet('jsk_orders_fallback', JSON.stringify(state.orders));
  } else if (state.user && state.user.role === 'admin') {
    state.orders.unshift(createdOrder);
  }
  btn.disabled = false;

  // Clear Cart
  state.cart = [];
  state.promoCode = ''; state.discountRate = 0;
  saveCart();
  updateCartUI();
  closeCheckoutModal();
  e.target.reset();

  // Trigger Celebration Confetti!
  launchConfetti();

  // Show Order Confirmation Modal
  document.getElementById('confirmed-order-id').textContent = '#' + createdOrder.orderId;
  document.getElementById('confirmed-cust-name').textContent = createdOrder.customerName;
  document.getElementById('confirmed-total').textContent = formatBDT(createdOrder.total);
  document.getElementById('confirmed-account-note').textContent = state.user && state.backendOnline
    ? 'Saved to your order history in My Profile.'
    : (state.backendOnline ? 'Tip: create an account to keep an order history.' : '');
  document.getElementById('order-success-modal').classList.remove('hidden');

  // Refresh dashboards / profile
  if (typeof refreshAfterOrder === 'function') refreshAfterOrder();

  // Pre-fill live order tracker
  const trackInput = document.getElementById('track-order-input');
  if (trackInput) {
    trackInput.value = createdOrder.orderId;
    trackOrderNow();
  }
}

/* ------------------------------ live order tracking ------------------------------ */
// Looks an order up from the public tracking API (offline: from local data)
async function fetchTrackedOrder(rawId) {
  try {
    const data = await api(`/api/orders/${encodeURIComponent(rawId)}`);
    return data.order;
  } catch (err) {
    if (err.status) return null;               // 404 → not found
  }
  const local = (state.orders.length ? state.orders : safeParse(safeGet('jsk_orders_fallback'), null) || FALLBACK_ORDERS)
    .find(o => String(o.orderId).toUpperCase() === rawId);
  return local || null;
}

async function trackOrderNow(quiet) {
  const input = document.getElementById('track-order-input');
  const resultBox = document.getElementById('tracking-result-box');
  if (!input || !resultBox) return;

  // quiet = background poll: re-check the order already on screen, never touch what the user is typing
  const rawId = quiet ? state.trackedId : input.value.replace(/^#/, '').trim().toUpperCase();
  if (!rawId) {
    if (!quiet) showToast('Please enter an Order ID (e.g. JSK-2026-101)', 'error');
    return;
  }

  const foundOrder = await fetchTrackedOrder(rawId);
  resultBox.classList.remove('hidden');

  if (!foundOrder) {
    if (quiet) return;
    state.trackedId = null;
    resultBox.innerHTML = `
      <div class="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-center">
        <i class="fa-solid fa-circle-exclamation text-2xl mb-2"></i>
        <p class="font-bold">Order ID "#${esc(rawId)}" Not Found</p>
        <p class="text-xs mt-1">Try sample Order IDs: <strong>JSK-2026-101</strong>, <strong>JSK-2026-102</strong>, or place a new order!</p>
      </div>
    `;
    return;
  }

  // Status-change toast while live-polling
  if (quiet && state.trackedId === foundOrder.orderId && state.trackedStatus && state.trackedStatus !== foundOrder.status) {
    showToast(`Order #${foundOrder.orderId} is now "${foundOrder.status}"`, 'success');
  }
  state.trackedId = foundOrder.orderId;
  state.trackedStatus = foundOrder.status;
  renderTrackingResult(foundOrder, resultBox);
}

function renderTrackingResult(o, resultBox) {
  const steps = [
    { label: 'Order Placed', icon: 'fa-clipboard-check' },
    { label: 'Shipped from JSK Hub', icon: 'fa-box', key: 'Shipped' },
    { label: 'Out for Delivery', icon: 'fa-truck-fast' },
    { label: 'Delivered', icon: 'fa-house-circle-check' }
  ];
  const currentStep = o.step || 1;
  const when = (idx) => {
    const h = (o.history || []).find(x => x.status === STATUS_STEPS[idx]);
    return h ? h.at : '';
  };
  const displayName = o.customerName || 'Customer';   // the public API already masks this (e.g. "Nusrat J.")
  const items = (o.items || []).map(i => `${esc(i.title)} × ${esc(i.qty)}`).join(' · ');

  resultBox.innerHTML = `
    <div class="bg-slate-900 text-white p-6 md:p-8 rounded-3xl border border-slate-800 shadow-xl">
      <div class="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <span class="text-xs uppercase tracking-widest text-blue-400 font-bold">Official SifatDropShipping Tracker <span class="ml-1 text-emerald-400"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-ping mr-1"></span>LIVE</span></span>
          <h4 class="text-2xl font-extrabold mt-0.5">#${esc(o.orderId)} — ${esc(displayName)}</h4>
          <p class="text-xs text-slate-400 mt-1"><i class="fa-solid fa-location-dot mr-1 text-emerald-400"></i>Delivering to ${esc(o.city)}</p>
          <p class="text-[11px] text-slate-500 mt-1">${items}</p>
        </div>
        <div class="text-right">
          <span class="px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            ${esc(o.status)}
          </span>
          <p class="text-lg font-extrabold text-white mt-2">COD Total: ${formatBDT(o.total)}</p>
        </div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-7">
        ${steps.map((s, idx) => {
          const done = (idx + 1) <= currentStep;
          const ts = when(idx);
          return `
            <div class="p-4 rounded-2xl border ${done ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-slate-800/60 border-slate-700 text-slate-500'} flex flex-col items-center text-center transition-all">
              <div class="w-11 h-11 rounded-full flex items-center justify-center text-lg mb-2.5 ${done ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/40' : 'bg-slate-700 text-slate-400'}">
                <i class="fa-solid ${s.icon}"></i>
              </div>
              <span class="text-xs font-bold">${s.label}</span>
              <span class="text-[10px] mt-1 ${done ? 'text-emerald-300' : 'text-slate-500'}">${done ? '✔ Completed' : 'Pending'}</span>
              ${done && ts ? `<span class="text-[10px] text-slate-400 mt-0.5">${esc(ts)}</span>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// Re-checks the tracked order every 8s so status changes made in the dashboard appear live
function initTrackingPoll() {
  setInterval(() => {
    if (document.hidden || !state.trackedId || !state.backendOnline) return;
    if (state.trackedStatus === 'Delivered') return;
    trackOrderNow(true);
  }, 8000);
}

/* ------------------------------ social proof popup ------------------------------ */
// Live Social Proof Sales Notification Popup
function initLiveSalesPopup() {
  const buyers = [
    { name: "Mahmudul Hasan", city: "Dhanmondi, Dhaka", item: "ANC Pro Max Wireless Earbuds" },
    { name: "Sadia Afrin", city: "Sylhet Sadar", item: "Signature Royal Navy Oxford Shirt" },
    { name: "Mehedi Ratul", city: "Uttara, Dhaka", item: "Ultra-Slim Titanium Smart Watch" },
    { name: "Farhana Yeasmin", city: "Agrabad, Chattogram", item: "Korean Glass Skin Glow Serum" }
  ];
  let idx = 0;
  const popup = document.getElementById('live-sales-toast');
  if (!popup) return;

  setInterval(() => {
    const b = buyers[idx % buyers.length];
    idx++;
    document.getElementById('live-buyer-name').textContent = `${b.name} (${b.city})`;
    document.getElementById('live-buyer-item').textContent = b.item;
    popup.classList.remove('translate-y-32', 'opacity-0');
    setTimeout(() => {
      popup.classList.add('translate-y-32', 'opacity-0');
    }, 4500);
  }, 13000);
}

/* ------------------------------ toast + confetti ------------------------------ */
// Toast Notification Helper (text is set via textContent — never interpreted as HTML)
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  const bg = type === 'success' ? 'bg-slate-900 border-emerald-500' : 'bg-rose-950 border-rose-500';
  el.className = `${bg} text-white px-4 py-3 rounded-2xl shadow-xl border-l-4 text-xs font-bold flex items-center gap-2.5 transition-all duration-300 max-w-xs`;
  const icon = document.createElement('i');
  icon.className = `fa-solid ${type === 'success' ? 'fa-circle-check text-emerald-400' : 'fa-triangle-exclamation text-rose-400'} text-base`;
  const span = document.createElement('span');
  span.textContent = msg;
  el.append(icon, span);
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

// Celebration Confetti
function launchConfetti() {
  for (let i = 0; i < 45; i++) {
    const conf = document.createElement('div');
    conf.style.position = 'fixed';
    conf.style.zIndex = '9999';
    conf.style.width = '10px';
    conf.style.height = '10px';
    conf.style.borderRadius = '2px';
    conf.style.left = Math.random() * 100 + 'vw';
    conf.style.top = '-10px';
    conf.style.pointerEvents = 'none';
    conf.style.backgroundColor = ['#2563eb', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'][i % 5];
    conf.style.transition = `transform ${1.5 + Math.random()}s linear, top ${1.5 + Math.random()}s ease-in`;
    document.body.appendChild(conf);
    requestAnimationFrame(() => {
      conf.style.top = '105vh';
      conf.style.transform = `rotate(${360 + Math.random() * 360}deg)`;
    });
    setTimeout(() => conf.remove(), 3000);
  }
}
