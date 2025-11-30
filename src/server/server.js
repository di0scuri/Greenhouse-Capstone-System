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

// Setup real-time listener
console.log('Setting up real-time SMS alert listener...');
const unsubscribe = alertService.setupRealtimeAlertListener(realtimeDb, db);
console.log('SMS Alert Service is active - monitoring for new sensor readings...');

// Setup alert routes
alertService.setupAlertRoute(app, realtimeDb, db);

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

// Get current thresholds
app.get('/api/thresholds', (req, res) => {
  res.json(alertService.THRESHOLDS);
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
  unsubscribe();
  plantAgeScheduler.stopScheduler();
  console.log('Listeners and schedulers stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  unsubscribe();
  plantAgeScheduler.stopScheduler();
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
});