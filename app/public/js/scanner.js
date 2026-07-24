/**
 * Barcode Scanner Controller wrapping html5-qrcode library
 */
class BarcodeScannerController {
  constructor() {
    this.html5Qrcode = null;
    this.isScanning = false;
    this.isCoolingDown = false;
    this.selectedDeviceId = null;
    
    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.scannerCard = document.getElementById('scanner-card');
    this.toggleBtn = document.getElementById('toggle-scanner-btn');
    this.statusBadge = document.getElementById('scanner-status');
    this.cameraSelect = document.getElementById('camera-select');
    this.barcodeInput = document.getElementById('barcode');
    this.autoSubmitToggle = document.getElementById('auto-submit-toggle');
    this.focusScanBtn = document.getElementById('btn-focus-scan');
  }

  bindEvents() {
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => this.toggleScanner());
    }
    if (this.cameraSelect) {
      this.cameraSelect.addEventListener('change', (e) => {
        if (this.isScanning) {
          this.stopScanner().then(() => this.startScanner(e.target.value));
        }
      });
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

  async detectCameras() {
    if (typeof Html5Qrcode === 'undefined') {
      if (this.cameraSelect) {
        this.cameraSelect.innerHTML = '<option value="">Scanner library not loaded</option>';
      }
      return;
    }

    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        if (this.cameraSelect) {
          this.cameraSelect.innerHTML = '';
          devices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = device.label || `Camera ${index + 1}`;
            this.cameraSelect.appendChild(option);
          });
        }
        this.selectedDeviceId = devices[0].id;
      } else {
        if (this.cameraSelect) {
          this.cameraSelect.innerHTML = '<option value="">No camera detected</option>';
        }
      }
    } catch (err) {
      console.warn('Camera detection error:', err);
      if (this.cameraSelect) {
        this.cameraSelect.innerHTML = '<option value="">Camera access restricted</option>';
      }
    }
  }

  async startScanner(deviceId = null) {
    if (this.isScanning) return;

    if (typeof Html5Qrcode === 'undefined') {
      alert('Html5Qrcode library is not loaded.');
      return;
    }

    if (!this.html5Qrcode) {
      this.html5Qrcode = new Html5Qrcode("reader");
    }

    await this.detectCameras();

    const cameraConfig = deviceId || (this.cameraSelect && this.cameraSelect.value ? this.cameraSelect.value : { facingMode: "environment" });

    const scanConfig = {
      fps: 10,
      qrbox: (viewWidth, viewHeight) => {
        const minEdge = Math.min(viewWidth, viewHeight);
        return {
          width: Math.floor(minEdge * 0.85),
          height: Math.floor(minEdge * 0.5)
        };
      },
      aspectRatio: 1.333333
    };

    try {
      this.updateStatus('Starting...', 'status-off');
      await this.html5Qrcode.start(
        cameraConfig,
        scanConfig,
        (decodedText, decodedResult) => this.onScanSuccess(decodedText, decodedResult),
        (errorMessage) => { /* Ignore frame decode errors */ }
      );

      this.isScanning = true;
      this.updateStatus('Scanning', 'status-active');
    } catch (err) {
      console.error('Failed to start scanner:', err);
      this.updateStatus('Error', 'status-off');
      alert('Could not access camera. Please check camera permissions or HTTPS connection.');
    }
  }

  async stopScanner() {
    if (!this.isScanning || !this.html5Qrcode) return;

    try {
      await this.html5Qrcode.stop();
      this.isScanning = false;
      this.updateStatus('Stopped', 'status-off');
    } catch (err) {
      console.error('Failed to stop scanner:', err);
    }
  }

  onScanSuccess(decodedText, decodedResult) {
    if (this.isCoolingDown) return;

    // Cooldown lock for 1.5 seconds to prevent double triggers
    this.isCoolingDown = true;
    setTimeout(() => { this.isCoolingDown = false; }, 1500);

    // Audio & Haptic feedback
    this.playBeepSound();
    if (navigator.vibrate) navigator.vibrate(100);

    // Populate Barcode Input Field
    if (this.barcodeInput) {
      this.barcodeInput.value = decodedText;
      
      // Auto-submit or focus next field
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
      osc.frequency.setValueAtTime(880, ctx.currentTime); // 880Hz (A5)
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
      // AudioContext blocked or unavailable
    }
  }

  updateStatus(text, className) {
    if (this.statusBadge) {
      this.statusBadge.textContent = text;
      this.statusBadge.className = `status-indicator ${className}`;
    }
  }
}

// Initialize Controller on DOM load
document.addEventListener('DOMContentLoaded', () => {
  window.scannerController = new BarcodeScannerController();
});
