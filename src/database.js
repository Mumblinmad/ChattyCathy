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

// Get time range and sample count for a class (for calculating sampling rate)
function getClassSampleInfo(classId) {
  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as count,
      MIN(timestamp) as first_timestamp,
      MAX(timestamp) as last_timestamp
    FROM noise_samples
    WHERE class_id = ?
  `);
  return stmt.get(classId);
}

// ============ Advanced Statistics Functions ============

// Get all-time statistics for a class
function getAllTimeStats(classId) {
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as sample_count,
      AVG(level) as avg_level,
      MAX(level) as max_level,
      MIN(level) as min_level,
      MAX(peak_level) as max_peak_level
    FROM noise_samples
    WHERE class_id = ?
  `);
  return stmt.get(classId);
}

// Get longest duration at highest level
function getLongestDurationAtHighest(classId) {
  // First, get the maximum level
  const maxStmt = db.prepare(`
    SELECT MAX(level) as max_level
    FROM noise_samples
    WHERE class_id = ?
  `);
  const maxResult = maxStmt.get(classId);
  
  if (!maxResult || maxResult.max_level === null) {
    return null;
  }
  
  const maxLevel = maxResult.max_level;
  // Use a threshold of 1% to account for slight variations
  const threshold = 1.0;
  
  // Get all samples at or near the max level, ordered by timestamp
  const stmt = db.prepare(`
    SELECT timestamp, level
    FROM noise_samples
    WHERE class_id = ? AND level >= ?
    ORDER BY timestamp
  `);
  const samples = stmt.all(classId, maxLevel - threshold);
  
  if (!samples || samples.length === 0) {
    return null;
  }
  
  // Find the longest consecutive period
  let longestDuration = 0;
  let longestStart = null;
  let longestEnd = null;
  let currentStart = samples[0].timestamp;
  let currentEnd = samples[0].timestamp;
  
  for (let i = 1; i < samples.length; i++) {
    // If samples are consecutive (within 2 seconds, accounting for 1-second sampling)
    if (samples[i].timestamp - samples[i - 1].timestamp <= 2) {
      currentEnd = samples[i].timestamp;
    } else {
      // Period ended, check if it's the longest
      const duration = currentEnd - currentStart;
      if (duration > longestDuration) {
        longestDuration = duration;
        longestStart = currentStart;
        longestEnd = currentEnd;
      }
      // Start new period
      currentStart = samples[i].timestamp;
      currentEnd = samples[i].timestamp;
    }
  }
  
  // Check the last period
  const duration = currentEnd - currentStart;
  if (duration > longestDuration) {
    longestDuration = duration;
    longestStart = currentStart;
    longestEnd = currentEnd;
  }
  
  if (longestStart === null) {
    return null;
  }
  
  return {
    duration: longestDuration,
    startTime: longestStart,
    endTime: longestEnd,
    level: maxLevel
  };
}

// Get longest duration at lowest level
function getLongestDurationAtLowest(classId) {
  // First, get the minimum level
  const minStmt = db.prepare(`
    SELECT MIN(level) as min_level
    FROM noise_samples
    WHERE class_id = ?
  `);
  const minResult = minStmt.get(classId);
  
  if (!minResult || minResult.min_level === null) {
    return null;
  }
  
  const minLevel = minResult.min_level;
  // Use a threshold of 1% to account for slight variations
  const threshold = 1.0;
  
  // Get all samples at or near the min level, ordered by timestamp
  const stmt = db.prepare(`
    SELECT timestamp, level
    FROM noise_samples
    WHERE class_id = ? AND level <= ?
    ORDER BY timestamp
  `);
  const samples = stmt.all(classId, minLevel + threshold);
  
  if (!samples || samples.length === 0) {
    return null;
  }
  
  // Find the longest consecutive period
  let longestDuration = 0;
  let longestStart = null;
  let longestEnd = null;
  let currentStart = samples[0].timestamp;
  let currentEnd = samples[0].timestamp;
  
  for (let i = 1; i < samples.length; i++) {
    // If samples are consecutive (within 2 seconds, accounting for 1-second sampling)
    if (samples[i].timestamp - samples[i - 1].timestamp <= 2) {
      currentEnd = samples[i].timestamp;
    } else {
      // Period ended, check if it's the longest
      const duration = currentEnd - currentStart;
      if (duration > longestDuration) {
        longestDuration = duration;
        longestStart = currentStart;
        longestEnd = currentEnd;
      }
      // Start new period
      currentStart = samples[i].timestamp;
      currentEnd = samples[i].timestamp;
    }
  }
  
  // Check the last period
  const duration = currentEnd - currentStart;
  if (duration > longestDuration) {
    longestDuration = duration;
    longestStart = currentStart;
    longestEnd = currentEnd;
  }
  
  if (longestStart === null) {
    return null;
  }
  
  return {
    duration: longestDuration,
    startTime: longestStart,
    endTime: longestEnd,
    level: minLevel
  };
}

