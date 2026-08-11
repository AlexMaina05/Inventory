/**
 * HTML Templates per SSR
 */

function head(title = "Inventory") {
  return `
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>${title}</title>
      
      <!-- PWA Meta Tags -->
      <link rel="manifest" href="/public/manifest.json">
      <meta name="theme-color" content="#4f46e5">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
      
      <link rel="stylesheet" href="/public/css/style.css">
      <!-- Includiamo la libreria html5-qrcode dal CDN -->
      <script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script>
      <!-- Includiamo HTMX -->
      <script src="https://unpkg.com/htmx.org@1.9.6"></script>
      
      <!-- Dark Mode inline script per evitare il flash bianco -->
      <script>
        if (localStorage.getItem('theme') === 'dark') {
          document.documentElement.classList.add('dark-theme');
          document.addEventListener('DOMContentLoaded', () => {
             document.body.classList.add('dark-theme');
          });
        }
      </script>
    </head>
  `;
}

function renderLogin(errorMsg = '') {
  return `
    <!DOCTYPE html>
    <html lang="it">
      ${head("Login - Inventory")}
      <body>
        <div class="container" style="max-width: 400px; margin-top: 10vh;">
          <div class="card p-0 form-card" style="border-top-color: var(--primary);">
            <div class="card-header" style="justify-content: center;">
              <div class="brand">
                <span class="brand-icon">📦</span>
                <h1 class="brand-title">Inventory Auth</h1>
              </div>
            </div>
            <div class="card-body">
              ${errorMsg ? `<div class="toast toast-error mb-4" style="position: static; margin-bottom: 1rem;"><span class="toast-icon">❌</span><span>${errorMsg}</span></div>` : ''}
              <form action="/api/login" method="POST">
                <div class="form-group">
                  <label for="pin" class="form-label">PIN di Accesso <span class="required">*</span></label>
                  <input type="password" id="pin" name="pin" class="form-control" required autofocus autocomplete="current-password">
                </div>
                <button type="submit" class="btn btn-primary btn-block">Accedi</button>
              </form>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

function header() {
  return `
    <header class="app-header">
      <div class="container header-container">
        <div class="brand">
          <span class="brand-icon">📦</span>
          <h1 class="brand-title">Inventory</h1>
        </div>
        <div class="header-actions">
          <button id="theme-toggle" class="btn btn-secondary btn-icon" title="Toggle Dark Mode">🌓</button>
          
          <form id="import-form" hx-encoding="multipart/form-data" hx-post="/api/items/import" style="display:none;" hx-on::after-request="this.reset()">
            <input type="file" id="import-file" name="file" accept=".xlsx" onchange="document.getElementById('import-submit').click()">
            <button type="submit" id="import-submit"></button>
          </form>
          <button onclick="document.getElementById('import-file').click()" class="btn btn-secondary btn-icon" title="Importa da Excel">📤 Importa</button>
          
          <a href="/api/items/export" class="btn btn-secondary btn-icon" title="Esporta in Excel">📥 Excel</a>
          <button id="toggle-scanner-btn" class="btn btn-primary btn-icon" title="Avvia Scanner">📷 Scan</button>
          <form action="/api/logout" method="POST" style="display:inline;" hx-post="/api/logout" hx-target="body" hx-swap="outerHTML">
             <button type="submit" class="btn btn-danger btn-icon" title="Logout" style="min-width:44px;">🚪</button>
          </form>
        </div>
      </div>
    </header>
  `;
}

function scannerCard() {
  return `
    <div id="scanner-card" class="card p-0 scanner-card hidden">
      <div class="card-header">
        <h2 class="card-title">Scanner Fotocamera</h2>
        <span id="scanner-status" class="status-indicator status-off">Spento</span>
      </div>
      <div class="card-body p-0">
        <div class="camera-wrapper">
          <div id="reader"></div>
          <div class="scanner-reticle">
            <div class="reticle-line"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function itemForm(categories = []) {
  let catOptions = categories.map(c => `<option value="${c}">${c}</option>`).join('');
  return `
    <div class="card p-0 form-card">
      <div class="card-header">
        <h2 class="card-title">Registra Articolo</h2>
      </div>
      <div class="card-body">
        <form id="item-form" 
              hx-post="/api/items/upsert" 
              hx-target="#inventory-table-body" 
              hx-swap="innerHTML"
              hx-on::after-request="if(event.detail.successful) { this.reset(); document.getElementById('barcode').focus(); }">
          
          <div class="form-group">
            <label for="barcode" class="form-label">Codice a Barre <span class="required">*</span></label>
            <div class="input-with-button">
              <input type="text" id="barcode" name="barcode" class="form-control" required autocomplete="off" placeholder="Es. 801234567890">
              <button type="button" id="btn-focus-scan" class="btn btn-secondary" title="Avvia Fotocamera">📷</button>
            </div>
          </div>
          
          <div class="form-group">
            <label for="name" class="form-label">Nome Articolo <span class="required">*</span></label>
            <input type="text" id="name" name="name" class="form-control" required placeholder="Es. Cavo HDMI 2m">
          </div>

          <div class="form-group">
            <label for="category" class="form-label">Categoria</label>
            <input type="text" id="category" name="category" class="form-control" list="category-list" placeholder="Es. Elettronica" autocomplete="off">
            <datalist id="category-list">
              ${catOptions}
            </datalist>
          </div>
          
          <div class="form-group">
            <label for="quantity" class="form-label">Quantità (da aggiungere)</label>
            <input type="number" id="quantity" name="quantity" class="form-control" value="1" min="1" required>
          </div>
          
          <div class="form-group flex items-center" style="margin-top: 1.5rem; justify-content: space-between;">
            <button type="submit" class="btn btn-primary" style="flex: 1;">💾 Salva Articolo</button>
          </div>
          <div class="form-group mt-2">
            <label class="toggle-checkbox">
              <input type="checkbox" id="auto-submit-toggle" checked>
              Salva automaticamente alla lettura del codice
            </label>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderTableRow(item) {
  const badgeHtml = item.category ? `<span class="badge" style="background-color: var(--surface-alt); border: 1px solid var(--border-color); color: var(--text-main); margin-left: 0.5rem;">${item.category}</span>` : '';
  
  return `
    <tr id="row-${item.id}" class="item-row">
      <td class="font-mono">${item.barcode}</td>
      <td class="font-medium">${item.name} ${badgeHtml}</td>
      <td>
        <div class="quantity-stepper">
          <button class="btn-step" 
                  hx-patch="/api/items/${item.id}/quantity?delta=-1" 
                  hx-target="#row-${item.id}" 
                  hx-swap="outerHTML">-</button>
          <input type="number" 
                 value="${item.quantity}" 
                 min="0"
                 hx-post="/api/items/${item.id}/quantity" 
                 hx-trigger="change" 
                 hx-target="#row-${item.id}" 
                 hx-swap="outerHTML" 
                 name="quantity"
                 style="width: 50px; text-align: center;">
          <button class="btn-step" 
                  hx-patch="/api/items/${item.id}/quantity?delta=1" 
                  hx-target="#row-${item.id}" 
                  hx-swap="outerHTML">+</button>
        </div>
      </td>
      <td>
        <button class="btn btn-danger btn-sm btn-icon" 
                hx-delete="/api/items/${item.id}" 
                hx-target="#row-${item.id}" 
                hx-swap="outerHTML swap:300ms"
                hx-confirm="Sei sicuro di voler eliminare ${item.name}?">
          🗑️
        </button>
      </td>
    </tr>
  `;
}

function renderTableRows(items) {
  if (items.length === 0) {
    return `<tr><td colspan="4" class="text-center text-muted empty-state">Nessun articolo trovato nell'inventario.</td></tr>`;
  }
  return items.map(renderTableRow).join('');
}

