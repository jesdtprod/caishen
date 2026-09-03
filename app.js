const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyPPqwKKK04voCZAATZFp2oDLYmps51VKlDJY0FKWojm1Y2mnOPp33co1FeT4xjsCXC9g/exec';
const SESSION_KEY = 'caishen_session_token';
const VIEW_KEY = 'caishen_active_view';

const localStore = {
  users: [{ id: 'USR-DEMO', name: 'Administrator', username: 'admin', role: 'Admin', status: 'Active' }],
  products: [],
  stockIn: [],
  sales: [],
  inventory: [],
};

let state = { user: null, data: localStore };

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener('DOMContentLoaded', () => {
  setToday();
  bindNavigation();
  bindForms();
  showAllSkeletons();
  setupCustomSelects();
  restoreSession();
});

let activeRequestsCount = 0;

function showOverlay(message = 'Processing request...') {
  activeRequestsCount++;
  const overlay = $('#globalLoadingOverlay');
  const text = $('#globalLoadingText');
  if (text && message) text.textContent = message;
  if (overlay) overlay.classList.remove('hidden');
}

function hideOverlay() {
  activeRequestsCount = Math.max(0, activeRequestsCount - 1);
  if (activeRequestsCount === 0) {
    const overlay = $('#globalLoadingOverlay');
    if (overlay) overlay.classList.add('hidden');
  }
}

function getActionMessage(action) {
  const map = {
    login: 'Signing in to system...',
    saveProduct: 'Saving product to catalog...',
    updateProduct: 'Updating product specifications...',
    deleteProduct: 'Deleting product record...',
    saveStockIn: 'Saving inbound stock receipt...',
    saveSale: 'Recording sales transaction...',
    saveUser: 'Creating user credentials...',
    updateUser: 'Updating user credentials...',
    deleteUser: 'Deleting user account...',
    dashboard: 'Fetching latest dashboard data...',
  };
  return map[action] || 'Processing request...';
}

