import dotenv from 'dotenv';
import axios from 'axios';
import admin from 'firebase-admin';

dotenv.config();

const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY;
const SEMAPHORE_API_URL = 'https://api.semaphore.co/api/v4/messages';

const plantRequirementsCache = new Map();
const lastAlertSent = new Map();
const processedTimestamps = new Set();

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
    return [];
  }
}

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
    return null;
  }
}

async function getCurrentStageRequirements(db, plant) {
  try {
    const plantType = plant.plantType || plant.type;
    
    if (!plantType) {
      return null;
    }

    const cacheKey = `${plantType}_${plant.status}`;
    if (plantRequirementsCache.has(cacheKey)) {
      return plantRequirementsCache.get(cacheKey);
    }

    const plantListRef = db.collection('plantsList').doc(plantType.toLowerCase());
    const plantListDoc = await plantListRef.get();

    if (!plantListDoc.exists) {
      return null;
    }

    const plantListData = plantListDoc.data();
    const stages = plantListData.stages || [];
    
    const currentStage = stages.find(stage => 
      stage.stage.toLowerCase() === (plant.status || '').toLowerCase()
    );

    if (!currentStage) {
      return null;
    }

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

    plantRequirementsCache.set(cacheKey, requirements);
    setTimeout(() => plantRequirementsCache.delete(cacheKey), 5 * 60 * 1000);

    return requirements;
  } catch (error) {
    return null;
  }
}

function normalizeSensorData(sensorData) {
  const normalized = {};
  
  for (const [key, value] of Object.entries(sensorData)) {
    const lowerKey = key.toLowerCase();
    normalized[lowerKey] = value;
  }
  
  return normalized;
}

export async function checkThresholdsForPlant(sensorData, plantRequirements) {
  const alerts = [];

  if (!plantRequirements || !plantRequirements.thresholds) {
    return alerts;
  }

  const thresholds = plantRequirements.thresholds;
  const normalizedData = normalizeSensorData(sensorData);

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

  for (const check of checks) {
    let sensorValue = null;
    
    for (const key of check.sensorKeys) {
      if (normalizedData[key] !== undefined && normalizedData[key] !== null) {
        sensorValue = normalizedData[key];
        break;
      }
    }

    const threshold = thresholds[check.thresholdKey];

    if (sensorValue === null || !threshold) {
      continue;
    }

    const numValue = parseFloat(sensorValue);
    const minThreshold = parseFloat(threshold.min);
    const maxThreshold = parseFloat(threshold.max);
    
    if (isNaN(numValue) || isNaN(minThreshold) || isNaN(maxThreshold)) {
      continue;
    }

    if (numValue < minThreshold) {
      alerts.push({
        parameter: check.name,
        value: numValue,
        status: 'LOW',
        threshold: minThreshold,
        unit: threshold.unit,
        message: `${check.name}: ${numValue}${threshold.unit} (below ${minThreshold}${threshold.unit})`
      });
    } else if (numValue > maxThreshold) {
      alerts.push({
        parameter: check.name,
        value: numValue,
        status: 'HIGH',
        threshold: maxThreshold,
        unit: threshold.unit,
        message: `${check.name}: ${numValue}${threshold.unit} (above ${maxThreshold}${threshold.unit})`
      });
    }
  }

  return alerts;
}

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
  
  if (message.length > 320) {
    message = message.substring(0, 317) + '...';
  }
  
  return message;
}

function createAlertId(plantId, alerts) {
  const alertKeys = alerts.map(a => `${a.parameter}-${a.status}`).sort().join('_');
  return `${plantId}_${alertKeys}`;
}

function shouldSendAlert(sensorId, alertId) {
  const lastSent = lastAlertSent.get(sensorId);
  
  if (!lastSent) {
    return true;
  }
  
  if (lastSent.alertId !== alertId) {
    return true;
  }
  
  const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
  if (lastSent.timestamp < dayAgo) {
    return true;
  }
  
  return false;
}

function markAlertAsSentInMemory(sensorId, alertId) {
  lastAlertSent.set(sensorId, {
    alertId: alertId,
    timestamp: Date.now()
  });
}

