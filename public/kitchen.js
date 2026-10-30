// State Management
let orders = [];
let activeFilter = 'active'; // 'active', 'pending', 'preparing', 'ready', 'all'
let enteredPin = '';
let isAudioMuted = false;
let audioInterval = null;
let audioContext = null;
let socket = null;

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  initSocket();
  setupKeyboardListener();
  setInterval(updateTimersAndDelays, 1000);
});

// Authentication Check
function checkAuth() {
  const isAuth = sessionStorage.getItem('klp_kds_auth');
  const modal = document.getElementById('pinLockModal');
  if (isAuth === 'true') {
    modal.classList.add('hidden');
    loadOrders();
    startAudioLoop();
  } else {
    modal.classList.remove('hidden');
    resetPinDisplay();
  }
}

// PIN Keypad Logic (Never reveal PIN on screen)
function pressPin(digit) {
  if (enteredPin.length < 4) {
    enteredPin += digit;
    updatePinDots();
    if (enteredPin.length === 4) {
      setTimeout(verifyPin, 150);
    }
  }
}

function clearPin() {
  enteredPin = '';
  updatePinDots();
  document.getElementById('pinError').classList.add('hidden');
}

function backspacePin() {
  if (enteredPin.length > 0) {
    enteredPin = enteredPin.slice(0, -1);
    updatePinDots();
    document.getElementById('pinError').classList.add('hidden');
  }
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`dot-${i}`);
    if (i < enteredPin.length) {
      dot.classList.remove('bg-transparent', 'border-slate-300');
      dot.classList.add('bg-brand-600', 'border-brand-600', 'scale-125');
    } else {
      dot.classList.remove('bg-brand-600', 'border-brand-600', 'scale-125');
      dot.classList.add('bg-transparent', 'border-slate-300');
    }
  }
}

function resetPinDisplay() {
  enteredPin = '';
  updatePinDots();
  document.getElementById('pinError').classList.add('hidden');
}

// Verify PIN with Server
async function verifyPin() {
  try {
    const res = await fetch('/api/kitchen/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: enteredPin })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      sessionStorage.setItem('klp_kds_auth', 'true');
      document.getElementById('pinLockModal').classList.add('hidden');
      loadOrders();
      startAudioLoop();
    } else {
      document.getElementById('pinError').classList.remove('hidden');
      enteredPin = '';
      updatePinDots();
    }
  } catch (err) {
    document.getElementById('pinError').textContent = 'Server connection error.';
    document.getElementById('pinError').classList.remove('hidden');
    enteredPin = '';
    updatePinDots();
  }
}

// Keyboard input for PIN
function setupKeyboardListener() {
  window.addEventListener('keydown', (e) => {
    const modal = document.getElementById('pinLockModal');
    if (!modal.classList.contains('hidden')) {
      if (e.key >= '0' && e.key <= '9') {
        pressPin(e.key);
      } else if (e.key === 'Backspace') {
        backspacePin();
      } else if (e.key === 'Escape' || e.key === 'Delete') {
        clearPin();
      }
    }
  });
}

function lockScreen() {
  sessionStorage.removeItem('klp_kds_auth');
  checkAuth();
}

// Web Audio API Synthesizer (Loud Kitchen Ding-Dong Bell Alert)
function playKitchenChime() {
  if (isAudioMuted) return;

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!audioContext) {
      audioContext = new AudioCtx();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const now = audioContext.currentTime;

    // High Note (Ding)
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now); // A5 note
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc1.connect(gain1);
    gain1.connect(audioContext.destination);
    osc1.start(now);
    osc1.stop(now + 0.5);

    // Resonant Low Note (Dong)
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(587.33, now + 0.18); // D5 note
    gain2.gain.setValueAtTime(0.35, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc2.connect(gain2);
    gain2.connect(audioContext.destination);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.9);

  } catch (e) {
    console.warn('Audio playback restricted by browser policy until user interacts.', e);
  }
}

// Continuous Repeating Audio Loop until accepted
function startAudioLoop() {
  if (audioInterval) clearInterval(audioInterval);
  
  audioInterval = setInterval(() => {
    const hasPending = orders.some(o => o.status === 'pending');
    const banner = document.getElementById('urgentAlertBanner');

    if (hasPending) {
      banner.classList.remove('hidden');
      playKitchenChime();
    } else {
      banner.classList.add('hidden');
    }
  }, 2800);
}

