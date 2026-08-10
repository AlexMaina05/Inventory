/**
 * HTML Escaping utility to prevent XSS attacks.
 * @param {string|number} str 
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders a single table row element for an item.
 * @param {Object} item 
 * @returns {string} HTML <tr> string
 */
function renderTableRow(item) {
  if (!item) return '';
  return `
    <tr id="item-row-${item.id}" class="item-row">
      <td class="font-mono font-semibold">${escapeHtml(item.barcode)}</td>
      <td class="font-medium">${escapeHtml(item.name)}</td>
      <td>
        <div class="quantity-controls flex items-center gap-1">
          <button type="button" 
                  class="btn btn-sm btn-outline btn-step"
                  hx-patch="/api/items/${item.id}/quantity"
                  hx-vals='{"delta": -1}'
                  hx-target="#item-row-${item.id}"
                  hx-swap="outerHTML">-</button>
          <input type="number" 
                 class="form-control form-control-sm text-center qty-input" 
                 style="width: 60px; display: inline-block;" 
                 value="${escapeHtml(item.quantity)}" 
                 min="0"
                 name="quantity"
                 hx-patch="/api/items/${item.id}/quantity"
                 hx-trigger="change"
                 hx-target="#item-row-${item.id}"
                 hx-swap="outerHTML">
          <button type="button" 
                  class="btn btn-sm btn-outline btn-step"
                  hx-patch="/api/items/${item.id}/quantity"
                  hx-vals='{"delta": 1}'
                  hx-target="#item-row-${item.id}"
                  hx-swap="outerHTML">+</button>
        </div>
      </td>
      <td class="text-muted text-sm">${escapeHtml(item.updated_at || item.created_at)}</td>
      <td class="table-actions">
        <button type="button" class="btn btn-sm btn-outline" 
                onclick="document.getElementById('barcode').value='${escapeHtml(item.barcode)}'; document.getElementById('name').value='${escapeHtml(item.name)}'; document.getElementById('quantity').value='1'; document.getElementById('barcode').focus();">
          Fill
        </button>
        <button type="button" 
                class="btn btn-sm btn-danger btn-delete" 
                hx-delete="/api/items/${item.id}" 
                hx-target="closest tr" 
                hx-swap="outerHTML swap:300ms">
          🗑 Delete
        </button>
      </td>
    </tr>
  `;
}

/**
 * Renders table body row items.
 * @param {Array<Object>} items 
 * @returns {string} HTML string of <tr> elements
 */
function renderTableRows(items = []) {
  if (!items || items.length === 0) {
    return `
      <tr>
        <td colspan="5" class="text-center text-muted empty-state">
          No inventory items found. Scan or enter a barcode above to add items.
        </td>
      </tr>
    `;
  }

  return items.map(item => renderTableRow(item)).join('');
}

/**
 * Renders Out-Of-Band Toast message fragment.
 * @param {string} message 
 * @param {'success'|'error'|'info'} [type='success'] 
 * @returns {string}
 */
function renderToast(message, type = 'success') {
  return `
    <div id="toast-container" hx-swap-oob="true">
      <div class="toast toast-${escapeHtml(type)} animate-slide-in">
        <span class="toast-icon">${type === 'success' ? '✓' : '⚠'}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
      </div>
    </div>
  `;
}

/**
 * Renders full HTML page layout.
 * Supports calling as renderPage(items) or renderPage({ items, searchQuery })
 * @param {Array<Object>|Object} data 
 * @param {string} [searchQueryParam=''] 
 * @returns {string} Complete HTML document
 */
function renderPage(data = {}, searchQueryParam = '') {
  let items = [];
  let searchQuery = searchQueryParam;

  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === 'object') {
    items = data.items || [];
    searchQuery = data.searchQuery || searchQueryParam || '';
  }

  const tableRowsHtml = renderTableRows(items);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inventory Management</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/public/css/style.css">
  <!-- HTMX library delivery with fallback -->
  <script src="/public/js/htmx.min.js" onerror="this.onerror=null;this.src='https://unpkg.com/htmx.org@1.9.10'"></script>
  <!-- HTML5-QRCode library delivery with fallback -->
  <script src="/public/js/html5-qrcode.min.js" onerror="this.onerror=null;this.src='https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'"></script>
