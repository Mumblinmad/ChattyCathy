// Renderer process - runs in the browser context
console.log('Chatty Cathy renderer loaded');

class AudioMonitor {
  constructor(teacherDisplay) {
    this.teacherDisplay = teacherDisplay;
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.stream = null;
    this.dataArray = null;
    this.isMonitoring = false;
    this.animationId = null;

    // Rolling average settings
    this.averageWindowMs = 5000; // 5 seconds
    this.volumeHistory = [];
    this.lastDisplayUpdate = 0;
    this.displayUpdateInterval = 100; // Update display every 100ms

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
      this.analyser.fftSize = 2048; // Larger for better RMS accuracy

      // Reset volume history
      this.volumeHistory = [];

      this.microphone = this.audioContext.createMediaStreamSource(this.stream);
      this.microphone.connect(this.analyser);

      // Use time domain data for RMS calculation
      this.dataArray = new Uint8Array(this.analyser.fftSize);

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

    const now = Date.now();

    // Get time domain data for RMS calculation
    this.analyser.getByteTimeDomainData(this.dataArray);

    // Calculate RMS (Root Mean Square) - standard for audio level metering
    let sumSquares = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      // Normalize from 0-255 to -1 to 1 (128 is silence)
      const normalized = (this.dataArray[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / this.dataArray.length);

    // Scale RMS to 0-100 percentage (RMS of 0.5 = 100%)
    const currentVolume = Math.min(100, rms * 200);

    // Add to history with timestamp
    this.volumeHistory.push({ time: now, volume: currentVolume });

    // Remove samples older than the averaging window
    const cutoff = now - this.averageWindowMs;
    this.volumeHistory = this.volumeHistory.filter(sample => sample.time > cutoff);

    // Update meter fill with current instant value (responsive)
    this.meterFill.style.height = currentVolume + '%';

    // Update teacher display with peak value from last 5 seconds
    if (now - this.lastDisplayUpdate >= this.displayUpdateInterval) {
      const peakVolume = Math.max(...this.volumeHistory.map(s => s.volume));
      this.teacherDisplay.updateLevel(peakVolume);
      this.lastDisplayUpdate = now;
    }

    this.animationId = requestAnimationFrame(() => this.updateMeter());
  }
}

// Teacher Display - shows different images based on noise level
class TeacherDisplay {
  constructor() {
    this.container = document.getElementById('teacherDisplay');
    this.currentLevel = 0;

    // Define noise level thresholds and corresponding images
    // These will be configurable in settings later
    this.levels = [
      { threshold: 0, image: null, label: 'Silent' },
      { threshold: 20, image: null, label: 'Quiet' },
      { threshold: 40, image: null, label: 'Normal' },
      { threshold: 60, image: null, label: 'Loud' },
      { threshold: 80, image: null, label: 'Very Loud' }
    ];
  }

  updateLevel(volumePercent) {
    // Find the appropriate level based on volume
    let newLevel = 0;
    for (let i = this.levels.length - 1; i >= 0; i--) {
      if (volumePercent >= this.levels[i].threshold) {
        newLevel = i;
        break;
      }
    }

    // Only update if level changed
    if (newLevel !== this.currentLevel) {
      this.currentLevel = newLevel;
      this.showLevel(newLevel);
    }
  }

  showLevel(levelIndex) {
    const level = this.levels[levelIndex];

    // Hide placeholder when monitoring
    const placeholder = this.container.querySelector('.teacher-placeholder');
    if (placeholder) {
      placeholder.style.display = 'none';
    }

    // Set background image if available
    if (level.image) {
      this.container.style.backgroundImage = `url('${level.image}')`;
    } else {
      // Show level indicator when no image is set
      this.container.style.backgroundImage = 'none';
      this.showLevelIndicator(level);
    }
  }

  showLevelIndicator(level) {
    // Remove existing indicator
    let indicator = this.container.querySelector('.level-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'level-indicator';
      this.container.appendChild(indicator);
    }
    indicator.textContent = level.label;
    indicator.dataset.level = this.currentLevel;
  }

  reset() {
    this.currentLevel = 0;
    this.container.style.backgroundImage = 'none';

    const placeholder = this.container.querySelector('.teacher-placeholder');
    if (placeholder) {
      placeholder.style.display = 'block';
    }

    const indicator = this.container.querySelector('.level-indicator');
    if (indicator) {
      indicator.remove();
    }
  }
}

// Volume Meter Segments
class MeterSegments {
  constructor() {
    this.meterContainer = document.getElementById('meterContainer');
    this.meterSegments = document.getElementById('meterSegments');
    this.segmentHeight = 30; // pixels per segment

    this.createSegments();
    window.addEventListener('resize', () => this.createSegments());
  }

  createSegments() {
    const meterHeight = this.meterContainer.offsetHeight;
    const segmentCount = Math.floor(meterHeight / this.segmentHeight);

    this.meterSegments.innerHTML = '';
    for (let i = 0; i < segmentCount; i++) {
      const segment = document.createElement('div');
      segment.className = 'segment';
      this.meterSegments.appendChild(segment);
    }
  }
}

// Settings Navigation
class SettingsManager {
  constructor() {
    this.mainScreen = document.getElementById('mainScreen');
    this.settingsScreen = document.getElementById('settingsScreen');
    this.settingsBtn = document.getElementById('settingsBtn');
    this.backBtn = document.getElementById('backBtn');
    this.sidebarBtns = document.querySelectorAll('.sidebar-btn');
    this.panels = document.querySelectorAll('.settings-panel');

    this.settingsBtn.addEventListener('click', () => this.openSettings());
    this.backBtn.addEventListener('click', () => this.closeSettings());
    this.sidebarBtns.forEach(btn => {
      btn.addEventListener('click', () => this.switchPanel(btn.dataset.panel));
    });
  }

  openSettings() {
    this.mainScreen.classList.remove('active');
    this.settingsScreen.classList.add('active');
  }

  closeSettings() {
    this.settingsScreen.classList.remove('active');
    this.mainScreen.classList.add('active');
  }

  switchPanel(panelName) {
    this.sidebarBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.panel === panelName);
    });
    this.panels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `${panelName}Panel`);
    });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new MeterSegments();
  const teacherDisplay = new TeacherDisplay();
  new AudioMonitor(teacherDisplay);
  new SettingsManager();
});