function inventoryTable(items, categories = []) {
  let catOptions = categories.map(c => `<option value="${c}">${c}</option>`).join('');
  return `
    <div class="card p-0 inventory-section">
      <div class="card-header flex table-header-flex">
        <h2 class="card-title">Inventario</h2>
        <div class="flex gap-1" style="width: 100%; max-width: 500px; margin-left: auto;">
          <select id="category-filter" name="category" class="form-control form-control-sm" style="flex: 1;"
                  hx-get="/api/items" 
                  hx-trigger="change" 
                  hx-target="#inventory-table-body"
                  hx-include="[name='q']">
            <option value="">Tutte le cat.</option>
            ${catOptions}
          </select>
          <div class="search-box" style="flex: 2;">
            <input type="text" name="q" class="form-control form-control-sm" placeholder="Cerca nome o codice..." 
                   hx-get="/api/items" 
                   hx-trigger="keyup changed delay:300ms, search" 
                   hx-target="#inventory-table-body"
                   hx-include="[name='category']">
          </div>
        </div>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Barcode</th>
              <th>Articolo</th>
              <th>Quantità</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody id="inventory-table-body">
            ${renderTableRows(items)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderToast(message, type = 'info') {
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  return `
    <div id="toast-container" hx-swap-oob="beforeend">
      <div class="toast toast-${type} animate-slide-in" role="alert">
        <span class="toast-icon">${icon}</span>
        <span>${message}</span>
        <button type="button" onclick="this.parentElement.remove()" style="margin-left: auto; background:none; border:none; cursor:pointer; font-size:1.1rem; padding: 0.25rem;">✕</button>
      </div>
    </div>
  `;
}

function renderPage(items, categories = []) {
  return `
    <!DOCTYPE html>
    <html lang="it">
      ${head()}
      <body>
        ${header()}
        
        <main class="container">
          <div class="hero-deck">
            ${scannerCard()}
            ${itemForm(categories)}
          </div>
          
          ${inventoryTable(items, categories)}
          
          <!-- Contenitore per i Toasts che HTMX riempirà con hx-swap-oob -->
          <div id="toast-container"></div>
        </main>

        <script src="/public/js/scanner.js"></script>
        <script>
          // Registrazione Service Worker per la PWA
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/public/sw.js').catch(err => {
                console.log('SW registration failed: ', err);
              });
            });
          }

          // Script Dark Mode
          document.addEventListener('DOMContentLoaded', () => {
             const btn = document.getElementById('theme-toggle');
             if (btn) {
               btn.addEventListener('click', () => {
                  const isDark = document.body.classList.toggle('dark-theme');
                  localStorage.setItem('theme', isDark ? 'dark' : 'light');
               });
             }
          });

          // Sound Effects Engine
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          window.playSound = function(type) {
            try {
              if (audioCtx.state === 'suspended') audioCtx.resume();
              const osc = audioCtx.createOscillator();
              const gain = audioCtx.createGain();
              osc.connect(gain);
              gain.connect(audioCtx.destination);
              
              if (type === 'success') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, audioCtx.currentTime);
                osc.frequency.setValueAtTime(1046, audioCtx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
                osc.start(audioCtx.currentTime);
                osc.stop(audioCtx.currentTime + 0.2);
              } else if (type === 'error') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, audioCtx.currentTime);
                osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.3);
                gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
                osc.start(audioCtx.currentTime);
                osc.stop(audioCtx.currentTime + 0.3);
              } else if (type === 'scan') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
                gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
                osc.start(audioCtx.currentTime);
                osc.stop(audioCtx.currentTime + 0.1);
              }
            } catch (e) {
              console.warn("Audio blocked by browser", e);
            }
          };

          // Aggancia i suoni ad HTMX
          document.body.addEventListener('htmx:afterRequest', function(evt) {
            if (evt.detail.successful) {
              // Suono di successo solo per modifiche (POST, PATCH, DELETE, PUT)
              if (evt.detail.requestConfig.verb !== 'get') {
                window.playSound('success');
              }
            } else {
              window.playSound('error');
            }
          });
        </script>
      </body>
    </html>
  `;
}

module.exports = {
  renderPage,
  renderTableRow,
  renderTableRows,
  renderToast,
  renderLogin
};
