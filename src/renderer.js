// Renderer process - runs in the browser context
console.log('Chatty Cathy renderer loaded');

class AudioMonitor {
  constructor(teacherDisplay, classManager) {
    this.teacherDisplay = teacherDisplay;
    this.classManager = classManager;
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

    // Recording settings - batch samples for efficiency
    this.sampleBuffer = [];
    this.lastSampleTime = 0;
    this.sampleInterval = 1000; // Record to DB every 1 second
    this.batchFlushInterval = 10000; // Flush to DB every 10 seconds

    this.meterFill = document.getElementById('meterFill');
    this.startBtn = document.getElementById('startBtn');
    this.micSelect = document.getElementById('micSelect');
    this.classSelect = document.getElementById('classSelect');

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
    // Check if a class is selected
    const selectedClassId = this.classSelect.value;
    if (!selectedClassId) {
      alert('Please select a class before starting monitoring.');
      return;
    }

    try {
      const deviceId = this.micSelect.value;
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: deviceId ? { exact: deviceId } : undefined }
      });

      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048; // Larger for better RMS accuracy

      // Reset volume history and sample buffer
      this.volumeHistory = [];
      this.sampleBuffer = [];
      this.lastSampleTime = 0;

      this.microphone = this.audioContext.createMediaStreamSource(this.stream);
      this.microphone.connect(this.analyser);

      // Use time domain data for RMS calculation
      this.dataArray = new Uint8Array(this.analyser.fftSize);

      this.isMonitoring = true;
      this.startBtn.textContent = 'Stop Monitoring';
      this.startBtn.classList.add('monitoring');

      // Disable class selector while monitoring
      this.classSelect.disabled = true;

      // Start batch flush timer
      this.flushTimer = setInterval(() => this.flushSamples(), this.batchFlushInterval);

      this.updateMeter();
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please ensure microphone permissions are granted.');
    }
  }

  stopMonitoring() {
    this.isMonitoring = false;

    // Flush any remaining samples
    this.flushSamples();

    // Clear flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

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

    // Re-enable class selector
    this.classSelect.disabled = false;
  }

  async flushSamples() {
    if (this.sampleBuffer.length === 0) return;

    const classId = parseInt(this.classSelect.value);
    if (!classId) return;

    const samplesToFlush = [...this.sampleBuffer];
    this.sampleBuffer = [];

    try {
      await window.electronAPI.insertSamplesBatch(classId, samplesToFlush);
      console.log(`Flushed ${samplesToFlush.length} samples to database`);
    } catch (err) {
      console.error('Error flushing samples:', err);
      // Put samples back if flush failed
      this.sampleBuffer = [...samplesToFlush, ...this.sampleBuffer];
    }
  }

  recordSample(level, peakLevel) {
    const now = Date.now();

    // Only record at the specified interval
    if (now - this.lastSampleTime < this.sampleInterval) return;

    this.lastSampleTime = now;
    this.sampleBuffer.push({
      timestamp: Math.floor(now / 1000), // Unix timestamp in seconds
      level: level,
      peakLevel: peakLevel
    });
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

      // Record sample to database (at sampleInterval rate)
      this.recordSample(currentVolume, peakVolume);
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
      { threshold: 0, image: null, label: 'Silent', fitMode: 'cover', position: { x: 50, y: 50 } },
      { threshold: 20, image: null, label: 'Quiet', fitMode: 'cover', position: { x: 50, y: 50 } },
      { threshold: 40, image: null, label: 'Normal', fitMode: 'cover', position: { x: 50, y: 50 } },
      { threshold: 60, image: null, label: 'Loud', fitMode: 'cover', position: { x: 50, y: 50 } },
      { threshold: 80, image: null, label: 'Very Loud', fitMode: 'cover', position: { x: 50, y: 50 } }
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
      const fitMode = level.fitMode || 'cover';
      const pos = level.position || { x: 50, y: 50 };
      this.container.style.backgroundImage = `url('${level.image}')`;
      this.container.style.backgroundSize = fitMode;
      this.container.style.backgroundPosition = `${pos.x}% ${pos.y}%`;
    } else {
      // Show level indicator when no image is set
      this.container.style.backgroundImage = 'none';
      this.container.style.backgroundSize = 'cover';
      this.container.style.backgroundPosition = 'center';
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
    this.meterFill = document.getElementById('meterFill');
    this.segmentHeight = 30; // pixels per segment

    this.createSegments();
    this.updateGradientSize();
    window.addEventListener('resize', () => {
      this.createSegments();
      this.updateGradientSize();
    });
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

  updateGradientSize() {
    // Set gradient to span full container height so colors match volume level
    const containerHeight = this.meterContainer.offsetHeight;
    this.meterFill.style.backgroundSize = `100% ${containerHeight}px`;
    this.meterFill.style.backgroundPosition = 'bottom';
  }
}

