/**
 * SifatDropShipping - Merchant / Master Dashboard (admin only)
 * Orders (Direct + Vendor-synced) · Product Manager (add / remove) · Master Sync vendors
 * Founder & CEO: Jack Sifat Khan
 */

let vendors = [];
let sourceFilter = 'all';
let knownOrderIds = null;

/* ------------------------------ boot / refresh ------------------------------ */
function initAdminPanel() {
  if (!canAdmin()) return;
  updateAccountVisibility();
  renderWebhookInfo();
  switchDashTab(state.dashTab || 'orders');
  loadAdminData();
  if (state.backendOnline && isAdminUser()) {
    document.getElementById('dash-live-pill')?.classList.remove('hidden');
    if (state.adminTimer) clearInterval(state.adminTimer);
    // Poll so vendor webhook orders appear without a manual refresh
    state.adminTimer = setInterval(() => { if (!document.hidden && isAdminUser()) loadAdminData(true); }, 10000);
  }
}

async function loadAdminData(silent) {
  if (!canAdmin()) return;
  if (state.backendOnline && isAdminUser()) {
    try {
      const [o, v] = await Promise.all([api('/api/orders'), api('/api/vendors')]);
      state.orders = o.orders;
      vendors = v.vendors;
    } catch (err) {
      if (err.status === 401 || err.status === 403) { handleLogout(); return; }
      return;                                   // transient network error: keep what we have
    }
    // Toast for orders that arrived since the last refresh (e.g. vendor webhook pushes)
    const ids = new Set(state.orders.map(x => x.orderId));
    if (knownOrderIds && silent) {
      const fresh = state.orders.filter(x => !knownOrderIds.has(x.orderId));
      if (fresh.length) {
        const f = fresh[0];
        fresh.forEach(x => { x._flash = true; });
        showToast(fresh.length === 1
          ? `New order ${f.orderId} from ${f.vendorSource}!`
          : `${fresh.length} new orders synced!`, 'success');
      }
    }
    knownOrderIds = ids;
  } else if (!state.orders.length) {
    state.orders = safeParse(safeGet('jsk_orders_fallback'), null) || FALLBACK_ORDERS;
  }
  renderDashboardStats();
  renderProductManager();
  renderVendorPanel();
}