function toggleAudioMute() {
  isAudioMuted = !isAudioMuted;
  const btn = document.getElementById('muteBtn');
  if (isAudioMuted) {
    btn.textContent = 'Unmute Sound';
    btn.classList.add('bg-white', 'text-red-700');
  } else {
    btn.textContent = 'Mute Sound';
    btn.classList.remove('bg-white', 'text-red-700');
  }
}

function testKitchenSound() {
  isAudioMuted = false;
  playKitchenChime();
}

// Socket.io Real-Time Integration
function initSocket() {
  try {
    if (typeof io !== 'undefined') {
      socket = io();
      
      socket.on('connect', () => {
        console.log('Kitchen KDS connected to real-time server.');
      });

      // New order placed by customer
      socket.on('order:new', (newOrder) => {
        orders.unshift(newOrder);
        renderOrders();
        updateStats();
        playKitchenChime(); // Instant sound
      });

      // Order status updated
      socket.on('order:status_updated', ({ orderId, status, order }) => {
        const idx = orders.findIndex(o => o.id === orderId);
        if (idx !== -1) {
          orders[idx] = order;
        } else {
          orders.unshift(order);
        }
        renderOrders();
        updateStats();
      });
    }
  } catch (err) {
    console.error('Socket.io error:', err);
  }
}

// Load Orders from Server
async function loadOrders() {
  try {
    const res = await fetch('/api/orders');
    if (!res.ok) throw new Error('Failed to fetch orders');
    orders = await res.json();
    renderOrders();
    updateStats();
  } catch (err) {
    console.error('Failed to load orders:', err);
  }
}

// Filter Tab Switcher
function setFilter(filter) {
  activeFilter = filter;
  
  const tabs = ['active', 'pending', 'preparing', 'ready', 'all'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    if (t === filter) {
      btn.className = 'px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-brand-600 text-white shadow-xs';
    } else {
      btn.className = 'px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200';
    }
  });

  renderOrders();
}