// Threshold Editor - gradient-style stop editor for noise levels
class ThresholdEditor {
  constructor(teacherDisplay) {
    this.teacherDisplay = teacherDisplay;
    this.thresholdBar = document.getElementById('thresholdBar');
    this.thresholdStops = document.getElementById('thresholdStops');
    this.stopEditor = document.getElementById('stopEditor');
    this.stopPercentage = document.getElementById('stopPercentage');
    this.stopImagePreview = document.getElementById('stopImagePreview');
    this.stopImageInput = document.getElementById('stopImageInput');
    this.removeImageBtn = document.getElementById('removeImageBtn');
    this.stopLabelInput = document.getElementById('stopLabelInput');
    this.levelsList = document.getElementById('levelsList');
    this.fitCoverBtn = document.getElementById('fitCoverBtn');
    this.fitContainBtn = document.getElementById('fitContainBtn');

    // Default stops
    this.defaultStops = [
      { threshold: 0, image: null, label: 'Silent', fitMode: 'cover', position: { x: 50, y: 50 } },
      { threshold: 20, image: null, label: 'Quiet', fitMode: 'cover', position: { x: 50, y: 50 } },
      { threshold: 40, image: null, label: 'Normal', fitMode: 'cover', position: { x: 50, y: 50 } },
      { threshold: 60, image: null, label: 'Loud', fitMode: 'cover', position: { x: 50, y: 50 } },
      { threshold: 80, image: null, label: 'Very Loud', fitMode: 'cover', position: { x: 50, y: 50 } }
    ];

    this.stops = [...this.defaultStops];
    this.selectedStop = null;
    this.draggingStop = null;
    this.saveTimeout = null;

    // Image dragging state
    this.isDraggingImage = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.startPosX = 50;
    this.startPosY = 50;

    this.init();
  }

  async init() {
    // Load saved config
    await this.loadConfig();

    // Click on bar to add new stop
    this.thresholdBar.addEventListener('click', (e) => this.onBarClick(e));

    // Image upload
    this.stopImageInput.addEventListener('change', (e) => this.onImageSelect(e));
    this.removeImageBtn.addEventListener('click', () => this.removeImage());

    // Label input
    this.stopLabelInput.addEventListener('input', (e) => this.onLabelChange(e));

    // Fit mode buttons
    this.fitCoverBtn.addEventListener('click', () => this.setFitMode('cover'));
    this.fitContainBtn.addEventListener('click', () => this.setFitMode('contain'));

    // Image preview drag to reposition
    this.stopImagePreview.addEventListener('mousedown', (e) => this.onImageDragStart(e));
    document.addEventListener('mousemove', (e) => this.onImageDragMove(e));
    document.addEventListener('mouseup', () => this.onImageDragEnd());

    // Mouse move/up for dragging threshold stops
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('mouseup', () => this.onMouseUp());

    this.renderStops();
    this.renderLevelsList();
    this.syncToTeacherDisplay();
  }

  async loadConfig() {
    try {
      const config = await window.electronAPI.loadConfig();
      if (config && config.levels && config.levels.length > 0) {
        // Ensure each stop has the new fitMode and position fields
        this.stops = config.levels.map(level => ({
          threshold: level.threshold,
          image: level.image,
          label: level.label,
          fitMode: level.fitMode || 'cover',
          position: level.position || { x: 50, y: 50 }
        }));
        console.log('Loaded config with', this.stops.length, 'levels');
      }
    } catch (err) {
      console.error('Error loading config:', err);
    }
  }

