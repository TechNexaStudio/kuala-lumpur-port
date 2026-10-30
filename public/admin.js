// Master Admin State Management
let currentTab = 'analytics';
let currentRange = 'today';
let analyticsData = {};
let allOrdersLedger = [];
let allAdminMenu = [];
let currentMenuCategory = 'All';
let socket = null;

// Categories
const ADMIN_CATEGORIES = ['All', 'Deals', 'Burgers', 'Pizzas', 'Pastas', 'Wraps', 'Drinks'];

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();
  initSocket();
});

// Authentication Check
function checkAdminAuth() {
  const isAuth = sessionStorage.getItem('klp_admin_auth');
  const modal = document.getElementById('adminLoginModal');

  if (isAuth === 'true') {
    modal.classList.add('hidden');
    loadAllAdminData();
  } else {
    modal.classList.remove('hidden');
  }
}

// Handle Admin Login
async function handleAdminLoginSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('adminLoginUser').value.trim();
  const password = document.getElementById('adminLoginPass').value.trim();
  const errEl = document.getElementById('adminLoginError');

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      sessionStorage.setItem('klp_admin_auth', 'true');
      document.getElementById('adminLoginModal').classList.add('hidden');
      loadAllAdminData();
    } else {
      errEl.textContent = data.error || 'Invalid Admin Credentials.';
      errEl.classList.remove('hidden');
    }
  } catch (err) {
    errEl.textContent = 'Server connection error.';
    errEl.classList.remove('hidden');
  }
}

function logoutAdmin() {
  sessionStorage.removeItem('klp_admin_auth');
  location.reload();
}

// Socket.io Real-Time Integration
function initSocket() {
  try {
    if (typeof io !== 'undefined') {
      socket = io();
      socket.on('connect', () => {
        console.log('Master Admin connected to real-time server.');
      });

      socket.on('order:new', () => {
        if (currentTab === 'analytics' || currentTab === 'orders') loadAllAdminData();
      });
      socket.on('order:status_updated', () => {
        if (currentTab === 'analytics' || currentTab === 'orders') loadAllAdminData();
      });
      socket.on('order:paid', () => {
        if (currentTab === 'analytics' || currentTab === 'orders') loadAllAdminData();
      });
      socket.on('menu:updated', () => {
        loadAdminMenu();
      });
    }
  } catch (err) {
    console.error('Socket error:', err);
  }
}

// Load All Data
async function loadAllAdminData() {
  await Promise.all([
    loadAnalytics(),
    loadOrdersLedger(),
    loadAdminMenu()
  ]);

  if (window.lucide) {
    lucide.createIcons();
  }
}

// Tab Switcher
function switchAdminTab(tabName) {
  currentTab = tabName;
  const tabs = ['analytics', 'orders', 'menu', 'security'];

  tabs.forEach(t => {
    const section = document.getElementById(`section-${t}`);
    const btn = document.getElementById(`tabBtn-${t}`);

    if (t === tabName) {
      section.classList.remove('hidden');
      btn.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-brand-600 text-white shadow-xs flex items-center gap-2';
    } else {
      section.classList.add('hidden');
      btn.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center gap-2';
    }
  });

  if (window.lucide) {
    lucide.createIcons();
  }
}

// ================= ANALYTICS ================= //

function setAnalyticsRange(range) {
  currentRange = range;
  ['today', 'week', 'month', 'all'].forEach(r => {
    const btn = document.getElementById(`range-${r}`);
    if (r === range) {
      btn.className = 'px-3 py-1.5 rounded-lg bg-brand-600 text-white shadow-xs';
    } else {
      btn.className = 'px-3 py-1.5 rounded-lg hover:bg-slate-200 text-slate-700';
    }
  });

  loadAnalytics();
}

