import 'dotenv/config';
import axios from 'axios';
import admin from 'firebase-admin';

// Semaphore API Configuration
const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY;
const SEMAPHORE_API_URL = 'https://api.semaphore.co/api/v4/messages';

// Dummy Thresholds (adjust based on your plant needs)
export const THRESHOLDS = {
  conductivity: { min: 20, max: 50 },
  moisture: { min: 10, max: 25 },
  nitrogen: { min: 10, max: 25 },
  phosphorus: { min: 10, max: 25 },
  potassium: { min: 1000, max: 2000 },
  temperature: { min: 20, max: 35 },
  ph: { min: 5.5, max: 7.5 }
};

const sentAlerts = new Set();

export async function sendSMS(phoneNumber, message) {
  try {
    const response = await axios.post(SEMAPHORE_API_URL, {
      apikey: SEMAPHORE_API_KEY,
      number: phoneNumber,
      message: message,
      sendername: 'FARM-ALERT'
    });
    
    console.log(`✅ SMS sent to ${phoneNumber}:`, response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`❌ Error sending SMS to ${phoneNumber}:`, error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

async function fetchAlertRecipients(db) {
  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef
      .where('role', 'in', ['Admin', 'Farmer'])
      .get();

    if (snapshot.empty) {
      console.log('⚠️  No matching users found');
      return [];
    }

    const users = [];
    snapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.mobile) {
        users.push({
          id: doc.id,
          name: userData.name,
          role: userData.role,
          mobile: userData.mobile
        });
      }
    });

    console.log(`📱 Found ${users.length} recipients:`, users.map(u => `${u.name} (${u.role})`).join(', '));
    return users;
  } catch (error) {
    console.error('❌ Error fetching users from Firebase:', error);
    return [];
  }
}

export function checkThresholds(sensorData) {
  const alerts = [];

  for (const [key, value] of Object.entries(sensorData)) {
    if (key === 'timestamp' || key === 'createdAt') continue;

    const threshold = THRESHOLDS[key.toLowerCase()];
    if (!threshold) continue;

    const numValue = parseFloat(value);
    
    if (isNaN(numValue)) continue;
    
    if (numValue < threshold.min) {
      alerts.push({
        parameter: key,
        value: numValue,
        status: 'LOW',
        threshold: threshold.min,
        message: `${key}: ${numValue} (below ${threshold.min})`
      });
    } else if (numValue > threshold.max) {
      alerts.push({
        parameter: key,
        value: numValue,
        status: 'HIGH',
        threshold: threshold.max,
        message: `${key}: ${numValue} (above ${threshold.max})`
      });
    }
  }

  return alerts;
}

/**
 * Generate alert message
 */
function generateAlertMessage(sensorData, alerts) {
  const timestamp = sensorData.timestamp || new Date().toLocaleString();
  
  let message = `🚨 SOIL SENSOR ALERT 🚨\n`;
  message += `Time: ${timestamp}\n\n`;
  
  alerts.forEach((alert, index) => {
    message += `${index + 1}. ${alert.message}\n`;
  });
  
  message += `\nPlease check your farm immediately.`;
  
  // SMS character limit is 160, truncate if needed
  if (message.length > 160) {
    message = message.substring(0, 157) + '...';
  }
  
  return message;
}

/**
 * Create unique alert ID to prevent duplicates
 */
function createAlertId(timestamp, alerts) {
  const alertKeys = alerts.map(a => `${a.parameter}-${a.status}`).sort().join('_');
  return `${timestamp}_${alertKeys}`;
}

/**
 * Check if alert was already sent (Firebase-based)
 */
async function isAlertAlreadySent(db, alertId) {
  try {
    const alertDoc = await db.collection('sentAlerts').doc(alertId).get();
    return alertDoc.exists;
  } catch (error) {
    console.error('Error checking alert status:', error);
    // Fall back to in-memory check
    return sentAlerts.has(alertId);
  }
}

/**
 * Mark alert as sent (Firebase-based)
 */
async function markAlertAsSent(db, alertId, alertData) {
  try {
    await db.collection('sentAlerts').doc(alertId).set({
      ...alertData,
      sentAt: admin.firestore.FieldValue.serverTimestamp()
    });
    sentAlerts.add(alertId);
    console.log('✅ Alert marked as sent:', alertId);
  } catch (error) {
    console.error('Error marking alert as sent:', error);
    // Fall back to in-memory
    sentAlerts.add(alertId);
  }
}

/**
 * Main function to process soil sensor data and send alerts
 */
