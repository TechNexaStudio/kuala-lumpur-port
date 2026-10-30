const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const RESTAURANT_FILE = path.join(DATA_DIR, 'restaurant.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to read JSON
function readJson(filePath, defaultVal = []) {
  try {
    if (!fs.existsSync(filePath)) return defaultVal;
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultVal;
  }
}

// Helper to write JSON
function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
    return false;
  }
}

// Ensure settings exist
function getSettings() {
  const defaultSettings = { kitchenPin: '7288', defaultKitchenPin: '7288' };
  const settings = readJson(SETTINGS_FILE, null);
  if (!settings) {
    writeJson(SETTINGS_FILE, defaultSettings);
    return defaultSettings;
  }
  return settings;
}

// Route shortcuts
app.get('/kitchen', (req, res) => {
  res.sendFile('kitchen.html', { root: path.join(__dirname, 'public') });
});

app.get('/cashier', (req, res) => {
  res.sendFile('cashier.html', { root: path.join(__dirname, 'public') });
});

app.get('/admin', (req, res) => {
  res.sendFile('admin.html', { root: path.join(__dirname, 'public') });
});

app.get('/menu', (req, res) => {
  res.sendFile('index.html', { root: path.join(__dirname, 'public') });
});

const os = require('os');

// Helper to get local Wi-Fi / LAN IP address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return 'localhost';
}

// API: Network Info (for QR generation & mobile connectivity)
app.get('/api/network-info', (req, res) => {
  const localIp = getLocalIp();
  res.json({
    ip: localIp,
    port: PORT,
    localUrl: `http://localhost:${PORT}`,
    networkUrl: `http://${localIp}:${PORT}`
  });
});

// API: Restaurant Info
app.get('/api/restaurant', (req, res) => {
  const info = readJson(RESTAURANT_FILE, {});
  res.json(info);
});

// API: Menu items
app.get('/api/menu', (req, res) => {
  const menu = readJson(MENU_FILE, []);
  res.json(menu);
});

// API: Verify Kitchen PIN
app.post('/api/kitchen/verify-pin', (req, res) => {
  const { pin } = req.body;
  const settings = getSettings();
  if (pin === settings.kitchenPin) {
    return res.json({ success: true, message: 'PIN Verified' });
  }
  return res.status(401).json({ success: false, error: 'Incorrect PIN. Access Denied.' });
});

// API: Reset Kitchen PIN to Default (7288)
app.post('/api/kitchen/reset-pin', (req, res) => {
  const settings = getSettings();
  settings.kitchenPin = settings.defaultKitchenPin || '7288';
  writeJson(SETTINGS_FILE, settings);
  res.json({ success: true, message: 'Kitchen PIN has been successfully reset to default.' });
});

