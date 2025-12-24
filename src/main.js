const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./database');

let mainWindow;

// Get the user data directory for storing config
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function getImagesDir() {
  return path.join(app.getPath('userData'), 'images');
}

// Ensure images directory exists
function ensureImagesDir() {
  const dir = getImagesDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Load config from disk
function loadConfig() {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading config:', err);
  }
  return null;
}

// Save config to disk
function saveConfig(config) {
  try {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (err) {
    console.error('Error saving config:', err);
    return false;
  }
}

// Save image and return the file path
function saveImage(dataUrl, filename) {
  try {
    const imagesDir = ensureImagesDir();
    const ext = dataUrl.match(/data:image\/(\w+);/)?.[1] || 'png';
    const safeFilename = `${filename.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.${ext}`;
    const filePath = path.join(imagesDir, safeFilename);

    // Extract base64 data and save
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(filePath, base64Data, 'base64');

    return filePath;
  } catch (err) {
    console.error('Error saving image:', err);
    return null;
  }
}

// Load image as data URL
function loadImage(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath).slice(1);
      const mimeType = ext === 'jpg' ? 'jpeg' : ext;
      return `data:image/${mimeType};base64,${data.toString('base64')}`;
    }
  } catch (err) {
    console.error('Error loading image:', err);
  }
  return null;
}

// Delete image file
function deleteImage(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (err) {
    console.error('Error deleting image:', err);
  }
  return false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  // Initialize database
  db.initDatabase(app.getPath('userData'));

  // Check Mic Permissions
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media'){
      callback(true);
    } else {
      callback(false);
    }
  });

  // ============ Class CRUD IPC Handlers ============
  ipcMain.handle('class-create', (event, name) => {
    return db.createClass(name);
  });

  ipcMain.handle('class-get-all', () => {
    return db.getAllClasses();
  });

  ipcMain.handle('class-get', (event, id) => {
    return db.getClass(id);
  });

  ipcMain.handle('class-update', (event, id, name) => {
    return db.updateClass(id, name);
  });

  ipcMain.handle('class-delete', (event, id) => {
    return db.deleteClass(id);
  });

  // ============ Noise Sample IPC Handlers ============
  ipcMain.handle('sample-insert', (event, classId, level, peakLevel) => {
    return db.insertSample(classId, level, peakLevel);
  });

  ipcMain.handle('sample-insert-batch', (event, classId, samples) => {
    return db.insertSamplesBatch(classId, samples);
  });

  ipcMain.handle('sample-get', (event, classId, startTime, endTime) => {
    return db.getSamples(classId, startTime, endTime);
  });

  ipcMain.handle('sample-stats', (event, classId, startTime, endTime) => {
    return db.getClassStats(classId, startTime, endTime);
  });

  ipcMain.handle('sample-hourly', (event, classId, startTime, endTime) => {
    return db.getHourlyAverages(classId, startTime, endTime);
  });

  ipcMain.handle('sample-daily', (event, classId, startTime, endTime) => {
    return db.getDailyAverages(classId, startTime, endTime);
  });

  ipcMain.handle('sample-count', (event, classId) => {
    return db.getSampleCount(classId);
  });

  // IPC Handlers for config persistence
  ipcMain.handle('load-config', () => {
    const config = loadConfig();
    if (config && config.levels) {
      // Load images as data URLs
      config.levels = config.levels.map(level => ({
        ...level,
        image: level.imagePath ? loadImage(level.imagePath) : null
      }));
    }
    return config;
  });

  ipcMain.handle('save-config', (event, config) => {
    // Process levels to save images to disk
    if (config.levels) {
      config.levels = config.levels.map(level => {
        const result = { ...level };

        // If there's a new data URL image, save it
        if (level.image && level.image.startsWith('data:')) {
          // Delete old image if exists
          if (level.imagePath) {
            deleteImage(level.imagePath);
          }
          result.imagePath = saveImage(level.image, `level_${level.threshold}`);
        } else if (!level.image && level.imagePath) {
          // Image was removed
          deleteImage(level.imagePath);
          result.imagePath = null;
        }

        // Don't store data URL in config file
        delete result.image;
        return result;
      });
    }
    return saveConfig(config);
  });

  ipcMain.handle('save-image', (event, dataUrl, filename) => {
    return saveImage(dataUrl, filename);
  });

  ipcMain.handle('delete-image', (event, filePath) => {
    return deleteImage(filePath);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  db.closeDatabase();
});
