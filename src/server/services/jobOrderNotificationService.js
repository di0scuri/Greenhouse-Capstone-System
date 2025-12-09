import dotenv from 'dotenv';
import axios from 'axios';
import admin from 'firebase-admin';

dotenv.config();

const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY;
const SEMAPHORE_API_URL = 'https://api.semaphore.co/api/v4/messages';

// Track which dates have already been notified
const notifiedDates = new Set();

async function sendSMS(phoneNumber, message) {
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

async function fetchFarmerRecipients(db) {
  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef
      .where('role', '==', 'Farmer')
      .get();

    if (snapshot.empty) {
      return [];
    }

    const farmers = [];
    snapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.mobile) {
        farmers.push({
          id: doc.id,
          name: userData.displayName || userData.name || userData.email || 'Unknown',
          mobile: userData.mobile
        });
      }
    });

    return farmers;
  } catch (error) {
    console.error('Error fetching farmers:', error);
    return [];
  }
}

function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isSameDay(date1, date2) {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

async function getTodayJobOrders(db) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const jobOrdersRef = db.collection('jobOrders');
    const snapshot = await jobOrdersRef
      .where('status', '==', 'pending')
      .where('scheduledDate', '>=', today.toISOString())
      .where('scheduledDate', '<', tomorrow.toISOString())
      .orderBy('scheduledDate')
      .get();

    if (snapshot.empty) {
      return [];
    }

    const jobOrders = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Double-check the date matches today
      const scheduledDate = new Date(data.scheduledDate);
      if (isSameDay(scheduledDate, today)) {
        jobOrders.push({
          id: doc.id,
          ...data
        });
      }
    });

    return jobOrders;
  } catch (error) {
    console.error('Error fetching job orders:', error);
    return [];
  }
}

function parsePlotSize(plotSizeStr) {
  if (!plotSizeStr) return null;
  
  // Handle formats like "30x20cm", "100x100cm", etc.
  const match = plotSizeStr.match(/(\d+)x(\d+)cm/i);
  if (!match) return null;
  
  const length = parseFloat(match[1]);
  const width = parseFloat(match[2]);
  
  // Convert cm² to m²
  const areaInCm2 = length * width;
  const areaInM2 = areaInCm2 / 10000; // 1 m² = 10,000 cm²
  
  return areaInM2;
}

async function getPlotSize(db, plotNumber) {
  try {
    const plantsRef = db.collection('plants');
    const snapshot = await plantsRef
      .where('plotNumber', '==', plotNumber)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const plantData = snapshot.docs[0].data();
    const plotSizeStr = plantData.plotSize;
    
    // Parse the plot size string (e.g., "30x20cm")
    return parsePlotSize(plotSizeStr);
  } catch (error) {
    console.error('Error fetching plot size:', error);
    return null;
  }
}

function convertFertilizerAmount(amountPerHectare, plotSizeM2) {
  if (!plotSizeM2) return amountPerHectare;
  
  // 1 hectare = 10,000 m²
  const hectareToM2 = 10000;
  const plotSizeInHectares = plotSizeM2 / hectareToM2;
  
  // Extract number from string like "10 bag/ha" or "4.25 bags/ha"
  const match = amountPerHectare.match(/([\d.]+)\s*(bag|bags|kg|g|L|ml)/i);
  if (!match) return amountPerHectare;
  
  const amount = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  
  let convertedAmount = amount * plotSizeInHectares;
  let finalUnit = 'kg';
  
  // Convert bags to kg (1 bag = 50kg)
  if (unit.includes('bag')) {
    convertedAmount = convertedAmount * 50; // Convert to kg
  } else if (unit === 'g') {
    convertedAmount = convertedAmount / 1000; // Convert g to kg
  } else if (unit === 'kg') {
    // Already in kg
    finalUnit = 'kg';
  } else {
    // For other units (L, ml), keep as is
    finalUnit = unit;
  }
  
  // If amount is less than 1 kg, convert to grams
  if (finalUnit === 'kg' && convertedAmount < 1) {
    convertedAmount = convertedAmount * 1000; // Convert to grams
    finalUnit = 'g';
  }
  
  // Format with appropriate precision
  let formatted;
  if (convertedAmount < 0.01) {
    formatted = convertedAmount.toFixed(4);
  } else if (convertedAmount < 0.1) {
    formatted = convertedAmount.toFixed(3);
  } else if (convertedAmount < 10) {
    formatted = convertedAmount.toFixed(2);
  } else if (convertedAmount < 100) {
    formatted = convertedAmount.toFixed(1);
  } else {
    formatted = Math.round(convertedAmount).toString();
  }
  
  // Remove trailing zeros
  formatted = parseFloat(formatted).toString();
  
  return `${formatted} ${finalUnit}`;
}

