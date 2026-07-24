# Prompt per Google Antigravity: Sviluppo App Inventario Ultra-Leggera Dockerizzata

## CONTESTO & OBIETTIVO
Agisci come un Principal Software Architect e Senior Full-Stack Engineer. Il tuo obiettivo è progettare e implementare da zero un'applicazione web ultra-leggera, performante e reattiva per la gestione dell'inventario tramite scansione di codici a barre, ottimizzata per l'esecuzione in ambiente Docker su risorse hardware contenute (es. Home Server / Hyper-V VM / Mini PC).

L'applicazione deve permettere la scansione di codici a barre tramite fotocamera (mobile e desktop), l'inserimento/incremento di quantità, la gestione dell'inventario esistente, la ricerca rapida, e l'esportazione dei dati in formato Excel (`.xlsx`).

---

## ARCHITETTURA TECNICA & STACK CONSIGLIATO
Per garantire il minimo consumo di memoria RAM (< 30-50 MB) e la massima reattività senza l'overhead di pesanti framework SPA (React/Angular/Vue):

- **Backend:** Node.js con Fastify (o Go / Python FastAPI) + SQLite (DB embedded tramite `better-sqlite3` o driver nativo).
- **Frontend:** Server-Rendered HTML + HTMX (o Vanilla JS reattivo/Alpine.js) + CSS moderno responsive.
- **Barcode Scanner:** Integrazione lato client con `html5-qrcode` o `@zxing/library` per l'accesso nativo alla fotocamera (supporto sia Mobile che Desktop WebCam).
- **Export Engine:** `exceljs` o `xlsx` per la generazione lato server del file Excel.
- **Containerizzazione:** `Dockerfile` multi-stage build basato su immagine Alpine Linux (es. `node:20-alpine`), occupazione disco minimale e consumo RAM residenziale ultra-basso.

---

## REQUISITI FUNZIONALI DETTAGLIATI

### 1. Modulo Scansione Codici a Barre (Camera Scanner)
- **Interfaccia Camera:** Componente HTML5 con selettore fotocamera (frontale/posteriore per mobile, webcam per PC) e pulsante Start/Stop scansione.
- **Flusso Operativo:**
  1. Quando un codice a barre viene scansionato (o inserito manualmente in un campo di ripiego), l'input cattura la stringa alfanumerica/numerica del barcode.
  2. Il valore viene inserito automaticamente in un campo input dedicato `"Codice a Barre"`.
  3. Viene attivato/focalizzato il campo `"Quantità"` (valore predefinito: `1`).
  4. Un pulsante **"Aggiungi a Inventario"** invia la richiesta al backend.

### 2. Logica di Aggiornamento / Inserimento (Upsert Logic)
- **Verifica Esistenza:** Alla pressione di "Aggiungi", il sistema interroga il DB SQLite:
  - **Se il codice esiste già:** Incrementa la quantità esistente di +N (dove N è la quantità inserita dall'utente). Es: `quantita_nuova = quantita_attuale + N`.
  - **Se il codice NON esiste:** Crea un nuovo record nel DB con `barcode`, `quantita = N`, e assegna una data/ora di primo inserimento e un nome predefinito modificabile.
- **Notifica UX:** Feedback visivo immediato (toast alert o badge) che conferma l'operazione (es. *"Incrementato codice 800123456789 di +5. Nuova quantità: 12"*).

### 3. Modulo Consultazione & Ricerca Inventario
- **Tabella / Griglia Inventario:** Visualizzazione dell'elenco completo degli articoli censiti con le seguenti colonne: `Codice a Barre`, `Nome / Descrizione`, `Quantità`, `Ultimo Aggiornamento`, `Azioni`.
- **Barra di Ricerca Istantanea:** Input di ricerca in tempo reale (live-search via HTMX o fetch JS) per filtrare per codice a barre o nome.
- **Modifica Rapida Quantità (In-place Edit):**
  - Pulsanti istantanei `+1` / `-1` accanto a ogni voce.
  - Possibilità di sovrascrivere direttamente il numero della quantità con salvataggio immediato senza dover ri-scansionare il codice.
- **Eliminazione:** Pulsante per rimuovere una voce dall'inventario (con modale di conferma).

### 4. Esportazione Dati (Excel Export)
- Pulsante dedicato in plancia **"Esporta in Excel (.xlsx)"**.
- Genera e avvia il download diretto di un foglio di calcolo formattato con tutte le voci dell'inventario, le quantità aggiornate e i timestamp.

### 5. Architettura Multi-User Readiness
- Schema DB preparato per la scalabilità: tabelle modellate in modo da supportare future relazioni `users` e `logs` (audit delle scansioni).
- Gestione della concorrenza su SQLite impostando la modalità `WAL` (Write-Ahead Logging) per prevenire blocchi durante letture/scritture simultanee.

---

## SCHEMA DATABASE (SQLite)

```sql
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT 'Nuovo Articolo',
    quantity INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON inventory(barcode);
```

---

## REQUISITI PER DOCKER & DEPLOYMENT

### Dockerfile (Multi-Stage)
Devi generare un `Dockerfile` ottimizzato che utilizzi `node:20-alpine` come base, compili eventuali moduli nativi SQLite se necessari, pulisca le dipendenze di dev e mantenga la dimensione totale dell'immagine sotto i 150MB.

### docker-compose.yml
Includi un file `docker-compose.yml` completo con:
- Volume persistente montato per il database SQLite (`./data:/app/data`).
- Restart policy (`unless-stopped`).
- Mappatura porte (es. `3000:3000`).

---

## ISTRUZIONI PER GOOGLE ANTIGRAVITY

Sulla base delle specifiche sopra indicate, genera il codice sorgente completo, pronto per la produzione e privo di placeholder o commenti "TODO". Fornisci:
1. Tutti i file di codice (`server.js`, `database.js`, script JS frontend per lo scanner, file HTML/CSS).
2. Il `Dockerfile` e il `docker-compose.yml`.
3. Le istruzioni per il build ed il primo avvio del container (`docker compose up -d`).