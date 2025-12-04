// server/services/smsAlertService.js
import dotenv from 'dotenv';
import axios from 'axios';
import admin from 'firebase-admin';

dotenv.config();

// Semaphore API Configuration
const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY;
const SEMAPHORE_API_URL = 'https://api.semaphore.co/api/v4/messages';

// Cache for plant requirements to reduce Firestore reads
const plantRequirementsCache = new Map();
// Track last processed timestamp per sensor to prevent re-processing on startup/reconnect
const lastProcessedTimestamp = new Map(); 

// 5-minute cache TTL (in milliseconds)
const CACHE_TTL = 5 * 60 * 1000; 

/**
 * Send SMS using Semaphore API
 * @param {string} phoneNumber 
 * @param {string} message 
 * @returns {Promise<{success: boolean, data?: object, error?: any}>}
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
    // Log detailed error response if available
    console.error('SMS Send Error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

/**
 * Fetch alert recipients (Admin and Farmer roles with mobile numbers)
 * @param {admin.firestore.Firestore} db 
 * @returns {Promise<Array<{id: string, name: string, role: string, mobile: string}>>}
 */
async function fetchAlertRecipients(db) {
  try {
    const snapshot = await db.collection('users')
      .where('role', 'in', ['Admin', 'Farmer'])
      .where('mobile', '!=', null) // Filter out users without mobile upfront
      .get();

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs.map(doc => {
      const userData = doc.data();
      return {
        id: doc.id,
        name: userData.displayName || userData.name || userData.email || 'Unknown',
        role: userData.role,
        mobile: userData.mobile
      };
    });
  } catch (error) {
    console.error('Error fetching users from Firebase:', error);
    return [];
  }
}

/**
 * Get plant by sensor ID from plants collection
 * @param {admin.firestore.Firestore} db 
 * @param {string} sensorId 
 * @returns {Promise<object | null>}
 */
async function getPlantBySensor(db, sensorId) {
  try {
    const snapshot = await db.collection('plants')
      .where('soilSensor', '==', sensorId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }
    
    const plantDoc = snapshot.docs[0];
    return { id: plantDoc.id, ...plantDoc.data() };
  } catch (error) {
    console.error('Error fetching plant by sensor:', error);
    return null;
  }
}

/**
 * Get current stage requirements from plantsList collection
 * @param {admin.firestore.Firestore} db 
 * @param {object} plant 
 * @returns {Promise<object | null>}
 */
async function getCurrentStageRequirements(db, plant) {
  try {
    const plantType = plant.plantType || plant.type;
    const plantStatus = (plant.status || '').toLowerCase();
    
    if (!plantType || !plantStatus) {
      return null;
    }

    // Check cache first
    const cacheKey = `${plantType}_${plantStatus}`;
    if (plantRequirementsCache.has(cacheKey)) {
      return plantRequirementsCache.get(cacheKey);
    }

    // Fetch from Firestore
    const plantListDoc = await db.collection('plantsList').doc(plantType.toLowerCase()).get();

    if (!plantListDoc.exists) {
      return null;
    }

    const plantListData = plantListDoc.data();
    const stages = plantListData.stages || [];
    
    // Find current stage
    const currentStage = stages.find(stage => 
      (stage.stage || '').toLowerCase() === plantStatus
    );

    if (!currentStage) {
      return null;
    }

    // Helper to structure threshold
    const getThreshold = (lowKey, highKey, unit = '') => ({
      min: parseFloat(currentStage[lowKey]), 
      max: parseFloat(currentStage[highKey]),
      unit: unit
    });

    const requirements = {
      plantName: plantListData.name || plantType,
      scientificName: plantListData.sName || '',
      currentStage: currentStage.stage,
      plotNumber: plant.plotNumber || 'Unknown',
      thresholds: {
        nitrogen: getThreshold('lowN', 'highN', 'ppm'),
        phosphorus: getThreshold('lowP', 'highP', 'ppm'),
        potassium: getThreshold('lowK', 'highK', 'ppm'),
        ph: getThreshold('lowpH', 'highpH', ''),
        temperature: getThreshold('lowTemp', 'highTemp', '°C'),
        humidity: getThreshold('lowHum', 'highHum', '%')
      }
    };

    // Cache the requirements
    plantRequirementsCache.set(cacheKey, requirements);
    setTimeout(() => plantRequirementsCache.delete(cacheKey), CACHE_TTL);

    return requirements;
  } catch (error) {
    console.error('Error fetching stage requirements:', error);
    return null;
  }
}