function apiCall(action, payload = {}) {
  showOverlay(getActionMessage(action));

  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes('PASTE_YOUR')) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const result = mockCall(action, payload);
        hideOverlay();
        resolve(result);
      }, 350);
    });
  }

  return new Promise((resolve, reject) => {
    const callback = `ceCallback_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement('script');
    const params = new URLSearchParams({
      action,
      callback,
      payload: JSON.stringify(payload),
    });
    let completed = false;
    let timeoutId;

    window[callback] = (response) => {
      completed = true;
      cleanup();
      hideOverlay();
      response.ok ? resolve(response.data) : reject(new Error(response.error));
    };

    script.onerror = () => {
      if (completed) return;
      cleanup();
      hideOverlay();
      reject(new Error('Google Apps Script was blocked by the browser. Disable ad blocker/shields for this site, then reload.'));
    };

    script.onload = () => {
      if (completed) return;
      cleanup();
      hideOverlay();
      reject(new Error('Google Apps Script loaded but did not return data. Redeploy Apps Script as a new version.'));
    };

    function cleanup() {
      clearTimeout(timeoutId);
      delete window[callback];
      script.remove();
    }

    timeoutId = setTimeout(() => {
      if (completed) return;
      cleanup();
      hideOverlay();
      reject(new Error('Google Apps Script is taking too long. Try again, then check deployment access is Anyone.'));
    }, 45000);

    script.src = `${APPS_SCRIPT_URL}?${params.toString()}`;
    document.body.appendChild(script);
  });
}

function mockCall(action, payload) {
  if (action === 'login') {
    return { user: localStore.users[0], data: localStore };
  }
  if (action === 'saveProduct') {
    localStore.products.push(withId('PRD', Object.assign({}, payload, { sku: nextLocalSku() })));
  }
  if (action === 'updateProduct') updateLocal(localStore.products, payload);
  if (action === 'deleteProduct') removeLocal(localStore.products, payload.id);
  if (action === 'saveStockIn') localStore.stockIn.push(withId('STK', payload));
  if (action === 'saveSale') {
    const product = localStore.products.find((productItem) => productItem.id === payload.productId);
    const price = Number(payload.price || (product ? product.price : 0) || 0);
    localStore.sales.push(withId('SAL', Object.assign({}, payload, {
      price,
      total: Number(payload.quantity || 0) * price,
    })));
  }
  if (action === 'saveUser') localStore.users.push(withId('USR', payload));
  if (action === 'updateUser') updateLocal(localStore.users, payload);
  if (action === 'deleteUser') removeLocal(localStore.users, payload.id);
  refreshLocalInventory();
  return localStore;
}

function withId(prefix, item) {
  return Object.assign({ id: `${prefix}-${Date.now()}` }, item);
}

function nextLocalSku() {
  const maxNumber = localStore.products.reduce((max, product) => {
    const match = String(product.sku || '').match(/^CSH-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return 'CSH-' + String(maxNumber + 1).padStart(5, '0');
}

function updateLocal(rows, item) {
  const index = rows.findIndex((row) => row.id === item.id);
  if (index >= 0) rows[index] = Object.assign({}, rows[index], item);
}

function removeLocal(rows, id) {
  const index = rows.findIndex((row) => row.id === id);
  if (index >= 0) rows.splice(index, 1);
}

function refreshLocalInventory() {
  localStore.inventory = localStore.products.map((product) => {
    const stockIn = sum(localStore.stockIn, product.id);
    const sold = sum(localStore.sales, product.id);
    const currentStock = Number(product.beginningStock || 0) + stockIn - sold;
    return Object.assign({}, product, {
      stockIn,
      sold,
      currentStock,
      stockStatus: currentStock <= Number(product.lowStock || 0) ? 'Low Stock' : 'In Stock',
    });
  });
}

function sum(rows, productId) {
  return rows.filter((row) => row.productId === productId).reduce((total, row) => total + Number(row.quantity || 0), 0);
}

function openModal(modalId) {
  const modal = $(`#${modalId}`);
  if (modal) modal.classList.remove('hidden');
}

function closeModal(modalId) {
  const modal = $(`#${modalId}`);
  if (modal) modal.classList.add('hidden');
}

function setButtonLoading(button, isLoading) {
  if (!button) return;
  button.classList.toggle('is-loading', isLoading);
  button.disabled = isLoading;
  const spinner = button.querySelector('.btn-spinner');
  if (spinner) spinner.classList.toggle('hidden', !isLoading);
}

function renderSkeletonRows(colCount = 5, rowCount = 4) {
  return Array.from({ length: rowCount }).map(() =>
    `<tr class="skeleton-row">${Array.from({ length: colCount }).map(() =>
      `<td><div class="skeleton-shimmer skeleton-line"></div></td>`
    ).join('')}</tr>`
  ).join('');
}

function renderSkeletonCards(count = 3) {
  return Array.from({ length: count }).map(() =>
    `<div class="data-card" style="pointer-events: none;">
      <div class="data-card-header">
        <div class="skeleton-shimmer" style="width: 80px; height: 20px; border-radius: 4px;"></div>
        <div class="skeleton-shimmer" style="width: 50px; height: 20px; border-radius: 99px;"></div>
      </div>
      <div style="padding-top: 4px;">
        <div class="skeleton-shimmer" style="width: 65%; height: 16px; border-radius: 4px; margin-bottom: 10px;"></div>
        <div class="data-card-grid">
          <div class="skeleton-shimmer" style="width: 100%; height: 24px; border-radius: 4px;"></div>
          <div class="skeleton-shimmer" style="width: 100%; height: 24px; border-radius: 4px;"></div>
          <div class="skeleton-shimmer" style="width: 100%; height: 24px; border-radius: 4px;"></div>
        </div>
      </div>
    </div>`
  ).join('');
}

function showAllSkeletons() {
  const targets = [
    { sel: '#overviewRows', cols: 4 },
    { sel: '#productRows', cols: 6 },
    { sel: '#stockRows', cols: 5 },
    { sel: '#salesRows', cols: 5 },
    { sel: '#inventoryRows', cols: 6 },
    { sel: '#userRows', cols: 5 },
  ];
  targets.forEach(({ sel, cols }) => {
    const el = $(sel);
    if (el) el.innerHTML = renderSkeletonRows(cols, 4);
  });
  ['#productCards', '#stockCards', '#salesCards', '#inventoryCards', '#userCards'].forEach((sel) => {
    const el = $(sel);
    if (el) el.innerHTML = renderSkeletonCards(3);
  });
}

function setupCustomSelects() {
  $$('select').forEach((select) => initCustomSelect(select));

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.custom-select-wrap')) {
      $$('.custom-select-wrap.open').forEach((el) => el.classList.remove('open'));
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      $$('.custom-select-wrap.open').forEach((el) => el.classList.remove('open'));
    }
  });
}

