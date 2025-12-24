const Database = require('better-sqlite3');
const path = require('path');

let db = null;

function initDatabase(userDataPath) {
  const dbPath = path.join(userDataPath, 'chattycathy.db');
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS noise_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      level REAL NOT NULL,
      peak_level REAL,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_samples_class_time
      ON noise_samples(class_id, timestamp);

    CREATE INDEX IF NOT EXISTS idx_samples_timestamp
      ON noise_samples(timestamp);
  `);

  console.log('Database initialized at:', dbPath);
  return db;
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

// ============ Class CRUD Operations ============

function createClass(name) {
  const stmt = db.prepare('INSERT INTO classes (name) VALUES (?)');
  const result = stmt.run(name);
  return { id: result.lastInsertRowid, name };
}

function getAllClasses() {
  const stmt = db.prepare('SELECT * FROM classes ORDER BY name');
  return stmt.all();
}

function getClass(id) {
  const stmt = db.prepare('SELECT * FROM classes WHERE id = ?');
  return stmt.get(id);
}

function updateClass(id, name) {
  const stmt = db.prepare(`
    UPDATE classes
    SET name = ?, updated_at = strftime('%s', 'now')
    WHERE id = ?
  `);
  stmt.run(name, id);
  return { id, name };
}

function deleteClass(id) {
  const stmt = db.prepare('DELETE FROM classes WHERE id = ?');
  stmt.run(id);
  return true;
}

// ============ Noise Sample Operations ============

// Insert a single sample
function insertSample(classId, level, peakLevel = null) {
  const stmt = db.prepare(`
    INSERT INTO noise_samples (class_id, timestamp, level, peak_level)
    VALUES (?, strftime('%s', 'now'), ?, ?)
  `);
  stmt.run(classId, level, peakLevel);
}

// Batch insert samples (more efficient for high-frequency recording)
function insertSamplesBatch(classId, samples) {
  const stmt = db.prepare(`
    INSERT INTO noise_samples (class_id, timestamp, level, peak_level)
    VALUES (?, ?, ?, ?)
  `);

  const insertMany = db.transaction((samples) => {
    for (const sample of samples) {
      stmt.run(classId, sample.timestamp, sample.level, sample.peakLevel || null);
    }
  });

  insertMany(samples);
}

// Get samples for a class within a time range
function getSamples(classId, startTime, endTime) {
  const stmt = db.prepare(`
    SELECT timestamp, level, peak_level
    FROM noise_samples
    WHERE class_id = ? AND timestamp BETWEEN ? AND ?
    ORDER BY timestamp
  `);
  return stmt.all(classId, startTime, endTime);
}

// Get aggregated stats for a class
function getClassStats(classId, startTime = null, endTime = null) {
  let query = `
    SELECT
      COUNT(*) as sample_count,
      AVG(level) as avg_level,
      MAX(level) as max_level,
      MIN(level) as min_level,
      AVG(peak_level) as avg_peak
    FROM noise_samples
    WHERE class_id = ?
  `;

  const params = [classId];

  if (startTime && endTime) {
    query += ' AND timestamp BETWEEN ? AND ?';
    params.push(startTime, endTime);
  }

  const stmt = db.prepare(query);
  return stmt.get(...params);
}

// Get hourly averages for a class (useful for charts)
function getHourlyAverages(classId, startTime, endTime) {
  const stmt = db.prepare(`
    SELECT
      strftime('%Y-%m-%d %H:00', timestamp, 'unixepoch', 'localtime') as hour,
      AVG(level) as avg_level,
      MAX(level) as max_level,
      COUNT(*) as sample_count
    FROM noise_samples
    WHERE class_id = ? AND timestamp BETWEEN ? AND ?
    GROUP BY hour
    ORDER BY hour
  `);
  return stmt.all(classId, startTime, endTime);
}

// Get daily averages for a class
function getDailyAverages(classId, startTime, endTime) {
  const stmt = db.prepare(`
    SELECT
      strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime') as date,
      AVG(level) as avg_level,
      MAX(level) as max_level,
      MIN(level) as min_level,
      COUNT(*) as sample_count
    FROM noise_samples
    WHERE class_id = ? AND timestamp BETWEEN ? AND ?
    GROUP BY date
    ORDER BY date
  `);
  return stmt.all(classId, startTime, endTime);
}

// Delete old samples (for cleanup)
function deleteSamplesOlderThan(days) {
  const cutoff = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
  const stmt = db.prepare('DELETE FROM noise_samples WHERE timestamp < ?');
  const result = stmt.run(cutoff);
  return result.changes;
}

// Get total sample count for a class
function getSampleCount(classId) {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM noise_samples WHERE class_id = ?');
  return stmt.get(classId).count;
}

module.exports = {
  initDatabase,
  closeDatabase,
  // Classes
  createClass,
  getAllClasses,
  getClass,
  updateClass,
  deleteClass,
  // Samples
  insertSample,
  insertSamplesBatch,
  getSamples,
  getClassStats,
  getHourlyAverages,
  getDailyAverages,
  deleteSamplesOlderThan,
  getSampleCount
};
