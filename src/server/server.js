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
import { smsAlertService } from './services/smsAlertService.js';
import plantAgeScheduler from './services/plantAgeScheduler.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Setup real-time listener
console.log('Setting up real-time SMS alert listener...');
const alertServiceInit = await smsAlertService.initialize(realtimeDb, db, true);
console.log('SMS Alert Service is active - monitoring for new sensor readings...');
const cleanupListener = alertServiceInit.cleanupListener;

// Setup alert routes
smsAlertService.setupAlertRoute(app, realtimeDb, db);

// Setup plant age scheduler
console.log('Setting up plant age update scheduler...');
plantAgeScheduler.setupDailyScheduler(db);
plantAgeScheduler.setupRoutes(app, db);
console.log('Plant Age Scheduler is active - will run daily at midnight');

// ========================
// API Endpoints
// ========================

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server is running',
    alertService: 'active',
    plantAgeScheduler: 'active',
    timestamp: new Date().toISOString()
  });
});

// Get current thresholds (if needed - you can adjust based on your THRESHOLDS export)
app.get('/api/thresholds', (req, res) => {
  // If you have a THRESHOLDS constant exported from smsAlertService
  // res.json(smsAlertService.THRESHOLDS);
  // Otherwise, just return a placeholder or fetch from database
  res.json({ 
    message: 'Thresholds are plant-specific and stored in plantsList collection',
    note: 'Each plant type and stage has its own thresholds'
  });
});

// Test endpoint to check users from Firestore
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

// Debug endpoint to check all sensors
app.get('/api/debug/sensors', async (req, res) => {
  try {
    const sensors = {};
    
    // Check all SoilSensorX
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

// Test endpoint to get latest sensor reading from Realtime Database
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
    const sensorData = data[timestamp];

    res.json({
      timestamp,
      data: sensorData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin endpoint to trigger startup messages
app.post('/api/admin/trigger-startup', async (req, res) => {
  const results = await smsAlertService.sendStartupMessages(realtimeDb, db);
  res.json({ success: true, results });
});

// Test endpoint to manually trigger an alert check for a specific sensor
app.post('/api/admin/test-alert', async (req, res) => {
  try {
    const { sensorId } = req.body;
    
    if (!sensorId) {
      return res.status(400).json({ error: 'sensorId is required' });
    }

    // Get latest reading
    const snapshot = await realtimeDb.ref(sensorId)
      .orderByKey()
      .limitToLast(1)
      .once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'No readings found for sensor' });
    }

    const data = snapshot.val();
    const timestamp = Object.keys(data)[0];
    const sensorData = data[timestamp];

    // Process alert
    const result = await smsAlertService.processSoilSensorAlert(sensorId, {
      ...sensorData,
      timestamp
    }, db);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Schedule periodic cleanup (optional)
setInterval(async () => {
  await smsAlertService.cleanupOldAlerts(db, 30); // Clean alerts older than 30 days
  await smsAlertService.cleanupOldStartupNotifications(db, 7); // Clean startup notifications older than 7 days
  console.log('Periodic cleanup completed at:', new Date().toISOString());
}, 24 * 60 * 60 * 1000); // Run every 24 hours

// ========================
// Serve Frontend (MUST come AFTER API routes)
// ========================

// Serve the static files from the React build folder (Vite dist)
// The dist folder should be at the project root after build
const distPath = path.join(__dirname, '..', '..', 'dist');
app.use(express.static(distPath));

// For all other routes not starting with /api, serve index.html (this handles React Router)
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'));
  } else {
    next();
  }
});

// ========================
// Graceful Shutdown
// ========================
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  
  // Cleanup realtime listener
  if (cleanupListener) {
    cleanupListener();
  }
  
  // Stop plant age scheduler
  if (plantAgeScheduler && plantAgeScheduler.stopScheduler) {
    plantAgeScheduler.stopScheduler();
  }
  
  console.log('Listeners and schedulers stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  
  if (cleanupListener) {
    cleanupListener();
  }
  
  if (plantAgeScheduler && plantAgeScheduler.stopScheduler) {
    plantAgeScheduler.stopScheduler();
  }
  
  console.log('Listeners and schedulers stopped');
  process.exit(0);
});

// ========================
// Start Server
// ========================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Services active:');
  console.log('  ✓ SMS Alert Service (real-time monitoring)');
  console.log('  ✓ Plant Age Scheduler (daily at midnight)');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});