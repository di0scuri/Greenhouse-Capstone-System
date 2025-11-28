// server/config/firebase.js
import admin from 'firebase-admin';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

// ES modules don't have __dirname, so recreate it
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load service account key from project root
const serviceAccountPath = join(__dirname, '../../serviceAccountKey.json');

try {
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  
  // Initialize Firebase Admin (only if not already initialized)
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://greenhouse-management-sy-7713b-default-rtdb.firebaseio.com"
    });
    console.log('✅ Firebase Admin initialized successfully');
    console.log('📊 Realtime Database: https://greenhouse-management-sy-7713b-default-rtdb.firebaseio.com');
    console.log('🗄️  Firestore: greenhouse-management-sy-7713b');
  } else {
    console.log('ℹ️  Firebase Admin already initialized');
  }
} catch (error) {
  console.error('❌ Error initializing Firebase Admin:', error.message);
  console.error('\n📋 Setup Instructions:');
  console.error('1. Go to: https://console.firebase.google.com/project/greenhouse-management-sy-7713b/settings/serviceaccounts/adminsdk');
  console.error('2. Click "Generate new private key"');
  console.error('3. Save the downloaded file as "serviceAccountKey.json" in your project root');
  console.error('\nProject structure should be:');
  console.error('your-project/');
  console.error('├── serviceAccountKey.json  ← Place here');
  console.error('├── server/');
  console.error('│   ├── config/');
  console.error('│   │   └── firebase.js     ← This file');
  console.error('│   └── server.js');
  console.error('└── src/');
  process.exit(1);
}

// Get Firestore instance (for user data)
const db = admin.firestore();

// Get Realtime Database instance (for sensor readings)
const realtimeDb = admin.database();

// Optional: Set Firestore settings
db.settings({
  timestampsInSnapshots: true
});

console.log('✅ Firestore connected - for user data (Admin/Farmer)');
console.log('✅ Realtime Database connected - for sensor readings (SoilSensor)');

export { 
  admin,        // Firebase Admin SDK
  db,           // Firestore (for users collection)
  realtimeDb    // Realtime Database (for SoilSensor path)
};