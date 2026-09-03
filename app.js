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

function showOverlay() {
  // Disabled: skeleton loading and modal button spinners provide interactive feedback
}

function hideOverlay() {
  // Disabled: skeleton loading and modal button spinners provide interactive feedback
}

function getActionMessage(action) {
  const map = {
    login: 'Signing in to system...',
    saveProduct: 'Saving product to catalog...',
    updateProduct: 'Updating product specifications...',
    deleteProduct: 'Deleting product record...',
    saveStockIn: 'Saving inbound stock receipt...',
    updateStockIn: 'Updating stock-in record...',
    cancelStockIn: 'Cancelling inbound stock receipt...',
    saveSale: 'Recording sales transaction...',
    updateSale: 'Updating sales record...',
    cancelSale: 'Cancelling sales order...',
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
  if (action === 'saveStockIn') localStore.stockIn.unshift(withId('STK', Object.assign({ status: 'Active' }, payload)));
  if (action === 'updateStockIn') updateLocal(localStore.stockIn, payload);
  if (action === 'cancelStockIn') {
    const item = localStore.stockIn.find((r) => String(r.id) === String(payload.id));
    if (item) item.status = 'Cancelled';
  }
  if (action === 'saveSale') {
    const product = localStore.products.find((productItem) => productItem.id === payload.productId);
    const price = Number(payload.price || (product ? product.price : 0) || 0);
    localStore.sales.unshift(withId('SAL', Object.assign({ status: 'Completed' }, payload, {
      price,
      total: Number(payload.quantity || 0) * price,
    })));
  }
  if (action === 'updateSale') {
    const product = localStore.products.find((productItem) => productItem.id === payload.productId);
    const price = Number(payload.price || (product ? product.price : 0) || 0);
    const quantity = Number(payload.quantity || 0);
    updateLocal(localStore.sales, Object.assign({}, payload, {
      price,
      quantity,
      total: price * quantity,
    }));
  }
  if (action === 'cancelSale') {
    const item = localStore.sales.find((r) => String(r.id) === String(payload.id));
    if (item) item.status = 'Cancelled';
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
  return rows
    .filter((row) => row.productId === productId && row.status !== 'Cancelled')
    .reduce((total, row) => total + Number(row.quantity || 0), 0);
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

function setupPasswordToggle() {
  const toggleBtn = $('#togglePasswordBtn');
  const passwordInput = $('#loginPassword');
  if (!toggleBtn || !passwordInput) return;

  toggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const isPassword = passwordInput.getAttribute('type') === 'password';
    passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
    const eyeShow = toggleBtn.querySelector('.eye-show');
    const eyeHide = toggleBtn.querySelector('.eye-hide');
    if (eyeShow && eyeHide) {
      eyeShow.classList.toggle('hidden', isPassword);
      eyeHide.classList.toggle('hidden', !isPassword);
    }
    toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  });
}

function bindForms() {
  $('#loginForm').addEventListener('submit', submitLogin);
  setupPasswordToggle();
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

function closeAllKebabMenus() {
  $$('.kebab-wrap.open').forEach((w) => w.classList.remove('open'));
  $$('.kebab-menu.open').forEach((m) => m.classList.remove('open'));
}

function handleActions(event) {
  const kebabBtn = event.target.closest('.kebab-btn, [data-kebab-toggle]');
  if (kebabBtn) {
    event.preventDefault();
    event.stopPropagation();
    const wrap = kebabBtn.closest('.kebab-wrap');
    const menu = wrap ? wrap.querySelector('.kebab-menu') : null;
    const wasOpen = wrap && wrap.classList.contains('open');

    closeAllKebabMenus();

    if (wrap && menu && !wasOpen) {
      wrap.classList.add('open');
      menu.classList.add('open');
    }
    return;
  }

  const button = event.target.closest('[data-action]');
  if (!button) return;

  closeAllKebabMenus();

  const type = button.dataset.type;
  const id = button.dataset.id;
  const rows = type === 'product' ? state.data.products : type === 'stock' ? state.data.stockIn : type === 'sale' ? state.data.sales : state.data.users;
  const item = rows.find((record) => String(record.id) === String(id));
  if (!item) return;
  if (button.dataset.action === 'edit') return editRecord(type, item);
  if (button.dataset.action === 'delete') return promptDelete(type, id);
}

let pendingDelete = null;

function promptDelete(type, id) {
  const rows = type === 'product' ? state.data.products : type === 'stock' ? state.data.stockIn : type === 'sale' ? state.data.sales : state.data.users;
  const item = rows.find((record) => String(record.id) === String(id));
  if (!item) return;

  pendingDelete = { type, id, item };

  const title = $('#confirmItemTitle');
  const desc = $('#confirmItemDesc');
  const btnText = $('#confirmDeleteBtn .btn-text');

  if (type === 'stock') {
    const prodName = productName(item.productId);
    if (title) title.textContent = 'Cancel Stock-In?';
    if (desc) desc.innerHTML = `Are you sure you want to cancel inbound receipt of <strong>${escapeHtml(prodName)}</strong> (+${item.quantity})?<br><span style="font-size: 12.5px; color: var(--muted); margin-top: 6px; display: inline-block;">This stock-in will be marked as Cancelled and will NOT be included in inventory balances.</span>`;
    if (btnText) btnText.textContent = 'Yes, Cancel';
  } else if (type === 'sale') {
    const prodName = productName(item.productId);
    if (title) title.textContent = 'Cancel Sale?';
    if (desc) desc.innerHTML = `Are you sure you want to cancel the sale order of <strong>${escapeHtml(prodName)}</strong> (₱${money(item.total)})?<br><span style="font-size: 12.5px; color: var(--muted); margin-top: 6px; display: inline-block;">This sale will be marked as Cancelled and inventory will be restored.</span>`;
    if (btnText) btnText.textContent = 'Yes, Cancel';
  } else {
    const itemName = item.name || item.username || 'this record';
    if (title) title.textContent = `Delete ${type === 'product' ? 'Product' : 'User'}?`;
    if (desc) desc.innerHTML = `Are you sure you want to delete <strong>${escapeHtml(itemName)}</strong>?<br><span style="font-size: 12.5px; color: var(--muted); margin-top: 6px; display: inline-block;">This record will be safely archived (soft delete).</span>`;
    if (btnText) btnText.textContent = 'Yes, Delete';
  }

  openModal('confirmModal');
}

function executeConfirmedDelete() {
  if (!pendingDelete) return;
  const { type, id } = pendingDelete;
  const confirmBtn = $('#confirmDeleteBtn');
  setButtonLoading(confirmBtn, true);

  const action = type === 'product' ? 'deleteProduct' : type === 'stock' ? 'cancelStockIn' : type === 'sale' ? 'cancelSale' : 'deleteUser';
  apiCall(action, { id, actorRole: state.user ? state.user.role : 'Admin', actorId: state.user ? state.user.id : '' })
    .then((data) => {
      setButtonLoading(confirmBtn, false);
      state.data = data;
      closeModal('confirmModal');
      pendingDelete = null;
      render();
      showToast(type === 'stock' ? 'Stock-In cancelled successfully.' : type === 'sale' ? 'Sale cancelled successfully.' : `${type === 'product' ? 'Product' : 'User'} archived successfully.`);
    })
    .catch((error) => {
      setButtonLoading(confirmBtn, false);
      showToast(error.message || 'Unable to complete action.', 'error');
    });
}

function editRecord(type, item) {
  let form;
  if (type === 'product') form = $('#productForm');
  else if (type === 'user') form = $('#userForm');
  else if (type === 'stock') form = $('#stockForm');
  else if (type === 'sale') form = $('#salesForm');

  if (!form) return;

  Object.keys(item).forEach((key) => {
    if (form.elements[key] && key !== 'password') {
      if (key === 'date' && item[key]) {
        const dStr = String(item[key]);
        const m = dStr.match(/^(\d{4}-\d{2}-\d{2})/);
        form.elements[key].value = m ? m[1] : dStr.slice(0, 10);
      } else {
        form.elements[key].value = item[key];
      }
    }
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
  if (type === 'stock') {
    const btnText = $('#stockSubmit .btn-text');
    if (btnText) btnText.textContent = 'Update Stock-In';
    else if ($('#stockSubmit')) $('#stockSubmit').textContent = 'Update Stock-In';
    if ($('#stockModalTitle')) $('#stockModalTitle').textContent = 'Edit Stock-In Entry';
    openModal('stockModal');
  }
  if (type === 'sale') {
    const btnText = $('#salesSubmit .btn-text');
    if (btnText) btnText.textContent = 'Update Sale';
    else if ($('#salesSubmit')) $('#salesSubmit').textContent = 'Update Sale';
    if ($('#salesModalTitle')) $('#salesModalTitle').textContent = 'Edit Sales Entry';
    openModal('salesModal');
  }
  showView(type === 'product' ? 'products' : type === 'stock' ? 'stock' : type === 'sale' ? 'sales' : 'users');
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
  const stockBtnText = $('#stockSubmit .btn-text');
  if (stockBtnText) stockBtnText.textContent = 'Save Stock-In';
  else if ($('#stockSubmit')) $('#stockSubmit').textContent = 'Save Stock-In';
  if ($('#stockModalTitle')) $('#stockModalTitle').textContent = 'Stock-In Entry';
  const salesBtnText = $('#salesSubmit .btn-text');
  if (salesBtnText) salesBtnText.textContent = 'Save Sale';
  else if ($('#salesSubmit')) $('#salesSubmit').textContent = 'Save Sale';
  if ($('#salesModalTitle')) $('#salesModalTitle').textContent = 'Sales Entry';
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
  $('#statSales').textContent = money(data.sales.filter((r) => r.status !== 'Cancelled').reduce((total, item) => total + Number(item.total || 0), 0));
  $('#statLow').textContent = inventory.filter((item) => item.stockStatus === 'Low Stock').length;

  fillSelects(data.products);
  fillRows('#overviewRows', inventory.slice(0, 8), (item) => [item.sku, item.name, item.currentStock, badge(item.stockStatus)]);

  fillRows('#productRows', data.products, (item) => [item.sku, item.name, item.category, money(item.price), badge(item.status), rowActions('product', item.id)]);
  fillProductCards('#productCards', data.products);

  fillRows('#stockRows', data.stockIn, (item) => [
    formatDateTime(item.date, item.createdAt),
    productName(item.productId),
    `${item.quantity} ${productUnit(item.productId)}`,
    item.supplier || '-',
    item.reference || '-',
    item.encodedBy || '-',
    badge(item.status || 'Active'),
    rowActions('stock', item.id, item),
  ]);
  fillStockCards('#stockCards', data.stockIn);

  fillRows('#salesRows', data.sales, (item) => [
    formatDateTime(item.date, item.createdAt),
    productName(item.productId),
    item.customer || 'Walk-in',
    `${item.quantity} ${productUnit(item.productId)}`,
    `₱${money(item.total)}`,
    item.encodedBy || '-',
    badge(item.status || 'Completed'),
    rowActions('sale', item.id, item),
  ]);
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
    target.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--muted); grid-column: 1 / -1;">No products found.</div>';
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
    target.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--muted); grid-column: 1 / -1;">No users found.</div>';
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
        <div class="data-card-grid" style="grid-template-columns: 1fr 1fr;">
          <div class="data-card-field">
            <span class="field-label">Username</span>
            <span class="field-val">${escapeHtml(item.username)}</span>
          </div>
          <div class="data-card-field">
            <span class="field-label">Role</span>
            <span class="field-val">${escapeHtml(item.role)}</span>
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
    target.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--muted); grid-column: 1 / -1;">No stock-in records found.</div>';
    return;
  }
  target.innerHTML = list.map((item) => {
    const unit = productUnit(item.productId);
    const sku = productSku(item.productId);
    const isCancelled = item.status === 'Cancelled';
    return `
      <div class="data-card ${isCancelled ? 'is-cancelled' : ''}">
        <div class="data-card-header">
          <div class="data-card-tags">
            ${sku ? `<span class="sku-tag">${escapeHtml(sku)}</span>` : ''}
          </div>
          ${rowActions('stock', item.id, item)}
        </div>
        <div class="data-card-body">
          <h4 class="data-card-title">${escapeHtml(productName(item.productId))}</h4>
          <div class="data-card-grid" style="grid-template-columns: 1fr 1fr;">
            <div class="data-card-field">
              <span class="field-label">Supplier</span>
              <span class="field-val">${escapeHtml(item.supplier || '-')}</span>
            </div>
            <div class="data-card-field">
              <span class="field-label">Reference / PO #</span>
              <span class="field-val">${escapeHtml(item.reference || '-')}</span>
            </div>
            <div class="data-card-field">
              <span class="field-label">Quantity Received</span>
              <span class="field-val" style="font-weight: 700; ${isCancelled ? 'text-decoration: line-through; color: var(--muted);' : 'color: #15803d;'}">
                +${item.quantity} ${escapeHtml(unit)}
              </span>
            </div>
            <div class="data-card-field">
              <span class="field-label">Status</span>
              <span class="field-val">${badge(item.status || 'Active')}</span>
            </div>
            <div class="data-card-field" style="border-top: 1px dashed var(--line); padding-top: 6px; margin-top: 2px;">
              <span class="field-label">Encoded By</span>
              <span class="field-val">${escapeHtml(item.encodedBy || '-')}</span>
            </div>
            <div class="data-card-field" style="border-top: 1px dashed var(--line); padding-top: 6px; margin-top: 2px;">
              <span class="field-label">Date &amp; Time</span>
              <span class="field-val" style="font-size: 11.5px; font-weight: 600;">${escapeHtml(formatDateTime(item.date, item.createdAt))}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function fillSalesCards(selector, list) {
  const target = $(selector);
  if (!target) return;
  if (!list.length) {
    target.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--muted); grid-column: 1 / -1;">No sales records found.</div>';
    return;
  }
  target.innerHTML = list.map((item) => {
    const unit = productUnit(item.productId);
    const sku = productSku(item.productId);
    const unitPrice = Number(item.price || (item.quantity ? Number(item.total || 0) / Number(item.quantity || 1) : 0));
    const isCancelled = item.status === 'Cancelled';
    return `
      <div class="data-card ${isCancelled ? 'is-cancelled' : ''}">
        <div class="data-card-header">
          <div class="data-card-tags">
            ${sku ? `<span class="sku-tag">${escapeHtml(sku)}</span>` : ''}
          </div>
          ${rowActions('sale', item.id, item)}
        </div>
        <div class="data-card-body">
          <h4 class="data-card-title">${escapeHtml(productName(item.productId))}</h4>
          <div class="data-card-grid" style="grid-template-columns: 1fr 1fr;">
            <div class="data-card-field">
              <span class="field-label">Customer</span>
              <span class="field-val">${escapeHtml(item.customer || 'Walk-in Customer')}</span>
            </div>
            <div class="data-card-field">
              <span class="field-label">Unit Price</span>
              <span class="field-val">₱${money(unitPrice)}</span>
            </div>
            <div class="data-card-field">
              <span class="field-label">Quantity Sold</span>
              <span class="field-val" style="${isCancelled ? 'text-decoration: line-through;' : ''}">${item.quantity} ${escapeHtml(unit)}</span>
            </div>
            <div class="data-card-field">
              <span class="field-label">Total Amount</span>
              <span class="field-val price" style="${isCancelled ? 'text-decoration: line-through; color: var(--muted);' : ''}">₱${money(item.total)}</span>
            </div>
            <div class="data-card-field" style="border-top: 1px dashed var(--line); padding-top: 6px; margin-top: 2px;">
              <span class="field-label">Encoded By</span>
              <span class="field-val">${escapeHtml(item.encodedBy || '-')}</span>
            </div>
            <div class="data-card-field" style="border-top: 1px dashed var(--line); padding-top: 6px; margin-top: 2px;">
              <span class="field-label">Date &amp; Time</span>
              <span class="field-val" style="font-size: 11.5px; font-weight: 600;">${escapeHtml(formatDateTime(item.date, item.createdAt))}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function fillInventoryCards(selector, list) {
  const target = $(selector);
  if (!target) return;
  if (!list.length) {
    target.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--muted); grid-column: 1 / -1;">No inventory records found.</div>';
    return;
  }
  target.innerHTML = list.map((item) => `
    <div class="data-card">
      <div class="data-card-header">
        <div class="data-card-tags">
          <span class="sku-tag">${escapeHtml(item.sku)}</span>
          ${badge(item.stockStatus)}
        </div>
      </div>
      <div class="data-card-body">
        <h4 class="data-card-title">${escapeHtml(item.name)}</h4>
        <div class="data-card-grid">
          <div class="data-card-field">
            <span class="field-label">Inbound</span>
            <span class="field-val">${item.stockIn || 0} ${escapeHtml(item.unit || '')}</span>
          </div>
          <div class="data-card-field">
            <span class="field-label">Sold</span>
            <span class="field-val">${item.sold || 0} ${escapeHtml(item.unit || '')}</span>
          </div>
          <div class="data-card-field">
            <span class="field-label">Current</span>
            <span class="field-val" style="color: var(--ce-blue); font-weight: 700;">${item.currentStock || 0} ${escapeHtml(item.unit || '')}</span>
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

function productItem(productId) {
  return state.data.products.find((item) => item.id === productId);
}

function productName(productId) {
  const product = productItem(productId);
  return product ? product.name : '-';
}

function productUnit(productId) {
  const product = productItem(productId);
  return product && product.unit ? product.unit : '';
}

function productSku(productId) {
  const product = productItem(productId);
  return product && product.sku ? product.sku : '';
}

function badge(text) {
  return `<span class="badge ${text === 'Low Stock' ? 'low' : ''}">${escapeHtml(text || '-')}</span>`;
}

function rowActions(type, id, item = {}) {
  const isCancelled = item && item.status === 'Cancelled';
  let actionsHtml = '';

  if (type === 'stock' || type === 'sale') {
    actionsHtml = `
      <button class="kebab-item" data-action="edit" data-type="${type}" data-id="${escapeHtml(id)}" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        <span>Edit</span>
      </button>
      ${!isCancelled ? `
      <button class="kebab-item danger" data-action="delete" data-type="${type}" data-id="${escapeHtml(id)}" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
        <span>Cancel</span>
      </button>` : ''}
    `;
  } else {
    actionsHtml = `
      <button class="kebab-item" data-action="edit" data-type="${type}" data-id="${escapeHtml(id)}" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        <span>Edit</span>
      </button>
      <button class="kebab-item danger" data-action="delete" data-type="${type}" data-id="${escapeHtml(id)}" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        <span>Delete</span>
      </button>
    `;
  }

  return `<div class="kebab-wrap">
    <button class="kebab-btn" data-kebab-toggle="${escapeHtml(id)}" type="button" aria-label="More actions" title="Actions">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
    </button>
    <div class="kebab-menu">
      ${actionsHtml}
    </div>
  </div>`;
}

function money(value) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(value, fallback) {
  if (!value && !fallback) return '-';

  function parseDate(input) {
    if (!input) return null;
    if (input instanceof Date && !isNaN(input.getTime())) return input;
    const str = String(input).trim();
    if (!str) return null;

    // Check if already in target format 'YYYY-MM-DD hh:mm:ss AM/PM'
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+(AM|PM)$/i.test(str)) {
      return str;
    }

    // Check for format 'YYYY-MM-DD HH:mm:ss' or 'YYYY-MM-DDTHH:mm:ss' without timezone (treat as local)
    const localMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
    if (localMatch) {
      const [, y, m, d, hh, mm, ss] = localMatch;
      return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
    }

    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  const d = parseDate(value);
  const fb = parseDate(fallback);

  if (typeof d === 'string') return d;

  let activeDate = d;
  if (!activeDate && fb) {
    if (typeof fb === 'string') return fb;
    activeDate = fb;
  }

  if (!activeDate) return String(value || fallback || '-');

  let year = activeDate.getFullYear();
  let month = activeDate.getMonth() + 1;
  let day = activeDate.getDate();
  let hours24 = activeDate.getHours();
  let minutes = activeDate.getMinutes();
  let seconds = activeDate.getSeconds();

  // If activeDate has midnight (00:00:00) and fallback has actual time, borrow time from fallback
  if (fb && typeof fb !== 'string' && hours24 === 0 && minutes === 0 && seconds === 0) {
    if (fb.getHours() !== 0 || fb.getMinutes() !== 0 || fb.getSeconds() !== 0) {
      hours24 = fb.getHours();
      minutes = fb.getMinutes();
      seconds = fb.getSeconds();
    }
  }

  const yyyy = String(year);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const period = hours24 >= 12 ? 'PM' : 'AM';
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  const hh = String(hours12).padStart(2, '0');
  const min = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} ${period}`;
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


