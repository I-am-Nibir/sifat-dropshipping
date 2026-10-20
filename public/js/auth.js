/**
 * SifatDropShipping - Accounts: Login / Register, Profile & Order History, Checkout prefill
 * Founder & CEO: Jack Sifat Khan
 * Depends on helpers from app.js (state, api, esc, formatBDT, showToast, safeSet…)
 */

let authTab = 'login';
let myOrders = [];

const isAdminUser = () => !!(state.user && state.user.role === 'admin');
// Admin tools are available to the admin account; in Standalone Browser Mode (no server) the demo dashboard is open.
const canAdmin = () => !state.backendOnline || isAdminUser();

/* ------------------------------ session ------------------------------ */
async function initAuth() {
  if (state.token && state.backendOnline) {
    try {
      const data = await api('/api/auth/me');
      state.user = data.user;
    } catch (err) {
      if (err.status === 401) { state.token = null; safeDel('jsk_token'); }
    }
  }
  renderAuthArea();
  updateAccountVisibility();
  if (state.user && !isAdminUser()) await loadMyOrders();
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('user-menu');
    if (menu && !menu.classList.contains('hidden') && !e.target.closest('#auth-area')) menu.classList.add('hidden');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      ['auth-modal', 'quickview-modal'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
    }
  });
}

function updateAccountVisibility() {
  const profile = document.getElementById('profile-section');
  const dash = document.getElementById('dashboard-section');
  if (profile) profile.classList.toggle('hidden', !state.user);
  if (dash) dash.classList.toggle('hidden', !canAdmin());
  if (state.user) fillProfileForm();
}

/* ------------------------------ header (login button / user menu) ------------------------------ */
function renderAuthArea() {
  const area = document.getElementById('auth-area');
  if (!area) return;
  if (!state.user) {
    area.innerHTML = `
      <button onclick="openAuthModal('login')"
        class="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-xs font-extrabold bg-white border border-slate-200 hover:border-blue-600 hover:text-blue-600 text-slate-800 transition">
        <i class="fa-regular fa-user"></i><span class="hidden sm:inline">Login / Register</span>
      </button>`;
    return;
  }
  const initial = esc((state.user.name || '?').trim()[0].toUpperCase());
  area.innerHTML = `
    <button onclick="toggleUserMenu()" aria-label="Account menu"
      class="inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-white border border-slate-200 hover:border-blue-600 transition">
      <span class="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-xs font-extrabold flex items-center justify-center">${initial}</span>
      <span class="hidden sm:inline text-xs font-bold text-slate-800 max-w-[90px] truncate">${esc(state.user.name.split(' ')[0])}</span>
      <i class="fa-solid fa-chevron-down text-[9px] text-slate-400"></i>
    </button>
    <div id="user-menu" class="hidden absolute right-0 mt-2 w-60 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-50">
      <div class="px-3 py-2.5 border-b border-slate-100 mb-1">
        <p class="text-xs font-extrabold text-slate-900 truncate">${esc(state.user.name)}</p>
        <p class="text-[11px] text-slate-400 truncate">${esc(state.user.email)}</p>
        ${isAdminUser() ? '<span class="inline-block mt-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-extrabold"><i class="fa-solid fa-crown mr-1"></i>MERCHANT ADMIN</span>' : ''}
      </div>
      <a href="#profile-section" onclick="toggleUserMenu()" class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600"><i class="fa-solid fa-clock-rotate-left w-4"></i>My Profile &amp; Orders</a>
      ${isAdminUser() ? '<a href="#dashboard-section" onclick="toggleUserMenu()" class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600"><i class="fa-solid fa-chart-pie w-4"></i>Master Dashboard</a>' : ''}
      <button onclick="handleLogout()" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50"><i class="fa-solid fa-right-from-bracket w-4"></i>Log out</button>
    </div>`;
}

function toggleUserMenu() {
  document.getElementById('user-menu')?.classList.toggle('hidden');
}

