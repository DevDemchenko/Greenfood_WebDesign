// ====== STATE ======
let currentUser = null;

// ====== HELPERS (CSRF + API) ======
function getCookie(name) {
  const v = document.cookie.split('; ').find(row => row.startsWith(name + '='));
  return v ? decodeURIComponent(v.split('=')[1]) : null;
}

async function api(url, { method = 'GET', data = null } = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };
  const csrftoken = getCookie('csrftoken');
  if (csrftoken) opts.headers['X-CSRFToken'] = csrftoken;
  if (data) opts.body = JSON.stringify(data);

  const res = await fetch(url, opts);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'Ошибка запроса');
  return payload;
}

// ====== INIT ======
async function init() {
  try {
    const me = await api('/api/me');
    currentUser = me.authenticated ? me.user : null;
  } catch {
    currentUser = null;
  }

  updateUI();
  await renderMenuPage();
}

// ====== AUTH ======
async function login() {
  try {
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value;

    const r = await api('/api/login', { method: 'POST', data: { email, password: pass } });
    currentUser = r.user;

    closeModal();
    updateUI();
    showNotification('Добро пожаловать, ' + currentUser.name + '!');
    showPage(currentUser.role === 'admin' ? 'admin' : 'dashboard');
  } catch (e) {
    showAlert('loginAlert', e.message);
  }
}

async function register() {
  try {
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPass').value;
    const pass2 = document.getElementById('regPass2').value;

    if (!name || !email || !pass) { showAlert('regAlert', 'Заполните все поля'); return; }
    if (pass.length < 6) { showAlert('regAlert', 'Пароль минимум 6 символов'); return; }
    if (pass !== pass2) { showAlert('regAlert', 'Пароли не совпадают'); return; }

    const r = await api('/api/register', { method: 'POST', data: { name, email, password: pass, password2: pass2 } });
    currentUser = r.user;

    closeModal();
    updateUI();
    showNotification('Регистрация успешна! Добро пожаловать!');
    showPage('dashboard');
  } catch (e) {
    showAlert('regAlert', e.message);
  }
}

async function logout() {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  currentUser = null;
  updateUI();
  showPage('home');
  showNotification('Вы вышли из аккаунта');
}

// ====== UI VISIBILITY ======
function updateUI() {
  const isAuth = !!currentUser;
  const isAdmin = isAuth && currentUser.role === 'admin';

  document.getElementById('authButtons')?.classList.toggle('hidden', isAuth);
  document.getElementById('userMenu')?.classList.toggle('hidden', !isAuth);

  document.getElementById('nav-orders')?.classList.toggle('hidden', !isAuth || isAdmin);
  document.getElementById('nav-dash')?.classList.toggle('hidden', !isAuth || isAdmin);
  document.getElementById('nav-admin')?.classList.toggle('hidden', !isAdmin);

  if (isAuth) {
    const h = document.getElementById('headerUserName');
    if (h) h.textContent = currentUser.name;
  } else {
    const h = document.getElementById('headerUserName');
    if (h) h.textContent = '';
  }
}

// ====== PAGES ======
async function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');

  document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
  const navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');

  window.scrollTo(0, 0);

  if (name === 'menu') await renderMenuPage();
  if (name === 'dashboard') {
    await updateDashboard();
    switchDashTab('profile');
  }
  if (name === 'orders') await renderUserOrders();
  if (name === 'admin') await renderAdmin();
}

