// server/services/smsAlertService.js
import dotenv from 'dotenv';
import axios from 'axios';
import admin from 'firebase-admin';

dotenv.config();

// Semaphore API Configuration
const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY;
const SEMAPHORE_API_URL = 'https://api.semaphore.co/api/v4/messages';

const sentAlerts = new Set();
const lastProcessedTimestamp = new Map(); // Track last processed timestamp per sensor
const lastAlertStatus = new Map(); // Track last alert status per plant

// Cache for plant requirements to reduce Firestore reads
const plantRequirementsCache = new Map();

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
    
    return { success: true, data: response.data };
  } catch (error) {
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
      return null;
    }

    // Check cache first
    const cacheKey = `${plantType}_${plant.status}`;
    if (plantRequirementsCache.has(cacheKey)) {
      return plantRequirementsCache.get(cacheKey);
    }

    // Fetch from Firestore
    const plantListRef = db.collection('plantsList').doc(plantType.toLowerCase());
    const plantListDoc = await plantListRef.get();

    if (!plantListDoc.exists) {
      return null;
    }

    const plantListData = plantListDoc.data();
    const stages = plantListData.stages || [];
    
    // Find current stage by matching plant's status
    const currentStage = stages.find(stage => 
      stage.stage.toLowerCase() === (plant.status || '').toLowerCase()
    );

    if (!currentStage) {
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
 * Check sensor data against plant-specific thresholds
 */
export async function checkThresholdsForPlant(sensorData, plantRequirements) {
  const alerts = [];

  if (!plantRequirements || !plantRequirements.thresholds) {
    return alerts;
  }

  const thresholds = plantRequirements.thresholds;

  // Map of sensor data keys to threshold keys
  const parameterMap = {
    'nitrogen': 'nitrogen',
    'phosphorus': 'phosphorus',
    'potassium': 'potassium',
    'ph': 'ph',
    'temperature': 'temperature',
    'humidity': 'humidity',
    'moisture': 'humidity' // Map moisture to humidity if needed
  };

  for (const [sensorKey, thresholdKey] of Object.entries(parameterMap)) {
    const sensorValue = sensorData[sensorKey];
    const threshold = thresholds[thresholdKey];

    if (!threshold || sensorValue === undefined || sensorValue === null) {
      continue;
    }

    const numValue = parseFloat(sensorValue);
    
    if (isNaN(numValue) || isNaN(threshold.min) || isNaN(threshold.max)) {
      continue;
    }

    if (numValue < threshold.min) {
      alerts.push({
        parameter: sensorKey.charAt(0).toUpperCase() + sensorKey.slice(1),
        value: numValue,
        status: 'LOW',
        threshold: threshold.min,
        unit: threshold.unit,
        message: `${sensorKey.charAt(0).toUpperCase() + sensorKey.slice(1)}: ${numValue}${threshold.unit} (below ${threshold.min}${threshold.unit})`
      });
    } else if (numValue > threshold.max) {
      alerts.push({
        parameter: sensorKey.charAt(0).toUpperCase() + sensorKey.slice(1),
        value: numValue,
        status: 'HIGH',
        threshold: threshold.max,
        unit: threshold.unit,
        message: `${sensorKey.charAt(0).toUpperCase() + sensorKey.slice(1)}: ${numValue}${threshold.unit} (above ${threshold.max}${threshold.unit})`
      });
    }
  }

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
  
  message += `\nPlease check the system to see appropriate actions immediately.`;
  
  // SMS limit is typically 160 characters for single message
  // Semaphore allows longer messages but charges per segment (160 chars)
  if (message.length > 320) { // 2 SMS segments
    message = message.substring(0, 317) + '...';
  }
  
  return message;
}

/**
 * Create alert signature for comparing alerts (ignores timestamp)
 */
function createAlertSignature(alerts) {
  return alerts.map(a => `${a.parameter}-${a.status}`).sort().join('_');
}

/**
 * Get last alert info from Firestore
 */
async function getLastAlertInfo(db, plantId) {
  try {
    const lastAlertDoc = await db.collection('lastAlerts').doc(plantId).get();
    
    if (!lastAlertDoc.exists) {
      return null;
    }
    
    const data = lastAlertDoc.data();
    return {
      signature: data.signature,
      sentAt: data.sentAt?.toDate(),
      alerts: data.alerts
    };
  } catch (error) {
    console.error('Error getting last alert info:', error);
    return null;
  }
}

/**
 * Save last alert info to Firestore
 */
async function saveLastAlertInfo(db, plantId, alerts, alertData) {
  try {
    const signature = createAlertSignature(alerts);
    
    await db.collection('lastAlerts').doc(plantId).set({
      plantId,
      signature,
      alerts,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      ...alertData
    });
    
  } catch (error) {
  }
}

/**
 * Check if alert should be sent based on daily limit AND status change
 */
async function shouldSendAlert(db, plantId, currentAlerts) {
  try {
    const lastAlertInfo = await getLastAlertInfo(db, plantId);
    
    // No previous alert - send it
    if (!lastAlertInfo) {
      return { shouldSend: true, reason: 'First alert for this plant' };
    }
    
    const currentSignature = createAlertSignature(currentAlerts);
    const lastSentAt = lastAlertInfo.sentAt;
    
    // Check if it's been less than 24 hours since last alert
    const now = new Date();
    const hoursSinceLastAlert = (now - lastSentAt) / (1000 * 60 * 60);
    
    // Check if status changed
    const statusChanged = currentSignature !== lastAlertInfo.signature;
    
    if (hoursSinceLastAlert < 24) {
      // Within 24 hours - DON'T send (even if status changed)
      console.log(`   Last: ${lastAlertInfo.signature}`);
      console.log(`   Now:  ${currentSignature}`);
      if (statusChanged) {
        console.log(`   Note: Status changed but suppressed due to 24h limit`);
      }
      return { 
        shouldSend: false, 
        reason: `Alert sent ${hoursSinceLastAlert.toFixed(1)} hours ago (24h limit)` 
      };
    } else {
      // More than 24 hours - check if status changed
      if (statusChanged) {
        console.log(`[SEND] 24h passed AND status changed - will send`);
        console.log(`   Last: ${lastAlertInfo.signature}`);
        console.log(`   Now:  ${currentSignature}`);
        console.log(`   Time: ${hoursSinceLastAlert.toFixed(1)}h ago`);
        return { 
          shouldSend: true, 
          reason: `24h passed and alert status changed` 
        };
      } else {
        console.log(`[SKIP] 24h passed but status unchanged (${hoursSinceLastAlert.toFixed(1)}h ago)`);
        console.log(`   Status: ${currentSignature}`);
        return { 
          shouldSend: false, 
          reason: `Alert status unchanged from ${hoursSinceLastAlert.toFixed(1)} hours ago` 
        };
      }
    }
    
  } catch (error) {
    console.error('Error checking alert status:', error);
    // On error, allow sending (fail-safe approach)
    return { shouldSend: true, reason: 'Error checking history, sending to be safe' };
  }
}

/**
 * Get latest sensor reading from Realtime Database
 */
async function getLatestSensorReading(realtimeDb, sensorId) {
  try {
    const snapshot = await realtimeDb.ref(sensorId)
      .orderByKey()
      .limitToLast(1)
      .once('value');

    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.val();
    const latestTimestamp = Object.keys(data)[0];
    const latestReading = data[latestTimestamp];
    
    return {
      timestamp: latestTimestamp,
      data: latestReading
    };
  } catch (error) {
    console.error(`Error getting latest reading for ${sensorId}:`, error);
    return null;
  }
}

/**
 * Main function to process soil sensor alerts
 */
export async function processSoilSensorAlert(sensorId, sensorData, db) {
  try {
    console.log('\n=== Processing Soil Sensor Alert ===');
    console.log('Sensor ID:', sensorId);
    console.log('Sensor Data:', JSON.stringify(sensorData, null, 2));

    // Step 1: Find plant associated with this sensor
    const plant = await getPlantBySensor(db, sensorId);
    
    if (!plant) {
      console.log(`No plant found for sensor ${sensorId} - skipping alert`);
      return { success: false, message: 'No plant associated with sensor' };
    }

    console.log(`Plant found: ${plant.plantName || plant.plantType} (Plot ${plant.plotNumber})`);
    console.log(`Current stage: ${plant.status}`);

    // Step 2: Get current stage requirements from plantsList
    const plantRequirements = await getCurrentStageRequirements(db, plant);
    
    if (!plantRequirements) {
      console.log('Could not fetch plant requirements - skipping alert');
      return { success: false, message: 'Plant requirements not found' };
    }

    console.log('Requirements loaded for stage:', plantRequirements.currentStage);

    // Step 3: Check thresholds
    const alerts = await checkThresholdsForPlant(sensorData, plantRequirements);
    
    if (alerts.length === 0) {
      console.log('[OK] All readings within normal range - no alerts needed');
      return { success: true, message: 'No alerts needed' };
    }

    console.log(`[WARNING] ${alerts.length} threshold violation(s) detected:`);
    alerts.forEach(alert => console.log(`   - ${alert.message}`));

    // Step 4: Check if we should send this alert (daily limit + status change check)
    const alertCheck = await shouldSendAlert(db, plant.id, alerts);
    
    if (!alertCheck.shouldSend) {
      console.log(`[SKIP] ${alertCheck.reason}`);
      return { success: true, message: alertCheck.reason, skipped: true };
    }

    console.log(`[PROCEED] ${alertCheck.reason}`);

    // Step 5: Generate alert message
    const message = generateAlertMessage(plant, plantRequirements, alerts);
    console.log('\n[SMS] Alert Message:');
    console.log('─────────────────');
    console.log(message);
    console.log('─────────────────\n');

    // Step 6: Get recipients
    const recipients = await fetchAlertRecipients(db);
    
    if (recipients.length === 0) {
      console.log('[ERROR] No recipients found - cannot send alerts');
      return { success: false, message: 'No recipients found' };
    }

    console.log(`[SENDING] SMS to ${recipients.length} recipient(s)...`);

    // Step 7: Send SMS alerts
    const sendPromises = recipients.map(user => 
      sendSMS(user.mobile, message)
    );

    const results = await Promise.all(sendPromises);
    
    // Step 8: Save this alert as the last alert
    await saveLastAlertInfo(db, plant.id, alerts, {
      plantName: plantRequirements.plantName,
      plotNumber: plantRequirements.plotNumber,
      currentStage: plantRequirements.currentStage,
      sensorId,
      timestamp: sensorData.timestamp || new Date().toISOString(),
      recipients: recipients.map(r => ({ name: r.name, mobile: r.mobile })),
      sensorData
    });

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    
    console.log('\n[SUMMARY] SMS Alert Summary:');
    console.log(`   [SUCCESS] Sent: ${successCount}/${recipients.length}`);
    if (failCount > 0) {
      console.log(`   [FAILED] Failed: ${failCount}`);
    }
    console.log('═══════════════════════════════\n');

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
    console.error('[ERROR] Error processing soil sensor alert:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Setup API routes for sensor readings and alerts
 */
export function setupAlertRoute(app, realtimeDb, firestoreDb) {
  // POST endpoint for sensor readings - SAVES TO YOUR STRUCTURE
  app.post('/api/soil-sensor/reading', async (req, res) => {
    try {
      const { sensorId, ...sensorData } = req.body;
      
      if (!sensorId) {
        return res.status(400).json({ error: 'sensorId is required' });
      }

      // Save in YOUR existing structure: SoilSensor1/timestamp/data
      const timestamp = new Date().toISOString()
        .replace(/[:]/g, '_')
        .replace(/\..+/, '');
      
      await realtimeDb.ref(`${sensorId}/${timestamp}`).set(sensorData);
      
      console.log(`Sensor reading saved to ${sensorId}/${timestamp}`);
      
      // Process alerts
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
      console.error('Error in sensor reading endpoint:', error);
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

      // Get latest reading
      const latestReading = await getLatestSensorReading(realtimeDb, sensorId);

      if (!latestReading) {
        return res.json({ success: false, message: 'No sensor readings found' });
      }
      
      const alertResult = await processSoilSensorAlert(sensorId, {
        ...latestReading.data,
        timestamp: latestReading.timestamp
      }, firestoreDb);
      
      res.json(alertResult);
    } catch (error) {
      console.error('Error checking alerts:', error);
      res.status(500).json({ error: error.message });
    }
  });

  console.log('[OK] Alert routes registered');
}

/**
 * Setup real-time listener for sensor changes - ONLY CHECKS LATEST READING
 */
export function setupRealtimeAlertListener(realtimeDb, firestoreDb) {
  console.log('[LISTENER] Setting up Realtime Database listener for soil sensors...');
  
  // List of sensors to monitor
  const sensorNames = ['SoilSensor1', 'SoilSensor2', 'SoilSensor3', 'SoilSensor4', 'SoilSensor5'];
  
  sensorNames.forEach(sensorName => {
    const sensorRef = realtimeDb.ref(sensorName);
    
    // Only listen for new readings (child_added)
    sensorRef.on('child_added', async (snapshot) => {
      const timestamp = snapshot.key;
      const sensorData = snapshot.val();
      
      // Check if this is actually the latest reading
      const latestSnapshot = await realtimeDb.ref(sensorName)
        .orderByKey()
        .limitToLast(1)
        .once('value');
      
      const latestData = latestSnapshot.val();
      const latestTimestamp = Object.keys(latestData)[0];
      
      // Only process if this is the latest reading
      if (timestamp !== latestTimestamp) {
        console.log(`[SKIP] ${sensorName}/${timestamp} - Not the latest reading`);
        return;
      }
      
      // Check if we already processed this timestamp
      if (lastProcessedTimestamp.get(sensorName) === timestamp) {
        console.log(`[SKIP] ${sensorName}/${timestamp} - Already processed`);
        return;
      }
      
      console.log(`\n[NEW LATEST] ${sensorName} at ${timestamp}:`);
      console.log('Data:', sensorData);
      
      // Update last processed timestamp
      lastProcessedTimestamp.set(sensorName, timestamp);
      
      // Process alert
      await processSoilSensorAlert(sensorName, {
        ...sensorData,
        timestamp: timestamp,
        sensorId: sensorName
      }, firestoreDb);
    });
  });
  
  console.log(`[OK] Real-time listener active - monitoring LATEST readings only: ${sensorNames.join(', ')}`);
  console.log('   Alerts: Once per day OR when status changes\n');
  
  return () => {
    sensorNames.forEach(sensorName => {
      realtimeDb.ref(sensorName).off('child_added');
    });
    lastProcessedTimestamp.clear();
    console.log('Real-time listener stopped');
  };
}

/**
 * Cleanup old alerts (run periodically)
 */
export async function cleanupOldAlerts(db, daysToKeep = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const snapshot = await db.collection('lastAlerts')
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
    console.log(`[OK] Cleaned up ${snapshot.size} old alert records`);
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

  async cleanupOldAlerts(firestoreDb, daysToKeep = 30) {
    return cleanupOldAlerts(firestoreDb, daysToKeep);
  }
}

export const smsAlertService = new SMSAlertService();
export default smsAlertService;