  saveConfig() {
    // Debounce saves to avoid excessive writes
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(async () => {
      try {
        const config = {
          levels: this.stops.map(s => ({
            threshold: s.threshold,
            image: s.image,
            label: s.label,
            fitMode: s.fitMode || 'cover',
            position: s.position || { x: 50, y: 50 }
          }))
        };
        await window.electronAPI.saveConfig(config);
        console.log('Config saved');
      } catch (err) {
        console.error('Error saving config:', err);
      }
    }, 500);
  }

  onBarClick(e) {
    // Don't add if clicking on a stop
    if (e.target.classList.contains('threshold-stop')) return;

    const rect = this.thresholdBar.getBoundingClientRect();
    const percentage = Math.round(((e.clientX - rect.left) / rect.width) * 100);

    // Don't add if too close to existing stop
    const tooClose = this.stops.some(s => Math.abs(s.threshold - percentage) < 5);
    if (tooClose) return;

    // Add new stop
    this.stops.push({
      threshold: percentage,
      image: null,
      label: `Level ${percentage}%`,
      fitMode: 'cover',
      position: { x: 50, y: 50 }
    });

    this.stops.sort((a, b) => a.threshold - b.threshold);
    this.renderStops();
    this.renderLevelsList();
    this.syncToTeacherDisplay();
    this.saveConfig();
  }

  renderStops() {
    this.thresholdStops.innerHTML = '';

    this.stops.forEach((stop, index) => {
      const el = document.createElement('div');
      el.className = 'threshold-stop';
      if (stop.image) el.classList.add('has-image');
      if (this.selectedStop === index) el.classList.add('selected');
      el.style.left = `${stop.threshold}%`;
      el.dataset.index = index;

      // Left click to select
      el.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
          e.stopPropagation();
          this.selectStop(index);
          this.draggingStop = index;
          el.classList.add('dragging');
        }
      });