export async function processSoilSensorAlert(sensorData, db) {
  try {
    console.log('\n📊 Processing soil sensor data...');
    console.log('Data:', JSON.stringify(sensorData, null, 2));

    // Check thresholds
    const alerts = checkThresholds(sensorData);
    
    if (alerts.length === 0) {
      console.log('✅ All readings within normal range - no alerts needed');
      return { success: true, message: 'No alerts needed' };
    }

    console.log(`⚠️  ${alerts.length} threshold violation(s) detected:`);
    alerts.forEach(alert => console.log(`   - ${alert.message}`));

    // Check for duplicate alerts
    const alertId = createAlertId(sensorData.timestamp, alerts);
    const alreadySent = await isAlertAlreadySent(db, alertId);
    
    if (alreadySent) {
      console.log('ℹ️  Alert already sent for this timestamp and conditions');
      return { success: true, message: 'Alert already sent' };
    }

    // Generate message
    const message = generateAlertMessage(sensorData, alerts);
    console.log('\n📝 Alert message:\n' + message);

    // Fetch recipients
    const recipients = await fetchAlertRecipients(db);
    
    if (recipients.length === 0) {
      console.log('❌ No recipients found - cannot send alerts');
      return { success: false, message: 'No recipients found' };
    }

    console.log(`\n📤 Sending SMS to ${recipients.length} recipient(s)...`);

    // Send SMS to all recipients
    const sendPromises = recipients.map(user => 
      sendSMS(user.mobile, message)
    );

    const results = await Promise.all(sendPromises);
    
    // Mark this alert as sent in Firebase
    await markAlertAsSent(db, alertId, {
      timestamp: sensorData.timestamp,
      alerts,
      recipients: recipients.map(r => ({ name: r.name, mobile: r.mobile })),
      sensorData
    });

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    
    console.log(`\n✅ SMS Alert Summary:`);
    console.log(`   - Successfully sent: ${successCount}/${recipients.length}`);
    if (failCount > 0) {
      console.log(`   - Failed: ${failCount}`);
    }

    return {
      success: true,
      alerts,
      sentTo: successCount,
      total: recipients.length,
      results
    };

  } catch (error) {
    console.error('❌ Error processing soil sensor alert:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Express route example for adding sensor readings
 */
export function setupAlertRoute(app, db) {
  // Endpoint to add new sensor reading and trigger alerts
  app.post('/api/soil-sensor/reading', async (req, res) => {
    try {
      const sensorData = {
        ...req.body,
        timestamp: req.body.timestamp || new Date().toISOString(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // Save to Firebase
      const docRef = await db.collection('soilSensorReadings').add(sensorData);
      console.log('💾 Sensor reading saved with ID:', docRef.id);
      
      // Process alerts
      const alertResult = await processSoilSensorAlert(sensorData, db);
      
      res.json({
        success: true,
        readingId: docRef.id,
        alertResult
      });
    } catch (error) {
      console.error('❌ Error in sensor reading endpoint:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Endpoint to manually trigger alert check for latest reading
  app.post('/api/soil-sensor/check-alerts', async (req, res) => {
    try {
      // Get the latest sensor reading
      const snapshot = await db.collection('soilSensorReadings')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (snapshot.empty) {
        return res.json({ success: false, message: 'No sensor readings found' });
      }

      const latestReading = snapshot.docs[0].data();
      const alertResult = await processSoilSensorAlert(latestReading, db);
      
      res.json(alertResult);
    } catch (error) {
      console.error('❌ Error checking alerts:', error);
      res.status(500).json({ error: error.message });
    }
  });

  console.log('✅ Alert routes registered');
}

/**
 * Setup Firebase Firestore listener for real-time alerts
 */
export function setupRealtimeAlertListener(db) {
  console.log('🔧 Setting up Firestore real-time listener...');
  
  const unsubscribe = db.collection('soilSensorReadings')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const newReading = change.doc.data();
          console.log('\n🆕 New sensor reading detected!');
          processSoilSensorAlert(newReading, db);
        }
      });
    }, error => {
      console.error('❌ Error in Firestore listener:', error);
    });

  console.log('✅ Real-time listener active - monitoring soilSensorReadings collection');
  
  return unsubscribe; // Call this to stop listening
}

/**
 * Clean up old sent alerts (optional maintenance function)
 */
export async function cleanupOldAlerts(db, daysToKeep = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const snapshot = await db.collection('sentAlerts')
      .where('sentAt', '<', cutoffDate)
      .get();

    if (snapshot.empty) {
      console.log('No old alerts to clean up');
      return;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`✅ Cleaned up ${snapshot.size} old alerts`);
  } catch (error) {
    console.error('❌ Error cleaning up old alerts:', error);
  }
}

// Create service class for consistency with OpenRouter pattern
class SMSAlertService {
  constructor() {
    this.apiKey = SEMAPHORE_API_KEY;
    this.apiUrl = SEMAPHORE_API_URL;
    this.thresholds = THRESHOLDS;
  }

  async sendSMS(phoneNumber, message) {
    return sendSMS(phoneNumber, message);
  }

  checkThresholds(sensorData) {
    return checkThresholds(sensorData);
  }

  async processSoilSensorAlert(sensorData, db) {
    return processSoilSensorAlert(sensorData, db);
  }

  setupAlertRoute(app, db) {
    return setupAlertRoute(app, db);
  }

  setupRealtimeAlertListener(db) {
    return setupRealtimeAlertListener(db);
  }

  async cleanupOldAlerts(db, daysToKeep = 30) {
    return cleanupOldAlerts(db, daysToKeep);
  }
}

// Export singleton instance
export const smsAlertService = new SMSAlertService();
export default smsAlertService;