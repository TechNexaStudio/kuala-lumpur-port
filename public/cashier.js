// Cashier POS State Management
let tablesData = [];
let ordersData = [];
let selectedOrder = null;
let currentDiscountType = 'percent'; // 'percent' or 'fixed'
let currentDiscountVal = 0;
let currentCashReceived = 0;
let socket = null;

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  checkCashierAuth();
  initSocket();
});

// Authentication Check
function checkCashierAuth() {
  const isAuth = sessionStorage.getItem('klp_cashier_auth');
  const user = sessionStorage.getItem('klp_cashier_user') || 'cashier';
  const modal = document.getElementById('loginModal');

  if (isAuth === 'true') {
    modal.classList.add('hidden');
    document.getElementById('cashierUserNameBadge').textContent = user;
    loadDashboardData();
  } else {
    modal.classList.remove('hidden');
  }
}

// Handle Login Submit
async function handleLoginSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const errEl = document.getElementById('loginError');

  try {
    const res = await fetch('/api/cashier/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      sessionStorage.setItem('klp_cashier_auth', 'true');
      sessionStorage.setItem('klp_cashier_user', data.cashier.username);
      document.getElementById('loginModal').classList.add('hidden');
      document.getElementById('cashierUserNameBadge').textContent = data.cashier.username;
      loadDashboardData();
    } else {
      errEl.textContent = data.error || 'Invalid Username or Password.';
      errEl.classList.remove('hidden');
    }
  } catch (err) {
    errEl.textContent = 'Server connection error.';
    errEl.classList.remove('hidden');
  }
}

function logoutCashier() {
  sessionStorage.removeItem('klp_cashier_auth');
  sessionStorage.removeItem('klp_cashier_user');
  location.reload();
}

// Socket.io Realtime Listener
function initSocket() {
  try {
    if (typeof io !== 'undefined') {
      socket = io();

      socket.on('connect', () => {
        console.log('Cashier POS connected to real-time server.');
      });

      // New order placed or status updated or paid
      socket.on('order:new', () => {
        loadDashboardData();
      });
      socket.on('order:status_updated', () => {
        loadDashboardData();
      });
      socket.on('order:paid', () => {
        loadDashboardData();
      });
    }
  } catch (err) {
    console.error('Socket error:', err);
  }
}

// Load Tables & Orders Data
async function loadDashboardData() {
  try {
    const [tablesRes, ordersRes] = await Promise.all([
      fetch('/api/tables'),
      fetch('/api/orders')
    ]);

    tablesData = await tablesRes.json();
    ordersData = await ordersRes.json();

    renderTablesMap();
    renderUnpaidOrdersList();
    updateHeaderStats();

    // Re-sync selected order if currently open
    if (selectedOrder) {
      const updated = ordersData.find(o => o.id === selectedOrder.id);
      if (updated && updated.paymentStatus !== 'paid') {
        selectOrder(updated);
      } else {
        clearActiveBill();
      }
    }

    if (window.lucide) {
      lucide.createIcons();
    }
  } catch (err) {
    console.error('Failed to load dashboard data:', err);
  }
}

function refreshTablesData() {
  loadDashboardData();
}

// Update Top Header Stats
function updateHeaderStats() {
  const paidOrders = ordersData.filter(o => o.paymentStatus === 'paid');
  const totalCash = paidOrders.reduce((sum, o) => {
    return sum + (o.paymentDetails ? o.paymentDetails.netPayable : (o.total || 0));
  }, 0);

  const cashEl = document.getElementById('headerTotalCash');
  const paidCountEl = document.getElementById('headerPaidCount');

  if (cashEl) cashEl.textContent = `RM ${totalCash.toFixed(2)}`;
  if (paidCountEl) paidCountEl.textContent = paidOrders.length;
}