function initCustomSelect(select) {
  if (!select || select.dataset.customized === 'true') return;
  select.dataset.customized = 'true';

  const wrap = document.createElement('div');
  wrap.className = 'custom-select-wrap';
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const label = document.createElement('span');
  label.className = 'custom-select-label';

  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.setAttribute('class', 'custom-select-arrow');
  arrow.setAttribute('viewBox', '0 0 24 24');
  arrow.setAttribute('fill', 'none');
  arrow.setAttribute('stroke', 'currentColor');
  arrow.setAttribute('stroke-width', '2');
  arrow.setAttribute('stroke-linecap', 'round');
  arrow.setAttribute('stroke-linejoin', 'round');
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', '6 9 12 15 18 9');
  arrow.appendChild(polyline);

  trigger.appendChild(label);
  trigger.appendChild(arrow);
  wrap.appendChild(trigger);

  const menu = document.createElement('div');
  menu.className = 'custom-select-menu';
  menu.setAttribute('role', 'listbox');
  wrap.appendChild(menu);

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = wrap.classList.contains('open');
    $$('.custom-select-wrap.open').forEach((el) => {
      if (el !== wrap) el.classList.remove('open');
    });
    wrap.classList.toggle('open', !isOpen);
    trigger.setAttribute('aria-expanded', String(!isOpen));
  });

  buildCustomOptions(select, menu, label);

  select.addEventListener('change', () => {
    syncCustomSelectLabel(select, label, menu);
  });

  const form = select.closest('form');
  if (form) {
    form.addEventListener('reset', () => {
      setTimeout(() => syncCustomSelectLabel(select, label, menu), 0);
    });
  }
}

function buildCustomOptions(select, menu, label) {
  if (!menu) return;
  menu.innerHTML = '';
  const options = Array.from(select.options);

  options.forEach((opt) => {
    const item = document.createElement('div');
    item.className = `custom-select-option ${opt.value === select.value ? 'selected' : ''}`;
    item.dataset.value = opt.value;
    item.setAttribute('role', 'option');

    const spanText = document.createElement('span');
    spanText.textContent = opt.textContent;
    item.appendChild(spanText);

    const check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    check.setAttribute('class', 'option-check');
    check.setAttribute('viewBox', '0 0 24 24');
    check.setAttribute('fill', 'none');
    check.setAttribute('stroke', 'currentColor');
    check.setAttribute('stroke-width', '2.5');
    const chkPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    chkPoly.setAttribute('points', '20 6 9 17 4 12');
    check.appendChild(chkPoly);
    item.appendChild(check);

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      select.value = opt.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('input', { bubbles: true }));
      syncCustomSelectLabel(select, label, menu);
      const wrap = select.closest('.custom-select-wrap');
      if (wrap) wrap.classList.remove('open');
    });

    menu.appendChild(item);
  });

  syncCustomSelectLabel(select, label, menu);
}

function syncCustomSelectLabel(select, label, menu) {
  if (!select) return;
  const wrap = select.closest('.custom-select-wrap');
  if (!label && wrap) label = wrap.querySelector('.custom-select-label');
  if (!menu && wrap) menu = wrap.querySelector('.custom-select-menu');

  const selected = select.options[select.selectedIndex];
  if (label) {
    label.textContent = selected ? selected.textContent : 'Select...';
    label.classList.toggle('is-placeholder', !select.value);
  }

  if (menu) {
    menu.querySelectorAll('.custom-select-option').forEach((opt) => {
      const isMatch = opt.dataset.value === select.value;
      opt.classList.toggle('selected', isMatch);
    });
  }
}