// Render Orders Grid
function renderOrders() {
  const container = document.getElementById('ordersContainer');
  const emptyState = document.getElementById('kitchenEmptyState');

  let filtered = [];
  if (activeFilter === 'active') {
    filtered = orders.filter(o => o.status === 'pending' || o.status === 'preparing');
  } else if (activeFilter === 'pending') {
    filtered = orders.filter(o => o.status === 'pending');
  } else if (activeFilter === 'preparing') {
    filtered = orders.filter(o => o.status === 'preparing');
  } else if (activeFilter === 'ready') {
    filtered = orders.filter(o => o.status === 'ready');
  } else {
    filtered = orders;
  }

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  container.innerHTML = filtered.map(order => {
    const elapsedSecs = Math.floor((new Date() - new Date(order.createdAt)) / 1000);
    const isOverTenMins = elapsedSecs >= 600 && order.status !== 'ready' && order.status !== 'served';
    const mins = Math.floor(elapsedSecs / 60);
    const secs = elapsedSecs % 60;
    const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    // Styling based on 10 min delay or status
    let cardBorder = 'border-slate-200 bg-white';
    let timerBadgeClass = 'bg-slate-100 text-slate-700';

    if (isOverTenMins) {
      // 10 MINUTE DELAY RED ALERT
      cardBorder = 'border-red-500 bg-red-50/70 shadow-lg shadow-red-500/10 ring-2 ring-red-400';
      timerBadgeClass = 'bg-red-600 text-white font-black animate-pulse';
    } else if (order.status === 'pending') {
      cardBorder = 'border-amber-300 bg-amber-50/40';
      timerBadgeClass = 'bg-amber-100 text-amber-900 border border-amber-200';
    } else if (order.status === 'preparing') {
      cardBorder = 'border-blue-300 bg-blue-50/30';
      timerBadgeClass = 'bg-blue-100 text-blue-900 border border-blue-200';
    } else if (order.status === 'ready') {
      cardBorder = 'border-emerald-300 bg-emerald-50/20';
      timerBadgeClass = 'bg-emerald-100 text-emerald-900 border border-emerald-200';
    }

    // Status Badge
    let statusLabel = '';
    let statusColor = '';
    if (order.status === 'pending') {
      statusLabel = '🔔 NEW / PENDING';
      statusColor = 'bg-amber-500 text-white animate-pulse';
    } else if (order.status === 'preparing') {
      statusLabel = '👨‍🍳 IN COOKING';
      statusColor = 'bg-blue-600 text-white';
    } else if (order.status === 'ready') {
      statusLabel = '✅ READY TO SERVE';
      statusColor = 'bg-emerald-600 text-white';
    } else {
      statusLabel = order.status.toUpperCase();
      statusColor = 'bg-slate-600 text-white';
    }

    // Action buttons based on status
    let actionButtons = '';
    if (order.status === 'pending') {
      actionButtons = `
        <button 
          onclick="updateOrderStatus('${order.id}', 'preparing')"
          class="w-full bg-gradient-to-r from-brand-600 to-amber-600 hover:from-brand-500 hover:to-amber-500 text-white font-bold py-3 px-4 rounded-xl text-sm shadow-md shadow-brand-500/20 flex items-center justify-center gap-2 transition active:scale-95"
        >
          <i data-lucide="play" class="w-4 h-4 fill-current"></i>
          <span>Accept & Start Cooking</span>
        </button>
      `;
    } else if (order.status === 'preparing') {
      actionButtons = `
        <button 
          onclick="updateOrderStatus('${order.id}', 'ready')"
          class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl text-sm shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition active:scale-95"
        >
          <i data-lucide="check" class="w-4 h-4"></i>
          <span>Mark as Ready to Serve</span>
        </button>
      `;
    } else if (order.status === 'ready') {
      actionButtons = `
        <div class="flex items-center justify-between text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl font-bold">
          <span class="flex items-center gap-1.5">
            <i data-lucide="check-circle" class="w-4 h-4"></i>
            <span>Food Ready for Waiter Pickup</span>
          </span>
          <button 
            onclick="updateOrderStatus('${order.id}', 'preparing')"
            class="text-[11px] text-slate-500 hover:text-slate-800 underline ml-2"
          >
            Undo
          </button>
        </div>
      `;
    }

    return `
      <div id="order-card-${order.id}" class="rounded-2xl border ${cardBorder} p-5 flex flex-col justify-between shadow-xs transition-all duration-300">
        
        <!-- Card Header: Table, Timer, Order ID -->
        <div>
          <div class="flex items-center justify-between gap-2 mb-3">
            
            <!-- Table Number Pill -->
            <div class="flex items-center gap-2">
              <span class="px-3 py-1 rounded-xl bg-slate-900 text-white font-heading font-black text-base shadow-xs flex items-center gap-1.5">
                <i data-lucide="map-pin" class="w-3.5 h-3.5 text-brand-400"></i>
                Table #${order.table}
              </span>
              <span class="text-xs font-mono font-bold text-slate-500">#${order.id}</span>
            </div>

            <!-- Live Elapsed Timer -->
            <div class="flex items-center gap-1.5">
              ${isOverTenMins ? `
                <span class="text-[11px] font-black text-red-600 uppercase tracking-wider bg-red-100 px-2 py-0.5 rounded-md border border-red-200">
                  ⚠️ Delayed &gt;10m
                </span>
              ` : ''}
              <div class="px-2.5 py-1 rounded-lg text-xs font-mono font-black ${timerBadgeClass} flex items-center gap-1">
                <i data-lucide="clock" class="w-3.5 h-3.5"></i>
                <span class="order-timer" data-created="${order.createdAt}">${timeFormatted}</span>
              </div>
            </div>

          </div>

          <!-- Status Pill -->
          <div class="mb-3">
            <span class="px-2.5 py-0.5 rounded-md text-[11px] font-bold ${statusColor}">
              ${statusLabel}
            </span>
          </div>

          <!-- Items Ordered List -->
          <div class="bg-white/80 rounded-xl border border-slate-200/90 p-3.5 mb-3 divide-y divide-slate-100">
            ${order.items.map(it => `
              <div class="py-1.5 first:pt-0 last:pb-0 flex items-center justify-between text-sm">
                <div class="flex items-center gap-2.5">
                  <span class="w-6 h-6 rounded-lg bg-amber-100 text-brand-800 font-black text-xs flex items-center justify-center font-mono">
                    ${it.quantity}x
                  </span>
                  <span class="font-bold text-slate-800">${it.name}</span>
                </div>
                <span class="text-[11px] font-semibold text-slate-400 uppercase">${it.category}</span>
              </div>
            `).join('')}
          </div>

          <!-- Special Kitchen Instructions / Notes -->
          ${order.notes ? `
            <div class="mb-4 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2 font-medium">
              <i data-lucide="alert-circle" class="w-4 h-4 text-amber-600 shrink-0 mt-0.5"></i>
              <div>
                <strong class="font-bold">Customer Note:</strong> ${order.notes}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Card Footer: Action Button -->
        <div class="pt-3 border-t border-slate-200/60 mt-2">
          ${actionButtons}
        </div>

      </div>
    `;
  }).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}

// Update Order Status
async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update status');

    // Update local state
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx !== -1) {
      orders[idx] = data.order;
    }

    renderOrders();
    updateStats();

  } catch (err) {
    alert(`Could not update order: ${err.message}`);
  }
}

// Live Timer & 10-Minute Alert Tick
function updateTimersAndDelays() {
  const timerElements = document.querySelectorAll('.order-timer');
  timerElements.forEach(el => {
    const createdStr = el.getAttribute('data-created');
    if (!createdStr) return;

    const elapsedSecs = Math.floor((new Date() - new Date(createdStr)) / 1000);
    const mins = Math.floor(elapsedSecs / 60);
    const secs = elapsedSecs % 60;
    el.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    // Re-check 10 minute threshold (600 seconds)
    if (elapsedSecs === 600) {
      renderOrders(); // Re-render to trigger red card styling
    }
  });
}

// Update Queue Counts
function updateStats() {
  const pending = orders.filter(o => o.status === 'pending').length;
  const cooking = orders.filter(o => o.status === 'preparing').length;
  const ready = orders.filter(o => o.status === 'ready').length;
  const active = pending + cooking;

  // Header counters
  const statPending = document.getElementById('statPendingCount');
  const statCooking = document.getElementById('statCookingCount');
  const statReady = document.getElementById('statReadyCount');

  if (statPending) statPending.textContent = pending;
  if (statCooking) statCooking.textContent = cooking;
  if (statReady) statReady.textContent = ready;

  // Tab counters
  const tabActive = document.getElementById('tabCountActive');
  const tabPending = document.getElementById('tabCountPending');
  const tabCooking = document.getElementById('tabCountCooking');
  const tabReady = document.getElementById('tabCountReady');
  const tabAll = document.getElementById('tabCountAll');

  if (tabActive) tabActive.textContent = active;
  if (tabPending) tabPending.textContent = pending;
  if (tabCooking) tabCooking.textContent = cooking;
  if (tabReady) tabReady.textContent = ready;
  if (tabAll) tabAll.textContent = orders.length;

  // Sound alert bar
  const banner = document.getElementById('urgentAlertBanner');
  if (banner) {
    if (pending > 0) {
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }
}

// Settings Modal & Reset to Original Password
function openSettingsModal() {
  document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
}

async function resetPinToDefault() {
  if (!confirm('Are you sure you want to restore the original factory default PIN?')) return;

  try {
    const res = await fetch('/api/kitchen/reset-pin', {
      method: 'POST'
    });
    const data = await res.json();
    alert(data.message || 'PIN has been reset to original default.');
    closeSettingsModal();
  } catch (err) {
    alert('Failed to reset PIN.');
  }
}

async function submitNewPin() {
  const newPin = document.getElementById('newPinInput').value;
  if (!newPin || newPin.length !== 4 || isNaN(newPin)) {
    alert('Please enter a valid 4-digit PIN.');
    return;
  }

  try {
    const res = await fetch('/api/kitchen/change-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPin })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Kitchen PIN updated successfully.');
      document.getElementById('newPinInput').value = '';
      closeSettingsModal();
    } else {
      alert(data.error || 'Failed to update PIN.');
    }
  } catch (err) {
    alert('Error updating PIN.');
  }
}