/**
 * Check sensor data against plant-specific thresholds
 * @param {object} sensorData 
 * @param {object} plantRequirements 
 * @returns {Array<object>}
 */
export async function checkThresholdsForPlant(sensorData, plantRequirements) {
  const alerts = [];

  if (!plantRequirements || !plantRequirements.thresholds) {
    return alerts;
  }

  const { thresholds } = plantRequirements;

  // Map of sensor data keys to threshold keys
  const parameterMap = {
    nitrogen: 'nitrogen',
    phosphorus: 'phosphorus',
    potassium: 'potassium',
    ph: 'ph',
    temperature: 'temperature',
    humidity: 'humidity',
  };
  
  // Use `Object.entries` for cleaner iteration
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
    
    const paramName = sensorKey.charAt(0).toUpperCase() + sensorKey.slice(1);
    const unit = threshold.unit;
    let status = null;

    if (numValue < threshold.min) {
      status = 'LOW';
    } else if (numValue > threshold.max) {
      status = 'HIGH';
    }

    if (status) {
      alerts.push({
        parameter: paramName,
        value: numValue,
        status: status,
        threshold: status === 'LOW' ? threshold.min : threshold.max,
        unit: unit,
        message: `${paramName}: ${numValue}${unit} (${status} ${status === 'LOW' ? 'below' : 'above'} ${status === 'LOW' ? threshold.min : threshold.max}${unit})`
      });
    }
  }

  return alerts;
}

/**
 * Generate SMS alert message
 * @param {object} plant 
 * @param {object} plantRequirements 
 * @param {Array<object>} alerts 
 * @returns {string}
 */
function generateAlertMessage(plant, plantRequirements, alerts) {
  const timestamp = new Date().toLocaleString('en-US', { 
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
  });
  
  let message = `*** SOIL ALERT ***\n`;
  message += `Plant: ${plantRequirements.plantName}\n`;
  message += `Plot: ${plantRequirements.plotNumber}\n`;
  message += `Stage: ${plantRequirements.currentStage}\n`;
  message += `Time: ${timestamp}\n\n`;
  
  alerts.forEach((alert, index) => {
    // Use the pre-formatted alert message
    message += `${index + 1}. ${alert.message}\n`;
  });
  
  message += `\nPlease check the system to see appropriate actions immediately.`;
  
  // Truncate to save SMS segments, keeping it under 320 chars (2 segments)
  if (message.length > 320) { 
    message = message.substring(0, 317) + '...';
  }
  
  return message;
}

/**
 * Generate startup status message (no alert - just current status)
 * @param {object} plant 
 * @param {object} plantRequirements 
 * @param {Array<object>} alerts 
 * @param {object} sensorData 
 * @returns {string}
 */
function generateStartupMessage(plant, plantRequirements, alerts, sensorData) {
  const timestamp = new Date().toLocaleString('en-US', { 
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
  });
  
  let message = `*** SYSTEM STARTUP - PLANT STATUS ***\n`;
  message += `Plant: ${plantRequirements.plantName}\n`;
  message += `Plot: ${plantRequirements.plotNumber}\n`;
  message += `Stage: ${plantRequirements.currentStage}\n`;
  message += `Time: ${timestamp}\n\n`;
  
  if (alerts.length > 0) {
    message += `⚠️  WARNINGS:\n`;
    alerts.forEach((alert, index) => {
      message += `${index + 1}. ${alert.message}\n`;
    });
  } else {
    message += `✅ ALL READINGS NORMAL:\n`;
    // Show current readings
    const { thresholds } = plantRequirements;
    Object.entries(thresholds).forEach(([key, threshold], index) => {
      const sensorKey = key.charAt(0).toUpperCase() + key.slice(1);
      const sensorValue = sensorData[key] || sensorData[key.toLowerCase()];
      if (sensorValue !== undefined && sensorValue !== null) {
        message += `${index + 1}. ${sensorKey}: ${sensorValue}${threshold.unit}\n`;
      }
    });
  }
  
  message += `\nSystem monitoring is now active.`;
  
  // Truncate to save SMS segments
  if (message.length > 320) { 
    message = message.substring(0, 317) + '...';
  }
  
  return message;
}

/**
 * Create alert signature for comparing alerts (ignores timestamp)
 * @param {Array<object>} alerts 
 * @returns {string}
 */
function createAlertSignature(alerts) {
  // Sort by parameter name and status for consistent signature
  return alerts
    .map(a => `${a.parameter}-${a.status}`)
    .sort()
    .join('_');
}