async function markAlertAsSent(db, alertId, alertData) {
  try {
    await db.collection('sentAlerts').doc(alertId).set({
      ...alertData,
      sentAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
  }
}

export async function processSoilSensorAlert(sensorId, sensorData, db) {
  try {
    const plant = await getPlantBySensor(db, sensorId);
    
    if (!plant) {
      return { success: false, message: 'No plant associated with sensor' };
    }

    const plantRequirements = await getCurrentStageRequirements(db, plant);
    
    if (!plantRequirements) {
      return { success: false, message: 'Plant requirements not found' };
    }

    const alerts = await checkThresholdsForPlant(sensorData, plantRequirements);
    
    if (alerts.length === 0) {
      return { success: true, message: 'No alerts needed' };
    }

    const alertId = createAlertId(plant.id, alerts);
    
    if (!shouldSendAlert(sensorId, alertId)) {
      return { success: true, message: 'Same alert already sent recently', skipped: true };
    }

    const message = generateAlertMessage(plant, plantRequirements, alerts);

    const recipients = await fetchAlertRecipients(db);
    
    if (recipients.length === 0) {
      return { success: false, message: 'No recipients found' };
    }

    const sendPromises = recipients.map(user => 
      sendSMS(user.mobile, message)
    );

    const results = await Promise.all(sendPromises);
    
    markAlertAsSentInMemory(sensorId, alertId);
    
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
    return { success: false, error: error.message };
  }
}

export function setupAlertRoute(app, realtimeDb, firestoreDb) {
  app.post('/api/soil-sensor/reading', async (req, res) => {
    try {
      const { sensorId, ...sensorData } = req.body;
      
      if (!sensorId) {
        return res.status(400).json({ error: 'sensorId is required' });
      }

      const timestamp = new Date().toISOString()
        .replace(/[:]/g, '_')
        .replace(/\..+/, '');
      
      await realtimeDb.ref(`${sensorId}/${timestamp}`).set(sensorData);
      
      if (process.env.ENABLE_SOIL_ALERTS === 'true') {
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
      } else {
        res.json({
          success: true,
          sensorId,
          timestamp,
          alertResult: { success: true, message: 'Alerts disabled' }
        });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/soil-sensor/check-alerts', async (req, res) => {
    try {
      const { sensorId } = req.body;

      if (!sensorId) {
        return res.status(400).json({ error: 'sensorId is required' });
      }

      if (process.env.ENABLE_SOIL_ALERTS !== 'true') {
        return res.json({ success: false, message: 'Alerts are disabled' });
      }

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
      
      const alertResult = await processSoilSensorAlert(sensorId, {
        ...latestReading,
        timestamp: latestTimestamp
      }, firestoreDb);
      
      res.json(alertResult);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

function isValidTimestamp(key) {
  return key.includes('2025-') || key.includes('2024-') || key.includes('2026-');
}

export function setupRealtimeAlertListener(realtimeDb, firestoreDb) {
  if (process.env.ENABLE_SOIL_ALERTS !== 'true') {
    return () => {};
  }

  const sensorNames = ['SoilSensor1', 'SoilSensor2', 'SoilSensor3', 'SoilSensor4', 'SoilSensor5'];
  const startTime = Date.now();
  
  sensorNames.forEach(async (sensorName) => {
    try {
      const snapshot = await realtimeDb.ref(sensorName)
        .orderByKey()
        .limitToLast(1)
        .once('value');
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        const latestKey = Object.keys(data)[0];
        
        if (isValidTimestamp(latestKey)) {
          processedTimestamps.add(`${sensorName}_${latestKey}`);
        }
      }
    } catch (error) {
      // Silent fail
    }

    const sensorRef = realtimeDb.ref(sensorName).orderByKey().limitToLast(1);
    
    sensorRef.on('child_added', async (snapshot) => {
      const timestamp = snapshot.key;
      const sensorData = snapshot.val();
      
      if (!isValidTimestamp(timestamp)) {
        return;
      }
      
      const uniqueId = `${sensorName}_${timestamp}`;
      
      if (processedTimestamps.has(uniqueId)) {
        return;
      }
      
      processedTimestamps.add(uniqueId);
      
      await processSoilSensorAlert(sensorName, {
        ...sensorData,
        timestamp: timestamp,
        sensorId: sensorName
      }, firestoreDb);
    });
    
    sensorRef.on('child_changed', async (snapshot) => {
      const timestamp = snapshot.key;
      const sensorData = snapshot.val();
      
      if (!isValidTimestamp(timestamp)) {
        return;
      }
      
      const uniqueId = `${sensorName}_${timestamp}`;
      processedTimestamps.add(uniqueId);
      
      await processSoilSensorAlert(sensorName, {
        ...sensorData,
        timestamp: timestamp,
        sensorId: sensorName
      }, firestoreDb);
    });
  });
  
  return () => {
    sensorNames.forEach(sensorName => {
      realtimeDb.ref(sensorName).orderByKey().limitToLast(1).off('child_added');
      realtimeDb.ref(sensorName).orderByKey().limitToLast(1).off('child_changed');
    });
    processedTimestamps.clear();
    lastAlertSent.clear();
  };
}

export async function cleanupOldAlerts(db, daysToKeep = 7) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const snapshot = await db.collection('sentAlerts')
      .where('sentAt', '<', cutoffDate)
      .get();

    if (snapshot.empty) {
      return;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  } catch (error) {
    // Silent fail
  }
}

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