async function generateJobOrderMessage(jobOrders, db) {
  const today = new Date().toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
  
  let message = `*** JOB ORDERS TODAY ***\n`;
  message += `Date: ${today}\n`;
  message += `Total: ${jobOrders.length} task${jobOrders.length > 1 ? 's' : ''}\n\n`;
  
  for (let index = 0; index < jobOrders.length; index++) {
    const job = jobOrders[index];
    const jobNum = index + 1;
    
    message += `${jobNum}. ${job.title || 'Task'}\n`;
    message += `Plot: ${job.plotNumber || 'N/A'} | ${job.priority?.toUpperCase() || 'MED'}\n`;
    
    // Get plot size for conversion
    const plotSize = await getPlotSize(db, job.plotNumber);
    
    // Add fertilizer information
    if (job.type === 'FERTILIZER_APPLICATION' && job.fertilizerBags) {
      const fertilizers = [];
      for (const [name, amount] of Object.entries(job.fertilizerBags)) {
        const converted = convertFertilizerAmount(amount, plotSize);
        fertilizers.push(`${name}: ${converted}`);
      }
      if (fertilizers.length > 0) {
        message += `Fertilizer: ${fertilizers.join(', ')}\n`;
      }
    } else if (job.fertilizerAmount) {
      const converted = convertFertilizerAmount(job.fertilizerAmount, plotSize);
      message += `Fertilizer: ${converted}\n`;
    }
    
    if (index < jobOrders.length - 1) {
      message += '\n';
    }
  }
  
  message += `\nComplete these tasks today.`;
  
  // SMS limit - keep it reasonable for readability
  // Most carriers support up to 1600 chars (10 segments) but keep it shorter
  if (message.length > 640) {
    // If too long, create a summary version
    message = `*** JOB ORDERS TODAY ***\n`;
    message += `Date: ${today}\n`;
    message += `${jobOrders.length} task${jobOrders.length > 1 ? 's' : ''} scheduled\n\n`;
    
    for (let index = 0; index < jobOrders.length; index++) {
      const job = jobOrders[index];
      message += `${index + 1}. ${job.title} - Plot ${job.plotNumber}\n`;
    }
    
    message += `\nCheck system for full details.`;
  }
  
  return message;
}

async function checkAndSendJobOrderNotifications(db) {
  try {
    const todayDateString = getTodayDateString();
    
    // Check if we've already sent notification for today
    if (notifiedDates.has(todayDateString)) {
      console.log(`Job order notification already sent for ${todayDateString}`);
      return { success: true, message: 'Already notified today', skipped: true };
    }

    // Get today's pending job orders
    const jobOrders = await getTodayJobOrders(db);
    
    if (jobOrders.length === 0) {
      console.log('No job orders scheduled for today');
      return { success: true, message: 'No job orders today' };
    }

    // Get farmer recipients
    const farmers = await fetchFarmerRecipients(db);
    
    if (farmers.length === 0) {
      console.log('No farmers found to notify');
      return { success: false, message: 'No farmers found' };
    }

    // Generate consolidated message
    const message = await generateJobOrderMessage(jobOrders, db);

    console.log(`Sending job order notification to ${farmers.length} farmer(s)...`);
    
    // Send SMS to all farmers
    const sendPromises = farmers.map(farmer => 
      sendSMS(farmer.mobile, message)
    );

    const results = await Promise.all(sendPromises);
    const successCount = results.filter(r => r.success).length;

    // Mark today as notified
    notifiedDates.add(todayDateString);

    // Store notification record in Firestore
    await db.collection('jobOrderNotifications').add({
      date: todayDateString,
      jobOrderCount: jobOrders.length,
      jobOrderIds: jobOrders.map(j => j.id),
      recipients: farmers.map(f => ({ name: f.name, mobile: f.mobile })),
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      successCount,
      totalRecipients: farmers.length
    });

    console.log(`Job order notification sent: ${successCount}/${farmers.length} successful`);

    return {
      success: true,
      date: todayDateString,
      jobOrders: jobOrders.length,
      sentTo: successCount,
      total: farmers.length,
      results
    };

  } catch (error) {
    console.error('Error in job order notification:', error);
    return { success: false, error: error.message };
  }
}

// Setup daily scheduler to check for job orders
export function setupJobOrderScheduler(db) {
  console.log('Setting up job order notification scheduler...');
  
  // Check immediately on startup
  setTimeout(() => {
    checkAndSendJobOrderNotifications(db);
  }, 5000); // Wait 5 seconds after startup

  // Schedule daily check at 6:00 AM
  const checkTime = () => {
    const now = new Date();
    const target = new Date(now);
    target.setHours(6, 0, 0, 0); // 6:00 AM
    
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }
    
    return target.getTime() - now.getTime();
  };

  const scheduleNextCheck = () => {
    const timeUntilCheck = checkTime();
    console.log(`Next job order check in ${Math.round(timeUntilCheck / 1000 / 60)} minutes`);
    
    setTimeout(() => {
      checkAndSendJobOrderNotifications(db);
      scheduleNextCheck(); // Schedule next day
    }, timeUntilCheck);
  };

  scheduleNextCheck();
}

// Manual trigger endpoint for testing
export function setupJobOrderRoutes(app, db) {
  app.post('/api/job-orders/send-notifications', async (req, res) => {
    try {
      const result = await checkAndSendJobOrderNotifications(db);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/job-orders/today', async (req, res) => {
    try {
      const jobOrders = await getTodayJobOrders(db);
      res.json({
        date: getTodayDateString(),
        count: jobOrders.length,
        jobOrders
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/job-orders/notification-status', async (req, res) => {
    try {
      const todayDateString = getTodayDateString();
      const notified = notifiedDates.has(todayDateString);
      
      res.json({
        date: todayDateString,
        notificationSent: notified,
        notifiedDates: Array.from(notifiedDates)
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

class JobOrderNotificationService {
  constructor() {
    this.apiKey = SEMAPHORE_API_KEY;
    this.apiUrl = SEMAPHORE_API_URL;
  }

  async checkAndSendNotifications(db) {
    return checkAndSendJobOrderNotifications(db);
  }

  setupScheduler(db) {
    return setupJobOrderScheduler(db);
  }

  setupRoutes(app, db) {
    return setupJobOrderRoutes(app, db);
  }
}

export const jobOrderNotificationService = new JobOrderNotificationService();
export default jobOrderNotificationService;