// Get quietest and loudest hours
function getQuietestLoudestHour(classId, startTime, endTime) {
  const stmt = db.prepare(`
    SELECT
      CAST(strftime('%H', timestamp, 'unixepoch', 'localtime') AS INTEGER) as hour,
      AVG(level) as avg_level,
      COUNT(*) as sample_count
    FROM noise_samples
    WHERE class_id = ? AND timestamp BETWEEN ? AND ?
    GROUP BY hour
    ORDER BY avg_level
  `);
  const results = stmt.all(classId, startTime, endTime);
  
  if (!results || results.length === 0) {
    return { quietest: null, loudest: null };
  }
  
  return {
    quietest: results[0],
    loudest: results[results.length - 1],
    all: results
  };
}

// Get quietest and loudest days
function getQuietestLoudestDay(classId, startTime, endTime) {
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
    ORDER BY avg_level
  `);
  const results = stmt.all(classId, startTime, endTime);
  
  if (!results || results.length === 0) {
    return { quietest: null, loudest: null };
  }
  
  return {
    quietest: results[0],
    loudest: results[results.length - 1],
    all: results
  };
}

// Get quietest and loudest weeks
function getQuietestLoudestWeek(classId, startTime, endTime) {
  const stmt = db.prepare(`
    SELECT
      strftime('%Y-W%W', timestamp, 'unixepoch', 'localtime') as week,
      AVG(level) as avg_level,
      MAX(level) as max_level,
      MIN(level) as min_level,
      COUNT(*) as sample_count
    FROM noise_samples
    WHERE class_id = ? AND timestamp BETWEEN ? AND ?
    GROUP BY week
    ORDER BY avg_level
  `);
  const results = stmt.all(classId, startTime, endTime);
  
  if (!results || results.length === 0) {
    return { quietest: null, loudest: null };
  }
  
  return {
    quietest: results[0],
    loudest: results[results.length - 1],
    all: results
  };
}

// Get trend analysis (first half vs second half comparison)
function getTrendAnalysis(classId, startTime, endTime) {
  const stmt = db.prepare(`
    SELECT
      timestamp,
      level
    FROM noise_samples
    WHERE class_id = ? AND timestamp BETWEEN ? AND ?
    ORDER BY timestamp
  `);
  const samples = stmt.all(classId, startTime, endTime);
  
  if (!samples || samples.length < 2) {
    return { trend: null, change: null, firstHalfAvg: null, secondHalfAvg: null };
  }
  
  const midpoint = Math.floor(samples.length / 2);
  const firstHalf = samples.slice(0, midpoint);
  const secondHalf = samples.slice(midpoint);
  
  const firstHalfAvg = firstHalf.reduce((sum, s) => sum + s.level, 0) / firstHalf.length;
  const secondHalfAvg = secondHalf.reduce((sum, s) => sum + s.level, 0) / secondHalf.length;
  
  const change = secondHalfAvg - firstHalfAvg;
  const percentChange = (change / firstHalfAvg) * 100;
  
  return {
    trend: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable',
    change: change,
    percentChange: percentChange,
    firstHalfAvg: firstHalfAvg,
    secondHalfAvg: secondHalfAvg
  };
}

// Get volatility (standard deviation and variance)
function getVolatility(classId, startTime, endTime) {
  const stmt = db.prepare(`
    SELECT
      level
    FROM noise_samples
    WHERE class_id = ? AND timestamp BETWEEN ? AND ?
  `);
  const samples = stmt.all(classId, startTime, endTime);
  
  if (!samples || samples.length < 2) {
    return { stdDev: null, variance: null, avg: null };
  }
  
  const levels = samples.map(s => s.level);
  const avg = levels.reduce((sum, l) => sum + l, 0) / levels.length;
  
  // Calculate variance
  const variance = levels.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / levels.length;
  const stdDev = Math.sqrt(variance);
  
  return {
    stdDev: stdDev,
    variance: variance,
    avg: avg
  };
}

// Get most recent day's average volume for a class
function getMostRecentDayAverage(classId) {
  const stmt = db.prepare(`
    SELECT
      strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime') as date,
      AVG(level) as avg_level,
      MAX(level) as max_level,
      MIN(level) as min_level,
      COUNT(*) as sample_count
    FROM noise_samples
    WHERE class_id = ?
    GROUP BY date
    ORDER BY date DESC
    LIMIT 1
  `);
  return stmt.get(classId);
}

// Calculate Teacher Stress Score (0-1400) based on average volume
// This is an arbitrary but fun mapping: 0% = 0 stress, 100% = 1400 stress
function calculateTeacherStressScore(avgVolume) {
  if (avgVolume === null || avgVolume === undefined) {
    return null;
  }
  // Linear mapping: 0% -> 0, 100% -> 1400
  // Formula: stress = avgVolume * 14
  return Math.round(avgVolume * 14);
}

// Get average levels for all classes (for ranking)
function getAllClassesAverages(startTime, endTime) {
  const stmt = db.prepare(`
    SELECT
      c.id,
      c.name,
      COUNT(ns.id) as sample_count,
      AVG(ns.level) as avg_level,
      MAX(ns.level) as max_level,
      MIN(ns.level) as min_level
    FROM classes c
    LEFT JOIN noise_samples ns ON c.id = ns.class_id AND ns.timestamp BETWEEN ? AND ?
    GROUP BY c.id, c.name
    HAVING sample_count > 0
    ORDER BY avg_level ASC
  `);
  return stmt.all(startTime, endTime);
}

// Identify monitoring sessions by detecting gaps > 5 minutes
function identifyMonitoringSessions(classId, startTime, endTime) {
  const stmt = db.prepare(`
    SELECT timestamp, level
    FROM noise_samples
    WHERE class_id = ? AND timestamp BETWEEN ? AND ?
    ORDER BY timestamp
  `);
  const samples = stmt.all(classId, startTime, endTime);
  
  if (!samples || samples.length === 0) {
    return [];
  }
  
  const sessions = [];
  const GAP_THRESHOLD = 300; // 5 minutes in seconds
  const MIN_SESSION_DURATION = 600; // 10 minutes minimum
  const MAX_SESSION_DURATION = 10800; // 3 hours maximum
  
  let currentSession = {
    startTime: samples[0].timestamp,
    endTime: samples[0].timestamp,
    samples: [samples[0]]
  };
  
  for (let i = 1; i < samples.length; i++) {
    const gap = samples[i].timestamp - samples[i - 1].timestamp;
    
    if (gap > GAP_THRESHOLD) {
      // Session boundary detected
      const duration = currentSession.endTime - currentSession.startTime;
      if (duration >= MIN_SESSION_DURATION && duration <= MAX_SESSION_DURATION) {
        sessions.push({
          startTime: currentSession.startTime,
          endTime: currentSession.endTime,
          duration: duration,
          sampleCount: currentSession.samples.length,
          samples: currentSession.samples
        });
      }
      // Start new session
      currentSession = {
        startTime: samples[i].timestamp,
        endTime: samples[i].timestamp,
        samples: [samples[i]]
      };
    } else {
      // Continue current session
      currentSession.endTime = samples[i].timestamp;
      currentSession.samples.push(samples[i]);
    }
  }
  
  // Add the last session
  const duration = currentSession.endTime - currentSession.startTime;
  if (duration >= MIN_SESSION_DURATION && duration <= MAX_SESSION_DURATION) {
    sessions.push({
      startTime: currentSession.startTime,
      endTime: currentSession.endTime,
      duration: duration,
      sampleCount: currentSession.samples.length,
      samples: currentSession.samples
    });
  }
  
  return sessions;
}

// Get session-based time analysis
function getSessionBasedTimeAnalysis(classId, startTime, endTime) {
  const sessions = identifyMonitoringSessions(classId, startTime, endTime);
  
  if (!sessions || sessions.length === 0) {
    return {
      avgQuietestTime: null,
      avgLoudestTime: null,
      dayPattern: null,
      sessionCount: 0
    };
  }
  
  const quietestTimes = []; // minutes since midnight
  const loudestTimes = []; // minutes since midnight
  const dayCounts = {}; // day of week counts
  
  for (const session of sessions) {
    // Find quietest and loudest times within this session
    let quietestSample = session.samples[0];
    let loudestSample = session.samples[0];
    
    for (const sample of session.samples) {
      if (sample.level < quietestSample.level) {
        quietestSample = sample;
      }
      if (sample.level > loudestSample.level) {
        loudestSample = sample;
      }
    }
    
    // Convert to minutes since midnight
    const quietestDate = new Date(quietestSample.timestamp * 1000);
    const loudestDate = new Date(loudestSample.timestamp * 1000);
    
    const quietestMinutes = quietestDate.getHours() * 60 + quietestDate.getMinutes();
    const loudestMinutes = loudestDate.getHours() * 60 + loudestDate.getMinutes();
    
    quietestTimes.push(quietestMinutes);
    loudestTimes.push(loudestMinutes);
    
    // Track day of week (0 = Sunday, 1 = Monday, etc.)
    const dayOfWeek = quietestDate.getDay();
    dayCounts[dayOfWeek] = (dayCounts[dayOfWeek] || 0) + 1;
  }
  
  // Calculate average times
  const avgQuietestMinutes = Math.round(quietestTimes.reduce((a, b) => a + b, 0) / quietestTimes.length);
  const avgLoudestMinutes = Math.round(loudestTimes.reduce((a, b) => a + b, 0) / loudestTimes.length);
  
  // Convert back to hour:minute
  const avgQuietestHour = Math.floor(avgQuietestMinutes / 60);
  const avgQuietestMin = avgQuietestMinutes % 60;
  const avgLoudestHour = Math.floor(avgLoudestMinutes / 60);
  const avgLoudestMin = avgLoudestMinutes % 60;
  
  // Detect day pattern
  let dayPattern = null;
  if (sessions.length >= 3) {
    const totalSessions = sessions.length;
    const mondayCount = dayCounts[1] || 0;
    const wednesdayCount = dayCounts[3] || 0;
    const fridayCount = dayCounts[5] || 0;
    const tuesdayCount = dayCounts[2] || 0;
    const thursdayCount = dayCounts[4] || 0;
    
    const mwfCount = mondayCount + wednesdayCount + fridayCount;
    const tthCount = tuesdayCount + thursdayCount;
    
    if (mwfCount / totalSessions >= 0.7) {
      dayPattern = 'MWF';
    } else if (tthCount / totalSessions >= 0.7) {
      dayPattern = 'TTh';
    } else {
      // Check if all sessions are on the same day
      const maxDayCount = Math.max(...Object.values(dayCounts));
      if (maxDayCount / totalSessions >= 0.7) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dominantDay = Object.keys(dayCounts).find(d => dayCounts[d] === maxDayCount);
        dayPattern = dayNames[parseInt(dominantDay)];
      } else {
        dayPattern = 'Mixed';
      }
    }
  }
  
  return {
    avgQuietestTime: {
      hour: avgQuietestHour,
      minute: avgQuietestMin,
      minutesSinceMidnight: avgQuietestMinutes
    },
    avgLoudestTime: {
      hour: avgLoudestHour,
      minute: avgLoudestMin,
      minutesSinceMidnight: avgLoudestMinutes
    },
    dayPattern: dayPattern,
    sessionCount: sessions.length
  };
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
  getSampleCount,
  getClassSampleInfo,
  // Advanced Statistics
  getAllTimeStats,
  getLongestDurationAtHighest,
  getLongestDurationAtLowest,
  getQuietestLoudestHour,
  getQuietestLoudestDay,
  getQuietestLoudestWeek,
  getTrendAnalysis,
  getVolatility,
  getAllClassesAverages,
  identifyMonitoringSessions,
  getSessionBasedTimeAnalysis,
  getMostRecentDayAverage,
  calculateTeacherStressScore
};