function syncCustomSelect(select) {
  if (!select) return;
  const wrap = select.closest('.custom-select-wrap');
  if (!wrap) {
    initCustomSelect(select);
    return;
  }
  const menu = wrap.querySelector('.custom-select-menu');
  const label = wrap.querySelector('.custom-select-label');
  buildCustomOptions(select, menu, label);
}

function syncAllCustomSelectsInForm(form) {
  if (!form) return;
  form.querySelectorAll('select').forEach((sel) => {
    syncCustomSelectLabel(sel);
  });
}

function bindNavigation() {
  $$('.nav-item[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      showView(button.dataset.view);
      closeMobileSidebar();
    });
  });

  const mobileBtn = $('#mobileMenuBtn');
  const sidebar = $('#appSidebar');
  const backdrop = $('#sidebarBackdrop');

  if (mobileBtn && sidebar) {
    mobileBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      if (backdrop) backdrop.classList.toggle('active', sidebar.classList.contains('open'));
    });
  }

  if (backdrop && sidebar) {
    backdrop.addEventListener('click', closeMobileSidebar);
  }

  $('#logoutButton').addEventListener('click', () => {
    clearSession();
    state = { user: null, data: localStore };
    $('#loginView').classList.remove('hidden');
    $('#dashboardView').classList.add('hidden');
    closeMobileSidebar();
    showToast('You have been logged out.');
  });
}

function closeMobileSidebar() {
  const sidebar = $('#appSidebar');
  const backdrop = $('#sidebarBackdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('active');
}

function bindForms() {
  $('#loginForm').addEventListener('submit', submitLogin);
  $('#productForm').addEventListener('submit', (event) => saveForm(event, 'saveProduct'));
  $('#stockForm').addEventListener('submit', (event) => saveForm(event, 'saveStockIn'));
  $('#salesForm').addEventListener('submit', (event) => saveForm(event, 'saveSale'));
  $('#userForm').addEventListener('submit', (event) => saveForm(event, 'saveUser', { actorRole: state.user.role }));
  $('#inventorySearch').addEventListener('input', render);
  document.addEventListener('click', handleActions);

  // Modal Open Triggers
  document.addEventListener('click', (event) => {
    const openBtn = event.target.closest('[data-open-modal]');
    if (openBtn) {
      openModal(openBtn.dataset.openModal);
      return;
    }
    const closeBtn = event.target.closest('[data-close-modal]');
    if (closeBtn) {
      closeModal(closeBtn.dataset.closeModal);
      return;
    }
    if (event.target.classList.contains('modal-backdrop')) {
      event.target.classList.add('hidden');
      return;
    }
  });

  // ESC to close modal
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      $$('.modal-backdrop:not(.hidden)').forEach((modal) => modal.classList.add('hidden'));
    }
  });

  $$('[data-reset-form]').forEach((button) => {
    button.addEventListener('click', () => resetForm(button.dataset.resetForm));
  });

  const confirmDelBtn = $('#confirmDeleteBtn');
  if (confirmDelBtn) confirmDelBtn.addEventListener('click', executeConfirmedDelete);

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.kebab-wrap')) {
      $$('.kebab-menu.open').forEach((m) => m.classList.remove('open'));
    }
  });
}

function restoreSession() {
  const token = localStorage.getItem(SESSION_KEY);
  if (!token) return;
  $('#loginView').classList.add('hidden');
  $('#dashboardView').classList.remove('hidden');
  showView(getSavedView());
  setLoginStatus('Restoring session...');
  apiCall('session', { token })
    .then((result) => {
      saveSession(result.token);
      showDashboard(result.user, result.data);
      setLoginStatus('');
    })
    .catch(() => {
      clearSession();
      $('#dashboardView').classList.add('hidden');
      $('#loginView').classList.remove('hidden');
      setLoginStatus('Please login again.');
    });
}

