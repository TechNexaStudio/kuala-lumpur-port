// State Management
let currentTable = 1;
let allMenuItems = [];
let filteredItems = [];
let activeCategory = 'All Menu';
let searchQuery = '';
let cart = {}; // { [itemId]: { item, quantity } }
let socket = null;

// Categories definition
const CATEGORIES = [
  { id: 'All Menu', label: 'All Menu', icon: 'sparkles' },
  { id: 'Deals', label: '🔥 Hot Deals', icon: 'flame' },
  { id: 'Burgers', label: '🍔 Burgers', icon: 'utensils' },
  { id: 'Pizzas', label: '🍕 Pizzas', icon: 'disc' },
  { id: 'Pastas', label: '🍝 Pastas', icon: 'soup' },
  { id: 'Wraps', label: '🌯 Wraps', icon: 'sandwich' },
  { id: 'Drinks', label: '🥤 Drinks', icon: 'cup-soda' },
];

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  initTableFromUrl();
  initSocket();
  await loadMenuData();
  renderCategoryTabs();
  renderTableButtons();
  updateTableUI();
  updateCartUI();
  if (window.lucide) {
    lucide.createIcons();
  }
});

// Setup Table from URL Query Param ?table=X
function initTableFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const tableParam = parseInt(urlParams.get('table'), 10);
  if (tableParam && tableParam >= 1 && tableParam <= 6) {
    currentTable = tableParam;
  } else {
    currentTable = 1; // default
  }
}

// Initialize Socket.io (if available)
function initSocket() {
  try {
    if (typeof io !== 'undefined') {
      socket = io();
      socket.on('connect', () => {
        console.log('Connected to Kuala Lumpur Port Realtime Socket');
      });
      socket.on('menu:updated', () => {
        loadMenuData();
      });
    }
  } catch (e) {
    console.warn('Socket.io not active or offline mode.');
  }
}

// Fetch Menu from Server
async function loadMenuData() {
  try {
    const res = await fetch('/api/menu');
    if (!res.ok) throw new Error('Failed to fetch menu');
    allMenuItems = await res.json();
    filterAndRenderItems();
  } catch (err) {
    console.error('Error loading menu:', err);
  }
}

// Render Category Tabs (Light & Fresh Theme)
function renderCategoryTabs() {
  const container = document.getElementById('categoriesContainer');
  if (!container) return;

  container.innerHTML = CATEGORIES.map(cat => {
    const isActive = cat.id === activeCategory;
    const activeClass = isActive 
      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/25 border-brand-600 font-bold' 
      : 'bg-white text-slate-700 hover:bg-amber-50/80 hover:text-brand-700 border-slate-200/90 font-semibold shadow-xs';

    return `
      <button 
        onclick="selectCategory('${cat.id}')"
        class="shrink-0 px-4 py-2 rounded-xl text-xs sm:text-sm border transition-all active:scale-95 flex items-center gap-1.5 ${activeClass}"
      >
        <span>${cat.label}</span>
      </button>
    `;
  }).join('');
}

// Select a category
function selectCategory(catId) {
  activeCategory = catId;
  renderCategoryTabs();
  filterAndRenderItems();
}

// Filter and Render Items
function filterAndRenderItems() {
  filteredItems = allMenuItems.filter(item => {
    // Category check
    let matchesCategory = false;
    if (activeCategory === 'All Menu') {
      matchesCategory = true;
    } else {
      matchesCategory = item.category.toLowerCase() === activeCategory.toLowerCase();
    }

    // Search query check
    let matchesSearch = true;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      matchesSearch = item.name.toLowerCase().includes(q) || 
                      item.description.toLowerCase().includes(q) ||
                      item.category.toLowerCase().includes(q);
    }

    return matchesCategory && matchesSearch;
  });

  renderMenuGrid();
  updateCategoryHeading();
}

// Update Category Heading text & count
function updateCategoryHeading() {
  const heading = document.getElementById('currentCategoryHeading');
  const countBadge = document.getElementById('itemsCountBadge');
  const subText = document.getElementById('currentCategorySub');

  if (heading && countBadge) {
    heading.querySelector('span').textContent = activeCategory;
    countBadge.textContent = `${filteredItems.length} items`;
  }

  if (subText) {
    if (activeCategory === 'All Menu') {
      subText.textContent = 'Explore our complete chef-crafted menu';
    } else if (activeCategory === 'Deals') {
      subText.textContent = 'Special value meal packages and combo deals';
    } else {
      subText.textContent = `Delicious freshly prepared ${activeCategory.toLowerCase()}`;
    }
  }
}

