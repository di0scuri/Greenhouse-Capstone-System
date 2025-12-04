// server/services/smsAlertService.js
import dotenv from 'dotenv';
import axios from 'axios';
import admin from 'firebase-admin';

dotenv.config();

// Semaphore API Configuration
const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY;
const SEMAPHORE_API_URL = 'https://api.semaphore.co/api/v4/messages';

const sentAlerts = new Set();
let lastCheckedTimestamp = null;

// Cache for plant requirements to reduce Firestore reads
const plantRequirementsCache = new Map();

// Track last processed timestamps for each sensor
const lastProcessedTimestamps = new Map();

/**
 * Send SMS using Semaphore API
 */
export async function sendSMS(phoneNumber, message) {
  try {
    const response = await axios.post(SEMAPHORE_API_URL, {
      apikey: SEMAPHORE_API_KEY,
      number: phoneNumber,
      message: message,
      sendername: "MaligatIFSy"
    });
    
    console.log(`SMS sent to ${phoneNumber}:`, response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`Error sending SMS to ${phoneNumber}:`, error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

/**
 * Fetch alert recipients (Admin and Farmer roles with mobile numbers)
 */
async function fetchAlertRecipients(db) {
  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef
      .where('role', 'in', ['Admin', 'Farmer'])
      .get();

    if (snapshot.empty) {
      console.log('No matching users found');
      return [];
    }

    const users = [];
    snapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.mobile) {
        users.push({
          id: doc.id,
          name: userData.displayName || userData.name || userData.email || 'Unknown',
          role: userData.role,
          mobile: userData.mobile
        });
      }
    });

    console.log(`Found ${users.length} recipients:`, users.map(u => `${u.name} (${u.role})`).join(', '));
    return users;
  } catch (error) {
    console.error('Error fetching users from Firebase:', error);
    return [];
  }
}

/**
 * Get plant by sensor ID from plants collection
 */
async function getPlantBySensor(db, sensorId) {
  try {
    const plantsRef = db.collection('plants');
    const snapshot = await plantsRef
      .where('soilSensor', '==', sensorId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log(`No plant found with sensor ID: ${sensorId}`);
      return null;
    }

    const plantDoc = snapshot.docs[0];
    const plantData = plantDoc.data();
    
    return {
      id: plantDoc.id,
      ...plantData
    };
  } catch (error) {
    console.error('Error fetching plant by sensor:', error);
    return null;
  }
}

/**
 * Get current stage requirements from plantsList collection
 */
async function getCurrentStageRequirements(db, plant) {
  try {
    const plantType = plant.plantType || plant.type;
    
    if (!plantType) {
      console.log('Plant type not specified');
      return null;
    }

    // Check cache first
    const cacheKey = `${plantType}_${plant.status}`;
    if (plantRequirementsCache.has(cacheKey)) {
      console.log(`Using cached requirements for ${plantType} - ${plant.status}`);
      return plantRequirementsCache.get(cacheKey);
    }

    // Fetch from Firestore
    const plantListRef = db.collection('plantsList').doc(plantType.toLowerCase());
    const plantListDoc = await plantListRef.get();

    if (!plantListDoc.exists) {
      console.log(`Plant type "${plantType}" not found in plantsList`);
      return null;
    }

    const plantListData = plantListDoc.data();
    const stages = plantListData.stages || [];
    
    // Find current stage by matching plant's status
    const currentStage = stages.find(stage => 
      stage.stage.toLowerCase() === (plant.status || '').toLowerCase()
    );

    if (!currentStage) {
      console.log(`Stage "${plant.status}" not found for ${plantType}`);
      return null;
    }

    // Structure thresholds from stage requirements
    const requirements = {
      plantName: plantListData.name || plantType,
      scientificName: plantListData.sName || '',
      currentStage: currentStage.stage,
      plotNumber: plant.plotNumber || 'Unknown',
      thresholds: {
        nitrogen: { 
          min: parseFloat(currentStage.lowN), 
          max: parseFloat(currentStage.highN),
          unit: 'ppm'
        },
        phosphorus: { 
          min: parseFloat(currentStage.lowP), 
          max: parseFloat(currentStage.highP),
          unit: 'ppm'
        },
        potassium: { 
          min: parseFloat(currentStage.lowK), 
          max: parseFloat(currentStage.highK),
          unit: 'ppm'
        },
        ph: { 
          min: parseFloat(currentStage.lowpH), 
          max: parseFloat(currentStage.highpH),
          unit: ''
        },
        temperature: { 
          min: parseFloat(currentStage.lowTemp), 
          max: parseFloat(currentStage.highTemp),
          unit: '°C'
        },
        humidity: { 
          min: parseFloat(currentStage.lowHum), 
          max: parseFloat(currentStage.highHum),
          unit: '%'
        }
      }
    };

    // Cache the requirements (cache for 5 minutes)
    plantRequirementsCache.set(cacheKey, requirements);
    setTimeout(() => plantRequirementsCache.delete(cacheKey), 5 * 60 * 1000);

    return requirements;
  } catch (error) {
    console.error('Error fetching stage requirements:', error);
    return null;
  }
}