function showDashboard(user, data) {
  state.user = user;
  state.data = data;
  $('#loginView').classList.add('hidden');
  $('#dashboardView').classList.remove('hidden');
  $('#roleLabel').textContent = user.role;
  const userText = $('#userChip .user-name-text');
  if (userText) userText.textContent = `${user.name} (${user.role})`;
  else $('#userChip').textContent = `${user.name} - ${user.role}`;
  const mobileAvatar = $('#mobileUserAvatar') || $('#mobileUserChip');
  if (mobileAvatar) mobileAvatar.textContent = (user.name || 'U').charAt(0).toUpperCase();
  $$('.admin-only').forEach((item) => item.classList.toggle('hidden', user.role !== 'Admin'));
  render();
  showView(getSavedView());
}

function saveSession(token) {
  if (token) localStorage.setItem(SESSION_KEY, token);
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(VIEW_KEY);
}

function submitLogin(event) {
  if (event) event.preventDefault();
  setLoginStatus('Verifying credentials...');
  const loginBtn = $('#loginButton');
  setButtonLoading(loginBtn, true);

  const form = Object.fromEntries(new FormData($('#loginForm')));
  apiCall('login', form)
    .then((result) => {
      setButtonLoading(loginBtn, false);
      saveSession(result.token);
      showDashboard(result.user, result.data);
      setLoginStatus('Login successful.');
      showToast(`Welcome back, ${result.user.name}!`);
    })
    .catch((error) => {
      setButtonLoading(loginBtn, false);
      setLoginStatus(error.message || 'Login failed.');
      showToast(error.message || 'Login failed.', 'error');
    });
}

function saveForm(event, action, extra = {}) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitBtn = form.querySelector('button[type="submit"]');
  setButtonLoading(submitBtn, true);

  const payload = Object.assign(Object.fromEntries(new FormData(form)), extra, { encodedBy: state.user ? state.user.name : 'Admin' });
  const finalAction = payload.id ? action.replace('save', 'update') : action;
  apiCall(finalAction, payload)
    .then((data) => {
      setButtonLoading(submitBtn, false);
      state.data = data;
      const formId = form.getAttribute('id');
      resetForm(formId);
      const modal = form.closest('.modal-backdrop');
      if (modal) modal.classList.add('hidden');
      render();
      showToast('Saved successfully.');
    })
    .catch((error) => {
      setButtonLoading(submitBtn, false);
      showToast(error.message || 'Unable to save.', 'error');
    });
}

function handleActions(event) {
  const kebabBtn = event.target.closest('[data-kebab-toggle]');
  if (kebabBtn) {
    event.stopPropagation();
    const id = kebabBtn.dataset.kebabToggle;
    const menu = $(`#kebab-${id}`);
    const isOpen = menu && menu.classList.contains('open');
    $$('.kebab-menu.open').forEach((m) => m.classList.remove('open'));
    if (menu && !isOpen) menu.classList.add('open');
    return;
  }

  const button = event.target.closest('[data-action]');
  if (!button) return;

  $$('.kebab-menu.open').forEach((m) => m.classList.remove('open'));

  const type = button.dataset.type;
  const id = button.dataset.id;
  const rows = type === 'product' ? state.data.products : state.data.users;
  const item = rows.find((record) => record.id === id);
  if (!item) return;
  if (button.dataset.action === 'edit') return editRecord(type, item);
  if (button.dataset.action === 'delete') return promptDelete(type, id);
}

let pendingDelete = null;

function promptDelete(type, id) {
  const rows = type === 'product' ? state.data.products : state.data.users;
  const item = rows.find((record) => record.id === id);
  if (!item) return;

  pendingDelete = { type, id, item };

  const title = $('#confirmItemTitle');
  const desc = $('#confirmItemDesc');
  const itemName = item.name || item.username || 'this record';

  if (title) title.textContent = `Delete ${type === 'product' ? 'Product' : 'User'}?`;
  if (desc) desc.innerHTML = `Are you sure you want to delete <strong>${escapeHtml(itemName)}</strong>?<br><span style="font-size: 12.5px; color: var(--muted); margin-top: 6px; display: inline-block;">This record will be safely archived (soft delete).</span>`;

  openModal('confirmModal');
}