// Render Menu Cards (Light & Fresh Cards)
function renderMenuGrid() {
  const grid = document.getElementById('menuGrid');
  const emptyState = document.getElementById('emptyState');
  if (!grid) return;

  if (filteredItems.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  grid.innerHTML = filteredItems.map(item => {
    const inCartQty = cart[item.id] ? cart[item.id].quantity : 0;
    const isPopular = item.popular;
    const imageSrc = item.image || 'images/burger.jpg';

    const isOutOfStock = item.available === false;

    return `
      <div class="food-card bg-white rounded-2xl border border-slate-200/90 overflow-hidden flex flex-col justify-between shadow-xs hover:shadow-xl transition-all duration-300 ${isOutOfStock ? 'opacity-70 grayscale-[20%]' : ''}">
        
        <!-- Image & Tags -->
        <div class="relative h-44 sm:h-48 overflow-hidden bg-amber-50/50">
          <img 
            src="${imageSrc}" 
            alt="${item.name}" 
            class="food-image w-full h-full object-cover"
            loading="lazy"
            onerror="this.src='images/burger.jpg'"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent"></div>
          
          <!-- Category & Popular Badges -->
          <div class="absolute top-3 left-3 flex flex-wrap gap-1.5">
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/90 backdrop-blur-md text-slate-800 border border-slate-200 shadow-xs">
              ${item.category}
            </span>
            ${isPopular ? `
              <span class="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-gradient-to-r from-amber-500 to-brand-500 text-white shadow-xs flex items-center gap-1">
                ★ Chef's Choice
              </span>
            ` : ''}
            ${isOutOfStock ? `
              <span class="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-red-600 text-white shadow-xs">
                Out of Stock
              </span>
            ` : ''}
          </div>

          <!-- Price Tag Bottom Left -->
          <div class="absolute bottom-2.5 left-3">
            <div class="text-xl sm:text-2xl font-black font-heading text-white drop-shadow-md">
              RM ${item.price.toFixed(2)}
            </div>
          </div>
        </div>

        <!-- Body Details -->
        <div class="p-4 flex-1 flex flex-col justify-between">
          <div>
            <h4 class="font-bold font-heading text-base sm:text-lg text-slate-900 mb-1 leading-snug">
              ${item.name}
            </h4>
            <p class="text-xs text-slate-600 leading-relaxed mb-4 line-clamp-2 font-normal">
              ${item.description}
            </p>
          </div>

          <!-- Add / Quantity Controls -->
          <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
            ${isOutOfStock ? `
              <button disabled class="w-full bg-slate-100 text-slate-400 font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm cursor-not-allowed border border-slate-200">
                Currently Out of Stock
              </button>
            ` : (inCartQty > 0 ? `
              <div class="flex items-center gap-2 bg-amber-50 border border-brand-500/40 rounded-xl p-1 w-full justify-between">
                <button 
                  onclick="updateCartQuantity('${item.id}', -1)"
                  class="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 flex items-center justify-center font-bold text-sm active:scale-90 transition shadow-xs"
                >
                  -
                </button>
                <span class="font-black text-sm text-brand-700 px-2">${inCartQty} in cart</span>
                <button 
                  onclick="updateCartQuantity('${item.id}', 1)"
                  class="w-8 h-8 rounded-lg bg-brand-600 hover:bg-brand-500 text-white flex items-center justify-center font-bold text-sm active:scale-90 transition shadow-xs"
                >
                  +
                </button>
              </div>
            ` : `
              <button 
                onclick="addToCart('${item.id}')"
                class="w-full bg-amber-50 hover:bg-brand-600 hover:text-white text-brand-800 font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition active:scale-95 border border-amber-200 hover:border-brand-600 shadow-xs"
              >
                <i data-lucide="plus" class="w-4 h-4"></i>
                <span>Add to Order</span>
              </button>
            `)}
          </div>

        </div>

      </div>
    `;
  }).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}

// Cart Logic
function addToCart(itemId) {
  const item = allMenuItems.find(i => i.id === itemId);
  if (!item) return;

  if (cart[itemId]) {
    cart[itemId].quantity += 1;
  } else {
    cart[itemId] = { item, quantity: 1 };
  }

  updateCartUI();
  renderMenuGrid();
}

function updateCartQuantity(itemId, delta) {
  if (!cart[itemId]) return;

  cart[itemId].quantity += delta;
  if (cart[itemId].quantity <= 0) {
    delete cart[itemId];
  }

  updateCartUI();
  renderMenuGrid();
  renderCartDrawerItems();
}

function removeFromCart(itemId) {
  if (cart[itemId]) {
    delete cart[itemId];
    updateCartUI();
    renderMenuGrid();
    renderCartDrawerItems();
  }
}

// Update Cart Floating Bar and Badges
function updateCartUI() {
  const cartEntries = Object.values(cart);
  const totalCount = cartEntries.reduce((sum, entry) => sum + entry.quantity, 0);
  const totalPrice = cartEntries.reduce((sum, entry) => sum + (entry.item.price * entry.quantity), 0);

  const floatingBar = document.getElementById('floatingCartBar');
  const countEl = document.getElementById('floatingCartCount');
  const totalEl = document.getElementById('floatingCartTotal');
  const tableEl = document.getElementById('floatingCartTable');

  if (tableEl) tableEl.textContent = currentTable;

  if (totalCount > 0) {
    floatingBar.classList.remove('translate-y-28', 'opacity-0', 'pointer-events-none');
    countEl.textContent = totalCount;
    totalEl.textContent = `RM ${totalPrice.toFixed(2)}`;
  } else {
    floatingBar.classList.add('translate-y-28', 'opacity-0', 'pointer-events-none');
  }

  // Update Drawer Subtotal & Total
  const drawerSubtotal = document.getElementById('drawerSubtotal');
  const drawerTotal = document.getElementById('drawerTotal');
  if (drawerSubtotal && drawerTotal) {
    drawerSubtotal.textContent = `RM ${totalPrice.toFixed(2)}`;
    drawerTotal.textContent = `RM ${totalPrice.toFixed(2)}`;
  }
}

// Render Items inside Cart Drawer (Light Theme)
function renderCartDrawerItems() {
  const container = document.getElementById('cartItemsList');
  const emptyState = document.getElementById('cartEmptyState');
  const footer = document.getElementById('cartDrawerFooter');
  const entries = Object.values(cart);

  if (entries.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    footer.classList.add('opacity-50', 'pointer-events-none');
    return;
  }

  emptyState.classList.add('hidden');
  footer.classList.remove('opacity-50', 'pointer-events-none');

  container.innerHTML = entries.map(({ item, quantity }) => {
    const itemTotal = (item.price * quantity).toFixed(2);
    return `
      <div class="pt-3 flex items-center justify-between gap-3">
        <div class="flex-1">
          <h5 class="font-bold text-sm text-slate-900">${item.name}</h5>
          <div class="text-xs text-brand-600 font-bold">RM ${item.price.toFixed(2)} each</div>
          <div class="text-xs text-slate-500 mt-0.5 font-medium">Subtotal: RM ${itemTotal}</div>
        </div>

        <!-- Quantity adjusters -->
        <div class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-1">
          <button 
            onclick="updateCartQuantity('${item.id}', -1)"
            class="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 text-slate-800 border border-slate-200 flex items-center justify-center font-bold text-xs shadow-xs"
          >
            -
          </button>
          <span class="w-6 text-center font-bold text-xs text-slate-900">${quantity}</span>
          <button 
            onclick="updateCartQuantity('${item.id}', 1)"
            class="w-7 h-7 rounded-lg bg-brand-600 hover:bg-brand-500 text-white flex items-center justify-center font-bold text-xs shadow-xs"
          >
            +
          </button>
        </div>

        <!-- Delete button -->
        <button 
          onclick="removeFromCart('${item.id}')" 
          class="p-1.5 text-slate-400 hover:text-red-500 transition"
          title="Remove"
        >
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    `;
  }).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}

// Drawer Open / Close
function openCartDrawer() {
  renderCartDrawerItems();
  const drawer = document.getElementById('cartDrawer');
  const backdrop = document.getElementById('cartDrawerBackdrop');
  const tableNum = document.getElementById('cartDrawerTableNum');

  if (tableNum) tableNum.textContent = currentTable;
  drawer.classList.remove('translate-x-full');
  backdrop.classList.remove('opacity-0', 'pointer-events-none');
}

function closeCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  const backdrop = document.getElementById('cartDrawerBackdrop');
  drawer.classList.add('translate-x-full');
  backdrop.classList.add('opacity-0', 'pointer-events-none');
}