      // Right click to remove
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.removeStop(index);
      });

      this.thresholdStops.appendChild(el);
    });
  }

  selectStop(index) {
    this.selectedStop = index;
    const stop = this.stops[index];

    this.stopEditor.style.display = 'block';
    this.stopPercentage.textContent = stop.threshold;
    this.stopLabelInput.value = stop.label;

    // Update fit mode buttons
    const fitMode = stop.fitMode || 'cover';
    this.fitCoverBtn.classList.toggle('active', fitMode === 'cover');
    this.fitContainBtn.classList.toggle('active', fitMode === 'contain');

    // Update image preview
    this.updateImagePreview(stop);

    this.renderStops();
  }

  updateImagePreview(stop) {
    if (stop.image) {
      const fitMode = stop.fitMode || 'cover';
      const pos = stop.position || { x: 50, y: 50 };
      this.stopImagePreview.style.backgroundImage = `url('${stop.image}')`;
      this.stopImagePreview.style.backgroundSize = fitMode;
      this.stopImagePreview.style.backgroundPosition = `${pos.x}% ${pos.y}%`;
      this.stopImagePreview.innerHTML = '';
    } else {
      this.stopImagePreview.style.backgroundImage = 'none';
      this.stopImagePreview.style.backgroundSize = 'cover';
      this.stopImagePreview.style.backgroundPosition = 'center';
      this.stopImagePreview.innerHTML = '<span>No image</span>';
    }
  }

  removeStop(index) {
    // Keep at least one stop
    if (this.stops.length <= 1) return;

    this.stops.splice(index, 1);

    if (this.selectedStop === index) {
      this.selectedStop = null;
      this.stopEditor.style.display = 'none';
    } else if (this.selectedStop > index) {
      this.selectedStop--;
    }

    this.renderStops();
    this.renderLevelsList();
    this.syncToTeacherDisplay();
    this.saveConfig();
  }

  onMouseMove(e) {
    if (this.draggingStop === null) return;

    const rect = this.thresholdBar.getBoundingClientRect();
    let percentage = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    percentage = Math.max(0, Math.min(100, percentage));

    // Check if too close to another stop
    const tooClose = this.stops.some((s, i) =>
      i !== this.draggingStop && Math.abs(s.threshold - percentage) < 3
    );
    if (tooClose) return;

    this.stops[this.draggingStop].threshold = percentage;
    this.stops.sort((a, b) => a.threshold - b.threshold);

    // Update selected index after sort
    this.selectedStop = this.stops.findIndex(s => s.threshold === percentage);
    this.draggingStop = this.selectedStop;

    this.stopPercentage.textContent = percentage;
    this.renderStops();
  }

  onMouseUp() {
    if (this.draggingStop !== null) {
      const el = this.thresholdStops.querySelector('.dragging');
      if (el) el.classList.remove('dragging');
      this.draggingStop = null;
      this.renderLevelsList();
      this.syncToTeacherDisplay();
      this.saveConfig();
    }
  }

  onImageSelect(e) {
    if (this.selectedStop === null) return;
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const stop = this.stops[this.selectedStop];
      stop.image = event.target.result;
      stop.position = { x: 50, y: 50 }; // Reset position for new image
      this.updateImagePreview(stop);
      this.renderStops();
      this.renderLevelsList();
      this.syncToTeacherDisplay();
      this.saveConfig();
    };
    reader.readAsDataURL(file);
  }

  removeImage() {
    if (this.selectedStop === null) return;
    const stop = this.stops[this.selectedStop];
    stop.image = null;
    stop.position = { x: 50, y: 50 };
    this.updateImagePreview(stop);
    this.renderStops();
    this.renderLevelsList();
    this.syncToTeacherDisplay();
    this.saveConfig();
  }

  setFitMode(mode) {
    if (this.selectedStop === null) return;
    const stop = this.stops[this.selectedStop];
    stop.fitMode = mode;

    // Update button states
    this.fitCoverBtn.classList.toggle('active', mode === 'cover');
    this.fitContainBtn.classList.toggle('active', mode === 'contain');

    this.updateImagePreview(stop);
    this.syncToTeacherDisplay();
    this.saveConfig();
  }

  onImageDragStart(e) {
    if (this.selectedStop === null) return;
    const stop = this.stops[this.selectedStop];
    if (!stop.image) return;

    // Only drag in 'cover' mode where position matters
    if (stop.fitMode !== 'cover') return;

    e.preventDefault();
    this.isDraggingImage = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.startPosX = stop.position?.x ?? 50;
    this.startPosY = stop.position?.y ?? 50;
    this.stopImagePreview.style.cursor = 'grabbing';
  }

  onImageDragMove(e) {
    if (!this.isDraggingImage || this.selectedStop === null) return;

    const stop = this.stops[this.selectedStop];
    const previewRect = this.stopImagePreview.getBoundingClientRect();

    // Calculate movement as percentage of preview size
    const deltaX = ((e.clientX - this.dragStartX) / previewRect.width) * 100;
    const deltaY = ((e.clientY - this.dragStartY) / previewRect.height) * 100;

    // Update position (inverted because we're moving the background)
    const newX = Math.max(0, Math.min(100, this.startPosX - deltaX));
    const newY = Math.max(0, Math.min(100, this.startPosY - deltaY));

    stop.position = { x: newX, y: newY };
    this.stopImagePreview.style.backgroundPosition = `${newX}% ${newY}%`;
  }

  onImageDragEnd() {
    if (!this.isDraggingImage) return;

    this.isDraggingImage = false;
    this.stopImagePreview.style.cursor = 'move';

    if (this.selectedStop !== null) {
      this.syncToTeacherDisplay();
      this.saveConfig();
    }
  }

  onLabelChange(e) {
    if (this.selectedStop === null) return;
    this.stops[this.selectedStop].label = e.target.value;
    this.renderLevelsList();
    this.syncToTeacherDisplay();
    this.saveConfig();
  }

  renderLevelsList() {
    this.levelsList.innerHTML = '';

    this.stops.forEach((stop, index) => {
      const item = document.createElement('div');
      item.className = 'level-item';
      item.innerHTML = `
        <span class="level-item-threshold">${stop.threshold}%</span>
        <span class="level-item-label">${stop.label}</span>
        <div class="level-item-image ${stop.image ? '' : 'empty'}"
             style="${stop.image ? `background-image: url('${stop.image}')` : ''}"></div>
      `;
      item.addEventListener('click', () => this.selectStop(index));
      this.levelsList.appendChild(item);
    });
  }

  syncToTeacherDisplay() {
    this.teacherDisplay.levels = this.stops.map(s => ({
      threshold: s.threshold,
      image: s.image,
      label: s.label,
      fitMode: s.fitMode || 'cover',
      position: s.position || { x: 50, y: 50 }
    }));
  }
}