function executeConfirmedDelete() {
  if (!pendingDelete) return;
  const { type, id } = pendingDelete;
  const confirmBtn = $('#confirmDeleteBtn');
  setButtonLoading(confirmBtn, true);

  const action = type === 'product' ? 'deleteProduct' : 'deleteUser';
  apiCall(action, { id, actorRole: state.user.role, actorId: state.user.id })
    .then((data) => {
      setButtonLoading(confirmBtn, false);
      state.data = data;
      closeModal('confirmModal');
      pendingDelete = null;
      render();
      showToast(`${type === 'product' ? 'Product' : 'User'} archived successfully.`);
    })
    .catch((error) => {
      setButtonLoading(confirmBtn, false);
      showToast(error.message || 'Unable to delete.', 'error');
    });
}

function editRecord(type, item) {
  const form = type === 'product' ? $('#productForm') : $('#userForm');
  Object.keys(item).forEach((key) => {
    if (form.elements[key] && key !== 'password') form.elements[key].value = item[key];
  });
  syncAllCustomSelectsInForm(form);
  if (type === 'product') {
    const btnText = $('#productSubmit .btn-text');
    if (btnText) btnText.textContent = 'Update Product';
    else $('#productSubmit').textContent = 'Update Product';
    openModal('productModal');
  }
  if (type === 'user') {
    const btnText = $('#userSubmit .btn-text');
    if (btnText) btnText.textContent = 'Update User';
    else $('#userSubmit').textContent = 'Update User';
    openModal('userModal');
  }
  showView(type === 'product' ? 'products' : 'users');
}

function resetForm(formId) {
  const form = $(`#${formId}`);
  if (!form) return;
  form.reset();
  if (form.elements.id) form.elements.id.value = '';
  if (formId === 'productForm' && form.elements.sku) form.elements.sku.value = 'Auto-generated';
  const prodBtnText = $('#productSubmit .btn-text');
  if (prodBtnText) prodBtnText.textContent = 'Save Product';
  else if ($('#productSubmit')) $('#productSubmit').textContent = 'Save Product';
  const userBtnText = $('#userSubmit .btn-text');
  if (userBtnText) userBtnText.textContent = 'Create User';
  else if ($('#userSubmit')) $('#userSubmit').textContent = 'Create User';
  setToday();
  syncAllCustomSelectsInForm(form);
}

function getSavedView() {
  const saved = localStorage.getItem(VIEW_KEY);
  if (saved === 'users' && state.user && state.user.role !== 'Admin') return 'overview';
  return saved && document.getElementById(saved) ? saved : 'overview';
}

function showView(viewId) {
  const targetView = document.getElementById(viewId) ? viewId : 'overview';
  localStorage.setItem(VIEW_KEY, targetView);
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === targetView));
  $$('.nav-item[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === targetView));
  const navBtn = document.querySelector(`[data-view="${targetView}"]`);
  if (navBtn) {
    const span = navBtn.querySelector('span');
    $('#pageTitle').textContent = span ? span.textContent : navBtn.textContent;
  }
}

function render() {
  const data = state.data;
  const inventory = data.inventory || [];
  $('#statProducts').textContent = data.products.length;
  $('#statStock').textContent = inventory.reduce((total, item) => total + Number(item.currentStock || 0), 0);
  $('#statSales').textContent = money(data.sales.reduce((total, item) => total + Number(item.total || 0), 0));
  $('#statLow').textContent = inventory.filter((item) => item.stockStatus === 'Low Stock').length;

  fillSelects(data.products);
  fillRows('#overviewRows', inventory.slice(0, 8), (item) => [item.sku, item.name, item.currentStock, badge(item.stockStatus)]);

  fillRows('#productRows', data.products, (item) => [item.sku, item.name, item.category, money(item.price), badge(item.status), rowActions('product', item.id)]);
  fillProductCards('#productCards', data.products);

  fillRows('#stockRows', data.stockIn, (item) => [item.date, productName(item.productId), item.quantity, item.supplier || '-', item.encodedBy || '-']);
  fillStockCards('#stockCards', data.stockIn);

  fillRows('#salesRows', data.sales, (item) => [item.date, productName(item.productId), item.quantity, money(item.total), item.encodedBy || '-']);
  fillSalesCards('#salesCards', data.sales);

  fillRows('#userRows', data.users, (item) => [item.name, item.username, item.role, badge(item.status), rowActions('user', item.id)]);
  fillUserCards('#userCards', data.users);

  const query = $('#inventorySearch').value.toLowerCase();
  const filteredInventory = inventory.filter((item) => `${item.sku} ${item.name}`.toLowerCase().includes(query));
  fillRows('#inventoryRows', filteredInventory, (item) => [
    item.sku, item.name, item.stockIn, item.sold, item.currentStock, badge(item.stockStatus),
  ]);
  fillInventoryCards('#inventoryCards', filteredInventory);
}