// Confirm and Place Order to Backend
async function confirmAndPlaceOrder() {
  const entries = Object.values(cart);
  if (entries.length === 0) return;

  const placeOrderBtn = document.getElementById('placeOrderBtn');
  const originalBtnHtml = placeOrderBtn.innerHTML;

  try {
    placeOrderBtn.disabled = true;
    placeOrderBtn.innerHTML = `
      <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span>Sending to Kitchen...</span>
    `;

    const notes = document.getElementById('orderNotes').value;
    const orderPayload = {
      table: currentTable,
      items: entries.map(e => ({ id: e.item.id, quantity: e.quantity })),
      notes: notes
    };

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to place order');
    }

    // Success!
    closeCartDrawer();
    cart = {};
    document.getElementById('orderNotes').value = '';
    updateCartUI();
    renderMenuGrid();

    // Show Confirmation Modal
    showSuccessModal(data.order);

  } catch (err) {
    alert(`Could not place order: ${err.message}`);
  } finally {
    placeOrderBtn.disabled = false;
    placeOrderBtn.innerHTML = originalBtnHtml;
  }
}

// Show Order Success Modal
function showSuccessModal(order) {
  const modal = document.getElementById('orderSuccessModal');
  document.getElementById('successOrderId').textContent = `#${order.id}`;
  document.getElementById('successOrderTable').textContent = `Table #${order.table}`;
  document.getElementById('successOrderTotal').textContent = `RM ${order.total.toFixed(2)}`;
  modal.classList.remove('hidden');
}