async function loadAnalytics() {
  try {
    const res = await fetch(`/api/admin/analytics?range=${currentRange}`);
    if (!res.ok) throw new Error('Failed to fetch analytics');
    analyticsData = await res.json();

    // Render KPI Cards
    document.getElementById('kpiNetRevenue').textContent = `RM ${analyticsData.totalNetRevenue.toFixed(2)}`;
    document.getElementById('kpiPaidOrders').textContent = analyticsData.paidOrdersCount;
    document.getElementById('kpiTotalOrders').textContent = analyticsData.totalOrders;
    document.getElementById('kpiDiscounts').textContent = `RM ${analyticsData.totalDiscounts.toFixed(2)}`;
    document.getElementById('kpiAvgBill').textContent = `RM ${analyticsData.averageOrderValue.toFixed(2)}`;

    // Render Category Breakdown
    renderCategoryBreakdown(analyticsData.categoryBreakdown);

    // Render Top Selling Items
    renderTopSelling(analyticsData.topSellingItems);

    if (window.lucide) {
      lucide.createIcons();
    }
  } catch (err) {
    console.error('Analytics error:', err);
  }
}

function renderCategoryBreakdown(cats) {
  const container = document.getElementById('categoryBreakdownContainer');
  const entries = Object.entries(cats || {});

  if (entries.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-400 py-4 text-center">No sales registered in this time range.</div>';
    return;
  }

  const totalQty = entries.reduce((sum, [, qty]) => sum + qty, 0);

  container.innerHTML = entries.map(([category, qty]) => {
    const pct = totalQty > 0 ? Math.round((qty / totalQty) * 100) : 0;
    return `
      <div>
        <div class="flex justify-between text-xs font-bold mb-1">
          <span class="text-slate-800">${category}</span>
          <span class="text-slate-500">${qty} items (${pct}%)</span>
        </div>
        <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div class="bg-brand-600 h-2 rounded-full" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTopSelling(items) {
  const container = document.getElementById('topSellingContainer');
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-400 py-4 text-center">No sales recorded yet.</div>';
    return;
  }

  container.innerHTML = items.map((it, idx) => {
    const rankBadge = idx === 0 ? 'bg-amber-100 text-amber-900 border-amber-300 font-black' :
                      idx === 1 ? 'bg-slate-200 text-slate-800' :
                      idx === 2 ? 'bg-orange-100 text-orange-900' : 'bg-slate-100 text-slate-600';

    return `
      <div class="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 text-xs">
        <div class="flex items-center gap-2.5">
          <span class="w-6 h-6 rounded-lg ${rankBadge} flex items-center justify-center font-bold text-[11px] border">
            #${idx + 1}
          </span>
          <div>
            <div class="font-bold text-slate-900">${it.name}</div>
            <div class="text-[10px] text-slate-400">${it.category}</div>
          </div>
        </div>
        <div class="text-right">
          <div class="font-black text-slate-900">RM ${it.revenue.toFixed(2)}</div>
          <div class="text-[10px] text-slate-500">${it.quantitySold} sold</div>
        </div>
      </div>
    `;
  }).join('');
}

// ================= ORDERS LEDGER ================= //

async function loadOrdersLedger() {
  try {
    const res = await fetch('/api/orders');
    if (!res.ok) throw new Error('Failed to fetch orders');
    allOrdersLedger = await res.json();
    filterOrderLedger();
  } catch (err) {
    console.error('Ledger error:', err);
  }
}

function filterOrderLedger() {
  const query = (document.getElementById('orderLedgerSearchInput').value || '').toLowerCase().trim();
  const tableFilter = document.getElementById('ledgerTableFilter').value;
  const statusFilter = document.getElementById('ledgerStatusFilter').value;

  const filtered = allOrdersLedger.filter(o => {
    // Search match
    let matchesSearch = true;
    if (query) {
      const itemsSummary = (o.items || []).map(i => i.name).join(' ').toLowerCase();
      matchesSearch = o.id.toLowerCase().includes(query) || itemsSummary.includes(query);
    }

    // Table match
    let matchesTable = true;
    if (tableFilter !== 'all') {
      matchesTable = o.table === parseInt(tableFilter, 10);
    }

    // Status match
    let matchesStatus = true;
    if (statusFilter !== 'all') {
      matchesStatus = o.paymentStatus === statusFilter;
    }

    return matchesSearch && matchesTable && matchesStatus;
  });

  renderOrdersLedgerTable(filtered);
}

function renderOrdersLedgerTable(orders) {
  const tbody = document.getElementById('ordersLedgerTableBody');
  const emptyState = document.getElementById('ledgerEmptyState');

  if (orders.length === 0) {
    tbody.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  tbody.innerHTML = orders.map(o => {
    const d = new Date(o.createdAt);
    const dateStr = d.toLocaleDateString('en-GB');
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const itemsShort = (o.items || []).map(i => `${i.quantity}x ${i.name}`).join(', ');

    const isPaid = o.paymentStatus === 'paid';
    const payBadge = isPaid
      ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">PAID</span>'
      : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">UNPAID</span>';

    const net = (o.paymentDetails ? o.paymentDetails.netPayable : (o.total || 0)).toFixed(2);
    const disc = (o.discount || 0).toFixed(2);
    const gross = (o.subtotal || o.total || 0).toFixed(2);

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-3 px-4 font-mono font-bold text-brand-700">#${o.id}</td>
        <td class="py-3 px-4 text-slate-500">${dateStr} ${timeStr}</td>
        <td class="py-3 px-4 font-bold text-slate-900">Table #${o.table}</td>
        <td class="py-3 px-4 max-w-xs truncate text-slate-600" title="${itemsShort}">${itemsShort}</td>
        <td class="py-3 px-4 font-mono">RM ${gross}</td>
        <td class="py-3 px-4 font-mono text-brand-600">-RM ${disc}</td>
        <td class="py-3 px-4 font-mono font-bold text-slate-900">RM ${net}</td>
        <td class="py-3 px-4">${payBadge}</td>
        <td class="py-3 px-4 text-right">
          <button 
            onclick='viewOrderDetails(${JSON.stringify(o).replace(/'/g, "&apos;")})'
            class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition"
          >
            Receipt
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function viewOrderDetails(o) {
  document.getElementById('detailOrderTitle').textContent = `Order #${o.id} - Table #${o.table}`;
  const body = document.getElementById('orderDetailBody');

  const d = new Date(o.createdAt);
  const itemsRows = (o.items || []).map(i => `
    <div class="flex justify-between py-1 border-b border-slate-100">
      <span>${i.quantity}x ${i.name}</span>
      <span class="font-mono font-bold">RM ${i.itemTotal.toFixed(2)}</span>
    </div>
  `).join('');

  body.innerHTML = `
    <div class="text-slate-500 mb-2">
      <div><strong>Date:</strong> ${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString()}</div>
      <div><strong>Status:</strong> ${o.status.toUpperCase()} | <strong>Payment:</strong> ${o.paymentStatus.toUpperCase()}</div>
      ${o.paymentDetails ? `<div><strong>Cashier:</strong> ${o.paymentDetails.cashier || 'cashier'}</div>` : ''}
    </div>
    
    <div class="font-bold text-slate-800 border-b border-slate-200 pb-1 mt-2">Ordered Items:</div>
    <div class="space-y-1 mb-3">${itemsRows}</div>

    <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1">
      <div class="flex justify-between"><span>Subtotal:</span><span class="font-mono">RM ${(o.subtotal || o.total).toFixed(2)}</span></div>
      <div class="flex justify-between text-brand-600"><span>Discount:</span><span class="font-mono">-RM ${(o.discount || 0).toFixed(2)}</span></div>
      <div class="flex justify-between font-bold text-slate-900 border-t pt-1"><span>Net Total Paid:</span><span class="font-mono">RM ${(o.paymentDetails ? o.paymentDetails.netPayable : o.total).toFixed(2)}</span></div>
    </div>
  `;

  document.getElementById('orderDetailModal').classList.remove('hidden');
}

function closeOrderDetailModal() {
  document.getElementById('orderDetailModal').classList.add('hidden');
}

// ================= MENU & STOCK MANAGEMENT ================= //

async function loadAdminMenu() {
  try {
    const res = await fetch('/api/menu');
    if (!res.ok) throw new Error('Failed to fetch menu');
    allAdminMenu = await res.json();
    renderMenuCategoryPills();
    renderAdminMenuGrid();
  } catch (err) {
    console.error('Menu load error:', err);
  }
}

function renderMenuCategoryPills() {
  const container = document.getElementById('menuAdminCatPills');
  if (!container) return;

  container.innerHTML = ADMIN_CATEGORIES.map(cat => {
    const isSel = cat === currentMenuCategory;
    const cls = isSel
      ? 'bg-brand-600 text-white font-bold border-brand-600 shadow-xs'
      : 'bg-white text-slate-700 hover:bg-amber-50 border-slate-200 font-semibold';

    return `
      <button 
        onclick="selectAdminMenuCategory('${cat}')"
        class="shrink-0 px-3.5 py-1.5 rounded-xl text-xs border transition ${cls}"
      >
        ${cat}
      </button>
    `;
  }).join('');
}

function selectAdminMenuCategory(cat) {
  currentMenuCategory = cat;
  renderMenuCategoryPills();
  renderAdminMenuGrid();
}

function renderAdminMenuGrid() {
  const container = document.getElementById('adminMenuGrid');
  if (!container) return;

  const filtered = allAdminMenu.filter(m => {
    if (currentMenuCategory === 'All') return true;
    return m.category.toLowerCase() === currentMenuCategory.toLowerCase();
  });

  container.innerHTML = filtered.map(item => {
    const isAvail = item.available !== false;
    const stockClass = isAvail 
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
      : 'bg-red-50 text-red-700 border-red-200';
    const stockText = isAvail ? 'In Stock' : 'Out of Stock';

    return `
      <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
        <div>
          <div class="flex items-start justify-between gap-3 mb-2">
            <div>
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">${item.category}</span>
              <h5 class="font-bold text-sm text-slate-900">${item.name}</h5>
            </div>
            <span class="font-black font-heading text-brand-600 text-base">RM ${item.price.toFixed(2)}</span>
          </div>
          <p class="text-xs text-slate-500 line-clamp-2 mb-3">${item.description}</p>
        </div>

        <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
          <!-- Toggle In-Stock Switch -->
          <button 
            onclick="toggleStock('${item.id}')"
            class="px-2.5 py-1 rounded-lg border ${stockClass} font-bold text-[11px] flex items-center gap-1 transition active:scale-95"
            title="Click to toggle availability"
          >
            <span class="w-2 h-2 rounded-full ${isAvail ? 'bg-emerald-500' : 'bg-red-500'}"></span>
            <span>${stockText}</span>
          </button>

          <!-- Edit & Delete -->
          <div class="flex items-center gap-1">
            <button 
              onclick='openEditItemModal(${JSON.stringify(item).replace(/'/g, "&apos;")})'
              class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
              title="Edit Dish / Price"
            >
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
            <button 
              onclick="deleteMenuItem('${item.id}', '${item.name.replace(/'/g, "\\'")}')"
              class="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition"
              title="Delete Item"
            >
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}

// Toggle In-Stock / Out-of-Stock
async function toggleStock(itemId) {
  try {
    const res = await fetch(`/api/menu/${itemId}/toggle-stock`, { method: 'PATCH' });
    const data = await res.json();
    if (res.ok) {
      loadAdminMenu();
    } else {
      alert(data.error || 'Failed to update stock');
    }
  } catch (err) {
    alert('Error updating stock status.');
  }
}

// Delete Item
async function deleteMenuItem(itemId, itemName) {
  if (!confirm(`Are you sure you want to permanently delete "${itemName}" from the menu?`)) return;

  try {
    const res = await fetch(`/api/menu/${itemId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      loadAdminMenu();
    } else {
      alert(data.error || 'Failed to delete item');
    }
  } catch (err) {
    alert('Error deleting menu item.');
  }
}

// Add / Edit Item Modal
function openAddItemModal() {
  document.getElementById('itemModalTitle').textContent = 'Add New Food Item';
  document.getElementById('editItemId').value = '';
  document.getElementById('modalItemName').value = '';
  document.getElementById('modalItemPrice').value = '';
  document.getElementById('modalItemDescription').value = '';
  document.getElementById('modalItemPopular').checked = false;
  document.getElementById('itemModalBackdrop').classList.remove('hidden');
}

function openEditItemModal(item) {
  document.getElementById('itemModalTitle').textContent = `Edit: ${item.name}`;
  document.getElementById('editItemId').value = item.id;
  document.getElementById('modalItemName').value = item.name;
  document.getElementById('modalItemCategory').value = item.category;
  document.getElementById('modalItemPrice').value = item.price;
  document.getElementById('modalItemDescription').value = item.description || '';
  document.getElementById('modalItemImage').value = item.image || 'images/burger.jpg';
  document.getElementById('modalItemPopular').checked = !!item.popular;
  document.getElementById('itemModalBackdrop').classList.remove('hidden');
}

function closeItemModal() {
  document.getElementById('itemModalBackdrop').classList.add('hidden');
}

async function handleSaveItem(e) {
  e.preventDefault();
  const id = document.getElementById('editItemId').value;
  const name = document.getElementById('modalItemName').value.trim();
  const category = document.getElementById('modalItemCategory').value;
  const price = parseFloat(document.getElementById('modalItemPrice').value);
  const description = document.getElementById('modalItemDescription').value.trim();
  const image = document.getElementById('modalItemImage').value;
  const popular = document.getElementById('modalItemPopular').checked;

  const payload = { name, category, price, description, image, popular };

  try {
    let res;
    if (id) {
      // Edit
      res = await fetch(`/api/menu/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      // Add
      res = await fetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (res.ok) {
      closeItemModal();
      loadAdminMenu();
    } else {
      alert(data.error || 'Failed to save item');
    }
  } catch (err) {
    alert('Error saving item.');
  }
}

// ================= PRINT SALES REPORT ================= //

function printSummaryReport() {
  const d = new Date();
  document.getElementById('printReportDate').textContent = `Generated: ${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString()}`;

  document.getElementById('printNetRevenue').textContent = `RM ${analyticsData.totalNetRevenue.toFixed(2)}`;
  document.getElementById('printPaidOrders').textContent = analyticsData.paidOrdersCount;
  document.getElementById('printDiscounts').textContent = `RM ${analyticsData.totalDiscounts.toFixed(2)}`;
  document.getElementById('printAvgBill').textContent = `RM ${analyticsData.averageOrderValue.toFixed(2)}`;

  const topItems = analyticsData.topSellingItems || [];
  const rows = topItems.map((it, idx) => `
    <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ccc; font-size: 11px;">
      <span>#${idx + 1} ${it.name} (${it.category})</span>
      <span>${it.quantitySold} sold - RM ${it.revenue.toFixed(2)}</span>
    </div>
  `).join('');

  document.getElementById('printTopSellingTable').innerHTML = rows || '<div>No items sold yet.</div>';
  window.print();
}

// ================= SECURITY & PASSWORDS ================= //

async function resetKitchenPinAdmin() {
  if (!confirm('Reset Kitchen PIN to original factory default (7288)?')) return;
  try {
    const res = await fetch('/api/kitchen/reset-pin', { method: 'POST' });
    const data = await res.json();
    alert(data.message || 'Kitchen PIN reset to default (7288).');
  } catch (e) {
    alert('Error resetting Kitchen PIN.');
  }
}

async function resetCashierPasswordAdmin() {
  if (!confirm('Reset Cashier credentials to original factory default (cashier / 7288)?')) return;
  try {
    const res = await fetch('/api/cashier/reset-password', { method: 'POST' });
    const data = await res.json();
    alert(data.message || 'Cashier credentials reset to default.');
  } catch (e) {
    alert('Error resetting Cashier credentials.');
  }
}

async function resetAdminPasswordAdmin() {
  if (!confirm('Reset Master Admin credentials to original default (admin / 7288)?')) return;
  try {
    const res = await fetch('/api/admin/reset-password', { method: 'POST' });
    const data = await res.json();
    alert(data.message || 'Admin credentials reset to default.');
  } catch (e) {
    alert('Error resetting Admin credentials.');
  }
}

async function updateAdminPassword() {
  const newPass = document.getElementById('newAdminPassInput').value.trim();
  if (!newPass || newPass.length < 4) {
    alert('Password must be at least 4 characters.');
    return;
  }

  try {
    const res = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: newPass })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Master Admin password updated successfully.');
      document.getElementById('newAdminPassInput').value = '';
    } else {
      alert(data.error || 'Failed to update admin password.');
    }
  } catch (e) {
    alert('Error updating password.');
  }
}