/**
 * Normalize sensor data keys to lowercase for consistent matching
 */
function normalizeSensorData(sensorData) {
  const normalized = {};
  
  for (const [key, value] of Object.entries(sensorData)) {
    const lowerKey = key.toLowerCase();
    normalized[lowerKey] = value;
  }
  
  console.log('[NORMALIZE] Original keys:', Object.keys(sensorData).join(', '));
  console.log('[NORMALIZE] Normalized keys:', Object.keys(normalized).join(', '));
  
  return normalized;
}

/**
 * Check sensor data against plant-specific thresholds - FIXED VERSION
 */
export async function checkThresholdsForPlant(sensorData, plantRequirements) {
  const alerts = [];

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║         THRESHOLD CHECK - DETAILED DEBUG              ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  if (!plantRequirements || !plantRequirements.thresholds) {
    console.log('❌ No plant requirements available for threshold checking');
    return alerts;
  }

  const thresholds = plantRequirements.thresholds;

  // Normalize sensor data to lowercase keys
  const normalizedData = normalizeSensorData(sensorData);

  console.log('📊 SENSOR DATA (normalized):');
  console.log(JSON.stringify(normalizedData, null, 2));
  console.log('\n📏 THRESHOLDS:');
  console.log(JSON.stringify(thresholds, null, 2));
  console.log('\n');

  // Define parameter checks with proper mapping
  const checks = [
    {
      name: 'Nitrogen',
      sensorKeys: ['nitrogen', 'n'],
      thresholdKey: 'nitrogen'
    },
    {
      name: 'Phosphorus',
      sensorKeys: ['phosphorus', 'p'],
      thresholdKey: 'phosphorus'
    },
    {
      name: 'Potassium',
      sensorKeys: ['potassium', 'k'],
      thresholdKey: 'potassium'
    },
    {
      name: 'pH',
      sensorKeys: ['ph'],
      thresholdKey: 'ph'
    },
    {
      name: 'Temperature',
      sensorKeys: ['temperature', 'temp'],
      thresholdKey: 'temperature'
    },
    {
      name: 'Humidity',
      sensorKeys: ['humidity', 'moisture'],
      thresholdKey: 'humidity'
    }
  ];

  console.log('🔍 CHECKING EACH PARAMETER:\n');
  console.log('─'.repeat(70));

  for (const check of checks) {
    // Find sensor value
    let sensorValue = null;
    let usedKey = null;
    
    for (const key of check.sensorKeys) {
      if (normalizedData[key] !== undefined && normalizedData[key] !== null) {
        sensorValue = normalizedData[key];
        usedKey = key;
        break;
      }
    }

    const threshold = thresholds[check.thresholdKey];

    // Header for this parameter
    console.log(`\n${check.name}:`);
    
    // Check if we have both value and threshold
    if (sensorValue === null) {
      console.log(`  ⚠️  No sensor data (tried: ${check.sensorKeys.join(', ')})`);
      continue;
    }

    if (!threshold) {
      console.log(`  ⚠️  No threshold defined`);
      continue;
    }

    const numValue = parseFloat(sensorValue);
    const minThreshold = parseFloat(threshold.min);
    const maxThreshold = parseFloat(threshold.max);
    
    if (isNaN(numValue)) {
      console.log(`  ❌ Invalid sensor value: "${sensorValue}"`);
      continue;
    }
    
    if (isNaN(minThreshold) || isNaN(maxThreshold)) {
      console.log(`  ❌ Invalid threshold: min=${threshold.min}, max=${threshold.max}`);
      continue;
    }

    // Display the check
    console.log(`  📍 Sensor: ${numValue}${threshold.unit} (from key: "${usedKey}")`);
    console.log(`  📏 Range: ${minThreshold}${threshold.unit} - ${maxThreshold}${threshold.unit}`);

    // Perform the threshold check
    if (numValue < minThreshold) {
      const alert = {
        parameter: check.name,
        value: numValue,
        status: 'LOW',
        threshold: minThreshold,
        unit: threshold.unit,
        message: `${check.name}: ${numValue}${threshold.unit} (below ${minThreshold}${threshold.unit})`
      };
      alerts.push(alert);
      const diff = ((minThreshold - numValue) / minThreshold * 100).toFixed(1);
      console.log(`  🔴 ALERT: TOO LOW by ${diff}%`);
      console.log(`     └─> ${alert.message}`);
    } else if (numValue > maxThreshold) {
      const alert = {
        parameter: check.name,
        value: numValue,
        status: 'HIGH',
        threshold: maxThreshold,
        unit: threshold.unit,
        message: `${check.name}: ${numValue}${threshold.unit} (above ${maxThreshold}${threshold.unit})`
      };
      alerts.push(alert);
      const diff = ((numValue - maxThreshold) / maxThreshold * 100).toFixed(1);
      console.log(`  🔴 ALERT: TOO HIGH by ${diff}%`);
      console.log(`     └─> ${alert.message}`);
    } else {
      console.log(`  ✅ WITHIN RANGE`);
    }
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`\n📊 SUMMARY: ${alerts.length} ALERT(S) DETECTED\n`);

  if (alerts.length > 0) {
    console.log('🚨 ALERTS TO BE SENT:');
    alerts.forEach((alert, i) => {
      console.log(`   ${i + 1}. ${alert.message}`);
    });
  } else {
    console.log('✅ All parameters within acceptable range');
  }

  console.log('\n' + '═'.repeat(70) + '\n');

  return alerts;
}

