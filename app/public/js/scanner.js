/**
 * Barcode Scanner Controller (Optimized for iPad & Android)
 * Wraps html5-qrcode library with native fallbacks and strict rear camera requests.
 */
class BarcodeScannerController {
  constructor() {
    this.html5Qrcode = null;
    this.isScanning = false;
    this.isCoolingDown = false;
    
    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.scannerCard = document.getElementById('scanner-card');
    this.toggleBtn = document.getElementById('toggle-scanner-btn');
    this.statusBadge = document.getElementById('scanner-status');
    this.barcodeInput = document.getElementById('barcode');
    this.autoSubmitToggle = document.getElementById('auto-submit-toggle');
    this.focusScanBtn = document.getElementById('btn-focus-scan');
    
    // Nascondiamo il selettore fotocamera manuale dato che forziamo quella posteriore
    this.cameraSelect = document.getElementById('camera-select');
    if (this.cameraSelect) {
      this.cameraSelect.style.display = 'none';
    }
  }

  bindEvents() {
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => this.toggleScanner());
    }
    if (this.focusScanBtn) {
      this.focusScanBtn.addEventListener('click', () => {
        if (!this.isScanning) {
          this.showScannerCard();
          this.startScanner();
        }
        if (this.barcodeInput) this.barcodeInput.focus();
      });
    }
  }

  showScannerCard() {
    if (this.scannerCard) {
      this.scannerCard.classList.remove('hidden');
    }
  }

  toggleScanner() {
    if (!this.scannerCard) return;
    
    if (this.scannerCard.classList.contains('hidden')) {
      this.showScannerCard();
      this.startScanner();
    } else if (this.isScanning) {
      this.stopScanner().then(() => {
        this.scannerCard.classList.add('hidden');
      });
    } else {
      this.scannerCard.classList.add('hidden');
    }
  }

  async startScanner() {
    if (this.isScanning) return;

    if (typeof Html5Qrcode === 'undefined') {
      alert('Libreria Scanner non caricata.');
      return;
    }

    if (!this.html5Qrcode) {
      // Configurazione per abilitare BarcodeDetector nativo se supportato
      this.html5Qrcode = new Html5Qrcode("reader", { 
        experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
        }
      });
    }

    // Definiamo i formati supportati per ridurre drasticamente il carico della CPU su iPad
    let formats = undefined;
    if (typeof Html5QrcodeSupportedFormats !== 'undefined') {
      formats = [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39
      ];
    }

    const scanConfig = {
      fps: 20, // 20 FPS è il bilanciamento ideale tra performance di lettura e surriscaldamento su iOS
      formatsToSupport: formats,
      qrbox: (viewWidth, viewHeight) => {
        const minEdge = Math.min(viewWidth, viewHeight);
        // Formato rettangolare stretto e lungo ottimizzato per i classici codici a barre 1D
        return {
          width: Math.floor(minEdge * 0.95),
          height: Math.floor(minEdge * 0.4) 
        };
      }
    };

    try {
      this.updateStatus('Avvio...', 'status-off');
      
      // Tentativo 1: Forziamo la fotocamera posteriore esatta (environment)
      try {
        await this.html5Qrcode.start(
          { facingMode: { exact: "environment" } },
          scanConfig,
          (decodedText, decodedResult) => this.onScanSuccess(decodedText, decodedResult),
          (errorMessage) => { /* ignore frame errors */ }
        );
      } catch (err) {
        console.warn("Fotocamera posteriore 'exact' non trovata. Uso fallback generico...", err);
        // Tentativo 2: Fallback generico per dispositivi senza classificazione esatta
        await this.html5Qrcode.start(
          { facingMode: "environment" },
          scanConfig,
          (decodedText, decodedResult) => this.onScanSuccess(decodedText, decodedResult),
          (errorMessage) => { /* ignore frame errors */ }
        );
      }

      this.isScanning = true;
      this.updateStatus('In Scansione', 'status-active');
    } catch (err) {
      console.error('Failed to start scanner:', err);
      this.updateStatus('Errore Fotocamera', 'status-off');
      alert("Impossibile avviare la fotocamera posteriore. Verifica di aver concesso i permessi o prova a usare HTTPS.");
    }
  }

  async stopScanner() {
    if (!this.isScanning || !this.html5Qrcode) return;

    try {
      await this.html5Qrcode.stop();
      this.isScanning = false;
      this.updateStatus('Scanner Fermo', 'status-off');
    } catch (err) {
      console.error('Failed to stop scanner:', err);
    }
  }

  onScanSuccess(decodedText, decodedResult) {
    if (this.isCoolingDown) return;

    // Cooldown lock di 1.5 secondi per evitare scansioni doppie
    this.isCoolingDown = true;
    setTimeout(() => { this.isCoolingDown = false; }, 1500);

    // Feedback audio e tattile
    this.playBeepSound();
    if (navigator.vibrate) navigator.vibrate(100);

    // Inserisci il codice a barre nel campo
    if (this.barcodeInput) {
      this.barcodeInput.value = decodedText;
      
      // Submit automatico via HTMX
      if (this.autoSubmitToggle && this.autoSubmitToggle.checked) {
        const form = document.getElementById('item-form');
        if (form && typeof htmx !== 'undefined') {
          htmx.trigger(form, 'submit');
        }
      } else {
        const nameInput = document.getElementById('name');
        if (nameInput) nameInput.focus();
      }
    }
  }

  playBeepSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
      // Ignora blocchi audio del browser
    }
  }

  updateStatus(text, className) {
    if (this.statusBadge) {
      this.statusBadge.textContent = text;
      this.statusBadge.className = `status-indicator ${className}`;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.scannerController = new BarcodeScannerController();
});