// Class Manager - CRUD operations for classes
class ClassManager {
  constructor() {
    this.classes = [];
    this.classSelect = document.getElementById('classSelect');
    this.classesList = document.getElementById('classesList');
    this.newClassNameInput = document.getElementById('newClassName');
    this.addClassBtn = document.getElementById('addClassBtn');

    this.editingClassId = null;

    this.addClassBtn.addEventListener('click', () => this.addClass());
    this.newClassNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addClass();
    });

    this.loadClasses();
  }

  async loadClasses() {
    try {
      this.classes = await window.electronAPI.getAllClasses();
      this.renderClassesList();
      this.updateClassSelect();
    } catch (err) {
      console.error('Error loading classes:', err);
    }
  }

  async addClass() {
    const name = this.newClassNameInput.value.trim();
    if (!name) return;

    try {
      const newClass = await window.electronAPI.createClass(name);
      this.classes.push(newClass);
      this.newClassNameInput.value = '';
      this.renderClassesList();
      this.updateClassSelect();
    } catch (err) {
      console.error('Error creating class:', err);
    }
  }

  async updateClass(id, name) {
    try {
      await window.electronAPI.updateClass(id, name);
      const classItem = this.classes.find(c => c.id === id);
      if (classItem) classItem.name = name;
      this.editingClassId = null;
      this.renderClassesList();
      this.updateClassSelect();
    } catch (err) {
      console.error('Error updating class:', err);
    }
  }

  async deleteClass(id) {
    if (!confirm('Are you sure you want to delete this class? All associated noise data will be lost.')) {
      return;
    }

    try {
      await window.electronAPI.deleteClass(id);
      this.classes = this.classes.filter(c => c.id !== id);
      this.renderClassesList();
      this.updateClassSelect();
    } catch (err) {
      console.error('Error deleting class:', err);
    }
  }

  startEditing(id) {
    this.editingClassId = id;
    this.renderClassesList();
  }

  cancelEditing() {
    this.editingClassId = null;
    this.renderClassesList();
  }

  updateClassSelect() {
    const currentValue = this.classSelect.value;
    this.classSelect.innerHTML = '<option value="">-- Select Class --</option>';

    this.classes.forEach(cls => {
      const option = document.createElement('option');
      option.value = cls.id;
      option.textContent = cls.name;
      this.classSelect.appendChild(option);
    });

    // Restore selection if still valid
    if (currentValue && this.classes.some(c => c.id == currentValue)) {
      this.classSelect.value = currentValue;
    }
  }

  async renderClassesList() {
    if (this.classes.length === 0) {
      this.classesList.innerHTML = `
        <div class="no-classes">
          <p>No classes yet. Add your first class above!</p>
        </div>
      `;
      return;
    }

    this.classesList.innerHTML = '';

    for (const cls of this.classes) {
      const item = document.createElement('div');
      item.className = 'class-item';

      // Get sample count for stats
      let sampleCount = 0;
      try {
        sampleCount = await window.electronAPI.getSampleCount(cls.id);
      } catch (err) {
        console.error('Error getting sample count:', err);
      }

      if (this.editingClassId === cls.id) {
        item.innerHTML = `
          <div class="class-item-name">
            <input type="text" value="${cls.name}" id="editClassInput">
          </div>
          <div class="class-item-actions">
            <button class="save-btn" title="Save">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            </button>
            <button class="cancel-btn" title="Cancel">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        `;

        const input = item.querySelector('#editClassInput');
        input.focus();
        input.select();

        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') this.updateClass(cls.id, input.value.trim());
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') this.cancelEditing();
        });

        item.querySelector('.save-btn').addEventListener('click', () => {
          this.updateClass(cls.id, input.value.trim());
        });
        item.querySelector('.cancel-btn').addEventListener('click', () => {
          this.cancelEditing();
        });
      } else {
        item.innerHTML = `
          <span class="class-item-name">${cls.name}</span>
          <span class="class-item-stats">${sampleCount} samples</span>
          <div class="class-item-actions">
            <button class="edit-btn" title="Edit">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </button>
            <button class="delete-btn" title="Delete">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </button>
          </div>
        `;

        item.querySelector('.edit-btn').addEventListener('click', () => {
          this.startEditing(cls.id);
        });
        item.querySelector('.delete-btn').addEventListener('click', () => {
          this.deleteClass(cls.id);
        });
      }

      this.classesList.appendChild(item);
    }
  }
}

