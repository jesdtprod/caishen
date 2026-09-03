const SHEETS = {
  users: 'Users',
  products: 'Products',
  stockIn: 'StockIn',
  sales: 'Sales',
};

const HEADERS = {
  Users: ['id', 'name', 'username', 'password', 'role', 'status', 'createdAt'],
  Products: ['id', 'sku', 'name', 'category', 'unit', 'price', 'beginningStock', 'lowStock', 'status', 'createdAt'],
  StockIn: ['id', 'date', 'productId', 'quantity', 'supplier', 'reference', 'encodedBy', 'createdAt'],
  Sales: ['id', 'date', 'productId', 'quantity', 'price', 'total', 'customer', 'encodedBy', 'createdAt'],
};

function doGet(event) {
  setupDatabase();
  const params = (event && event.parameter) || {};
  const callback = params.callback || 'callback';
  const response = handleApi(params);
  return ContentService
    .createTextOutput(`${callback}(${JSON.stringify(response)})`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function handleApi(params) {
  try {
    const payload = params.payload ? JSON.parse(params.payload) : {};
    let data;
    if (params.action === 'login') data = login(payload.username, payload.password);
    else if (params.action === 'dashboard') data = getDashboardData();
    else if (params.action === 'saveUser') data = saveUser(payload);
    else if (params.action === 'updateUser') data = updateUser(payload);
    else if (params.action === 'deleteUser') data = deleteUser(payload);
    else if (params.action === 'saveProduct') data = saveProduct(payload);
    else if (params.action === 'updateProduct') data = updateProduct(payload);
    else if (params.action === 'deleteProduct') data = deleteProduct(payload);
    else if (params.action === 'saveStockIn') data = saveStockIn(payload);
    else if (params.action === 'saveSale') data = saveSale(payload);
    else data = { message: 'CE Inventory API is ready.' };
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

function setupDatabase() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(HEADERS).forEach((name) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS[name]);
    } else {
      syncHeaders(sheet, HEADERS[name]);
    }
  });

  const users = readRows(SHEETS.users);
  if (!users.length) {
    appendRow(SHEETS.users, {
      id: makeId('USR'),
      name: 'Administrator',
      username: 'admin',
      password: 'admin123',
      role: 'Admin',
      status: 'Active',
      createdAt: now(),
    });
  }
}

function login(username, password) {
  setupDatabase();
  const user = readRows(SHEETS.users).find((item) =>
    String(item.username).toLowerCase() === String(username).toLowerCase() &&
    String(item.password) === String(password) &&
    item.status === 'Active'
  );
  if (!user) throw new Error('Invalid username, password, or inactive account.');
  delete user.password;
  return { user, data: getDashboardData() };
}

function getDashboardData() {
  const products = readRows(SHEETS.products);
  const stockIn = readRows(SHEETS.stockIn);
  const sales = readRows(SHEETS.sales);
  const inventory = products.map((product) => {
    const added = sumByProduct(stockIn, product.id, 'quantity');
    const sold = sumByProduct(sales, product.id, 'quantity');
    const currentStock = Number(product.beginningStock || 0) + added - sold;
    return Object.assign({}, product, {
      stockIn: added,
      sold,
      currentStock,
      stockStatus: currentStock <= Number(product.lowStock || 0) ? 'Low Stock' : 'In Stock',
    });
  });

  return {
    users: readRows(SHEETS.users).map((user) => {
      const copy = Object.assign({}, user);
      delete copy.password;
      return copy;
    }),
    products,
    stockIn,
    sales,
    inventory,
  };
}

function saveUser(payload) {
  requireAdmin(payload.actorRole);
  if (!payload.password) throw new Error('Password is required for new users.');
  ensureUnique(SHEETS.users, 'username', payload.username);
  const row = {
    id: makeId('USR'),
    name: payload.name,
    username: payload.username,
    password: payload.password,
    role: payload.role,
    status: payload.status || 'Active',
    createdAt: now(),
  };
  appendRow(SHEETS.users, row);
  return getDashboardData();
}

function updateUser(payload) {
  requireAdmin(payload.actorRole);
  const existing = findById(SHEETS.users, payload.id);
  ensureUnique(SHEETS.users, 'username', payload.username, payload.id);
  updateRow(SHEETS.users, payload.id, {
    name: payload.name,
    username: payload.username,
    password: payload.password || existing.password,
    role: payload.role,
    status: payload.status || 'Active',
  });
  return getDashboardData();
}

function deleteUser(payload) {
  requireAdmin(payload.actorRole);
  if (payload.id === payload.actorId) throw new Error('You cannot delete your own active login.');
  deleteRow(SHEETS.users, payload.id);
  return getDashboardData();
}