// Render 6 Tables Floor Map
function renderTablesMap() {
  const container = document.getElementById('tablesMapGrid');
  if (!container) return;

  container.innerHTML = tablesData.map(tbl => {
    const isOccupied = tbl.status === 'occupied';
    const isSelected = selectedOrder && selectedOrder.table === tbl.tableNumber;

    let borderClass = 'border-slate-200 bg-white hover:border-slate-300';
    let statusPill = `
      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        Available
      </span>
    `;

    if (isOccupied) {
      borderClass = 'border-amber-300 bg-amber-50/50 hover:border-amber-400 shadow-xs cursor-pointer';
      statusPill = `
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 animate-pulse">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
          Occupied
        </span>
      `;
    }

    if (isSelected) {
      borderClass = 'border-brand-600 bg-amber-50/90 ring-2 ring-brand-500 shadow-md';
    }

    return `
      <div 
        onclick="handleTableClick(${tbl.tableNumber}, ${isOccupied})"
        class="rounded-2xl border ${borderClass} p-4 transition-all duration-200 active:scale-95 flex flex-col justify-between h-32"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <i data-lucide="map-pin" class="w-4 h-4 text-brand-600"></i>
            <span class="font-heading font-black text-base text-slate-900">Table #${tbl.tableNumber}</span>
          </div>
          ${statusPill}
        </div>

        <div class="pt-2">
          ${isOccupied ? `
            <div class="text-xs text-slate-500 font-medium">${tbl.activeOrdersCount} Order(s) active</div>
            <div class="text-lg font-black font-heading text-brand-700">
              RM ${tbl.currentBill.toFixed(2)}
            </div>
          ` : `
            <div class="text-xs text-slate-400">Ready for guests</div>
            <div class="text-sm font-bold text-slate-500 mt-1">Free</div>
          `}
        </div>
      </div>
    `;
  }).join('');
}

// Click on Table
function handleTableClick(tableNum, isOccupied) {
  if (!isOccupied) {
    alert(`Table #${tableNum} is currently available with no active unpaid orders.`);
    return;
  }

  // Find active unpaid order for this table
  const order = ordersData.find(o => o.table === tableNum && o.paymentStatus !== 'paid');
  if (order) {
    selectOrder(order);
  }
}