function switchDashTab(tab) {
  state.dashTab = tab;
  document.querySelectorAll('.dash-pane').forEach(p => p.classList.add('hidden'));
  document.getElementById(`dash-pane-${tab}`)?.classList.remove('hidden');
  document.querySelectorAll('.dash-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
}

/* ------------------------------ KPIs + orders table ------------------------------ */
const orderSort = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') ||
  (parseInt(String(b.orderId).split('-').pop(), 10) || 0) - (parseInt(String(a.orderId).split('-').pop(), 10) || 0);

function sourceBadge(o) {
  if (o.source === 'vendor') {
    return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-[11px] font-extrabold whitespace-nowrap"><i class="fa-solid fa-link text-[9px]"></i>${esc(o.vendorSource)}</span>
            ${o.vendorOrderId ? `<span class="block text-[10px] text-slate-400 mt-0.5">Ref ${esc(o.vendorOrderId)}</span>` : ''}`;
  }
  return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-extrabold whitespace-nowrap"><i class="fa-solid fa-store text-[9px]"></i>Direct Store</span>
          ${o.userId ? '<span class="block text-[10px] text-slate-400 mt-0.5">Member</span>' : ''}`;
}

function renderDashboardStats() {
  const orders = state.orders;
  const sum = (l) => l.reduce((a, o) => a + (Number(o.total) || 0), 0);
  const vendorOrders = orders.filter(o => o.source === 'vendor');
  const directOrders = orders.filter(o => o.source !== 'vendor');
  const totalSales = sum(orders);
  const avgOrder = orders.length ? Math.round(totalSales / orders.length) : 0;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('dash-total-sales', formatBDT(totalSales));
  set('dash-total-orders', orders.length);
  set('dash-avg-order', formatBDT(avgOrder));
  set('dash-vendor-orders', vendorOrders.length);
  const split = document.getElementById('dash-sales-split');
  if (split) split.innerHTML = `<i class="fa-solid fa-arrow-trend-up mr-1"></i>Direct ${formatBDT(sum(directOrders))} · Vendors ${formatBDT(sum(vendorOrders))}`;
  const vr = document.getElementById('dash-vendor-rev');
  if (vr) vr.innerHTML = `<i class="fa-solid fa-store mr-1"></i>${formatBDT(sum(vendorOrders))} via Master Sync`;

  renderOrdersTable();
}

function setSourceFilter(v) { sourceFilter = v; renderOrdersTable(true); }

function renderOrdersTable(force) {
  const tbody = document.getElementById('dash-orders-tbody');
  if (!tbody) return;
  // Don't rebuild the table while the admin is mid-way through changing a status dropdown
  if (!force && tbody.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;

  let rows = [...state.orders].sort(orderSort);
  if (sourceFilter === 'direct') rows = rows.filter(o => o.source !== 'vendor');
  else if (sourceFilter === 'vendor') rows = rows.filter(o => o.source === 'vendor');
  else if (sourceFilter.startsWith('v:')) rows = rows.filter(o => o.vendorId === sourceFilter.slice(2));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-xs font-semibold text-slate-400">No orders for this filter yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(o => `
    <tr class="border-b border-slate-100 hover:bg-slate-50/80 text-xs ${o._flash ? 'row-flash' : ''}">
      <td class="py-3.5 px-4 font-bold text-blue-600 whitespace-nowrap">#${esc(o.orderId)}<br><span class="text-[10px] font-semibold text-slate-400">${esc(o.createdAt)}</span></td>
      <td class="py-3.5 px-4 font-semibold text-slate-800">${esc(o.customerName)}<br><span class="text-[11px] text-slate-400">${esc(o.phone)}</span></td>
      <td class="py-3.5 px-4 text-slate-600">${esc(o.city)}</td>
      <td class="py-3.5 px-4">${sourceBadge(o)}</td>
      <td class="py-3.5 px-4 font-extrabold text-slate-900 whitespace-nowrap">${formatBDT(o.total)}<br><span class="text-[10px] font-semibold text-slate-400">${(o.items || []).reduce((a, i) => a + (i.qty || 0), 0)} item(s)</span></td>
      <td class="py-3.5 px-4">
        <select onchange="updateOrderStatus('${esc(o.orderId)}', this.value)"
          class="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-800">
          ${STATUS_STEPS.map(st => `<option value="${st}" ${o.status === st ? 'selected' : ''}>${st}</option>`).join('')}
        </select>
      </td>
    </tr>
  `).join('');
}

async function updateOrderStatus(orderId, newStatus) {
  const ord = state.orders.find(o => o.orderId === orderId);
  const prev = ord ? { status: ord.status, step: ord.step } : null;
  if (ord) { ord.status = newStatus; ord.step = STATUS_STEPS.indexOf(newStatus) + 1; }

  if (state.backendOnline) {
    try {
      const data = await api(`/api/orders/${encodeURIComponent(orderId)}/status`, { method: 'PATCH', body: { status: newStatus } });
      if (ord) Object.assign(ord, data.order);
    } catch (err) {
      if (ord && prev) Object.assign(ord, prev);   // roll back
      showToast(err.message, 'error');
      renderOrdersTable(true);
      return;
    }
  } else {
    safeSet('jsk_orders_fallback', JSON.stringify(state.orders));
  }
  showToast(`Order #${orderId} updated to "${newStatus}"`, 'success');
  renderDashboardStats();
}

/* ------------------------------ Product Manager ------------------------------ */
function renderProductManager() {
  const list = document.getElementById('pm-list');
  if (!list) return;
  document.getElementById('pm-count').textContent = `(${state.products.length} live)`;
  if (!state.products.length) {
    list.innerHTML = `<div class="p-8 rounded-2xl bg-slate-50 border border-dashed border-slate-300 text-center text-xs font-semibold text-slate-400">Your storefront is empty. Add your first product →</div>`;
    return;
  }
  list.innerHTML = state.products.map(p => `
    <div class="flex items-center gap-3.5 p-3 rounded-2xl bg-white border border-slate-200 hover:border-blue-300 hover:shadow-md transition">
      <img src="${esc(p.image)}" alt="" class="w-14 h-14 rounded-xl object-cover bg-slate-100 flex-shrink-0" />
      <div class="flex-1 min-w-0">
        <p class="text-xs font-extrabold text-slate-900 truncate">${esc(p.title)}</p>
        <p class="text-[11px] text-slate-500 font-semibold mt-0.5">
          <span class="text-blue-600">${esc(p.category)}</span> · ${formatBDT(p.price)} <span class="line-through text-slate-300">${formatBDT(p.originalPrice)}</span> · Stock ${esc(p.stock ?? '—')}
        </p>
      </div>
      <button onclick="deleteProduct(${p.id})" title="Remove from storefront"
        class="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white text-xs font-bold transition flex items-center gap-1.5">
        <i class="fa-solid fa-trash-can"></i><span class="hidden sm:inline">Remove</span>
      </button>
    </div>
  `).join('');
}

// Add New Product from Jack Sifat Khan's Merchant Dashboard
async function handleAddNewProduct(e) {
  e.preventDefault();
  const title = document.getElementById('new-prod-title').value.trim();
  const category = document.getElementById('new-prod-cat').value;
  const price = Number(document.getElementById('new-prod-price').value);
  const originalPrice = Number(document.getElementById('new-prod-orig').value) || Math.round(price * 1.35);
  const stock = parseInt(document.getElementById('new-prod-stock').value, 10);
  const description = document.getElementById('new-prod-desc').value.trim();
  const image = document.getElementById('new-prod-img').value.trim() || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=700&q=80';

  let createdProd = null;
  if (state.backendOnline) {
    try {
      const data = await api('/api/products', { method: 'POST', body: { title, category, price, originalPrice, image, stock, description } });
      createdProd = data.product;
    } catch (err) {
      return showToast(err.message, 'error');
    }
  } else {
    createdProd = {
      id: Date.now(), title, category, price, originalPrice, rating: 5.0, reviews: 1,
      badge: "Jack Sifat's New Pick", stock: Number.isFinite(stock) ? stock : 25, image,
      description: description || 'Curated & verified personally by Founder Jack Sifat Khan.'
    };
    safeSet('jsk_products_fallback', JSON.stringify([createdProd, ...state.products]));
  }

  state.products.unshift(createdProd);
  renderProducts();
  renderProductManager();
  e.target.reset();
  showToast(`New Product "${title.slice(0, 30)}" Published to Store!`, 'success');
}

async function deleteProduct(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Remove "${p.title}" from the storefront?\n\nExisting orders are not affected.`)) return;

  if (state.backendOnline) {
    try { await api(`/api/products/${id}`, { method: 'DELETE' }); }
    catch (err) { return showToast(err.message, 'error'); }
  }
  state.products = state.products.filter(x => x.id !== id);
  if (!state.backendOnline) safeSet('jsk_products_fallback', JSON.stringify(state.products));

  // Also pull it out of any open shopping bag
  if (state.cart.some(i => i.id === id)) { state.cart = state.cart.filter(i => i.id !== id); saveCart(); updateCartUI(); }
  renderProducts();
  renderProductManager();
  showToast(`"${p.title.slice(0, 30)}" removed from storefront`, 'success');
}

/* ------------------------------ Master Sync (vendors) ------------------------------ */
function webhookUrl() {
  return (location.origin && location.origin !== 'null' ? location.origin : 'https://YOUR-DOMAIN') + '/api/master-sync/webhook';
}

function renderWebhookInfo() {
  const url = webhookUrl();
  const el = document.getElementById('webhook-url');
  if (el) el.textContent = 'POST ' + url;
  const sample = document.getElementById('webhook-sample');
  if (sample) sample.textContent =
`curl -X POST ${url} \\
  -H "Content-Type: application/json" \\
  -H "X-Master-Sync-Key: msk_YOUR_VENDOR_KEY" \\
  -d '{
    "vendorOrderId": "SHOP-10234",
    "customer": { "name": "Rahim Uddin", "phone": "01712345678",
                  "email": "rahim@example.com", "city": "Dhaka",
                  "address": "House 12, Road 5, Banani" },
    "items": [ { "title": "Smart Watch Series X", "qty": 1, "price": 2490 } ],
    "shipping": 60, "discount": 0, "currency": "BDT"
  }'`;
}

function renderVendorPanel() {
  const list = document.getElementById('vendor-list');
  if (!list) return;
  if (!state.backendOnline) {
    list.innerHTML = `<div class="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800"><i class="fa-solid fa-triangle-exclamation mr-1.5"></i>Master Sync needs the Node.js server. Run <code>npm start</code>.</div>`;
    return;
  }
  // Keep the order-source filter in sync with the vendor list
  const sel = document.getElementById('dash-source-filter');
  if (sel) {
    sel.innerHTML = `<option value="all">All Sources</option><option value="direct">Direct Store only</option><option value="vendor">All Vendors</option>` +
      vendors.map(v => `<option value="v:${esc(v.id)}">↳ ${esc(v.name)}</option>`).join('');
    sel.value = [...sel.options].some(o => o.value === sourceFilter) ? sourceFilter : 'all';
  }
  if (!vendors.length) {
    list.innerHTML = `<div class="p-8 rounded-2xl bg-slate-50 border border-dashed border-slate-300 text-center text-xs font-semibold text-slate-400">No vendors connected yet. Create one on the right →</div>`;
    return;
  }
  list.innerHTML = vendors.map(v => `
    <div class="p-4 rounded-2xl bg-white border border-slate-200">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-extrabold text-slate-900 flex items-center gap-2"><i class="fa-solid fa-store text-violet-600"></i>${esc(v.name)}</p>
          <p class="text-[11px] text-slate-500 font-semibold mt-0.5">
            ${v.hasKey ? `Key <code class="text-slate-700">${esc(v.keyPrefix)}</code>` : '<span class="text-amber-600">No active key — generate one</span>'}
            · ${v.orderCount} order(s) · ${formatBDT(v.revenue)}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button onclick="simulateVendorOrder('${esc(v.id)}')" class="px-3 py-1.5 rounded-full bg-violet-50 hover:bg-violet-600 text-violet-700 hover:text-white text-[11px] font-extrabold transition"><i class="fa-solid fa-bolt mr-1"></i>Simulate order</button>
          <button onclick="rotateVendorKey('${esc(v.id)}')" class="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-900 text-slate-700 hover:text-white text-[11px] font-extrabold transition"><i class="fa-solid fa-key mr-1"></i>${v.hasKey ? 'Rotate key' : 'Generate key'}</button>
          <button onclick="deleteVendor('${esc(v.id)}')" class="px-3 py-1.5 rounded-full bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white text-[11px] font-extrabold transition"><i class="fa-solid fa-trash-can mr-1"></i>Remove</button>
        </div>
      </div>
    </div>
  `).join('');
}

function revealNewKey(vendorName, key) {
  document.getElementById('new-key-vendor').textContent = `Vendor: ${vendorName}`;
  document.getElementById('new-key-value').textContent = key;
  document.getElementById('new-key-box').classList.remove('hidden');
}

async function handleCreateVendor(e) {
  e.preventDefault();
  const name = document.getElementById('new-vendor-name').value.trim();
  try {
    const data = await api('/api/vendors', { method: 'POST', body: { name } });
    revealNewKey(data.vendor.name, data.apiKey);
    e.target.reset();
    showToast(`Vendor "${name}" connected!`, 'success');
    loadAdminData(true);
  } catch (err) { showToast(err.message, 'error'); }
}

async function rotateVendorKey(id) {
  const v = vendors.find(x => x.id === id);
  if (v && v.hasKey && !confirm(`Rotate the key for "${v.name}"?\n\nTheir current key stops working immediately.`)) return;
  try {
    const data = await api(`/api/vendors/${encodeURIComponent(id)}/rotate-key`, { method: 'POST' });
    revealNewKey(data.vendor.name, data.apiKey);
    showToast('New vendor key generated', 'success');
    loadAdminData(true);
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteVendor(id) {
  const v = vendors.find(x => x.id === id);
  if (!v || !confirm(`Disconnect "${v.name}"?\n\nTheir key stops working. Orders they already synced stay in your dashboard.`)) return;
  try {
    await api(`/api/vendors/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast(`"${v.name}" disconnected`, 'success');
    loadAdminData(true);
  } catch (err) { showToast(err.message, 'error'); }
}

async function simulateVendorOrder(id) {
  try {
    const data = await api(`/api/vendors/${encodeURIComponent(id)}/simulate`, { method: 'POST' });
    showToast(`Synced ${data.order.orderId} from ${data.order.vendorSource}`, 'success');
    await loadAdminData(true);
    switchDashTab('orders');
  } catch (err) { showToast(err.message, 'error'); }
}