/**
 * Generate SMS alert message
 */
function generateAlertMessage(plant, plantRequirements, alerts) {
  const timestamp = new Date().toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  let message = `*** SOIL ALERT ***\n`;
  message += `Plant: ${plantRequirements.plantName}\n`;
  message += `Plot: ${plantRequirements.plotNumber}\n`;
  message += `Stage: ${plantRequirements.currentStage}\n`;
  message += `Time: ${timestamp}\n\n`;
  
  alerts.forEach((alert, index) => {
    message += `${index + 1}. ${alert.message}\n`;
  });
  
  message += `\nPlease check your farm immediately.`;
  
  // SMS limit is typically 160 characters for single message
  // Semaphore allows longer messages but charges per segment (160 chars)
  if (message.length > 320) { // 2 SMS segments
    message = message.substring(0, 317) + '...';
  }
  
  return message;
}

/**
 * Create unique alert ID
 */
function createAlertId(plantId, timestamp, alerts) {
  const alertKeys = alerts.map(a => `${a.parameter}-${a.status}`).sort().join('_');
  return `${plantId}_${timestamp}_${alertKeys}`;
}

/**
 * Check if alert was already sent
 */
async function isAlertAlreadySent(db, alertId) {
  try {
    const alertDoc = await db.collection('sentAlerts').doc(alertId).get();
    if (alertDoc.exists) {
      const alertData = alertDoc.data();
      const sentAt = alertData.sentAt?.toDate();
      
      // Only suppress if sent within last hour
      if (sentAt) {
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (sentAt > hourAgo) {
          return { shouldSkip: true, reason: 'Same alert sent within last hour' };
        }
      }
    }

    return { shouldSkip: false };
  } catch (error) {
    console.error('Error checking alert status:', error);
    return { shouldSkip: sentAlerts.has(alertId), reason: 'In-memory check' };
  }
}