// Render Unpaid Orders Queue List
function renderUnpaidOrdersList() {
  const container = document.getElementById('unpaidOrdersList');
  const emptyState = document.getElementById('noUnpaidOrdersState');
  const badge = document.getElementById('activeOrdersBadge');

  const unpaidOrders = ordersData.filter(o => o.paymentStatus !== 'paid');

  if (badge) badge.textContent = `${unpaidOrders.length} Active`;

  if (unpaidOrders.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  container.innerHTML = unpaidOrders.map(order => {
    const isSelected = selectedOrder && selectedOrder.id === order.id;
    const borderClass = isSelected 
      ? 'border-brand-600 bg-amber-50/80 ring-2 ring-brand-400 shadow-sm' 
      : 'border-slate-200 bg-white hover:bg-slate-50';

    const itemsSummary = order.items.map(it => `${it.quantity}x ${it.name}`).join(', ');

    return `
      <div 
        onclick='selectOrder(${JSON.stringify(order).replace(/'/g, "&apos;")})'
        class="rounded-xl border ${borderClass} p-3 cursor-pointer transition-all active:scale-98 flex items-center justify-between gap-3"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="px-2 py-0.5 rounded-lg bg-slate-900 text-white font-heading font-black text-xs">
              Table #${order.table}
            </span>
            <span class="text-xs font-mono font-bold text-slate-500">#${order.id}</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 uppercase">
              ${order.status}
            </span>
          </div>
          <div class="text-xs text-slate-600 truncate font-medium">
            ${itemsSummary}
          </div>
        </div>

        <div class="text-right shrink-0">
          <div class="text-base font-black font-heading text-slate-900">
            RM ${order.total.toFixed(2)}
          </div>
          <button class="mt-1 text-[11px] font-bold text-brand-600 hover:underline flex items-center gap-1 justify-end">
            <span>Bill Now</span>
            <i data-lucide="chevron-right" class="w-3 h-3"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Select an Order to Bill
function selectOrder(order) {
  selectedOrder = order;
  currentDiscountVal = 0;
  currentDiscountType = 'percent';

  document.getElementById('noTableSelectedState').classList.add('hidden');
  document.getElementById('activeBillContent').classList.remove('hidden');

  document.getElementById('billTablePill').textContent = `Table #${order.table}`;
  document.getElementById('billOrderId').textContent = `#${order.id}`;
  
  const dateObj = new Date(order.createdAt);
  document.getElementById('billOrderTime').textContent = `Ordered: ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  // Render Items List with Item-Level Discount Option
  renderBillItems(order);

  // Recalculate Totals
  calculateBillTotals();

  // Reset Cash Input to Exact
  const gross = order.subtotal || order.total;
  renderQuickCashButtons(gross);
  setCashReceived(gross);

  renderTablesMap();
  renderUnpaidOrdersList();

  if (window.lucide) {
    lucide.createIcons();
  }
}

function clearActiveBill() {
  selectedOrder = null;
  document.getElementById('noTableSelectedState').classList.remove('hidden');
  document.getElementById('activeBillContent').classList.add('hidden');
  renderTablesMap();
  renderUnpaidOrdersList();
}

// Render Items inside Checkout panel
function renderBillItems(order) {
  const container = document.getElementById('billItemsContainer');
  if (!container) return;

  container.innerHTML = order.items.map(it => {
    return `
      <div class="py-2 flex items-center justify-between gap-2">
        <div class="flex-1">
          <div class="font-bold text-slate-800">${it.quantity}x ${it.name}</div>
          <div class="text-[11px] text-slate-400">RM ${it.price.toFixed(2)} each</div>
        </div>
        <div class="text-right">
          <div class="font-bold text-slate-900 font-mono">RM ${it.itemTotal.toFixed(2)}</div>
        </div>
      </div>
    `;
  }).join('');
}

// Discount Logic
function applyDiscount(percent) {
  currentDiscountType = 'percent';
  currentDiscountVal = percent;
  document.getElementById('customDiscountInput').value = '';

  // Update button active styles
  [0, 5, 10, 20].forEach(p => {
    const btn = document.getElementById(`disc-btn-${p}`);
    if (btn) {
      if (p === percent) {
        btn.className = 'py-1.5 rounded-lg border bg-brand-600 text-white border-brand-600 shadow-xs';
      } else {
        btn.className = 'py-1.5 rounded-lg border bg-white hover:bg-amber-100 text-slate-700 border-amber-200';
      }
    }
  });

  calculateBillTotals();
}

function applyCustomDiscount() {
  const input = document.getElementById('customDiscountInput');
  const val = parseFloat(input.value);
  if (isNaN(val) || val < 0) {
    alert('Please enter a valid discount amount.');
    return;
  }

  currentDiscountType = 'fixed';
  currentDiscountVal = val;

  // Reset percentage buttons
  [0, 5, 10, 20].forEach(p => {
    const btn = document.getElementById(`disc-btn-${p}`);
    if (btn) btn.className = 'py-1.5 rounded-lg border bg-white hover:bg-amber-100 text-slate-700 border-amber-200';
  });

  calculateBillTotals();
}

// Calculate Gross, Discount, and Net Totals
function calculateBillTotals() {
  if (!selectedOrder) return;

  const gross = selectedOrder.subtotal || selectedOrder.total;
  let discountAmount = 0;

  if (currentDiscountType === 'percent') {
    discountAmount = parseFloat(((gross * currentDiscountVal) / 100).toFixed(2));
    const badge = document.getElementById('discountBadgeText');
    if (badge) {
      badge.textContent = currentDiscountVal > 0 ? `${currentDiscountVal}% OFF (-RM ${discountAmount.toFixed(2)})` : 'No Discount';
    }
  } else {
    discountAmount = Math.min(gross, currentDiscountVal);
    const badge = document.getElementById('discountBadgeText');
    if (badge) {
      badge.textContent = `Custom -RM ${discountAmount.toFixed(2)}`;
    }
  }

  const netPayable = Math.max(0, parseFloat((gross - discountAmount).toFixed(2)));

  document.getElementById('billGrossSubtotal').textContent = `RM ${gross.toFixed(2)}`;
  document.getElementById('billDiscountAmount').textContent = `- RM ${discountAmount.toFixed(2)}`;
  document.getElementById('billNetTotal').textContent = `RM ${netPayable.toFixed(2)}`;

  renderQuickCashButtons(netPayable);
  updateChangeReturn(currentCashReceived, netPayable);
}

// Render Quick Cash Buttons (Exact, RM 20, RM 50, RM 100)
function renderQuickCashButtons(netPayable) {
  const container = document.getElementById('quickCashButtonsContainer');
  if (!container) return;

  const presets = [
    { label: 'Exact', amount: netPayable },
    { label: 'RM 20', amount: 20 },
    { label: 'RM 50', amount: 50 },
    { label: 'RM 100', amount: 100 },
  ];

  container.innerHTML = presets.map(p => {
    return `
      <button 
        onclick="setCashReceived(${p.amount})"
        class="py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 active:scale-95 text-slate-800 font-bold transition text-xs"
      >
        ${p.label}
      </button>
    `;
  }).join('');
}

function setCashReceived(amount) {
  currentCashReceived = amount;
  const input = document.getElementById('cashReceivedInput');
  if (input) input.value = amount.toFixed(2);

  const netText = document.getElementById('billNetTotal').textContent.replace('RM', '').trim();
  const netPayable = parseFloat(netText) || 0;
  updateChangeReturn(amount, netPayable);
}

function handleCashInput(val) {
  currentCashReceived = parseFloat(val) || 0;
  const netText = document.getElementById('billNetTotal').textContent.replace('RM', '').trim();
  const netPayable = parseFloat(netText) || 0;
  updateChangeReturn(currentCashReceived, netPayable);
}

function updateChangeReturn(cashReceived, netPayable) {
  const changeEl = document.getElementById('changeReturnDisplay');
  const change = Math.max(0, cashReceived - netPayable);

  if (cashReceived < netPayable) {
    changeEl.textContent = `Need RM ${(netPayable - cashReceived).toFixed(2)} more`;
    changeEl.className = 'text-base font-bold font-heading text-red-600';
  } else {
    changeEl.textContent = `RM ${change.toFixed(2)}`;
    changeEl.className = 'text-2xl font-black font-heading text-emerald-700';
  }
}

// Generate 80mm Thermal Receipt HTML
function generate80mmReceiptHtml(order, paymentInfo) {
  const dateStr = new Date(paymentInfo.paidAt || Date.now()).toLocaleDateString('en-GB');
  const timeStr = new Date(paymentInfo.paidAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const itemsRows = order.items.map(it => {
    const nameTruncated = it.name.length > 20 ? it.name.substring(0, 19) + '.' : it.name.padEnd(20, ' ');
    const lineTotal = `RM ${it.itemTotal.toFixed(2)}`.padStart(10, ' ');
    return `${it.quantity}x ${nameTruncated} ${lineTotal}`;
  }).join('\n');

  return `
<div style="font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.4; color: #000; width: 100%; max-width: 300px; margin: 0 auto;">
  <div style="text-align: center; margin-bottom: 8px;">
    <div style="font-size: 16px; font-weight: 900; letter-spacing: 1px;">KUALA LUMPUR PORT</div>
    <div style="font-size: 11px;">Fresh, Fast & Flavourful Dining</div>
    <div style="font-size: 11px;">Contact: 03287205940</div>
  </div>
  
  <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
  
  <div style="display: flex; justify-content: space-between; font-size: 11px;">
    <span>Receipt #: ${order.id}</span>
    <span>Table: #${order.table}</span>
  </div>
  <div style="display: flex; justify-content: space-between; font-size: 11px;">
    <span>Date: ${dateStr}</span>
    <span>Time: ${timeStr}</span>
  </div>
  <div style="font-size: 11px;">Cashier: ${paymentInfo.cashier || 'cashier'}</div>

  <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
  
  <div style="font-weight: bold; font-size: 11px; margin-bottom: 4px;">
    QTY  ITEM                    AMOUNT
  </div>
  
  <pre style="font-family: inherit; font-size: 11px; margin: 0; white-space: pre-wrap;">${itemsRows}</pre>
  
  <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
  
  <div style="display: flex; justify-content: space-between; font-size: 11px;">
    <span>Subtotal:</span>
    <span>RM ${(order.subtotal || order.total).toFixed(2)}</span>
  </div>
  
  ${paymentInfo.discountAmount > 0 ? `
    <div style="display: flex; justify-content: space-between; font-size: 11px; color: #000;">
      <span>Discount (${paymentInfo.discountReason || 'Promo'}):</span>
      <span>-RM ${paymentInfo.discountAmount.toFixed(2)}</span>
    </div>
  ` : ''}

  <div style="display: flex; justify-content: space-between; font-size: 11px;">
    <span>Tax / SST:</span>
    <span>INCLUDED (0%)</span>
  </div>

  <div style="border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 0; margin: 6px 0; font-size: 14px; font-weight: 900; display: flex; justify-content: space-between;">
    <span>TOTAL PAYABLE:</span>
    <span>RM ${paymentInfo.netPayable.toFixed(2)}</span>
  </div>

  <div style="display: flex; justify-content: space-between; font-size: 11px;">
    <span>CASH RECEIVED:</span>
    <span>RM ${paymentInfo.cashReceived.toFixed(2)}</span>
  </div>
  <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: bold;">
    <span>CHANGE RETURN:</span>
    <span>RM ${paymentInfo.changeReturn.toFixed(2)}</span>
  </div>
  <div style="display: flex; justify-content: space-between; font-size: 11px;">
    <span>Payment Method:</span>
    <span>CASH ON COUNTER</span>
  </div>

  <div style="border-top: 1px dashed #000; margin: 10px 0 6px 0;"></div>
  
  <div style="text-align: center; font-size: 11px; margin-top: 8px;">
    <div style="font-weight: bold;">Thank You for Dining With Us!</div>
    <div>Please Visit Again</div>
    <div style="font-size: 10px; margin-top: 4px; color: #555;">Kuala Lumpur Port System</div>
  </div>
</div>
  `;
}

// Preview 80mm Receipt Modal
function previewThermalReceipt() {
  if (!selectedOrder) return;

  const gross = selectedOrder.subtotal || selectedOrder.total;
  let discountAmount = 0;
  if (currentDiscountType === 'percent') {
    discountAmount = parseFloat(((gross * currentDiscountVal) / 100).toFixed(2));
  } else {
    discountAmount = Math.min(gross, currentDiscountVal);
  }

  const netPayable = Math.max(0, parseFloat((gross - discountAmount).toFixed(2)));
  const cashRec = Math.max(netPayable, currentCashReceived);
  const change = parseFloat((cashRec - netPayable).toFixed(2));

  const paymentInfo = {
    netPayable: netPayable,
    discountAmount: discountAmount,
    discountReason: currentDiscountVal > 0 ? (currentDiscountType === 'percent' ? `${currentDiscountVal}% Promo` : 'Special Promo') : '',
    cashReceived: cashRec,
    changeReturn: change,
    cashier: sessionStorage.getItem('klp_cashier_user') || 'cashier',
    paidAt: new Date().toISOString()
  };

  const receiptHtml = generate80mmReceiptHtml(selectedOrder, paymentInfo);
  document.getElementById('thermalReceiptPrintArea').innerHTML = receiptHtml;
  document.getElementById('receiptModalBackdrop').classList.remove('hidden');
}

function closeReceiptModal() {
  document.getElementById('receiptModalBackdrop').classList.add('hidden');
}

function triggerThermalPrint() {
  window.print();
}

// Process Payment & Print Receipt
async function processCashPaymentAndPrint() {
  if (!selectedOrder) return;

  const gross = selectedOrder.subtotal || selectedOrder.total;
  let discountAmount = 0;
  let discountReason = '';

  if (currentDiscountType === 'percent') {
    discountAmount = parseFloat(((gross * currentDiscountVal) / 100).toFixed(2));
    discountReason = currentDiscountVal > 0 ? `${currentDiscountVal}% Promo Discount` : '';
  } else {
    discountAmount = Math.min(gross, currentDiscountVal);
    discountReason = currentDiscountVal > 0 ? `Custom Discount RM ${discountAmount.toFixed(2)}` : '';
  }

  const netPayable = Math.max(0, parseFloat((gross - discountAmount).toFixed(2)));
  const cashReceived = currentCashReceived >= netPayable ? currentCashReceived : netPayable;

  const cashierName = sessionStorage.getItem('klp_cashier_user') || 'cashier';

  const btn = document.getElementById('settleBillBtn');
  const originalHtml = btn.innerHTML;

  try {
    btn.disabled = true;
    btn.innerHTML = `
      <svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span>Processing Cash Payment...</span>
    `;

    const res = await fetch(`/api/orders/${selectedOrder.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cashReceived: cashReceived,
        discount: discountAmount,
        discountReason: discountReason,
        cashierName: cashierName
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Payment failed');

    // Generate receipt and show modal
    const paymentInfo = data.order.paymentDetails;
    const receiptHtml = generate80mmReceiptHtml(data.order, paymentInfo);
    document.getElementById('thermalReceiptPrintArea').innerHTML = receiptHtml;
    document.getElementById('receiptModalBackdrop').classList.remove('hidden');

    // Trigger instant print
    setTimeout(() => {
      window.print();
    }, 400);

    // Refresh dashboard
    await loadDashboardData();
    clearActiveBill();

  } catch (err) {
    alert(`Payment Error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// Settings Modal & Reset Cashier Password
function openSettingsModal() {
  document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
}

async function resetCashierPasswordToDefault() {
  if (!confirm('Are you sure you want to restore original cashier credentials (Username: cashier, Password: 7288)?')) return;

  try {
    const res = await fetch('/api/cashier/reset-password', {
      method: 'POST'
    });
    const data = await res.json();
    alert(data.message || 'Credentials restored.');
    closeSettingsModal();
  } catch (err) {
    alert('Failed to reset password.');
  }
}

async function submitNewCashierPassword() {
  const newPass = document.getElementById('newCashierPassInput').value.trim();
  if (!newPass || newPass.length < 4) {
    alert('Password must be at least 4 characters.');
    return;
  }

  try {
    const res = await fetch('/api/cashier/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: newPass })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Cashier password updated successfully.');
      document.getElementById('newCashierPassInput').value = '';
      closeSettingsModal();
    } else {
      alert(data.error || 'Failed to update password.');
    }
  } catch (err) {
    alert('Error updating password.');
  }
}