/* ------------------------------ auth modal ------------------------------ */
function openAuthModal(tab = 'login', opts = {}) {
  switchAuthTab(tab);
  document.getElementById('auth-offline-note').classList.toggle('hidden', state.backendOnline);
  document.getElementById('auth-merchant-note').classList.toggle('hidden', !opts.merchant);
  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('auth-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById(tab === 'register' ? 'auth-name' : 'auth-email').focus(), 50);
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
  if (state.resumeCheckout) { state.resumeCheckout = false; openCheckoutModal(); }  // continue as guest
}

function switchAuthTab(tab) {
  authTab = tab;
  const reg = tab === 'register';
  document.getElementById('auth-field-name').classList.toggle('hidden', !reg);
  document.getElementById('auth-field-phone').classList.toggle('hidden', !reg);
  document.getElementById('auth-pass-hint').classList.toggle('hidden', !reg);
  document.getElementById('auth-password').autocomplete = reg ? 'new-password' : 'current-password';
  document.getElementById('auth-title').textContent = reg ? 'Create your account' : 'Welcome back';
  document.getElementById('auth-sub').textContent = reg
    ? 'Save your details & track every order in one place'
    : 'Log in to see your order history & checkout faster';
  document.getElementById('auth-submit').textContent = reg ? 'Create Account' : 'Log In';
  const on = 'bg-white text-blue-600 shadow-sm', off = 'text-slate-500 hover:text-slate-800';
  document.getElementById('auth-tab-login').className = `py-2.5 rounded-xl text-sm font-bold transition ${reg ? off : on}`;
  document.getElementById('auth-tab-register').className = `py-2.5 rounded-xl text-sm font-bold transition ${reg ? on : off}`;
  document.getElementById('auth-error').classList.add('hidden');
}

function toggleAuthPassword() {
  const input = document.getElementById('auth-password');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  document.getElementById('auth-eye').className = show ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function submitAuth(e) {
  e.preventDefault();
  if (!state.backendOnline) return showAuthError('Accounts need the Node server (npm start).');
  const reg = authTab === 'register';
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const name = document.getElementById('auth-name').value.trim();
  const phone = document.getElementById('auth-phone').value.trim();

  if (reg && name.length < 2) return showAuthError('Please enter your full name.');
  if (!/^\S+@\S+\.\S{2,}$/.test(email)) return showAuthError('Please enter a valid email address.');
  if (!password) return showAuthError('Please enter your password.');
  if (reg && password.length < 8) return showAuthError('Password must be at least 8 characters.');

  const btn = document.getElementById('auth-submit');
  btn.disabled = true;
  try {
    const data = await api(reg ? '/api/auth/register' : '/api/auth/login', {
      method: 'POST',
      body: reg ? { name, email, phone, password } : { email, password }
    });
    state.token = data.token;
    state.user = data.user;
    safeSet('jsk_token', data.token);
    document.getElementById('auth-form').reset();
    document.getElementById('auth-modal').classList.add('hidden');
    renderAuthArea();
    updateAccountVisibility();
    showToast(reg ? `Welcome to SifatDropShipping, ${data.user.name.split(' ')[0]}!` : `Welcome back, ${data.user.name.split(' ')[0]}!`, 'success');

    if (isAdminUser()) { if (typeof initAdminPanel === 'function') initAdminPanel(); }
    else await loadMyOrders();

    if (state.resumeCheckout) { state.resumeCheckout = false; openCheckoutModal(); }
    else if (state.afterLoginScroll) { document.getElementById(state.afterLoginScroll)?.scrollIntoView({ behavior: 'smooth' }); }
    state.afterLoginScroll = null;
  } catch (err) {
    showAuthError(err.status ? err.message : 'Cannot reach the server. Please try again.');
  } finally {
    btn.disabled = false;
  }
}

function handleLogout() {
  state.token = null; state.user = null; myOrders = [];
  safeDel('jsk_token');
  if (state.adminTimer) { clearInterval(state.adminTimer); state.adminTimer = null; }
  state.orders = [];
  renderAuthArea();
  updateAccountVisibility();
  document.getElementById('dash-live-pill')?.classList.add('hidden');
  showToast('You have been logged out.', 'success');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------------ merchant portal gate ------------------------------ */
function openMerchantPortal(e) {
  if (canAdmin()) { updateAccountVisibility(); return true; }       // let the anchor scroll
  if (e) e.preventDefault();
  if (state.user) { showToast('Merchant Dashboard is only available to the admin account.', 'error'); return false; }
  state.afterLoginScroll = 'dashboard-section';
  openAuthModal('login', { merchant: true });
  return false;
}

/* ------------------------------ checkout prefill ------------------------------ */
function prefillCheckoutFromUser() {
  const idBox = document.getElementById('checkout-identity');
  const name = document.getElementById('cust-name'), phone = document.getElementById('cust-phone'),
        email = document.getElementById('cust-email'), city = document.getElementById('cust-city'),
        addr = document.getElementById('cust-address');
  const u = state.user;

  if (u) {
    if (!name.value) name.value = u.name || '';
    if (!phone.value) phone.value = u.phone || '';
    if (!addr.value) addr.value = u.address || '';
    if (u.city) city.value = [...city.options].some(o => o.value === u.city) ? u.city : 'Other District';
    email.value = u.email; email.readOnly = true; email.classList.add('opacity-70');
    idBox.innerHTML = `
      <div class="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800 flex items-center gap-2">
        <i class="fa-solid fa-circle-user text-base"></i>
        <span>Ordering as <strong>${esc(u.name)}</strong> — this order will be saved to your order history.</span>
      </div>`;
  } else {
    email.readOnly = false; email.classList.remove('opacity-70');
    idBox.innerHTML = `
      <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-600 flex flex-wrap items-center justify-between gap-2">
        <span><i class="fa-regular fa-user mr-1.5"></i>Ordering as a <strong>guest</strong></span>
        ${state.backendOnline ? '<button type="button" onclick="loginFromCheckout()" class="px-3 py-1 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold transition">Log in / Register to save orders</button>' : ''}
      </div>`;
  }
  setShippingZone(city.value === 'Dhaka' ? 60 : 120);
}

function loginFromCheckout() {
  closeCheckoutModal();
  state.resumeCheckout = true;
  openAuthModal('login');
}

/* ------------------------------ profile & order history ------------------------------ */
async function loadMyOrders() {
  if (!state.user || !state.backendOnline) return;
  try {
    const data = await api('/api/my-orders');
    myOrders = data.orders;
    renderProfile(data.totalSpent);
  } catch (err) {
    if (err.status === 401) handleLogout();
  }
}

function fillProfileForm() {
  const u = state.user;
  if (!u) return;
  document.getElementById('profile-avatar').textContent = (u.name || '?').trim()[0].toUpperCase();
  document.getElementById('profile-email-line').textContent = `${u.email} · member since ${u.createdAt ? u.createdAt.slice(0, 10) : 'today'}`;
  document.getElementById('prof-name').value = u.name || '';
  document.getElementById('prof-phone').value = u.phone || '';
  document.getElementById('prof-address').value = u.address || '';
  const sel = document.getElementById('prof-city');
  sel.value = [...sel.options].some(o => o.value === u.city) ? u.city : 'Dhaka';
}

async function saveProfile(e) {
  e.preventDefault();
  try {
    const data = await api('/api/auth/me', {
      method: 'PATCH',
      body: {
        name: document.getElementById('prof-name').value.trim(),
        phone: document.getElementById('prof-phone').value.trim(),
        city: document.getElementById('prof-city').value,
        address: document.getElementById('prof-address').value.trim()
      }
    });
    state.user = data.user;
    renderAuthArea();
    fillProfileForm();
    showToast('Profile saved — checkout will auto-fill!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

const STATUS_STYLE = {
  'Order Placed': 'bg-blue-50 text-blue-700 border-blue-200',
  'Shipped': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Out for Delivery': 'bg-amber-50 text-amber-700 border-amber-200',
  'Delivered': 'bg-emerald-50 text-emerald-700 border-emerald-200'
};

function renderProfile(totalSpent) {
  const list = document.getElementById('profile-orders');
  if (!list) return;
  document.getElementById('profile-order-count').textContent = myOrders.length;
  document.getElementById('profile-total-spent').textContent = formatBDT(totalSpent ?? myOrders.reduce((a, o) => a + (o.total || 0), 0));

  if (!myOrders.length) {
    list.innerHTML = `
      <div class="p-10 rounded-3xl bg-slate-50 border border-dashed border-slate-300 text-center">
        <i class="fa-solid fa-bag-shopping text-4xl text-slate-300 mb-3"></i>
        <h4 class="font-extrabold text-slate-800">No orders yet</h4>
        <p class="text-xs text-slate-500 mt-1">Orders you place while logged in will appear here automatically.</p>
        <a href="#products-section" class="inline-block mt-4 px-5 py-2.5 rounded-full bg-blue-600 text-white text-xs font-bold">Start Shopping</a>
      </div>`;
    return;
  }

  list.innerHTML = myOrders.map(o => `
    <div class="p-5 rounded-3xl border border-slate-200 bg-white hover:shadow-lg transition">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-sm font-extrabold text-blue-600">#${esc(o.orderId)}</p>
          <p class="text-[11px] text-slate-400 font-semibold">${esc(o.createdAt)} · ${esc(o.city)} · ${esc(o.paymentMethod || 'Cash on Delivery')}</p>
        </div>
        <span class="px-3 py-1 rounded-full border text-[11px] font-extrabold ${STATUS_STYLE[o.status] || STATUS_STYLE['Order Placed']}">${esc(o.status)}</span>
      </div>
      <div class="mt-3 space-y-2">
        ${(o.items || []).map(i => `
          <div class="flex items-center gap-3">
            ${i.image ? `<img src="${esc(i.image)}" alt="" class="w-11 h-11 rounded-xl object-cover bg-slate-100" />` : '<div class="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300"><i class="fa-solid fa-box"></i></div>'}
            <p class="flex-1 min-w-0 text-xs font-bold text-slate-800 truncate">${esc(i.title)}</p>
            <p class="text-xs font-semibold text-slate-500">${esc(i.qty)} × ${formatBDT(i.price)}</p>
          </div>`).join('')}
      </div>
      <div class="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-slate-500 font-semibold">COD Total <span class="text-base font-extrabold text-slate-900 ml-1">${formatBDT(o.total)}</span></p>
        <button onclick="trackFromProfile('${esc(o.orderId)}')" class="px-4 py-2 rounded-full bg-slate-900 hover:bg-blue-600 text-white text-xs font-bold transition">
          <i class="fa-solid fa-truck-fast mr-1.5"></i>Track Live
        </button>
      </div>
    </div>`).join('');
}

function trackFromProfile(orderId) {
  document.getElementById('track-order-input').value = orderId;
  document.getElementById('tracking-section').scrollIntoView({ behavior: 'smooth' });
  trackOrderNow();
}

// Called by app.js after any order is placed
async function refreshAfterOrder() {
  if (state.user && !isAdminUser()) await loadMyOrders();
  if (typeof loadAdminData === 'function' && canAdmin() && state.backendOnline && isAdminUser()) loadAdminData();
  if (typeof renderDashboardStats === 'function') renderDashboardStats();
}