function closeSuccessModal() {
  document.getElementById('orderSuccessModal').classList.add('hidden');
}

// Search Handler
function handleSearch(val) {
  searchQuery = val;
  const clearBtn = document.getElementById('clearSearchBtn');
  if (val.trim() !== '') {
    clearBtn.classList.remove('hidden');
  } else {
    clearBtn.classList.add('hidden');
  }
  filterAndRenderItems();
}

function clearSearch() {
  const input = document.getElementById('searchInput');
  input.value = '';
  handleSearch('');
}

// Table Selector Logic
function openTableSelectorModal() {
  document.getElementById('tableModalBackdrop').classList.remove('hidden');
}

function closeTableSelectorModal() {
  document.getElementById('tableModalBackdrop').classList.add('hidden');
}

function selectTable(num) {
  currentTable = num;
  updateTableUI();
  updateCartUI();
  closeTableSelectorModal();

  // Update URL without full refresh
  const url = new URL(window.location);
  url.searchParams.set('table', num);
  window.history.pushState({}, '', url);
}

function updateTableUI() {
  const textEl = document.getElementById('currentTableText');
  const heroTableNotice = document.getElementById('heroTableNotice');
  if (textEl) textEl.textContent = `Table #${currentTable}`;
  if (heroTableNotice) heroTableNotice.textContent = `Table #${currentTable}`;
  renderTableButtons();
}

function renderTableButtons() {
  const container = document.getElementById('tableSelectionButtons');
  if (!container) return;

  let html = '';
  for (let i = 1; i <= 6; i++) {
    const isSelected = i === currentTable;
    const btnClass = isSelected
      ? 'bg-brand-600 text-white border-brand-500 font-bold shadow-md shadow-brand-500/20 ring-2 ring-brand-300'
      : 'bg-slate-50 text-slate-700 hover:bg-amber-50 border-slate-200';

    html += `
      <button 
        onclick="selectTable(${i})"
        class="py-3 rounded-xl border text-center transition active:scale-95 ${btnClass}"
      >
        <div class="text-[10px] uppercase tracking-wider ${isSelected ? 'text-amber-100' : 'text-slate-500'}">Table</div>
        <div class="text-xl font-heading font-extrabold">${i}</div>
      </button>
    `;
  }
  container.innerHTML = html;
}

// QR Codes Preview Modal (Table 1 to 6)
async function openQrCodesModal() {
  const modal = document.getElementById('qrModalBackdrop');
  const grid = document.getElementById('qrCardsGrid');
  modal.classList.remove('hidden');

  let baseOrigin = window.location.origin;

  // If testing on localhost, fetch actual Wi-Fi / LAN IP so mobile phones can scan it
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    try {
      const netRes = await fetch('/api/network-info');
      if (netRes.ok) {
        const netData = await netRes.json();
        if (netData.networkUrl) {
          baseOrigin = netData.networkUrl;
        }
      }
    } catch (e) {
      console.warn('Could not fetch network IP, using origin', e);
    }
  }

  let cards = '';
  for (let i = 1; i <= 6; i++) {
    const tableUrl = `${baseOrigin}/?table=${i}`;
    const qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(tableUrl)}&margin=4`;

    cards += `
      <div class="qr-card-print bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center text-center shadow-xs">
        <div class="font-heading font-bold text-lg text-slate-900 mb-0.5">Table #${i}</div>
        <div class="text-[11px] text-brand-600 font-bold mb-3">Kuala Lumpur Port</div>
        <div class="p-2 bg-white rounded-xl shadow-xs border border-slate-200 mb-3">
          <img src="${qrImage}" alt="QR Table ${i}" class="w-32 h-32" />
        </div>
        <a 
          href="${tableUrl}" 
          target="_blank"
          class="text-xs text-brand-600 hover:underline font-semibold font-mono"
        >
          ${tableUrl}
        </a>
      </div>
    `;
  }

  grid.innerHTML = cards;
}

function closeQrCodesModal() {
  document.getElementById('qrModalBackdrop').classList.add('hidden');
}
