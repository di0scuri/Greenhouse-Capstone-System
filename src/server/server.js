import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// ES modules don't have __dirname, so recreate it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { db, realtimeDb } from './config/firebase.js';
import alertService from './services/smsAlertService.js';
import plantAgeScheduler from './services/plantAgeScheduler.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ================================
// REAL-TIME SMS ALERT LISTENER (controlled by .env)
// ================================
let unsubscribe = () => {};

console.log("Checking ENABLE_SOIL_ALERTS flag...");

if (process.env.ENABLE_SOIL_ALERTS === "true") {
  console.log("🚨 ENABLED: Starting real-time SMS alert listener...");
  unsubscribe = alertService.setupRealtimeAlertListener(realtimeDb, db);
  console.log("SMS Alert Service is active — monitoring sensor readings.");
} else {
  console.log("⏸️ DISABLED: SMS alert listener will NOT run at startup.");
  console.log("Set ENABLE_SOIL_ALERTS=true in .env to enable real-time monitoring.");
}

// Setup alert routes
alertService.setupAlertRoute(app, realtimeDb, db);

// ================================
// PLANT AGE SCHEDULER
// ================================
console.log('Setting up plant age update scheduler...');
plantAgeScheduler.setupDailyScheduler(db);
plantAgeScheduler.setupRoutes(app, db);
console.log('Plant Age Scheduler is active — runs daily at midnight.');


// ================================
// API ENDPOINTS
// ================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'Server is running',
    alertService: process.env.ENABLE_SOIL_ALERTS === "true" ? 'active' : 'disabled',
    plantAgeScheduler: 'active',
    timestamp: new Date().toISOString()
  });
});

// Get current thresholds
app.get('/api/thresholds', (req, res) => {
  res.json(alertService.THRESHOLDS);
});

// Test Firestore recipients
app.get('/api/test/recipients', async (req, res) => {
  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef
      .where('role', 'in', ['Admin', 'Farmer'])
      .get();

    const users = [];
    snapshot.forEach(doc => {
      const userData = doc.data();
      users.push({
        id: doc.id,
        name: userData.name,
        role: userData.role,
        mobile: userData.mobile || 'No mobile'
      });
    });

    res.json({
      count: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug sensors
app.get('/api/debug/sensors', async (req, res) => {
  try {
    const sensors = {};

    for (let i = 1; i <= 5; i++) {
      const sensorName = `SoilSensor${i}`;
      const snapshot = await realtimeDb.ref(sensorName)
        .orderByKey()
        .limitToLast(1)
        .once('value');

      if (snapshot.exists()) {
        sensors[sensorName] = snapshot.val();
      }
    }

    res.json({
      availableSensors: Object.keys(sensors),
      latestReadings: sensors
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Latest reading
app.get('/api/test/latest-reading', async (req, res) => {
  try {
    const snapshot = await realtimeDb.ref('SoilSensor')
      .orderByKey()
      .limitToLast(1)
      .once('value');

    if (!snapshot.exists()) {
      return res.json({ message: 'No sensor readings found' });
    }

    const data = snapshot.val();
    const timestamp = Object.keys(data)[0];

    res.json({
      timestamp,
      data: data[timestamp]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ================================
// Serve Frontend (Vite dist)
// ================================
const distPath = path.join(__dirname, '..', '..', 'dist');
app.use(express.static(distPath));

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'));
  } else {
    next();
  }
});


// ================================
// Graceful Shutdown
// ================================
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  if (unsubscribe) unsubscribe();
  plantAgeScheduler.stopScheduler();
  console.log('Listeners and schedulers stopped.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  if (unsubscribe) unsubscribe();
  plantAgeScheduler.stopScheduler();
  process.exit(0);
});


// ================================
// Start Server
// ================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);

  console.log('Services active:');
  console.log(`  • SMS Alert Service: ${process.env.ENABLE_SOIL_ALERTS === "true" ? 'enabled' : 'disabled'}`);
  console.log('  • Plant Age Scheduler: enabled');
});