function saveProduct(payload) {
  ensureUnique(SHEETS.products, 'sku', payload.sku);
  const row = {
    id: makeId('PRD'),
    sku: payload.sku,
    name: payload.name,
    category: payload.category,
    unit: payload.unit,
    price: Number(payload.price || 0),
    beginningStock: Number(payload.beginningStock || 0),
    lowStock: Number(payload.lowStock || 0),
    status: payload.status || 'Active',
    createdAt: now(),
  };
  appendRow(SHEETS.products, row);
  return getDashboardData();
}

function updateProduct(payload) {
  ensureUnique(SHEETS.products, 'sku', payload.sku, payload.id);
  updateRow(SHEETS.products, payload.id, {
    sku: payload.sku,
    name: payload.name,
    category: payload.category,
    unit: payload.unit,
    price: Number(payload.price || 0),
    beginningStock: Number(payload.beginningStock || 0),
    lowStock: Number(payload.lowStock || 0),
    status: payload.status || 'Active',
  });
  return getDashboardData();
}

function deleteProduct(payload) {
  const hasStock = readRows(SHEETS.stockIn).some((row) => row.productId === payload.id);
  const hasSales = readRows(SHEETS.sales).some((row) => row.productId === payload.id);
  if (hasStock || hasSales) throw new Error('Product already has transactions. Set it to Inactive instead.');
  deleteRow(SHEETS.products, payload.id);
  return getDashboardData();
}

function saveStockIn(payload) {
  const row = {
    id: makeId('STK'),
    date: payload.date,
    productId: payload.productId,
    quantity: Number(payload.quantity || 0),
    supplier: payload.supplier,
    reference: payload.reference,
    encodedBy: payload.encodedBy,
    createdAt: now(),
  };
  appendRow(SHEETS.stockIn, row);
  return getDashboardData();
}

function saveSale(payload) {
  const product = readRows(SHEETS.products).find((item) => item.id === payload.productId);
  if (!product) throw new Error('Product not found.');
  const price = Number(payload.price || product.price || 0);
  const quantity = Number(payload.quantity || 0);
  const currentStock = Number(product.beginningStock || 0) + sumByProduct(readRows(SHEETS.stockIn), product.id, 'quantity') - sumByProduct(readRows(SHEETS.sales), product.id, 'quantity');
  if (quantity > currentStock) throw new Error('Quantity sold is greater than current stock.');
  const row = {
    id: makeId('SAL'),
    date: payload.date,
    productId: payload.productId,
    quantity,
    price,
    total: price * quantity,
    customer: payload.customer,
    encodedBy: payload.encodedBy,
    createdAt: now(),
  };
  appendRow(SHEETS.sales, row);
  return getDashboardData();
}

function readRows(sheetName) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values.map((row) => headers.reduce((record, header, index) => {
    record[header] = row[index];
    return record;
  }, {}));
}

function appendRow(sheetName, record) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  const headers = HEADERS[sheetName];
  sheet.appendRow(headers.map((header) => Object.prototype.hasOwnProperty.call(record, header) ? record[header] : ''));
}

function syncHeaders(sheet, expectedHeaders) {
  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  expectedHeaders.forEach((header) => {
    if (!currentHeaders.includes(header)) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
    }
  });
}

function updateRow(sheetName, id, updates) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const rowIndex = values.findIndex((row, index) => index > 0 && row[0] === id);
  if (rowIndex < 1) throw new Error('Record not found.');
  Object.keys(updates).forEach((key) => {
    const columnIndex = headers.indexOf(key);
    if (columnIndex >= 0) sheet.getRange(rowIndex + 1, columnIndex + 1).setValue(updates[key]);
  });
}

function deleteRow(sheetName, id) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const rowIndex = values.findIndex((row, index) => index > 0 && row[0] === id);
  if (rowIndex < 1) throw new Error('Record not found.');
  sheet.deleteRow(rowIndex + 1);
}

function findById(sheetName, id) {
  const record = readRows(sheetName).find((row) => row.id === id);
  if (!record) throw new Error('Record not found.');
  return record;
}

function ensureUnique(sheetName, field, value, ignoreId) {
  const exists = readRows(sheetName).some((row) =>
    String(row[field]).toLowerCase() === String(value).toLowerCase() && row.id !== ignoreId
  );
  if (exists) throw new Error(`${field} already exists.`);
}

function sumByProduct(rows, productId, field) {
  return rows
    .filter((row) => row.productId === productId)
    .reduce((total, row) => total + Number(row[field] || 0), 0);
}

function requireAdmin(role) {
  if (role !== 'Admin') throw new Error('Only admin can create users.');
}

function makeId(prefix) {
  return `${prefix}-${Utilities.getUuid().slice(0, 8).toUpperCase()}`;
}

function now() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}