// API: Change Kitchen PIN
app.post('/api/kitchen/change-pin', (req, res) => {
  const { newPin } = req.body;
  if (!newPin || newPin.length !== 4 || isNaN(newPin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
  }
  const settings = getSettings();
  settings.kitchenPin = newPin;
  writeJson(SETTINGS_FILE, settings);
  res.json({ success: true, message: 'Kitchen PIN updated successfully.' });
});

// API: Cashier Login
app.post('/api/cashier/login', (req, res) => {
  const { username, password } = req.body;
  const settings = getSettings();
  const validUser = settings.cashierUsername || 'cashier';
  const validPass = settings.cashierPassword || '7288';

  if (username === validUser && password === validPass) {
    return res.json({
      success: true,
      message: 'Cashier Login Successful',
      cashier: { username: validUser }
    });
  }
  return res.status(401).json({ success: false, error: 'Invalid Username or Password.' });
});

// API: Cashier Reset Password to Default (7288)
app.post('/api/cashier/reset-password', (req, res) => {
  const settings = getSettings();
  settings.cashierUsername = settings.defaultCashierUsername || 'cashier';
  settings.cashierPassword = settings.defaultCashierPassword || '7288';
  writeJson(SETTINGS_FILE, settings);
  res.json({
    success: true,
    message: 'Cashier credentials have been reset to default (Username: cashier, Password: 7288).'
  });
});

// API: Cashier Change Password
app.post('/api/cashier/change-password', (req, res) => {
  const { newUsername, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters.' });
  }
  const settings = getSettings();
  if (newUsername) settings.cashierUsername = newUsername.trim();
  settings.cashierPassword = newPassword.trim();
  writeJson(SETTINGS_FILE, settings);
  res.json({ success: true, message: 'Cashier credentials updated successfully.' });
});

// API: Pay Order at Counter (Cash Payment & Receipt Generation)
app.post('/api/orders/:id/pay', (req, res) => {
  const { id } = req.params;
  const { cashReceived, discount, discountReason, cashierName } = req.body;

  const orders = readJson(ORDERS_FILE, []);
  const orderIndex = orders.findIndex(o => o.id === id);

  if (orderIndex === -1) {
    return res.status(404).json({ error: `Order #${id} not found.` });
  }

  const order = orders[orderIndex];
  const grossTotal = order.subtotal || order.total;
  const discountAmount = Math.max(0, parseFloat(discount) || 0);
  const netPayable = Math.max(0, parseFloat((grossTotal - discountAmount).toFixed(2)));
  const receivedAmount = parseFloat(cashReceived) || netPayable;

  if (receivedAmount < netPayable) {
    return res.status(400).json({
      error: `Cash received (RM ${receivedAmount.toFixed(2)}) is less than Net Payable (RM ${netPayable.toFixed(2)}).`
    });
  }

  const changeReturn = parseFloat((receivedAmount - netPayable).toFixed(2));
  const paidAt = new Date().toISOString();

  // Update order record
  orders[orderIndex].discount = discountAmount;
  orders[orderIndex].discountReason = discountReason || '';
  orders[orderIndex].total = netPayable;
  orders[orderIndex].paymentStatus = 'paid';
  orders[orderIndex].status = 'served';
  orders[orderIndex].paymentDetails = {
    method: 'CASH',
    cashReceived: receivedAmount,
    discountAmount: discountAmount,
    discountReason: discountReason || '',
    netPayable: netPayable,
    changeReturn: changeReturn,
    cashier: cashierName || 'Cashier',
    paidAt: paidAt
  };

  if (!orders[orderIndex].statusHistory) {
    orders[orderIndex].statusHistory = [];
  }
  orders[orderIndex].statusHistory.push({
    status: 'paid',
    timestamp: paidAt
  });

  writeJson(ORDERS_FILE, orders);

  const updatedOrder = orders[orderIndex];

  // Real-time broadcast: Table is now free, order marked paid
  io.emit('order:paid', {
    orderId: id,
    table: updatedOrder.table,
    order: updatedOrder
  });

  res.json({
    success: true,
    message: `Order #${id} for Table #${updatedOrder.table} paid successfully in cash!`,
    order: updatedOrder
  });
});

// ================= ADMIN APIS ================= //

// API: Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const settings = getSettings();
  const validUser = settings.adminUsername || 'admin';
  const validPass = settings.adminPassword || '7288';

  if (username === validUser && password === validPass) {
    return res.json({
      success: true,
      message: 'Admin Master Access Granted',
      admin: { username: validUser }
    });
  }
  return res.status(401).json({ success: false, error: 'Invalid Master Admin Credentials.' });
});

// API: Admin Reset Password to Default (admin / 7288)
app.post('/api/admin/reset-password', (req, res) => {
  const settings = getSettings();
  settings.adminUsername = settings.defaultAdminUsername || 'admin';
  settings.adminPassword = settings.defaultAdminPassword || '7288';
  writeJson(SETTINGS_FILE, settings);
  res.json({
    success: true,
    message: 'Admin master credentials have been reset to default (Username: admin, Password: 7288).'
  });
});

// API: Admin Change Password
app.post('/api/admin/change-password', (req, res) => {
  const { newUsername, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters.' });
  }
  const settings = getSettings();
  if (newUsername) settings.adminUsername = newUsername.trim();
  settings.adminPassword = newPassword.trim();
  writeJson(SETTINGS_FILE, settings);
  res.json({ success: true, message: 'Admin master credentials updated successfully.' });
});