// Statistics Manager - D3 chart for noise level visualization
class StatisticsManager {
  constructor(classManager) {
    this.classManager = classManager;
    this.statsClassSelect = document.getElementById('statsClassSelect');
    this.statsTimeRange = document.getElementById('statsTimeRange');
    this.statsChart = document.getElementById('statsChart');
    this.statsNoData = document.getElementById('statsNoData');
    this.statsAvg = document.getElementById('statsAvg');
    this.statsPeak = document.getElementById('statsPeak');
    this.statsSampleCount = document.getElementById('statsSampleCount');

    this.svg = null;
    this.margin = { top: 20, right: 30, bottom: 40, left: 50 };

    this.statsClassSelect.addEventListener('change', () => this.loadData());
    this.statsTimeRange.addEventListener('change', () => this.loadData());
  }

  updateClassSelect() {
    const currentValue = this.statsClassSelect.value;
    this.statsClassSelect.innerHTML = '<option value="">-- Select Class --</option>';

    this.classManager.classes.forEach(cls => {
      const option = document.createElement('option');
      option.value = cls.id;
      option.textContent = cls.name;
      this.statsClassSelect.appendChild(option);
    });

    if (currentValue && this.classManager.classes.some(c => c.id == currentValue)) {
      this.statsClassSelect.value = currentValue;
    }
  }

  getTimeRange() {
    const range = this.statsTimeRange.value;
    const now = Math.floor(Date.now() / 1000);
    let startTime;

    switch (range) {
      case 'hour':
        startTime = now - 3600;
        break;
      case 'day':
        startTime = now - 86400;
        break;
      case 'week':
        startTime = now - 604800;
        break;
      case 'month':
        startTime = now - 2592000;
        break;
      default:
        startTime = now - 86400;
    }

    return { startTime, endTime: now };
  }

  async loadData() {
    const classId = parseInt(this.statsClassSelect.value);
    if (!classId) {
      this.showNoData('Select a class to view statistics');
      return;
    }

    const { startTime, endTime } = this.getTimeRange();

    try {
      const samples = await window.electronAPI.getSamples(classId, startTime, endTime);

      if (!samples || samples.length === 0) {
        this.showNoData('No data available for this time range');
        return;
      }

      this.hideNoData();
      this.renderChart(samples);
      this.updateSummary(samples);
    } catch (err) {
      console.error('Error loading statistics:', err);
      this.showNoData('Error loading data');
    }
  }

  showNoData(message) {
    this.statsNoData.style.display = 'block';
    this.statsNoData.querySelector('p').textContent = message;
    this.statsChart.innerHTML = '';
    this.statsAvg.textContent = '--';
    this.statsPeak.textContent = '--';
    this.statsSampleCount.textContent = '--';
  }

  hideNoData() {
    this.statsNoData.style.display = 'none';
  }

  updateSummary(samples) {
    const levels = samples.map(s => s.level);
    const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
    const peak = Math.max(...levels);

    this.statsAvg.textContent = avg.toFixed(1) + '%';
    this.statsPeak.textContent = peak.toFixed(1) + '%';
    this.statsSampleCount.textContent = samples.length.toLocaleString();
  }