/**
 * Get last alert info from Firestore
 * @param {admin.firestore.Firestore} db 
 * @param {string} plantId 
 * @returns {Promise<object | null>}
 */
async function getLastAlertInfo(db, plantId) {
  try {
    const lastAlertDoc = await db.collection('lastAlerts').doc(plantId).get();
    
    if (!lastAlertDoc.exists) {
      return null;
    }
    
    const data = lastAlertDoc.data();
    // Use `sentAt?.toDate()` for safety
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
 * @param {admin.firestore.Firestore} db 
 * @param {string} plantId 
 * @param {Array<object>} alerts 
 * @param {object} alertData 
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
    console.error('Error saving last alert info:', error);
  }
}

/**
 * Save startup notification info (different from alerts)
 * @param {admin.firestore.Firestore} db 
 * @param {string} plantId 
 * @param {object} startupData 
 */
async function saveStartupNotification(db, plantId, startupData) {
  try {
    await db.collection('startupNotifications').doc(plantId).set({
      plantId,
      ...startupData,
      sentAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Error saving startup notification:', error);
  }
}

/**
 * Check if startup message should be sent
 * @param {admin.firestore.Firestore} db 
 * @param {string} plantId 
 * @returns {Promise<boolean>}
 */
async function shouldSendStartupMessage(db, plantId) {
  try {
    const startupDoc = await db.collection('startupNotifications').doc(plantId).get();
    
    // If no record exists, send startup message
    if (!startupDoc.exists) {
      return true;
    }
    
    const data = startupDoc.data();
    const lastSentAt = data.sentAt?.toDate();
    
    if (!lastSentAt) {
      return true;
    }
    
    // Only send startup message if last one was sent more than 12 hours ago
    const now = new Date().getTime();
    const lastSentTime = lastSentAt.getTime();
    const HOURS_12_MS = 12 * 60 * 60 * 1000;
    
    return (now - lastSentTime) > HOURS_12_MS;
    
  } catch (error) {
    console.error('Error checking startup notification:', error);
    // On error, send startup message to be safe
    return true;
  }
}

/**
 * Check if alert should be sent based on daily limit AND status change
 * @param {admin.firestore.Firestore} db 
 * @param {string} plantId 
 * @param {Array<object>} currentAlerts 
 * @returns {Promise<{shouldSend: boolean, reason: string}>}
 */
async function shouldSendAlert(db, plantId, currentAlerts) {
  try {
    const lastAlertInfo = await getLastAlertInfo(db, plantId);
    
    if (!lastAlertInfo || !lastAlertInfo.sentAt) {
      return { shouldSend: true, reason: 'First alert for this plant or last sent time is missing' };
    }
    
    const currentSignature = createAlertSignature(currentAlerts);
    const lastSentAt = lastAlertInfo.sentAt.getTime();
    
    const now = new Date().getTime();
    const HOURS_24_MS = 24 * 60 * 60 * 1000;
    const isWithin24Hours = (now - lastSentAt) < HOURS_24_MS;
    
    const hoursSinceLastAlert = (now - lastSentAt) / (1000 * 60 * 60);

    // Alert status changed?
    const statusChanged = currentSignature !== lastAlertInfo.signature;
    
    if (isWithin24Hours) {
      // Within 24 hours - Suppress, even if status changed, to avoid spam
      if (statusChanged) {
        console.log(`[SKIP] Status changed, but suppressed due to 24h limit (${hoursSinceLastAlert.toFixed(1)}h ago)`);
      }
      return { 
        shouldSend: false, 
        reason: `Alert sent ${hoursSinceLastAlert.toFixed(1)} hours ago (24h limit suppression)` 
      };
    } else {
      // More than 24 hours
      if (statusChanged) {
        console.log(`[SEND] 24h passed AND status changed - will send (${hoursSinceLastAlert.toFixed(1)}h ago)`);
        return { 
          shouldSend: true, 
          reason: `24h passed and alert status changed` 
        };
      } else {
        console.log(`[SKIP] 24h passed but status unchanged (${hoursSinceLastAlert.toFixed(1)}h ago)`);
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
 * @param {admin.database.Database} realtimeDb 
 * @param {string} sensorId 
 * @returns {Promise<{timestamp: string, data: object} | null>}
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
 * Send startup status message for a plant
 * @param {object} plant 
 * @param {object} sensorData 
 * @param {admin.firestore.Firestore} db 
 * @param {Array<object>} recipients 
 * @returns {Promise<object>}
 */
async function sendStartupMessageForPlant(plant, sensorData, db, recipients) {
  try {
    // Get plant requirements
    const plantRequirements = await getCurrentStageRequirements(db, plant);
    
    if (!plantRequirements) {
      return { success: false, message: 'Plant requirements not found' };
    }
    
    // Check thresholds
    const alerts = await checkThresholdsForPlant(sensorData, plantRequirements);
    
    // Generate startup message
    const message = generateStartupMessage(plant, plantRequirements, alerts, sensorData);
    
    console.log(`[STARTUP] Status Message for ${plantRequirements.plantName} (Plot ${plantRequirements.plotNumber}):\n${message}\n`);
    
    // Send SMS to recipients
    const sendPromises = recipients.map(user => 
      sendSMS(user.mobile, message)
    );
    
    const results = await Promise.all(sendPromises);
    
    // Save startup notification record
    await saveStartupNotification(db, plant.id, {
      plantName: plantRequirements.plantName,
      plotNumber: plantRequirements.plotNumber,
      currentStage: plantRequirements.currentStage,
      sensorId: plant.soilSensor,
      timestamp: new Date().toISOString(),
      recipients: recipients.map(r => ({ name: r.name, mobile: r.mobile })),
      alerts: alerts,
      sensorData: sensorData
    });
    
    const successCount = results.filter(r => r.success).length;
    
    return {
      success: true,
      plant: plantRequirements.plantName,
      plot: plantRequirements.plotNumber,
      alertsCount: alerts.length,
      messageSent: successCount,
      totalRecipients: recipients.length
    };
    
  } catch (error) {
    console.error(`Error sending startup message for plant ${plant.id}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Check and send startup messages for all plants
 * @param {admin.database.Database} realtimeDb 
 * @param {admin.firestore.Firestore} firestoreDb 
 */
export async function sendStartupMessages(realtimeDb, firestoreDb) {
  console.log('\n=== SENDING STARTUP STATUS MESSAGES ===\n');
  
  try {
    // Get all plants with soil sensors
    const plantsSnapshot = await firestoreDb.collection('plants')
      .where('soilSensor', '!=', null)
      .get();
    
    if (plantsSnapshot.empty) {
      console.log('[INFO] No plants with soil sensors found');
      return [];
    }
    
    // Get all recipients once
    const recipients = await fetchAlertRecipients(firestoreDb);
    
    if (recipients.length === 0) {
      console.log('[WARNING] No recipients found - cannot send startup messages');
      return [];
    }
    
    const results = [];
    
    // Process each plant
    for (const plantDoc of plantsSnapshot.docs) {
      const plant = { id: plantDoc.id, ...plantDoc.data() };
      const sensorId = plant.soilSensor;
      
      // Check if we should send startup message for this plant
      const shouldSend = await shouldSendStartupMessage(firestoreDb, plant.id);
      
      if (!shouldSend) {
        console.log(`[SKIP] Startup message for ${plant.plantType || 'Unknown'} (Plot ${plant.plotNumber || 'N/A'}) was sent recently`);
        continue;
      }
      
      // Get latest sensor reading
      const latestReading = await getLatestSensorReading(realtimeDb, sensorId);
      
      if (!latestReading) {
        console.log(`[WARNING] No sensor readings found for ${sensorId} (Plant: ${plant.plantType || 'Unknown'})`);
        continue;
      }
      
      console.log(`Processing startup status for ${plant.plantType || 'Unknown'} (Plot ${plant.plotNumber || 'N/A'})...`);
      
      // Send startup message
      const result = await sendStartupMessageForPlant(
        plant, 
        latestReading.data, 
        firestoreDb, 
        recipients
      );
      
      results.push(result);
      
      // Small delay between plants to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    
    console.log(`\n=== STARTUP COMPLETE ===`);
    console.log(`Total plants processed: ${plantsSnapshot.size}`);
    console.log(`Startup messages sent: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    
    return results;
    
  } catch (error) {
    console.error('Error sending startup messages:', error);
    return [];
  }
}

/**
 * Main function to process soil sensor alerts
 * @param {string} sensorId 
 * @param {object} sensorData 
 * @param {admin.firestore.Firestore} db 
 * @returns {Promise<object>}
 */
export async function processSoilSensorAlert(sensorId, sensorData, db) {
  try {
    console.log(`\n=== Processing Alert for ${sensorId} ===`);

    // Step 1: Find plant associated with this sensor
    const plant = await getPlantBySensor(db, sensorId);
    
    if (!plant) {
      console.log(`No plant found for sensor ${sensorId} - skipping alert`);
      return { success: false, message: 'No plant associated with sensor' };
    }

    // Step 2: Get current stage requirements
    const plantRequirements = await getCurrentStageRequirements(db, plant);
    
    if (!plantRequirements) {
      console.log('Could not fetch plant requirements - skipping alert');
      return { success: false, message: 'Plant requirements not found' };
    }

    // Step 3: Check thresholds
    const alerts = await checkThresholdsForPlant(sensorData, plantRequirements);
    
    if (alerts.length === 0) {
      console.log(`[OK] ${plantRequirements.plantName} (Plot ${plantRequirements.plotNumber}): All readings within normal range.`);
      return { success: true, message: 'No alerts needed' };
    }

    console.log(`[WARNING] ${alerts.length} violation(s) for ${plantRequirements.plantName} (Plot ${plantRequirements.plotNumber}):`);
    alerts.forEach(alert => console.log(`   - ${alert.message}`));

    // Step 4: Check if we should send this alert
    const alertCheck = await shouldSendAlert(db, plant.id, alerts);
    
    if (!alertCheck.shouldSend) {
      console.log(`[SKIP] ${alertCheck.reason}`);
      return { success: true, message: alertCheck.reason, skipped: true };
    }

    // Step 5: Generate alert message and log
    const message = generateAlertMessage(plant, plantRequirements, alerts);
    console.log(`[SMS] Alert Message for ${plant.id}:\n─────────────────\n${message}\n─────────────────`);

    // Step 6: Get recipients
    const recipients = await fetchAlertRecipients(db);
    
    if (recipients.length === 0) {
      console.log('[ERROR] No recipients found - cannot send alerts');
      // Still save the alert status to prevent re-sending immediately if recipients are added later
      await saveLastAlertInfo(db, plant.id, alerts, {
        plantName: plantRequirements.plantName,
        plotNumber: plantRequirements.plotNumber,
        currentStage: plantRequirements.currentStage,
        sensorId,
        timestamp: sensorData.timestamp || new Date().toISOString(),
        recipients: [],
        sensorData
      });
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
    
    console.log(`[SUMMARY] SMS Alert: ${successCount} sent, ${failCount} failed.`);

    return {
      success: true,
      plant: { name: plantRequirements.plantName, plot: plantRequirements.plotNumber, stage: plantRequirements.currentStage },
      alerts,
      sentTo: successCount,
      total: recipients.length,
      results
    };

  } catch (error) {
    console.error(`[ERROR] Fatal error processing alert for ${sensorId}:`, error);
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
        .replace(/[:.]/g, '_'); // Replaced non-alphanumeric chars for safety
      
      await realtimeDb.ref(`${sensorId}/${timestamp}`).set(sensorData);
      
      // Process alerts
      const alertResult = await processSoilSensorAlert(sensorId, {
        ...sensorData,
        timestamp: timestamp
      }, firestoreDb);
      
      res.json({ success: true, sensorId, timestamp, alertResult });
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

  // POST endpoint to trigger startup messages manually
  app.post('/api/soil-sensor/send-startup-messages', async (req, res) => {
    try {
      console.log('Manual startup messages triggered');
      const results = await sendStartupMessages(realtimeDb, firestoreDb);
      res.json({ 
        success: true, 
        message: 'Startup messages sent',
        results 
      });
    } catch (error) {
      console.error('Error sending startup messages:', error);
      res.status(500).json({ error: error.message });
    }
  });

  console.log('[OK] Alert routes registered');
}


/**
 * Setup real-time listener for sensor changes - EFFICIENTLY ONLY CHECKS LATEST READING
 * @param {admin.database.Database} realtimeDb 
 * @param {admin.firestore.Firestore} firestoreDb 
 * @returns {() => void}
 */
export function setupRealtimeAlertListener(realtimeDb, firestoreDb) {
  console.log('[LISTENER] Setting up Realtime Database listener for soil sensors...');
  
  // List of sensors to monitor
  const sensorNames = ['SoilSensor1', 'SoilSensor2', 'SoilSensor3', 'SoilSensor4', 'SoilSensor5'];
  
  sensorNames.forEach(sensorName => {
    // Query for the latest child added.
    const sensorRef = realtimeDb.ref(sensorName).orderByKey().limitToLast(1);
    
    // Use 'child_added' on the limited query. 
    sensorRef.on('child_added', async (snapshot) => {
      const timestamp = snapshot.key;
      const sensorData = snapshot.val();
      
      // Check if we already processed this timestamp (important for reconnects)
      if (lastProcessedTimestamp.get(sensorName) === timestamp) {
        console.log(`[SKIP] ${sensorName}/${timestamp} - Already processed`);
        return;
      }
      
      console.log(`\n[NEW LATEST] ${sensorName} at ${timestamp}:`);
      
      // Update last processed timestamp BEFORE processing
      lastProcessedTimestamp.set(sensorName, timestamp);
      
      // Process alert
      await processSoilSensorAlert(sensorName, {
        ...sensorData,
        timestamp: timestamp,
        sensorId: sensorName
      }, firestoreDb);
    }, (error) => {
      console.error(`Error in RTDB listener for ${sensorName}:`, error);
    });
  });
  
  console.log(`[OK] Real-time listener active for LATEST readings: ${sensorNames.join(', ')}`);
  
  // Return the cleanup function
  return () => {
    sensorNames.forEach(sensorName => {
      // Need to use the same query reference to turn off the listener
      realtimeDb.ref(sensorName).orderByKey().limitToLast(1).off('child_added');
    });
    lastProcessedTimestamp.clear();
    console.log('Real-time listener stopped');
  };
}

/**
 * Initialize SMS alert service with startup messages
 * @param {admin.database.Database} realtimeDb 
 * @param {admin.firestore.Firestore} firestoreDb 
 * @param {boolean} sendStartup Whether to send startup messages
 */
export async function initializeAlertService(realtimeDb, firestoreDb, sendStartup = true) {
  console.log('\n=== INITIALIZING SMS ALERT SERVICE ===\n');
  
  // Send startup messages if requested
  if (sendStartup) {
    await sendStartupMessages(realtimeDb, firestoreDb);
  }
  
  // Setup real-time listener
  const cleanupListener = setupRealtimeAlertListener(realtimeDb, firestoreDb);
  
  console.log('\n=== SMS ALERT SERVICE INITIALIZED ===\n');
  
  return {
    cleanupListener,
    sendStartupMessages: () => sendStartupMessages(realtimeDb, firestoreDb),
    processAlert: (sensorId, sensorData) => processSoilSensorAlert(sensorId, sensorData, firestoreDb)
  };
}

/**
 * Cleanup old alerts (run periodically)
 * @param {admin.firestore.Firestore} db 
 * @param {number} daysToKeep 
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
 * Cleanup old startup notifications (run periodically)
 * @param {admin.firestore.Firestore} db 
 * @param {number} daysToKeep 
 */
export async function cleanupOldStartupNotifications(db, daysToKeep = 7) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const snapshot = await db.collection('startupNotifications')
      .where('sentAt', '<', cutoffDate)
      .get();

    if (snapshot.empty) {
      console.log('No old startup notifications to clean up');
      return;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`[OK] Cleaned up ${snapshot.size} old startup notifications`);
  } catch (error) {
    console.error('Error cleaning up old startup notifications:', error);
  }
}

/**
 * SMS Alert Service Class (Encapsulates all logic)
 */
class SMSAlertService {
  constructor() {
    this.apiKey = SEMAPHORE_API_KEY;
    this.apiUrl = SEMAPHORE_API_URL;
  }

  // Expose core functions as methods
  async sendSMS(phoneNumber, message) {
    return sendSMS(phoneNumber, message);
  }

  async processSoilSensorAlert(sensorId, sensorData, firestoreDb) {
    return processSoilSensorAlert(sensorId, sensorData, firestoreDb);
  }

  setupAlertRoute(app, realtimeDb, firestoreDb) {
    return setupAlertRoute(app, realtimeDb, firestoreDb);
  }

  async initialize(realtimeDb, firestoreDb, sendStartup = true) {
    return initializeAlertService(realtimeDb, firestoreDb, sendStartup);
  }

  async sendStartupMessages(realtimeDb, firestoreDb) {
    return sendStartupMessages(realtimeDb, firestoreDb);
  }

  async cleanupOldAlerts(firestoreDb, daysToKeep = 30) {
    return cleanupOldAlerts(firestoreDb, daysToKeep);
  }

  async cleanupOldStartupNotifications(firestoreDb, daysToKeep = 7) {
    return cleanupOldStartupNotifications(firestoreDb, daysToKeep);
  }
}

export const smsAlertService = new SMSAlertService();
export default smsAlertService;