// API: Admin Sales Analytics (Today, Week, Month, All Time)
app.get('/api/admin/analytics', (req, res) => {
  const { range } = req.query; // 'today', 'week', 'month', 'all'
  const orders = readJson(ORDERS_FILE, []);

  const now = new Date();
  let startTime = new Date(0); // all time

  if (range === 'today') {
    startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (range === 'week') {
    startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === 'month') {
    startTime = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  // Filter orders by time
  const filteredOrders = orders.filter(o => new Date(o.createdAt) >= startTime);
  const paidOrders = filteredOrders.filter(o => o.paymentStatus === 'paid');

  let totalGross = 0;
  let totalDiscounts = 0;
  let totalNetRevenue = 0;
  const categoryCounts = {};
  const itemMap = {};

  paidOrders.forEach(o => {
    const gross = o.subtotal || o.total;
    const disc = o.discount || 0;
    const net = (o.paymentDetails && o.paymentDetails.netPayable) ? o.paymentDetails.netPayable : (o.total || 0);

    totalGross += gross;
    totalDiscounts += disc;
    totalNetRevenue += net;

    // Track items and categories
    if (Array.isArray(o.items)) {
      o.items.forEach(it => {
        categoryCounts[it.category] = (categoryCounts[it.category] || 0) + it.quantity;

        if (!itemMap[it.name]) {
          itemMap[it.name] = {
            name: it.name,
            category: it.category,
            quantitySold: 0,
            revenue: 0
          };
        }
        itemMap[it.name].quantitySold += it.quantity;
        itemMap[it.name].revenue += it.itemTotal || (it.price * it.quantity);
      });
    }
  });

  const topSelling = Object.values(itemMap).sort((a, b) => b.quantitySold - a.quantitySold).slice(0, 8);
  const avgOrderValue = paidOrders.length > 0 ? (totalNetRevenue / paidOrders.length) : 0;

  res.json({
    range: range || 'all',
    totalOrders: filteredOrders.length,
    paidOrdersCount: paidOrders.length,
    unpaidOrdersCount: filteredOrders.length - paidOrders.length,
    totalGrossRevenue: parseFloat(totalGross.toFixed(2)),
    totalDiscounts: parseFloat(totalDiscounts.toFixed(2)),
    totalNetRevenue: parseFloat(totalNetRevenue.toFixed(2)),
    averageOrderValue: parseFloat(avgOrderValue.toFixed(2)),
    categoryBreakdown: categoryCounts,
    topSellingItems: topSelling,
    recentOrders: filteredOrders.slice(0, 30)
  });
});

// API: Export Sales CSV
app.get('/api/admin/export-csv', (req, res) => {
  const orders = readJson(ORDERS_FILE, []);

  let csv = 'Order ID,Date,Time,Table,Status,Payment Status,Gross Subtotal (RM),Discount (RM),Net Total Paid (RM),Payment Method,Cashier,Items Ordered,Customer Notes\r\n';

  orders.forEach(o => {
    const d = new Date(o.createdAt);
    const dateStr = d.toLocaleDateString('en-GB');
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const itemsStr = (o.items || []).map(i => `${i.quantity}x ${i.name}`).join(' | ').replace(/"/g, '""');
    const notesStr = (o.notes || '').replace(/"/g, '""');
    const gross = (o.subtotal || o.total || 0).toFixed(2);
    const disc = (o.discount || 0).toFixed(2);
    const net = (o.paymentDetails ? o.paymentDetails.netPayable : (o.total || 0)).toFixed(2);
    const method = o.paymentDetails ? o.paymentDetails.method : 'CASH';
    const cashier = o.paymentDetails ? o.paymentDetails.cashier : '-';

    csv += `"${o.id}","${dateStr}","${timeStr}","Table ${o.table}","${o.status}","${o.paymentStatus}","${gross}","${disc}","${net}","${method}","${cashier}","${itemsStr}","${notesStr}"\r\n`;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="Kuala_Lumpur_Port_Sales_Ledger.csv"');
  res.send(csv);
});

// ================= MENU MANAGEMENT APIS ================= //

// API: Add Menu Item
app.post('/api/menu', (req, res) => {
  const { name, category, price, description, image, popular } = req.body;
  if (!name || !category || !price) {
    return res.status(400).json({ error: 'Name, Category, and Price are required.' });
  }

  const menu = readJson(MENU_FILE, []);
  const newItem = {
    id: `item-${Date.now().toString().slice(-6)}`,
    category: category.trim(),
    name: name.trim(),
    description: (description || '').trim(),
    price: parseFloat(price) || 0,
    currency: 'RM',
    image: image || (category.toLowerCase().includes('burger') ? 'images/burger.jpg' : 'images/pizza.jpg'),
    popular: !!popular,
    available: true
  };

  menu.push(newItem);
  writeJson(MENU_FILE, menu);

  io.emit('menu:updated', { action: 'add', item: newItem });
  res.status(201).json({ success: true, message: 'Item added to menu successfully!', item: newItem });
});

// API: Update Menu Item
app.put('/api/menu/:id', (req, res) => {
  const { id } = req.params;
  const { name, category, price, description, image, popular, available } = req.body;

  const menu = readJson(MENU_FILE, []);
  const idx = menu.findIndex(m => m.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: `Menu item #${id} not found.` });
  }

  if (name) menu[idx].name = name.trim();
  if (category) menu[idx].category = category.trim();
  if (price !== undefined) menu[idx].price = parseFloat(price);
  if (description !== undefined) menu[idx].description = description.trim();
  if (image) menu[idx].image = image.trim();
  if (popular !== undefined) menu[idx].popular = !!popular;
  if (available !== undefined) menu[idx].available = !!available;

  writeJson(MENU_FILE, menu);
  io.emit('menu:updated', { action: 'update', item: menu[idx] });

  res.json({ success: true, message: `Menu item #${id} updated successfully!`, item: menu[idx] });
});

// API: Toggle Item In-Stock / Out-of-Stock
app.patch('/api/menu/:id/toggle-stock', (req, res) => {
  const { id } = req.params;
  const menu = readJson(MENU_FILE, []);
  const idx = menu.findIndex(m => m.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: `Menu item #${id} not found.` });
  }

  menu[idx].available = !menu[idx].available;
  writeJson(MENU_FILE, menu);

  io.emit('menu:updated', { action: 'toggle-stock', item: menu[idx] });
  res.json({
    success: true,
    message: `${menu[idx].name} is now ${menu[idx].available ? 'Available (In Stock)' : 'Out of Stock'}!`,
    item: menu[idx]
  });
});

// API: Delete Menu Item
app.delete('/api/menu/:id', (req, res) => {
  const { id } = req.params;
  let menu = readJson(MENU_FILE, []);
  const initialLength = menu.length;
  menu = menu.filter(m => m.id !== id);

  if (menu.length === initialLength) {
    return res.status(404).json({ error: `Menu item #${id} not found.` });
  }

  writeJson(MENU_FILE, menu);
  io.emit('menu:updated', { action: 'delete', id });
  res.json({ success: true, message: `Menu item #${id} deleted successfully.` });
});

// API: Get Tables Status
app.get('/api/tables', (req, res) => {
  const restaurant = readJson(RESTAURANT_FILE, { totalTables: 6 });
  const orders = readJson(ORDERS_FILE, []);
  
  const tables = [];
  for (let i = 1; i <= (restaurant.totalTables || 6); i++) {
    const activeOrders = orders.filter(o => o.table === i && o.paymentStatus !== 'paid');
    tables.push({
      tableNumber: i,
      status: activeOrders.length > 0 ? 'occupied' : 'available',
      activeOrdersCount: activeOrders.length,
      currentBill: activeOrders.reduce((acc, o) => acc + (o.total || 0), 0)
    });
  }
  res.json(tables);
});

// API: Place Order
app.post('/api/orders', (req, res) => {
  const { table, items, notes } = req.body;

  const tableNum = parseInt(table, 10);
  if (!tableNum || tableNum < 1 || tableNum > 6) {
    return res.status(400).json({ error: 'Valid Table number (1 to 6) is required.' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart cannot be empty.' });
  }

  const menu = readJson(MENU_FILE, []);
  let subtotal = 0;
  const verifiedItems = [];

  for (const item of items) {
    const menuItem = menu.find(m => m.id === item.id);
    if (!menuItem) {
      return res.status(400).json({ error: `Item with id ${item.id} not found.` });
    }
    const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
    const itemTotal = menuItem.price * qty;
    subtotal += itemTotal;

    verifiedItems.push({
      id: menuItem.id,
      name: menuItem.name,
      category: menuItem.category,
      price: menuItem.price,
      quantity: qty,
      itemTotal: parseFloat(itemTotal.toFixed(2))
    });
  }

  const orders = readJson(ORDERS_FILE, []);
  const orderId = `KLP-${Date.now().toString().slice(-5)}`;

  const newOrder = {
    id: orderId,
    table: tableNum,
    items: verifiedItems,
    notes: (notes || '').trim(),
    subtotal: parseFloat(subtotal.toFixed(2)),
    tax: 0,
    total: parseFloat(subtotal.toFixed(2)),
    currency: 'RM',
    status: 'pending', // pending -> preparing -> ready -> served
    paymentStatus: 'unpaid', // unpaid -> paid
    createdAt: new Date().toISOString(),
    statusHistory: [
      { status: 'pending', timestamp: new Date().toISOString() }
    ]
  };

  orders.unshift(newOrder);
  writeJson(ORDERS_FILE, orders);

  // Broadcast to kitchen and cashier in real-time
  io.emit('order:new', newOrder);

  res.status(201).json({
    success: true,
    message: `Order #${orderId} successfully placed for Table #${tableNum}!`,
    order: newOrder
  });
});

// API: Update Order Status (Kitchen / POS actions)
function handleStatusUpdate(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'preparing', 'ready', 'served', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status: ${status}` });
  }

  const orders = readJson(ORDERS_FILE, []);
  const orderIndex = orders.findIndex(o => o.id === id);

  if (orderIndex === -1) {
    return res.status(404).json({ error: `Order #${id} not found.` });
  }

  orders[orderIndex].status = status;
  if (!orders[orderIndex].statusHistory) {
    orders[orderIndex].statusHistory = [];
  }
  orders[orderIndex].statusHistory.push({
    status: status,
    timestamp: new Date().toISOString()
  });

  writeJson(ORDERS_FILE, orders);

  const updatedOrder = orders[orderIndex];

  // Broadcast status update in real-time to all clients (Kitchen, Cashier, Customer)
  io.emit('order:status_updated', {
    orderId: id,
    status: status,
    order: updatedOrder
  });

  res.json({
    success: true,
    message: `Order #${id} status updated to ${status}.`,
    order: updatedOrder
  });
}

app.patch('/api/orders/:id/status', handleStatusUpdate);
app.post('/api/orders/:id/status', handleStatusUpdate); // fallback

// API: Get Orders
app.get('/api/orders', (req, res) => {
  const { table, status } = req.query;
  let orders = readJson(ORDERS_FILE, []);

  if (table) {
    orders = orders.filter(o => o.table === parseInt(table, 10));
  }
  if (status) {
    orders = orders.filter(o => o.status === status);
  }

  res.json(orders);
});

// Socket.io Connection Handler
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log(`====================================================`);
  console.log(`  KUALA LUMPUR PORT - RESTAURANT MANAGEMENT SYSTEM  `);
  console.log(`  Local Computer:    http://localhost:${PORT}        `);
  console.log(`  Mobile / Wi-Fi:    http://${localIp}:${PORT}       `);
  console.log(`  Kitchen Display:   http://${localIp}:${PORT}/kitchen`);
  console.log(`====================================================`);
});