</head>
<body>
  <!-- Header Bar / Navbar -->
  <header class="app-header">
    <div class="container header-container">
      <div class="brand">
        <span class="brand-icon">📦</span>
        <h1 class="brand-title">Inventory Manager</h1>
        <span class="badge badge-wal">WAL Active</span>
      </div>
      <div class="header-actions">
        <button id="toggle-scanner-btn" class="btn btn-primary btn-sm">
          <span class="btn-icon">📷</span> Toggle Camera
        </button>
        <a href="/api/items/export" id="export-btn" class="btn btn-secondary btn-sm btn-export" download>
          <span class="btn-icon">📊</span> Export Excel
        </a>
      </div>
    </div>
  </header>

  <main class="container main-content">
    <!-- Notification Toast Target Container -->
    <div id="toast-container"></div>

    <!-- Hero Deck: Top focal section for Scanner & Form -->
    <section class="hero-deck">
      <!-- Camera Scanner Card -->
      <div id="scanner-card" class="card scanner-card hidden">
        <div class="card-header">
          <h2 class="card-title">Barcode Camera Scanner</h2>
          <span id="scanner-status" class="status-indicator status-off">Stopped</span>
        </div>
        <div class="card-body">
          <div class="camera-wrapper">
            <div id="reader"></div>
            <div id="scanner-reticle" class="scanner-reticle">
              <div class="reticle-line"></div>
            </div>
          </div>
          <div class="scanner-controls mt-2">
            <select id="camera-select" class="form-control text-sm">
              <option value="">Detecting cameras...</option>
            </select>
            <label class="toggle-checkbox mt-2">
              <input type="checkbox" id="auto-submit-toggle" checked>
              <span>Auto-submit on scan</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Add / Increment Form Card -->
      <div class="card form-card">
        <div class="card-header">
          <h2 class="card-title">Add / Increment Inventory Item</h2>
        </div>
        <div class="card-body">
          <form id="item-form"
                hx-post="/api/items/upsert"
                hx-target="#items-table-body"
                hx-swap="innerHTML"
                hx-on::after-request="if(event.detail.successful) { this.reset(); document.getElementById('quantity').value='1'; document.getElementById('barcode').focus(); }">
            
            <div class="form-group">
              <label for="barcode" class="form-label">Barcode <span class="required">*</span></label>
              <div class="input-with-button">
                <input type="text" id="barcode" name="barcode" class="form-control font-mono" 
                       placeholder="Scan barcode or enter manually" required autofocus autocomplete="off">
                <button type="button" id="btn-focus-scan" class="btn btn-outline" title="Ready to scan">📷</button>
              </div>
            </div>

            <div class="form-group">
              <label for="name" class="form-label">Item Name <span class="required">*</span></label>
              <input type="text" id="name" name="name" class="form-control" 
                     placeholder="e.g. Widget A, USB-C Cable" required autocomplete="off">
            </div>

            <div class="form-group">
              <label for="quantity" class="form-label">Quantity Add/Increment</label>
              <div class="quantity-stepper">
                <button type="button" class="btn btn-outline btn-step" onclick="const q=document.getElementById('quantity'); q.value=Math.max(1, parseInt(q.value||1)-1);">-</button>
                <input type="number" id="quantity" name="quantity" class="form-control text-center" 
                       value="1" min="1" required>
                <button type="button" class="btn btn-outline btn-step" onclick="const q=document.getElementById('quantity'); q.value=parseInt(q.value||1)+1;">+</button>
              </div>
            </div>

            <div class="form-actions">
              <button type="submit" class="btn btn-primary btn-block">
                <span class="btn-icon">➕</span> Upsert Inventory Item
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>

    <!-- Inventory Table Section placed below Hero Deck -->
    <section class="inventory-section">
      <div class="card table-card">
        <div class="card-header table-header-flex">
          <h2 class="card-title">Inventory Items</h2>
          <!-- Real-time Search Bar -->
          <div class="search-box">
            <input type="search" 
                   id="search-input"
                   name="q" 
                   value="${escapeHtml(searchQuery)}" 
                   placeholder="Search barcode or name..." 
                   class="form-control form-control-sm"
                   hx-get="/items/search"
                   hx-trigger="keyup changed delay:300ms, search"
                   hx-target="#items-table-body"
                   hx-swap="innerHTML">
          </div>
        </div>
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Barcode</th>
                  <th>Name</th>
                  <th>Qty</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="items-table-body">
                ${tableRowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  </main>

  <script src="/public/js/scanner.js"></script>
</body>
</html>`;
}

module.exports = {
  escapeHtml,
  renderTableRow,
  renderTableRows,
  renderToast,
  renderPage,
  renderMainPage: renderPage
};
