const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// specific Electron APIs without exposing the entire API
contextBridge.exposeInMainWorld('electronAPI', {
  // Config persistence
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  // Image operations
  saveImage: (dataUrl, filename) => ipcRenderer.invoke('save-image', dataUrl, filename),
  deleteImage: (filePath) => ipcRenderer.invoke('delete-image', filePath),

  // Class CRUD operations
  createClass: (name) => ipcRenderer.invoke('class-create', name),
  getAllClasses: () => ipcRenderer.invoke('class-get-all'),
  getClass: (id) => ipcRenderer.invoke('class-get', id),
  updateClass: (id, name) => ipcRenderer.invoke('class-update', id, name),
  deleteClass: (id) => ipcRenderer.invoke('class-delete', id),

  // Noise sample operations
  insertSample: (classId, level, peakLevel) => ipcRenderer.invoke('sample-insert', classId, level, peakLevel),
  insertSamplesBatch: (classId, samples) => ipcRenderer.invoke('sample-insert-batch', classId, samples),
  getSamples: (classId, startTime, endTime) => ipcRenderer.invoke('sample-get', classId, startTime, endTime),
  getSampleStats: (classId, startTime, endTime) => ipcRenderer.invoke('sample-stats', classId, startTime, endTime),
  getHourlyAverages: (classId, startTime, endTime) => ipcRenderer.invoke('sample-hourly', classId, startTime, endTime),
  getDailyAverages: (classId, startTime, endTime) => ipcRenderer.invoke('sample-daily', classId, startTime, endTime),
  getSampleCount: (classId) => ipcRenderer.invoke('sample-count', classId),
  getClassSampleInfo: (classId) => ipcRenderer.invoke('class-sample-info', classId),
  
  // Advanced statistics operations
  getAllTimeStats: (classId) => ipcRenderer.invoke('stats-all-time', classId),
  getLongestDurationAtHighest: (classId) => ipcRenderer.invoke('stats-longest-highest', classId),
  getLongestDurationAtLowest: (classId) => ipcRenderer.invoke('stats-longest-lowest', classId),
  getTimeBasedStats: (classId, startTime, endTime) => ipcRenderer.invoke('stats-time-based', classId, startTime, endTime),
  getTrendAnalysis: (classId, startTime, endTime) => ipcRenderer.invoke('stats-trend', classId, startTime, endTime),
  getVolatility: (classId, startTime, endTime) => ipcRenderer.invoke('stats-volatility', classId, startTime, endTime),
  getClassesAverages: (startTime, endTime) => ipcRenderer.invoke('classes-averages', startTime, endTime),
  getSessionBasedTimeAnalysis: (classId, startTime, endTime) => ipcRenderer.invoke('stats-session-analysis', classId, startTime, endTime),
  getMostRecentDayAverage: (classId) => ipcRenderer.invoke('stats-most-recent-day', classId)
});

console.log('Preload script loaded');