function fillProductCards(selector, products) {
  const target = $(selector);
  if (!target) return;
  if (!products.length) {
    target.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--muted);">No products found.</div>';
    return;
  }
  target.innerHTML = products.map((item) => `
    <div class="data-card">
      <div class="data-card-header">
        <div class="data-card-tags">
          <span class="sku-tag">${escapeHtml(item.sku)}</span>
          ${badge(item.status)}
        </div>
        ${rowActions('product', item.id)}
      </div>
      <div class="data-card-body">
        <h4 class="data-card-title">${escapeHtml(item.name)}</h4>
        <div class="data-card-grid">
          <div class="data-card-field">
            <span class="field-label">Category</span>
            <span class="field-val">${escapeHtml(item.category || '-')}</span>
          </div>
          <div class="data-card-field">
            <span class="field-label">Price</span>
            <span class="field-val price">₱${money(item.price)}</span>
          </div>
          <div class="data-card-field">
            <span class="field-label">Beginning</span>
            <span class="field-val">${item.beginningStock || 0} ${escapeHtml(item.unit || '')}</span>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function fillUserCards(selector, users) {
  const target = $(selector);
  if (!target) return;
  if (!users.length) {
    target.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--muted);">No users found.</div>';
    return;
  }
  target.innerHTML = users.map((item) => `
    <div class="data-card">
      <div class="data-card-header">
        <div class="data-card-tags">
          <span class="sku-tag">${escapeHtml(item.role)}</span>
          ${badge(item.status)}
        </div>
        ${rowActions('user', item.id)}
      </div>
      <div class="data-card-body">
        <h4 class="data-card-title">${escapeHtml(item.name)}</h4>
        <div class="data-card-grid" style="grid-template-columns: 1fr;">
          <div class="data-card-field">
            <span class="field-label">Username</span>
            <span class="field-val">${escapeHtml(item.username)}</span>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function fillStockCards(selector, list) {
  const target = $(selector);
  if (!target) return;
  if (!list.length) {
    target.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--muted);">No stock-in records found.</div>';
    return;
  }
  target.innerHTML = list.map((item) => `
    <div class="data-card">
      <div class="data-card-header">
        <span class="sku-tag">${escapeHtml(item.date)}</span>
        <span class="badge" style="background: rgba(34,197,94,0.12); color: #15803d; font-weight:700;">+${item.quantity} Inbound</span>
      </div>
      <div class="data-card-body">
        <h4 class="data-card-title">${escapeHtml(productName(item.productId))}</h4>
        <div class="data-card-grid" style="grid-template-columns: 1fr 1fr;">
          <div class="data-card-field">
            <span class="field-label">Supplier</span>
            <span class="field-val">${escapeHtml(item.supplier || '-')}</span>
          </div>
          <div class="data-card-field">
            <span class="field-label">Encoded By</span>
            <span class="field-val">${escapeHtml(item.encodedBy || '-')}</span>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function fillSalesCards(selector, list) {
  const target = $(selector);
  if (!target) return;
  if (!list.length) {
    target.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--muted);">No sales records found.</div>';
    return;
  }
  target.innerHTML = list.map((item) => `
    <div class="data-card">
      <div class="data-card-header">
        <span class="sku-tag">${escapeHtml(item.date)}</span>
        <span class="field-val price" style="font-size: 15px;">₱${money(item.total)}</span>
      </div>
      <div class="data-card-body">
        <h4 class="data-card-title">${escapeHtml(productName(item.productId))}</h4>
        <div class="data-card-grid" style="grid-template-columns: 1fr 1fr;">
          <div class="data-card-field">
            <span class="field-label">Quantity Sold</span>
            <span class="field-val">${item.quantity}</span>
          </div>
          <div class="data-card-field">
            <span class="field-label">Encoded By</span>
            <span class="field-val">${escapeHtml(item.encodedBy || '-')}</span>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function fillInventoryCards(selector, list) {
  const target = $(selector);
  if (!target) return;
  if (!list.length) {
    target.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--muted);">No inventory records found.</div>';
    return;
  }
  target.innerHTML = list.map((item) => `
    <div class="data-card">
      <div class="data-card-header">
        <span class="sku-tag">${escapeHtml(item.sku)}</span>
        ${badge(item.stockStatus)}
      </div>
      <div class="data-card-body">
        <h4 class="data-card-title">${escapeHtml(item.name)}</h4>
        <div class="data-card-grid">
          <div class="data-card-field">
            <span class="field-label">Inbound</span>
            <span class="field-val">${item.stockIn || 0}</span>
          </div>
          <div class="data-card-field">
            <span class="field-label">Sold</span>
            <span class="field-val">${item.sold || 0}</span>
          </div>
          <div class="data-card-field">
            <span class="field-label">Current</span>
            <span class="field-val" style="color: var(--ce-blue); font-weight: 700;">${item.currentStock || 0}</span>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function fillSelects(products) {
  $$('select[name="productId"]').forEach((select) => {
    const current = select.value;
    select.innerHTML = '<option value="">Select product</option>' + products.map((item) =>
      `<option value="${item.id}">${escapeHtml(item.sku)} - ${escapeHtml(item.name)}</option>`
    ).join('');
    select.value = current;
    syncCustomSelect(select);
  });
}

function fillRows(selector, rows, mapper) {
  const target = $(selector);
  if (!target) return;
  target.innerHTML = rows.length
    ? rows.map((row) => `<tr>${mapper(row).map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center; padding: 24px; color: var(--muted);">No records found.</td></tr>';
}

function productName(productId) {
  const product = state.data.products.find((item) => item.id === productId);
  return product ? product.name : '-';
}

function badge(text) {
  return `<span class="badge ${text === 'Low Stock' ? 'low' : ''}">${escapeHtml(text || '-')}</span>`;
}

function rowActions(type, id) {
  return `<div class="kebab-wrap">
    <button class="kebab-btn" data-kebab-toggle="${id}" type="button" aria-label="More actions" title="Actions">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
    </button>
    <div class="kebab-menu" id="kebab-${id}">
      <button class="kebab-item" data-action="edit" data-type="${type}" data-id="${id}" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        <span>Edit</span>
      </button>
      <button class="kebab-item danger" data-action="delete" data-type="${type}" data-id="${id}" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        <span>Delete</span>
      </button>
    </div>
  </div>`;
}

function money(value) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[char]));
}

function setToday() {
  const today = new Date().toISOString().slice(0, 10);
  $$('input[type="date"]').forEach((input) => {
    if (!input.value) input.value = today;
  });
}

function setLoginStatus(message) {
  const target = $('#loginStatus');
  if (target) target.textContent = message;
}

let toastTimer = null;
function showToast(message, type = 'success') {
  const toast = $('#toast');
  if (!toast) return;
  const messageEl = $('#toastMessage');
  const iconEl = $('#toastIcon');

  if (messageEl) messageEl.textContent = message;
  else toast.textContent = message;

  if (type === 'error') {
    toast.classList.add('error');
    if (iconEl) {
      iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    }
  } else {
    toast.classList.remove('error');
    if (iconEl) {
      iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    }
  }

  toast.classList.remove('hidden');
  void toast.offsetWidth;
  toast.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}


