function head(title = "Inventory") {
  return `
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>${title}</title>
      
      <link rel="manifest" href="/public/manifest.json">
      <meta name="theme-color" content="#4f46e5">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
      
      <link rel="stylesheet" href="/public/css/style.css">
      <script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script>
      <script src="https://unpkg.com/htmx.org@1.9.6"></script>
      
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

function header(role) {
  return `
    <header class="app-header">
      <div class="container header-container">
        <div class="brand">
          <span class="brand-icon">📦</span>
          <h1 class="brand-title">Inventory</h1>
        </div>
        <div class="header-actions">
          <button id="theme-toggle" class="btn btn-secondary btn-icon" title="Toggle Dark Mode">🌓</button>
          
          <button id="mode-toggle-btn" class="btn btn-secondary btn-icon" style="border-color: var(--warning); color: var(--warning);">🛒 Cassa</button>

          ${role === 'admin' ? `
          <form id="import-form" hx-encoding="multipart/form-data" hx-post="/api/items/import" style="display:none;" hx-on::after-request="this.reset()">
            <input type="file" id="import-file" name="file" accept=".xlsx" onchange="document.getElementById('import-submit').click()">
            <button type="submit" id="import-submit"></button>
          </form>
          <button onclick="document.getElementById('import-file').click()" class="btn btn-secondary btn-icon" title="Importa da Excel">📤 Imp</button>
          <a href="/api/items/export" class="btn btn-secondary btn-icon" title="Esporta in Excel">📥 Esp</a>
          ` : ''}

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

function itemForm(categories = [], locations = []) {
  let catOptions = categories.map(c => `<option value="${c}">${c}</option>`).join('');
  let locOptions = locations.map(l => `<option value="${l}">${l}</option>`).join('');
  
  return `
    <div id="entry-form-section" class="card p-0 form-card">
      <div class="card-header">
        <h2 class="card-title">Registra Articolo (Carico)</h2>
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

          <div class="form-group" style="display:flex; gap:1rem;">
            <div style="flex:1;">
              <label for="category" class="form-label">Categoria</label>
              <input type="text" id="category" name="category" class="form-control" list="category-list" placeholder="Es. Elettronica" autocomplete="off">
              <datalist id="category-list">${catOptions}</datalist>
            </div>
            <div style="flex:1;">
              <label for="location" class="form-label">Posizione</label>
              <input type="text" id="location" name="location" class="form-control" list="location-list" value="Main" required autocomplete="off">
              <datalist id="location-list">${locOptions}</datalist>
            </div>
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

function cartSection() {
  return `
    <div id="cart-section" class="card p-0 form-card hidden" style="border-top-color: var(--warning);">
      <div class="card-header">
        <h2 class="card-title">🛒 Cassa (Scarico Merci)</h2>
      </div>
      <div class="card-body">
        <ul id="cart-list" style="list-style: none; padding: 0; margin-bottom: 1.5rem; font-size: 1.1rem;">
           <li class="text-muted text-center" style="padding: 2rem 0;">Il carrello è vuoto.<br><small>Scansiona i prodotti per scaricarli dal magazzino "Main".</small></li>
        </ul>
        <form id="checkout-form" hx-post="/api/items/checkout" hx-on::after-request="if(event.detail.successful) { window.clearCart(); }">
          <input type="hidden" id="cart-data" name="cartData" value="[]">
          <button type="button" id="btn-checkout" class="btn btn-primary btn-block" style="background-color: var(--warning); border-color: var(--warning);" disabled>Conferma Scarico Merci</button>
        </form>
      </div>
    </div>
  `;
}

function renderTableRow(item, role) {
  const catBadgeHtml = item.category ? `<span class="badge" style="background-color: var(--surface-alt); border: 1px solid var(--border-color); color: var(--text-main); margin-left: 0.5rem;">${item.category}</span>` : '';
  const locBadgeHtml = `<span class="badge" style="background-color: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); color: var(--success); margin-left: 0.5rem;">${item.location}</span>`;
  
  const deleteBtn = role === 'admin' 
    ? `<button class="btn btn-danger btn-sm btn-icon" hx-delete="/api/items/${item.id}" hx-target="#row-${item.id}" hx-swap="outerHTML swap:300ms" hx-confirm="Eliminare ${item.name}?">🗑️</button>` 
    : '';

  return `
    <tr id="row-${item.id}" class="item-row">
      <td class="font-mono">${item.barcode}</td>
      <td class="font-medium">${item.name} <br> ${catBadgeHtml} ${locBadgeHtml}</td>
      <td>
        <div class="quantity-stepper">
          <button class="btn-step" hx-patch="/api/items/${item.id}/quantity?delta=-1" hx-target="#row-${item.id}" hx-swap="outerHTML">-</button>
          <input type="number" value="${item.quantity}" min="0" hx-post="/api/items/${item.id}/quantity" hx-trigger="change" hx-target="#row-${item.id}" hx-swap="outerHTML" name="quantity" style="width: 50px; text-align: center;">
          <button class="btn-step" hx-patch="/api/items/${item.id}/quantity?delta=1" hx-target="#row-${item.id}" hx-swap="outerHTML">+</button>
        </div>
      </td>
      <td>${deleteBtn}</td>
    </tr>
  `;
}

function renderTableRows(items, role) {
  if (items.length === 0) {
    return `<tr><td colspan="4" class="text-center text-muted empty-state">Nessun articolo trovato.</td></tr>`;
  }
  return items.map(i => renderTableRow(i, role)).join('');
}

function inventoryTable(items, categories = [], locations = [], role) {
  let catOptions = categories.map(c => `<option value="${c}">${c}</option>`).join('');
  let locOptions = locations.map(l => `<option value="${l}">${l}</option>`).join('');
  
  return `
    <div class="card p-0 inventory-section">
      <div class="card-header flex table-header-flex">
        <h2 class="card-title">Inventario</h2>
        <div class="flex gap-1" style="width: 100%; max-width: 600px; margin-left: auto;">
          <select name="location" class="form-control form-control-sm" style="flex: 1;" hx-get="/api/items" hx-trigger="change" hx-target="#inventory-table-body" hx-include="[name='q'], [name='category']">
            <option value="">Tutte le posizioni</option>
            ${locOptions}
          </select>
          <select name="category" class="form-control form-control-sm" style="flex: 1;" hx-get="/api/items" hx-trigger="change" hx-target="#inventory-table-body" hx-include="[name='q'], [name='location']">
            <option value="">Tutte le categorie</option>
            ${catOptions}
          </select>
          <div class="search-box" style="flex: 2;">
            <input type="text" name="q" class="form-control form-control-sm" placeholder="Cerca nome o codice..." hx-get="/api/items" hx-trigger="keyup changed delay:300ms, search" hx-target="#inventory-table-body" hx-include="[name='category'], [name='location']">
          </div>
        </div>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Barcode</th>
              <th>Articolo & Posizione</th>
              <th>Quantità</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody id="inventory-table-body">
            ${renderTableRows(items, role)}
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

function renderPage(items, categories = [], locations = [], role) {
  return `
    <!DOCTYPE html>
    <html lang="it">
      ${head()}
      <body>
        ${header(role)}
        
        <main class="container">
          <div class="hero-deck">
            ${scannerCard()}
            ${itemForm(categories, locations)}
            ${cartSection()}
          </div>
          
          ${inventoryTable(items, categories, locations, role)}
          
          <div id="toast-container"></div>
        </main>

        <script src="/public/js/scanner.js"></script>
        <script>
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => { navigator.serviceWorker.register('/public/sw.js').catch(console.error); });
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
                osc.type = 'sine'; osc.frequency.setValueAtTime(880, audioCtx.currentTime); osc.frequency.setValueAtTime(1046, audioCtx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
                osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.2);
              } else if (type === 'error') {
                osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.3);
                gain.gain.setValueAtTime(0.2, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
                osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.3);
              } else if (type === 'scan') {
                osc.type = 'sine'; osc.frequency.setValueAtTime(1200, audioCtx.currentTime); gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
                osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.1);
              }
            } catch (e) { console.warn("Audio blocked", e); }
          };

          document.body.addEventListener('htmx:afterRequest', function(evt) {
            if (evt.detail.successful) {
              if (evt.detail.requestConfig.verb !== 'get') window.playSound('success');
            } else {
              window.playSound('error');
            }
          });
          
          // Cart Logic e Keystroke Listener (Barcode Esterno)
          let isCartMode = false;
          let cart = {}; 

          document.addEventListener('DOMContentLoaded', () => {
            const modeBtn = document.getElementById('mode-toggle-btn');
            const entryForm = document.getElementById('entry-form-section');
            const cartSec = document.getElementById('cart-section');
            
            if (modeBtn) {
              modeBtn.addEventListener('click', () => {
                isCartMode = !isCartMode;
                if (isCartMode) {
                  modeBtn.textContent = '📦 Modo Entrata';
                  modeBtn.style.borderColor = 'var(--primary)';
                  modeBtn.style.color = 'var(--primary)';
                  entryForm.classList.add('hidden');
                  cartSec.classList.remove('hidden');
                } else {
                  modeBtn.textContent = '🛒 Modo Cassa';
                  modeBtn.style.borderColor = 'var(--warning)';
                  modeBtn.style.color = 'var(--warning)';
                  entryForm.classList.remove('hidden');
                  cartSec.classList.add('hidden');
                }
              });
            }

            const btnCheckout = document.getElementById('btn-checkout');
            if (btnCheckout) {
              btnCheckout.addEventListener('click', () => {
                 const cartArray = Object.values(cart);
                 document.getElementById('cart-data').value = JSON.stringify(cartArray);
                 htmx.trigger('#checkout-form', 'submit');
              });
            }

            // Keystroke per scanner Bluetooth
            let keys = '';
            let lastTime = Date.now();
            
            document.addEventListener('keydown', (e) => {
              // Se stiamo scrivendo in un input di testo (es. nome prodotto), ignora la digitazione rapida
              if (e.target.tagName === 'INPUT' && e.target.type !== 'radio' && e.target.type !== 'checkbox') {
                 // Lascia funzionare l'Enter per fare submit, ma non lanciare global scan
                 return;
              }

              const currentTime = Date.now();
              if (currentTime - lastTime > 100) keys = ''; // troppo lento per essere uno scanner
              lastTime = currentTime;
              
              if (e.key === 'Enter') {
                if (keys.length >= 4) {
                   e.preventDefault();
                   window.handleGlobalScan(keys);
                }
                keys = '';
              } else {
                if (e.key.length === 1) keys += e.key;
              }
            });
          });

          window.clearCart = function() {
            cart = {};
            updateCartUI();
          }

          function updateCartUI() {
             const list = document.getElementById('cart-list');
             const btn = document.getElementById('btn-checkout');
             const items = Object.values(cart);
             
             if (items.length === 0) {
               list.innerHTML = '<li class="text-muted text-center" style="padding: 2rem 0;">Il carrello è vuoto.</li>';
               btn.disabled = true;
             } else {
               list.innerHTML = items.map(i => \`
                 <li style="display:flex; justify-content:space-between; align-items:center; padding: 0.75rem 0; border-bottom: 1px solid var(--border-color);">
                   <span><span class="font-mono">\${i.barcode}</span> <br><small class="text-muted">Da: \${i.location}</small></span>
                   <strong style="color: var(--danger); font-size: 1.2rem;">- \${i.quantity}</strong>
                 </li>
               \`).join('');
               btn.disabled = false;
             }
          }

          window.handleGlobalScan = function(barcode) {
             if (window.playSound) window.playSound('scan');
             
             if (isCartMode) {
                // Per default scarichiamo dal Main, oppure dall'unica location se ne ha 1 sola
                const key = barcode + '|Main';
                if (!cart[key]) cart[key] = { barcode: barcode, location: 'Main', quantity: 0 };
                cart[key].quantity += 1;
                updateCartUI();
             } else {
                const input = document.getElementById('barcode');
                if (input) {
                   input.value = barcode;
                   const autoToggle = document.getElementById('auto-submit-toggle');
                   if (autoToggle && autoToggle.checked) {
                      htmx.trigger('#item-form', 'submit');
                   } else {
                      document.getElementById('name').focus();
                   }
                }
             }
          }
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
