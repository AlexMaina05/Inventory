# 📦 Sistema di Gestione Inventario (Ultra-Leggero & Serverless)

Questa è l'applicazione di gestione inventario definitiva, progettata per offrire un'esperienza utente "Premium" (UI Enterprise, animazioni fluide) pur mantenendo un peso computazionale quasi nullo. Nata come app Node.js con database locale SQLite, l'architettura è stata potenziata per supportare il deploy a costo zero su infrastrutture **Edge Serverless (Vercel)**, utilizzando un database SQLite distribuito (**Turso / libSQL**).

---

## 🛠️ Stack Tecnologico
- **Backend:** Node.js, Fastify (Routing velocissimo e validazione)
- **Database:** libSQL / Turso (Compatibilità 100% SQLite, con supporto cloud serverless e locale)
- **Frontend / UI:** HTML5 Vanilla, CSS "Slate & Indigo" (Zero framework pesanti, no Bootstrap, no React)
- **Reattività:** HTMX (Aggiornamenti in tempo reale senza ricaricare la pagina)
- **Scanner:** API Nativa `BarcodeDetector` accelerata via Hardware + Fallback ottimizzato a `html5-qrcode` (20 FPS, forzatura fotocamera posteriore per device mobili).
- **Esportazione:** `exceljs` per download istantanei in formato `.xlsx`.

---

## 📂 Struttura del Progetto

```text
/app
├── api/
│   └── serverless.js       # Adattatore per eseguire Fastify su Vercel Functions
├── data/
│   └── inventory.db        # (Generato in automatico) Database locale di fallback
├── public/
│   ├── css/style.css       # Design System (Tema Premium Slate & Indigo)
│   └── js/scanner.js       # Logica ibrida fotocamera (Hardware Native / JS)
├── src/
│   ├── routes/items.js     # API RESTful e Controller HTMX
│   ├── views/templates.js  # Componenti UI (Server-Side Rendering manuale)
│   ├── app.js              # Configurazione istanza Fastify
│   ├── db.js               # Connessione DB (libSQL client asincrono)
│   └── server.js           # Entry-point per l'avvio del server locale tradizionale
├── package.json
└── vercel.json             # Regole di routing e CDN per Vercel
```

---

## 💻 Guida allo Sviluppo Locale (Test Rapidi)

La comodità di `@libsql/client` è che se non gli viene passato alcun parametro cloud, creerà automaticamente un file fisico `inventory.db` locale. **Non hai bisogno del cloud per sviluppare o testare.**

1. **Installa le dipendenze:**
   ```bash
   npm install
   ```

2. **Avvia il server in locale:**
   ```bash
   npm start
   ```

3. **Apri nel browser:**
   Visita `http://localhost:3000`. L'app è 100% funzionante con persistenza dei dati sul file `.db` locale.

---

## ☁️ Guida al Deploy (Vercel + Turso)

Questa sezione spiega come portare l'applicazione online in modo **gratuito e permanente**, garantendo che i dati scansionati non vengano persi quando la funzione Serverless si spegne.

### Fase 1: Creazione del Database Cloud (Turso)
Vercel ha un file system di sola lettura. Abbiamo bisogno di un database esterno che usi lo stesso linguaggio di SQLite: Turso.
1. Vai su [Turso.tech](https://turso.tech/) e accedi (o crea un account via GitHub).
2. Crea un nuovo database cliccando su **Create Database** (chiamalo ad esempio `inventory-db`).
3. Scegli un server vicino a te (es. Parigi o Francoforte).
4. Dalla dashboard del database appena creato, copia questi due valori cruciali:
   - **Database URL** (inizia con `libsql://...`)
   - **Auth Token** (clicca su "Generate Token", impostalo su *Never expires* e copia il codice lunghissimo).

### Fase 2: Caricamento su GitHub
1. Inizializza un repository git locale (se non l'hai già fatto):
   ```bash
   git init
   git add .
   git commit -m "Prima release"
   ```
2. Crea un repository privato o pubblico sul tuo account GitHub.
3. Fai il push di tutto il codice verso il repository appena creato.

### Fase 3: Deploy su Vercel
1. Accedi a [Vercel.com](https://vercel.com/) con lo stesso account GitHub.
2. Dalla dashboard di Vercel, clicca su **Add New... -> Project**.
3. Vercel ti mostrerà i tuoi repository GitHub. Seleziona quello che hai appena caricato e clicca **Import**.
4. ⚠️ **PASSAGGIO CRITICO (Environment Variables)** ⚠️
   Prima di premere il grande tasto "Deploy", espandi la sezione **"Environment Variables"** e aggiungi le due credenziali prese da Turso:
   - Chiave: `DATABASE_URL` | Valore: `libsql://...`
   - Chiave: `DATABASE_AUTH_TOKEN` | Valore: `[il_tuo_token]`
5. Ora clicca su **Deploy**.
6. Attendi ~30 secondi. Vercel installerà i pacchetti (senza build steps) e ti restituirà un link (es. `inventory-app.vercel.app`).

**Fatto! 🎉 L'app è online. Qualsiasi codice a barre che scansionerai dal telefono finirà in tempo reale sul database Turso.**

---

## 🧠 Decisioni Architetturali (Design pattern)
- **Perché HTMX e non React?**
  Per evitare il caricamento di enormi bundle JavaScript sul client. L'HTML viene generato direttamente in `templates.js` e inviato al volo. Questo rende l'app reattiva come una SPA, ma con il peso di un sito statico dei primi anni 2000.
- **Perché la fotocamera posteriore "forzata"?**
  I dispositivi Apple (iPad) faticano spesso a capire quale lente attivare tramite librerie JS generiche. Passando il vincolo hardware `{ facingMode: { exact: "environment" } }`, il browser apre immediatamente il sensore principale, velocizzando drasticamente il setup sul dispositivo.
- **Zero Lock-in Vendor**
  Se un domani volessi abbandonare Vercel, puoi semplicemente avviare un container Docker lanciando `npm start` (o un PM2 locale) e l'app tornerà a funzionare tranquillamente in modalità on-premise locale!