  renderChart(samples) {
    this.statsChart.innerHTML = '';

    const containerRect = this.statsChart.getBoundingClientRect();
    const width = containerRect.width - this.margin.left - this.margin.right;
    const height = 300 - this.margin.top - this.margin.bottom;

    // Create SVG
    const svg = d3.select(this.statsChart)
      .append('svg')
      .attr('width', width + this.margin.left + this.margin.right)
      .attr('height', height + this.margin.top + this.margin.bottom)
      .append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    // Parse data
    const data = samples.map(s => ({
      date: new Date(s.timestamp * 1000),
      level: s.level,
      peakLevel: s.peak_level || s.level
    }));

    // Create scales
    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.date))
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, 100])
      .range([height, 0]);

    // Add gradient definition
    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient')
      .attr('id', 'areaGradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#00d4ff')
      .attr('stop-opacity', 0.8);

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#00d4ff')
      .attr('stop-opacity', 0.1);

    // Add grid lines
    svg.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickSize(-height).tickFormat(''));

    svg.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).tickSize(-width).tickFormat(''));

    // Add area
    const area = d3.area()
      .x(d => x(d.date))
      .y0(height)
      .y1(d => y(d.level))
      .curve(d3.curveMonotoneX);

    svg.append('path')
      .datum(data)
      .attr('class', 'area')
      .attr('d', area);

    // Add line
    const line = d3.line()
      .x(d => x(d.date))
      .y(d => y(d.level))
      .curve(d3.curveMonotoneX);

    svg.append('path')
      .datum(data)
      .attr('class', 'line')
      .attr('d', line);

    // Add X axis
    svg.append('g')
      .attr('class', 'axis x-axis')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(6));

    // Add Y axis
    svg.append('g')
      .attr('class', 'axis y-axis')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => d + '%'));

    // Add tooltip
    const tooltip = d3.select(this.statsChart)
      .append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0)
      .style('position', 'absolute');

    // Add dots for interactivity (sparse to avoid clutter)
    const step = Math.max(1, Math.floor(data.length / 50));
    const sparseData = data.filter((_, i) => i % step === 0);

    svg.selectAll('.dot')
      .data(sparseData)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', d => x(d.date))
      .attr('cy', d => y(d.level))
      .attr('r', 4)
      .style('opacity', 0)
      .on('mouseover', function(event, d) {
        d3.select(this).style('opacity', 1).attr('r', 6);
        tooltip
          .style('opacity', 1)
          .html(`
            <strong>${d.date.toLocaleTimeString()}</strong><br/>
            Level: ${d.level.toFixed(1)}%<br/>
            Peak: ${d.peakLevel.toFixed(1)}%
          `)
          .style('left', (event.offsetX + 10) + 'px')
          .style('top', (event.offsetY - 10) + 'px');
      })
      .on('mouseout', function() {
        d3.select(this).style('opacity', 0).attr('r', 4);
        tooltip.style('opacity', 0);
      });
  }
}

// Settings Navigation
class SettingsManager {
  constructor(classManager, statisticsManager) {
    this.classManager = classManager;
    this.statisticsManager = statisticsManager;
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
    // Refresh classes list to show updated sample counts
    this.classManager.renderClassesList();
  }

  closeSettings() {
    this.settingsScreen.classList.remove('active');
    this.mainScreen.classList.add('active');
    // Refresh class selector in case classes were added/removed
    this.classManager.updateClassSelect();
  }

  switchPanel(panelName) {
    this.sidebarBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.panel === panelName);
    });
    this.panels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `${panelName}Panel`);
    });

    // Refresh classes list when switching to Classes panel (to update sample counts)
    if (panelName === 'classes') {
      this.classManager.renderClassesList();
    }

    // Refresh statistics when switching to Statistics panel
    if (panelName === 'statistics') {
      this.statisticsManager.updateClassSelect();
      this.statisticsManager.loadData();
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new MeterSegments();
  const teacherDisplay = new TeacherDisplay();
  const classManager = new ClassManager();
  const statisticsManager = new StatisticsManager(classManager);
  new AudioMonitor(teacherDisplay, classManager);
  new ThresholdEditor(teacherDisplay);
  new SettingsManager(classManager, statisticsManager);
});
