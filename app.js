const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyPPqwKKK04voCZAATZFp2oDLYmps51VKlDJY0FKWojm1Y2mnOPp33co1FeT4xjsCXC9g/exec';
const SESSION_KEY = 'caishen_session_token';

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

function showAllSkeletons() {
  const targets = [
    { sel: '#overviewRows', cols: 4 },
    { sel: '#productRows', cols: 7 },
    { sel: '#stockRows', cols: 5 },
    { sel: '#salesRows', cols: 5 },
    { sel: '#inventoryRows', cols: 6 },
    { sel: '#userRows', cols: 5 },
  ];
  targets.forEach(({ sel, cols }) => {
    const el = $(sel);
    if (el) el.innerHTML = renderSkeletonRows(cols, 4);
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
}

function restoreSession() {
  const token = localStorage.getItem(SESSION_KEY);
  if (!token) return;
  setLoginStatus('Restoring session...');
  apiCall('session', { token })
    .then((result) => {
      saveSession(result.token);
      showDashboard(result.user, result.data);
      setLoginStatus('');
    })
    .catch(() => {
      clearSession();
      setLoginStatus('Please login again.');
    });
}

function showDashboard(user, data) {
  state.user = user;
  state.data = data;
  $('#loginView').classList.add('hidden');
  $('#dashboardView').classList.remove('hidden');
  $('#roleLabel').textContent = user.role;
  $('#userChip').textContent = user.name + ' - ' + user.role;
  $('.admin-only').forEach((item) => item.classList.toggle('hidden', user.role !== 'Admin'));
  render();
}

function saveSession(token) {
  if (token) localStorage.setItem(SESSION_KEY, token);
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
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
      state.user = result.user;
      state.data = result.data;
      $('#loginView').classList.add('hidden');
      $('#dashboardView').classList.remove('hidden');
      $('#roleLabel').textContent = result.user.role;
      $('#userChip .user-name-text') ? $('#userChip .user-name-text').textContent = `${result.user.name} (${result.user.role})` : $('#userChip').textContent = `${result.user.name} - ${result.user.role}`;
      const mobileAvatar = $('#mobileUserAvatar') || $('#mobileUserChip');
      if (mobileAvatar) mobileAvatar.textContent = (result.user.name || 'U').charAt(0).toUpperCase();
      $$('.admin-only').forEach((item) => item.classList.toggle('hidden', result.user.role !== 'Admin'));
      render();
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
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const type = button.dataset.type;
  const id = button.dataset.id;
  const rows = type === 'product' ? state.data.products : state.data.users;
  const item = rows.find((record) => record.id === id);
  if (!item) return;
  if (button.dataset.action === 'edit') return editRecord(type, item);
  if (!confirm(`Delete ${item.name || item.username}?`)) return;
  const action = type === 'product' ? 'deleteProduct' : 'deleteUser';
  apiCall(action, { id, actorRole: state.user.role, actorId: state.user.id })
    .then((data) => {
      state.data = data;
      render();
      showToast('Deleted successfully.');
    })
    .catch((error) => showToast(error.message || 'Unable to delete.', 'error'));
}

function editRecord(type, item) {
  const form = type === 'product' ? $('#productForm') : $('#userForm');
  Object.keys(item).forEach((key) => {
    if (form.elements[key] && key !== 'password') form.elements[key].value = item[key];
  });
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
}

function showView(viewId) {
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === viewId));
  $$('.nav-item[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === viewId));
  const navBtn = document.querySelector(`[data-view="${viewId}"]`);
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
  fillRows('#productRows', data.products, (item) => [item.sku, item.name, item.category, money(item.price), item.beginningStock || 0, badge(item.status), rowActions('product', item.id)]);
  fillRows('#stockRows', data.stockIn, (item) => [item.date, productName(item.productId), item.quantity, item.supplier || '-', item.encodedBy || '-']);
  fillRows('#salesRows', data.sales, (item) => [item.date, productName(item.productId), item.quantity, money(item.total), item.encodedBy || '-']);
  fillRows('#userRows', data.users, (item) => [item.name, item.username, item.role, badge(item.status), rowActions('user', item.id)]);

  const query = $('#inventorySearch').value.toLowerCase();
  fillRows('#inventoryRows', inventory.filter((item) => `${item.sku} ${item.name}`.toLowerCase().includes(query)), (item) => [
    item.sku, item.name, item.stockIn, item.sold, item.currentStock, badge(item.stockStatus),
  ]);
}

function fillSelects(products) {
  $$('select[name="productId"]').forEach((select) => {
    const current = select.value;
    select.innerHTML = '<option value="">Select product</option>' + products.map((item) =>
      `<option value="${item.id}">${escapeHtml(item.sku)} - ${escapeHtml(item.name)}</option>`
    ).join('');
    select.value = current;
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
  return `<div class="row-actions">
    <button class="row-action" data-action="edit" data-type="${type}" data-id="${id}" type="button" title="Edit ${type === 'product' ? 'Product' : 'User'}" aria-label="Edit">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
    </button>
    <button class="row-action danger" data-action="delete" data-type="${type}" data-id="${id}" type="button" title="Delete ${type === 'product' ? 'Product' : 'User'}" aria-label="Delete">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
    </button>
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