/**
 * Mark alert as sent in Firestore
 */
async function markAlertAsSent(db, alertId, alertData) {
  try {
    await db.collection('sentAlerts').doc(alertId).set({
      ...alertData,
      sentAt: admin.firestore.FieldValue.serverTimestamp()
    });
    sentAlerts.add(alertId);
    console.log('Alert marked as sent:', alertId);
  } catch (error) {
    console.error('Error marking alert as sent:', error);
    sentAlerts.add(alertId);
  }
}

/**
 * Main function to process soil sensor alerts - UPDATED WITH NORMALIZATION
 */
export async function processSoilSensorAlert(sensorId, sensorData, db) {
  try {
    console.log('\n' + '═'.repeat(70));
    console.log('🌱 PROCESSING SOIL SENSOR ALERT');
    console.log('═'.repeat(70));
    console.log(`\n📍 Sensor ID: ${sensorId}`);
    console.log(`⏰ Timestamp: ${sensorData.timestamp || 'N/A'}`);
    console.log('\n📥 Raw Sensor Data:');
    console.log(JSON.stringify(sensorData, null, 2));

    // Step 1: Find plant associated with this sensor
    const plant = await getPlantBySensor(db, sensorId);
    
    if (!plant) {
      console.log(`\n❌ No plant found for sensor ${sensorId} - skipping alert`);
      return { success: false, message: 'No plant associated with sensor' };
    }

    console.log(`\n✅ Plant Found: ${plant.plantName || plant.plantType}`);
    console.log(`   📊 Plot: ${plant.plotNumber}`);
    console.log(`   🌱 Stage: ${plant.status}`);

    // Step 2: Get current stage requirements from plantsList
    const plantRequirements = await getCurrentStageRequirements(db, plant);
    
    if (!plantRequirements) {
      console.log('\n❌ Could not fetch plant requirements - skipping alert');
      return { success: false, message: 'Plant requirements not found' };
    }

    console.log(`\n📋 Requirements loaded for stage: ${plantRequirements.currentStage}`);

    // Step 3: Check thresholds (normalization happens inside checkThresholdsForPlant)
    const alerts = await checkThresholdsForPlant(sensorData, plantRequirements);
    
    if (alerts.length === 0) {
      console.log('✅ All readings within normal range - no alerts needed\n');
      return { success: true, message: 'No alerts needed' };
    }

    console.log(`\n🚨 ${alerts.length} THRESHOLD VIOLATION(S) DETECTED!`);

    // Step 4: Check if we already sent this alert recently
    const alertId = createAlertId(plant.id, sensorData.timestamp || Date.now(), alerts);
    const alertCheck = await isAlertAlreadySent(db, alertId);
    
    if (alertCheck.shouldSkip) {
      console.log(`\n⏭️  [SKIP] ${alertCheck.reason}\n`);
      return { success: true, message: alertCheck.reason, skipped: true };
    }

    // Step 5: Generate alert message
    const message = generateAlertMessage(plant, plantRequirements, alerts);
    console.log('\n📱 [SMS] Alert Message:');
    console.log('┌' + '─'.repeat(68) + '┐');
    message.split('\n').forEach(line => {
      console.log(`│ ${line.padEnd(67)}│`);
    });
    console.log('└' + '─'.repeat(68) + '┘\n');

    // Step 6: Get recipients
    const recipients = await fetchAlertRecipients(db);
    
    if (recipients.length === 0) {
      console.log('❌ [ERROR] No recipients found - cannot send alerts\n');
      return { success: false, message: 'No recipients found' };
    }

    console.log(`📤 [SENDING] SMS to ${recipients.length} recipient(s)...`);

    // Step 7: Send SMS alerts
    const sendPromises = recipients.map(user => 
      sendSMS(user.mobile, message)
    );

    const results = await Promise.all(sendPromises);
    
    // Step 8: Mark alert as sent
    await markAlertAsSent(db, alertId, {
      plantId: plant.id,
      plantName: plantRequirements.plantName,
      plotNumber: plantRequirements.plotNumber,
      currentStage: plantRequirements.currentStage,
      sensorId,
      timestamp: sensorData.timestamp || new Date().toISOString(),
      alerts,
      recipients: recipients.map(r => ({ name: r.name, mobile: r.mobile })),
      sensorData
    });

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    
    console.log('\n' + '═'.repeat(70));
    console.log('📊 [SUMMARY] SMS Alert Summary:');
    console.log(`   ✅ [SUCCESS] Sent: ${successCount}/${recipients.length}`);
    if (failCount > 0) {
      console.log(`   ❌ [FAILED] Failed: ${failCount}`);
    }
    console.log('═'.repeat(70) + '\n');

    return {
      success: true,
      plant: {
        name: plantRequirements.plantName,
        plot: plantRequirements.plotNumber,
        stage: plantRequirements.currentStage
      },
      alerts,
      sentTo: successCount,
      total: recipients.length,
      results
    };

  } catch (error) {
    console.error('❌ [ERROR] Error processing soil sensor alert:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Setup API routes for sensor readings and alerts - UPDATED
 */
export function setupAlertRoute(app, realtimeDb, firestoreDb) {
  // POST endpoint for sensor readings - SAVES TO YOUR STRUCTURE
  app.post('/api/soil-sensor/reading', async (req, res) => {
    try {
      const { sensorId, ...sensorData } = req.body;
      
      if (!sensorId) {
        return res.status(400).json({ error: 'sensorId is required' });
      }

      console.log('\n📥 API: Received sensor reading');
      console.log('Sensor ID:', sensorId);
      console.log('Data keys:', Object.keys(sensorData).join(', '));

      // Save in YOUR existing structure: SoilSensor1/timestamp/data
      const timestamp = new Date().toISOString()
        .replace(/[:]/g, '_')
        .replace(/\..+/, '');
      
      await realtimeDb.ref(`${sensorId}/${timestamp}`).set(sensorData);
      
      console.log(`✅ Sensor reading saved to ${sensorId}/${timestamp}`);
      
      // Process alerts (normalization happens inside processSoilSensorAlert)
      const alertResult = await processSoilSensorAlert(sensorId, {
        ...sensorData,
        timestamp: timestamp
      }, firestoreDb);
      
      res.json({
        success: true,
        sensorId,
        timestamp,
        alertResult
      });
    } catch (error) {
      console.error('❌ Error in sensor reading endpoint:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST endpoint to manually check alerts for a sensor
  app.post('/api/soil-sensor/check-alerts', async (req, res) => {
    try {
      const { sensorId } = req.body;

      if (!sensorId) {
        return res.status(400).json({ error: 'sensorId is required' });
      }

      console.log(`\n🔍 API: Manually checking alerts for ${sensorId}`);

      // Get latest reading from YOUR structure
      const snapshot = await realtimeDb.ref(sensorId)
        .orderByKey()
        .limitToLast(1)
        .once('value');

      if (!snapshot.exists()) {
        return res.json({ success: false, message: 'No sensor readings found' });
      }

      const data = snapshot.val();
      const latestTimestamp = Object.keys(data)[0];
      const latestReading = data[latestTimestamp];
      
      console.log('Latest reading timestamp:', latestTimestamp);
      
      const alertResult = await processSoilSensorAlert(sensorId, {
        ...latestReading,
        timestamp: latestTimestamp
      }, firestoreDb);
      
      res.json(alertResult);
    } catch (error) {
      console.error('❌ Error checking alerts:', error);
      res.status(500).json({ error: error.message });
    }
  });

  console.log('✅ [OK] Alert routes registered');
}

/**
 * Track last processed timestamps for each sensor
 */

/**
 * Setup real-time listener for sensor changes - ONLY LATEST TIMESTAMP
 */
export function setupRealtimeAlertListener(realtimeDb, firestoreDb) {
  console.log('\n📡 [LISTENER] Setting up Realtime Database listener for soil sensors...');
  console.log('   ⚡ Only processing LATEST timestamp per sensor\n');
  
  // List of sensors to monitor (based on your structure)
  const sensorNames = ['SoilSensor1', 'SoilSensor2', 'SoilSensor3', 'SoilSensor4', 'SoilSensor5'];
  
  sensorNames.forEach(sensorName => {
    // Listen ONLY to the last child (latest timestamp)
    const sensorRef = realtimeDb.ref(sensorName).orderByKey().limitToLast(1);
    
    // Listen for new readings (only triggers for the latest one)
    sensorRef.on('child_added', async (snapshot) => {
      const timestamp = snapshot.key;
      const sensorData = snapshot.val();
      
      // Check if we already processed this exact timestamp
      const lastProcessed = lastProcessedTimestamps.get(sensorName);
      if (lastProcessed === timestamp) {
        console.log(`⏭️  [SKIP] ${sensorName} at ${timestamp} - already processed`);
        return;
      }
      
      console.log(`\n📥 [NEW READING] ${sensorName} at ${timestamp}`);
      console.log('✅ [LATEST] Processing this reading');
      console.log('Data keys:', Object.keys(sensorData).join(', '));
      
      // Update last processed timestamp
      lastProcessedTimestamps.set(sensorName, timestamp);
      
      // Process with sensor ID and timestamp (normalization happens inside)
      await processSoilSensorAlert(sensorName, {
        ...sensorData,
        timestamp: timestamp,
        sensorId: sensorName
      }, firestoreDb);
    });
    
    // Listen for updates to the latest reading
    sensorRef.on('child_changed', async (snapshot) => {
      const timestamp = snapshot.key;
      const sensorData = snapshot.val();
      
      console.log(`\n🔄 [UPDATED] ${sensorName} at ${timestamp}`);
      console.log('✅ [LATEST] Processing this update');
      console.log('Data keys:', Object.keys(sensorData).join(', '));
      
      // Update last processed timestamp
      lastProcessedTimestamps.set(sensorName, timestamp);
      
      await processSoilSensorAlert(sensorName, {
        ...sensorData,
        timestamp: timestamp,
        sensorId: sensorName
      }, firestoreDb);
    });
  });
  
  console.log(`✅ [OK] Real-time listener active - monitoring: ${sensorNames.join(', ')}`);
  console.log('   🚨 Alerts will be sent ONLY for the latest readings\n');
  
  return () => {
    sensorNames.forEach(sensorName => {
      realtimeDb.ref(sensorName).orderByKey().limitToLast(1).off('child_added');
      realtimeDb.ref(sensorName).orderByKey().limitToLast(1).off('child_changed');
    });
    lastProcessedTimestamps.clear();
    console.log('🛑 Real-time listener stopped');
  };
}

/**
 * Cleanup old alerts (run periodically)
 */
export async function cleanupOldAlerts(db, daysToKeep = 7) {
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
    console.log(`✅ [OK] Cleaned up ${snapshot.size} old alerts`);
  } catch (error) {
    console.error('Error cleaning up old alerts:', error);
  }
}

/**
 * SMS Alert Service Class
 */
class SMSAlertService {
  constructor() {
    this.apiKey = SEMAPHORE_API_KEY;
    this.apiUrl = SEMAPHORE_API_URL;
  }

  async sendSMS(phoneNumber, message) {
    return sendSMS(phoneNumber, message);
  }

  async processSoilSensorAlert(sensorId, sensorData, firestoreDb) {
    return processSoilSensorAlert(sensorId, sensorData, firestoreDb);
  }

  setupAlertRoute(app, realtimeDb, firestoreDb) {
    return setupAlertRoute(app, realtimeDb, firestoreDb);
  }

  setupRealtimeAlertListener(realtimeDb, firestoreDb) {
    return setupRealtimeAlertListener(realtimeDb, firestoreDb);
  }

  async cleanupOldAlerts(firestoreDb, daysToKeep = 7) {
    return cleanupOldAlerts(firestoreDb, daysToKeep);
  }
}

export const smsAlertService = new SMSAlertService();
export default smsAlertService;