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

function doGet() {
  setupDatabase();
  const template = HtmlService.createTemplateFromFile('Index');
  template.logoUrl = getLogoUrl();
  return template
    .evaluate()
    .setTitle('CE Inventory and Sales')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setLogoUrl(url) {
  PropertiesService.getScriptProperties().setProperty('LOGO_URL', url);
}

function getLogoUrl() {
  return PropertiesService.getScriptProperties().getProperty('LOGO_URL') || 'assets/ce-logo.png';
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function setupDatabase() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(HEADERS).forEach((name) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS[name]);
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

function saveProduct(payload) {
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
  sheet.appendRow(headers.map((header) => record[header] || ''));
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
