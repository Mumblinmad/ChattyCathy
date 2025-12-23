// Renderer process - runs in the browser context
console.log('Chatty Cathy renderer loaded');

class AudioMonitor {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.stream = null;
    this.dataArray = null;
    this.isMonitoring = false;
    this.animationId = null;

    this.meterFill = document.getElementById('meterFill');
    this.startBtn = document.getElementById('startBtn');
    this.micSelect = document.getElementById('micSelect');

    this.startBtn.addEventListener('click', () => this.toggleMonitoring());
    this.micSelect.addEventListener('change', () => this.onMicChange());

    this.loadMicrophones();
  }

  async loadMicrophones() {
    try {
      // Need to request permission first to get device labels
      await navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => stream.getTracks().forEach(track => track.stop()));

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');

      this.micSelect.innerHTML = '';
      audioInputs.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Microphone ${this.micSelect.length + 1}`;
        this.micSelect.appendChild(option);
      });
    } catch (err) {
      console.error('Error loading microphones:', err);
      const option = document.createElement('option');
      option.textContent = 'No microphones found';
      this.micSelect.appendChild(option);
    }
  }

  async onMicChange() {
    if (this.isMonitoring) {
      this.stopMonitoring();
      await this.startMonitoring();
    }
  }

  async startMonitoring() {
    try {
      const deviceId = this.micSelect.value;
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: deviceId ? { exact: deviceId } : undefined }
      });

      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.3;

      this.microphone = this.audioContext.createMediaStreamSource(this.stream);
      this.microphone.connect(this.analyser);

      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      this.isMonitoring = true;
      this.startBtn.textContent = 'Stop Monitoring';
      this.startBtn.classList.add('monitoring');

      this.updateMeter();
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please ensure microphone permissions are granted.');
    }
  }

  stopMonitoring() {
    this.isMonitoring = false;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.microphone) {
      this.microphone.disconnect();
      this.microphone = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.meterFill.style.height = '0%';
    this.startBtn.textContent = 'Start Monitoring';
    this.startBtn.classList.remove('monitoring');
  }

  toggleMonitoring() {
    if (this.isMonitoring) {
      this.stopMonitoring();
    } else {
      this.startMonitoring();
    }
  }

  updateMeter() {
    if (!this.isMonitoring) return;

    this.analyser.getByteFrequencyData(this.dataArray);

    // Calculate average volume level
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    const average = sum / this.dataArray.length;

    // Convert to percentage (0-100)
    const volumePercent = Math.min(100, (average / 128) * 100);

    // Update meter fill
    this.meterFill.style.height = volumePercent + '%';

    this.animationId = requestAnimationFrame(() => this.updateMeter());
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new AudioMonitor();
});