// ====== MENU ======
async function renderMenuPage() {
  const grid = document.getElementById('menuGrid');
  if (!grid) return;

  grid.innerHTML = '';
  const data = await api('/api/menu');
  const items = data.items || [];

  if (items.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🌿</div><p>Меню пока пусто</p></div>';
    return;
  }

  items.forEach(item => {
    const canOrder = !!currentUser && currentUser.role !== 'admin';

    grid.innerHTML += `
      <div class="menu-card">
        <div class="menu-card-img">${item.emoji || '🥗'}</div>
        <div class="menu-card-body">
          <span class="menu-card-tag">${item.category}</span>
          <h3>${item.name}</h3>
          <p>${item.desc || ''}</p>
          <div class="menu-card-footer">
            <span class="menu-card-kcal">🔥 ${item.kcal}</span>
            <span class="menu-card-price">${item.price} ₽/день</span>
          </div>
          ${canOrder ? `<button class="btn btn-primary btn-sm" style="width:100%;margin-top:16px" onclick="orderItem(${item.id})">Заказать</button>` : ''}
          ${!currentUser ? `<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:16px" onclick="openModal('register')">Войдите чтобы заказать</button>` : ''}
        </div>
      </div>`;
  });
}

async function orderItem(menuId) {
  if (!currentUser) { openModal('login'); return; }
  try {
    const r = await api('/api/orders', { method: 'POST', data: { menu_id: menuId } });
    currentUser.subscription = r.subscription;
    showNotification('✅ Заказ оформлен!');
    await updateDashboard();
  } catch (e) {
    showNotification('❌ ' + e.message);
  }
}

// ====== DASHBOARD ======
async function updateDashboard() {
  if (!currentUser) return;

  // подтянем актуальные данные пользователя/профиля
  try {
    const me = await api('/api/me');
    if (me.authenticated) currentUser = me.user;
  } catch {}

  const u = currentUser;

  document.getElementById('sidebarAvatar').textContent = (u.name?.[0] || 'U').toUpperCase();
  document.getElementById('sidebarName').textContent = u.name || 'Пользователь';
  document.getElementById('sidebarEmail').textContent = u.email || '';
  document.getElementById('sidebarRole').textContent = u.role === 'admin' ? '⚡ Администратор' : '🥗 Клиент';
  document.getElementById('dashWelcome').textContent = 'Привет, ' + (u.name || '') + '!';

  document.getElementById('profileName').value = u.name || '';
  document.getElementById('profileEmail').value = u.email || '';
  document.getElementById('profilePhone').value = u.phone || '';
  document.getElementById('profileAddress').value = u.address || '';

  // заказы
  const ordersData = await api('/api/orders/my');
  const orders = ordersData.orders || [];

  document.getElementById('statOrders').textContent = orders.length;
  document.getElementById('statSub').textContent = u.subscription || '—';

  renderDashOrders(orders);
  await renderSubMenu();
}

function renderDashOrders(orders) {
  const el = document.getElementById('dashOrdersList');
  if (!el) return;

  if (!orders || orders.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>Заказов пока нет</p></div>';
    return;
  }

  el.innerHTML = orders.map(o => `
    <div class="order-item">
      <div class="order-info">
        <h4>${o.menuName}</h4>
        <p>${o.date}</p>
      </div>
      <div style="display:flex;align-items:center;gap:16px;">
        <span style="font-weight:700;color:var(--green-mid)">${o.price} ₽/день</span>
        <span class="order-status ${o.status === 'active' ? 'status-active' : (o.status === 'pending' ? 'status-pending' : 'status-done')}">
          ${o.status === 'active' ? '✅ Активный' : (o.status === 'pending' ? '⏳ В ожидании' : '✔ Завершён')}
        </span>
      </div>
    </div>
  `).join('');
}

async function renderSubMenu() {
  const el = document.getElementById('subMenuList');
  if (!el) return;

  const data = await api('/api/menu');
  const items = data.items || [];

  el.innerHTML = items.map(m => `
    <div style="background:var(--cream);border-radius:12px;padding:16px;border:1.5px solid #e0ddd6;">
      <div style="font-size:2rem;margin-bottom:8px">${m.emoji || '🥗'}</div>
      <div style="font-weight:700;margin-bottom:4px">${m.name}</div>
      <div style="font-size:0.82rem;color:var(--text-light);margin-bottom:12px">${m.kcal} · ${m.price} ₽/день</div>
      <button class="btn btn-primary btn-sm" style="width:100%" onclick="orderItem(${m.id})">Подключить</button>
    </div>
  `).join('');

  const infoEl = document.getElementById('currentSubInfo');
  const sub = currentUser && currentUser.subscription;
  if (infoEl) {
    infoEl.innerHTML = sub
      ? `<div style="background:var(--green-light);padding:14px 18px;border-radius:10px;color:var(--green-deep);font-weight:600">✅ Текущий рацион: <strong>${sub}</strong></div>`
      : '<p>Нет активной подписки. Выберите рацион:</p>';
  }
}

function switchDashTab(tab) {
  document.querySelectorAll('[id^="dtab-"][id$="-content"]').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('[id^="dtab-"]:not([id$="-content"])').forEach(el => el.classList.remove('active'));

  document.getElementById('dtab-' + tab + '-content')?.classList.add('active');
  document.getElementById('dtab-' + tab)?.classList.add('active');
}

async function saveProfile() {
  if (!currentUser) return;
  try {
    const name = document.getElementById('profileName').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    const address = document.getElementById('profileAddress').value.trim();

    const r = await api('/api/profile', { method: 'POST', data: { name, phone, address } });
    currentUser = r.user;

    await updateDashboard();
    showNotification('Профиль сохранён!');
  } catch (e) {
    showNotification('❌ ' + e.message);
  }
}

// ====== USER ORDERS PAGE ======
async function renderUserOrders() {
  if (!currentUser) return;

  const ordersData = await api('/api/orders/my');
  const orders = ordersData.orders || [];

  const el = document.getElementById('userOrdersList');
  if (!el) return;

  if (orders.length === 0) {
    el.innerHTML = `
      <div class="section-card empty-state">
        <div class="empty-icon">📦</div>
        <p>У вас пока нет заказов</p>
        <button class="btn btn-primary mt-4" onclick="showPage('menu')">Выбрать рацион</button>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="section-card">
      ${orders.map(o => `
        <div class="order-item">
          <div class="order-info"><h4>${o.menuName}</h4><p>${o.date}</p></div>
          <div style="display:flex;gap:16px;align-items:center">
            <span style="font-weight:700;color:var(--green-mid)">${o.price} ₽/день</span>
            <span class="order-status ${o.status === 'active' ? 'status-active' : (o.status === 'pending' ? 'status-pending' : 'status-done')}">
              ${o.status === 'active' ? '✅ Активный' : (o.status === 'pending' ? '⏳ В ожидании' : '✔ Завершён')}
            </span>
          </div>
        </div>
      `).join('')}
    </div>`;
}

// ====== ADMIN ======
async function renderAdmin() {
  await renderAdminMenu();
  await renderAdminUsers();
  await renderAdminOrders();
}

function switchAdminTab(tab) {
  document.querySelectorAll('[id^="admin-"]').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('admin-' + tab)?.classList.add('active');
  // event.target используется в вашем HTML — оставим, но безопасно:
  if (window.event && window.event.target) window.event.target.classList.add('active');
}

async function renderAdminMenu() {
  const tbody = document.getElementById('adminMenuTable');
  if (!tbody) return;

  const data = await api('/api/menu');
  const items = data.items || [];

  tbody.innerHTML = items.length === 0
    ? '<tr><td colspan="6" style="text-align:center;color:var(--text-light);padding:40px">Меню пусто</td></tr>'
    : items.map(m => `
      <tr>
        <td style="font-size:1.5rem">${m.emoji || '🥗'}</td>
        <td><strong>${m.name}</strong></td>
        <td>${m.kcal}</td>
        <td>${m.price} ₽</td>
        <td><span class="menu-card-tag">${m.category}</span></td>
        <td>
          <div class="action-btns">
            <button class="btn btn-danger btn-sm" onclick="deleteMenuItem(${m.id})">Удалить</button>
          </div>
        </td>
      </tr>
    `).join('');
}

async function addMenuItem() {
  try {
    const name = document.getElementById('newMenuName').value.trim();
    const kcal = document.getElementById('newMenuKcal').value.trim();
    const price = parseInt(document.getElementById('newMenuPrice').value) || 0;
    const category = document.getElementById('newMenuCat').value;
    const desc = document.getElementById('newMenuDesc').value.trim();
    const emoji = (document.getElementById('newMenuEmoji').value.trim() || '🥗');

    if (!name || !kcal || !price) { showNotification('❌ Заполните обязательные поля'); return; }

    await api('/api/menu', { method: 'POST', data: { name, kcal, price, category, desc, emoji } });

    document.getElementById('newMenuName').value = '';
    document.getElementById('newMenuKcal').value = '';
    document.getElementById('newMenuPrice').value = '';
    document.getElementById('newMenuDesc').value = '';
    document.getElementById('newMenuEmoji').value = '';

    await renderAdminMenu();
    await renderMenuPage();
    showNotification('✅ Позиция добавлена в меню');
  } catch (e) {
    showNotification('❌ ' + e.message);
  }
}

async function deleteMenuItem(id) {
  if (!confirm('Удалить позицию из меню?')) return;
  try {
    await api(`/api/menu/${id}`, { method: 'DELETE' });
    await renderAdminMenu();
    await renderMenuPage();
    showNotification('🗑 Позиция удалена');
  } catch (e) {
    showNotification('❌ ' + e.message);
  }
}

async function renderAdminUsers() {
  const tbody = document.getElementById('adminUsersTable');
  if (!tbody) return;

  const data = await api('/api/admin/users');
  const users = data.users || [];

  tbody.innerHTML = users.map((u, i) => `
    <tr>
      <td style="color:var(--text-light);font-size:0.8rem">${i + 1}</td>
      <td><strong>${u.name}</strong></td>
      <td>${u.email}</td>
      <td>
        <span class="menu-card-tag" style="${u.role === 'admin' ? 'background:#fff3cd;color:#856404' : ''}">
          ${u.role === 'admin' ? '⚡ Администратор' : '🥗 Клиент'}
        </span>
      </td>
      <td>${u.orders}</td>
      <td><span style="color:var(--text-light);font-size:0.8rem">—</span></td>
    </tr>
  `).join('');
}

async function renderAdminOrders() {
  const tbody = document.getElementById('adminOrdersTable');
  if (!tbody) return;

  const data = await api('/api/admin/orders');
  const orders = data.orders || [];

  tbody.innerHTML = orders.length === 0
    ? '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:40px">Заказов нет</td></tr>'
    : orders.map(o => `
      <tr>
        <td>${o.date}</td>
        <td>${o.userName}</td>
        <td>${o.menuName}</td>
        <td>
          <span class="order-status ${o.status === 'active' ? 'status-active' : (o.status === 'pending' ? 'status-pending' : 'status-done')}">
            ${o.status === 'active' ? '✅ Активный' : (o.status === 'pending' ? '⏳ В ожидании' : '✔ Завершён')}
          </span>
        </td>
        <td><strong>${o.price} ₽/день</strong></td>
      </tr>
    `).join('');
}

// ====== MODALS ======
function openModal(type) {
  document.getElementById('modalOverlay')?.classList.add('open');
  document.getElementById('loginModal')?.classList.toggle('hidden', type !== 'login');
  document.getElementById('registerModal')?.classList.toggle('hidden', type !== 'register');
  clearAlerts();
}
function closeModal() {
  document.getElementById('modalOverlay')?.classList.remove('open');
  clearAlerts();
}
function closeModalOutside(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}
function clearAlerts() {
  document.querySelectorAll('.alert').forEach(a => { a.classList.add('hidden'); a.textContent = ''; });
}
function showAlert(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ====== NOTIFICATIONS ======
function showNotification(msg) {
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ====== KEY HANDLERS ======
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter') {
    const loginModal = document.getElementById('loginModal');
    const regModal = document.getElementById('registerModal');
    if (loginModal && !loginModal.classList.contains('hidden')) login();
    if (regModal && !regModal.classList.contains('hidden')) register();
  }
});

// старт
init();
