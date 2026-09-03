const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyPPqwKKK04voCZAATZFp2oDLYmps51VKlDJY0FKWojm1Y2mnOPp33co1FeT4xjsCXC9g/exec';

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
});

function apiCall(action, payload = {}) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes('PASTE_YOUR')) {
    return Promise.resolve(mockCall(action, payload));
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
      response.ok ? resolve(response.data) : reject(new Error(response.error));
    };

    script.onerror = () => {
      if (completed) return;
      cleanup();
      reject(new Error('Google Apps Script was blocked by the browser. Disable ad blocker/shields for this site, then reload.'));
    };

    script.onload = () => {
      if (completed) return;
      cleanup();
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

function bindNavigation() {
  $$('.nav-item[data-view]').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.view));
  });
  $('#logoutButton').addEventListener('click', () => {
    state = { user: null, data: localStore };
    $('#loginView').classList.remove('hidden');
    $('#dashboardView').classList.add('hidden');
  });
}

function bindForms() {
  $('#loginForm').addEventListener('submit', submitLogin);
  $('#productForm').addEventListener('submit', (event) => saveForm(event, 'saveProduct'));
  $('#stockForm').addEventListener('submit', (event) => saveForm(event, 'saveStockIn'));
  $('#salesForm').addEventListener('submit', (event) => saveForm(event, 'saveSale'));
  $('#userForm').addEventListener('submit', (event) => saveForm(event, 'saveUser', { actorRole: state.user.role }));
  $('#inventorySearch').addEventListener('input', render);
  document.addEventListener('click', handleActions);
  $$('[data-reset-form]').forEach((button) => {
    button.addEventListener('click', () => resetForm(button.dataset.resetForm));
  });
}

function submitLogin(event) {
  if (event) event.preventDefault();
  setLoginStatus('Checking login...');
  const form = Object.fromEntries(new FormData($('#loginForm')));
  apiCall('login', form)
    .then((result) => {
      state.user = result.user;
      state.data = result.data;
      $('#loginView').classList.add('hidden');
      $('#dashboardView').classList.remove('hidden');
      $('#roleLabel').textContent = result.user.role;
      $('#userChip').textContent = `${result.user.name} - ${result.user.role}`;
      $('.admin-only').forEach((item) => item.classList.toggle('hidden', result.user.role !== 'Admin'));
      render();
      setLoginStatus('Login successful.');
      showToast('Login successful.');
    })
    .catch((error) => {
      setLoginStatus(error.message || 'Login failed.');
      showToast(error.message || 'Login failed.');
    });
}

function saveForm(event, action, extra = {}) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.assign(Object.fromEntries(new FormData(form)), extra, { encodedBy: state.user.name });
  const finalAction = payload.id ? action.replace('save', 'update') : action;
  apiCall(finalAction, payload)
    .then((data) => {
      state.data = data;
      resetForm(form.getAttribute('id'));
      render();
      showToast('Saved successfully.');
    })
    .catch((error) => showToast(error.message || 'Unable to save.'));
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
    .catch((error) => showToast(error.message || 'Unable to delete.'));
}

function editRecord(type, item) {
  const form = type === 'product' ? $('#productForm') : $('#userForm');
  Object.keys(item).forEach((key) => {
    if (form.elements[key] && key !== 'password') form.elements[key].value = item[key];
  });
  if (type === 'product') $('#productSubmit').textContent = 'Update Product';
  if (type === 'user') $('#userSubmit').textContent = 'Update User';
  showView(type === 'product' ? 'products' : 'users');
}

function resetForm(formId) {
  const form = $(`#${formId}`);
  form.reset();
  if (form.elements.id) form.elements.id.value = '';
  if (formId === 'productForm' && form.elements.sku) form.elements.sku.value = 'Auto-generated';
  if (formId === 'productForm') $('#productSubmit').textContent = 'Save Product';
  if (formId === 'userForm') $('#userSubmit').textContent = 'Create User';
  setToday();
}

function showView(viewId) {
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === viewId));
  $$('.nav-item[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === viewId));
  $('#pageTitle').textContent = document.querySelector(`[data-view="${viewId}"]`).textContent;
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
  target.innerHTML = rows.length
    ? rows.map((row) => `<tr>${mapper(row).map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')
    : '<tr><td colspan="8">No records yet.</td></tr>';
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
    <button class="row-action" data-action="edit" data-type="${type}" data-id="${id}" type="button">Edit</button>
    <button class="row-action danger" data-action="delete" data-type="${type}" data-id="${id}" type="button">Delete</button>
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

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}












