// server/services/plantAgeScheduler.js
import admin from 'firebase-admin';
import cron from 'node-cron';

/**
 * Calculate the number of days between two dates
 */
function calculateDaysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Reset hours to get accurate day count
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  
  const diffTime = end - start;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Determine current growth stage based on plant age and stages
 */
function getCurrentStage(plantAge, stages) {
  if (!stages || stages.length === 0) {
    return null;
  }

  // Find the stage that the plant is currently in
  for (const stage of stages) {
    const startDay = stage.startDuration || 0;
    const endDay = stage.endDuration || 0;
    
    if (plantAge >= startDay && plantAge <= endDay) {
      return stage.stage;
    }
  }

  // If past all stages, return last stage
  return stages[stages.length - 1].stage;
}

/**
 * Update plant age and status for a single plant
 */
async function updatePlantAge(db, plantDoc) {
  try {
    const plantData = plantDoc.data();
    const plantId = plantDoc.id;
    
    // Skip if no planted date
    if (!plantData.plantedDate) {
      console.log(`  ⏭️  Skipping ${plantId} - no planted date`);
      return { skipped: true, reason: 'No planted date' };
    }

    // Calculate current age
    const plantedDate = plantData.plantedDate.toDate ? plantData.plantedDate.toDate() : new Date(plantData.plantedDate);
    const today = new Date();
    const currentAge = calculateDaysBetween(plantedDate, today);

    // Get existing age
    const previousAge = plantData.age || 0;
    
    // Skip if age hasn't changed
    if (currentAge === previousAge) {
      console.log(`  ✅ ${plantData.plantName || plantData.plantType} (Plot ${plantData.plotNumber}): Age ${currentAge} - No update needed`);
      return { updated: false, reason: 'Age unchanged' };
    }

    // Determine new stage based on age
    let newStatus = plantData.status;
    let stageChanged = false;
    
    if (plantData.stages && plantData.stages.length > 0) {
      const calculatedStage = getCurrentStage(currentAge, plantData.stages);
      if (calculatedStage && calculatedStage !== plantData.status) {
        newStatus = calculatedStage;
        stageChanged = true;
      }
    }

    // Update plant document
    const updateData = {
      age: currentAge,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (stageChanged) {
      updateData.status = newStatus;
    }

    await db.collection('plants').doc(plantId).update(updateData);

    const logMessage = stageChanged
      ? `  🔄 ${plantData.plantName || plantData.plantType} (Plot ${plantData.plotNumber}): Day ${previousAge} → Day ${currentAge} | Stage: ${plantData.status} → ${newStatus}`
      : `  📅 ${plantData.plantName || plantData.plantType} (Plot ${plantData.plotNumber}): Day ${previousAge} → Day ${currentAge}`;

    console.log(logMessage);

    // Create event for stage change
    if (stageChanged) {
      await createStageChangeEvent(db, plantData, plantId, newStatus, currentAge);
    }

    return {
      updated: true,
      plantId,
      plantName: plantData.plantName || plantData.plantType,
      plotNumber: plantData.plotNumber,
      previousAge,
      currentAge,
      stageChanged,
      previousStage: plantData.status,
      newStage: newStatus
    };

  } catch (error) {
    console.error(`  ❌ Error updating plant ${plantDoc.id}:`, error);
    return { error: error.message };
  }
}

/**
 * Create an event in the events collection for stage changes
 */
async function createStageChangeEvent(db, plantData, plantId, newStage, currentAge) {
  try {
    const eventData = {
      plantId: plantId,
      plantName: plantData.plantName || plantData.plantType,
      type: 'LIFECYCLE_STAGE',
      status: 'info',
      message: `Stage change: ${newStage} (Day ${currentAge}) for ${plantData.plantName || plantData.plantType}`,
      timestamp: new Date(),
      notes: `Plant has progressed to ${newStage} stage on day ${currentAge}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      userId: 'system' // System-generated event
    };

    await db.collection('events').add(eventData);
    console.log(`    📝 Event created for stage change to ${newStage}`);
  } catch (error) {
    console.error('    ❌ Error creating stage change event:', error);
  }
}

/**
 * Update all plants' ages
 */
export async function updateAllPlantAges(db) {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║   🌱 DAILY PLANT AGE UPDATE - STARTED        ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log(`⏰ Time: ${new Date().toLocaleString()}\n`);

  try {
    // Fetch all plants
    const plantsSnapshot = await db.collection('plants').get();

    if (plantsSnapshot.empty) {
      console.log('📭 No plants found in database\n');
      return { success: true, message: 'No plants to update', count: 0 };
    }

    console.log(`📊 Found ${plantsSnapshot.size} plant(s) to process\n`);

    const results = {
      total: plantsSnapshot.size,
      updated: [],
      skipped: [],
      errors: [],
      stageChanges: []
    };

    // Update each plant
    for (const plantDoc of plantsSnapshot.docs) {
      const result = await updatePlantAge(db, plantDoc);

      if (result.error) {
        results.errors.push(result);
      } else if (result.skipped) {
        results.skipped.push(result);
      } else if (result.updated) {
        results.updated.push(result);
        if (result.stageChanged) {
          results.stageChanges.push(result);
        }
      }
    }

    // Print summary
    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║   📊 UPDATE SUMMARY                           ║');
    console.log('╚═══════════════════════════════════════════════╝');
    console.log(`✅ Total plants: ${results.total}`);
    console.log(`📅 Ages updated: ${results.updated.length}`);
    console.log(`🔄 Stage changes: ${results.stageChanges.length}`);
    console.log(`⏭️  Skipped: ${results.skipped.length}`);
    console.log(`❌ Errors: ${results.errors.length}`);

    if (results.stageChanges.length > 0) {
      console.log('\n🔄 Stage Changes:');
      results.stageChanges.forEach(change => {
        console.log(`   • ${change.plantName} (Plot ${change.plotNumber}): ${change.previousStage} → ${change.newStage}`);
      });
    }

    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║   ✅ DAILY PLANT AGE UPDATE - COMPLETED      ║');
    console.log('╚═══════════════════════════════════════════════╝\n');

    return {
      success: true,
      results
    };

  } catch (error) {
    console.error('❌ Error in updateAllPlantAges:', error);
    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║   ❌ DAILY PLANT AGE UPDATE - FAILED         ║');
    console.log('╚═══════════════════════════════════════════════╝\n');
    return { success: false, error: error.message };
  }
}

/**
 * Setup cron job to run at 12:00 AM daily
 */
export function setupDailyAgeUpdateScheduler(db) {
  console.log('⏰ Setting up daily plant age update scheduler...');
  
  // Cron format: second minute hour day month weekday
  // '0 0 0 * * *' = At 12:00 AM every day
  const cronSchedule = '0 0 0 * * *';
  
  const scheduledTask = cron.schedule(cronSchedule, async () => {
    await updateAllPlantAges(db);
  }, {
    scheduled: true,
    timezone: "Asia/Manila" // Adjust to your timezone
  });

  console.log('✅ Daily scheduler active - Will run at 12:00 AM every day (Asia/Manila timezone)');
  console.log(`   Next run: ${getNextMidnight().toLocaleString('en-US', { 
    timeZone: 'Asia/Manila',
    dateStyle: 'full',
    timeStyle: 'short'
  })}\n`);

  return scheduledTask;
}

/**
 * Get next midnight timestamp
 */
function getNextMidnight() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
}

/**
 * Setup API route for manual age update
 */
export function setupAgeUpdateRoute(app, db) {
  // POST endpoint to manually trigger age update
  app.post('/api/plants/update-ages', async (req, res) => {
    try {
      console.log('\n🔧 Manual age update triggered via API\n');
      const result = await updateAllPlantAges(db);
      
      res.json({
        success: result.success,
        message: 'Plant ages updated',
        ...result
      });
    } catch (error) {
      console.error('Error in manual age update:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // GET endpoint to check scheduler status
  app.get('/api/plants/age-update-status', (req, res) => {
    const nextRun = getNextMidnight();
    res.json({
      success: true,
      schedulerActive: true,
      nextScheduledRun: nextRun.toISOString(),
      nextRunLocal: nextRun.toLocaleString('en-US', { 
        timeZone: 'Asia/Manila',
        dateStyle: 'full',
        timeStyle: 'short'
      }),
      timezone: 'Asia/Manila',
      cronSchedule: '0 0 0 * * * (12:00 AM daily)'
    });
  });

  console.log('✅ Age update API routes registered:');
  console.log('   POST /api/plants/update-ages - Manual trigger');
  console.log('   GET  /api/plants/age-update-status - Scheduler status\n');
}

/**
 * Plant Age Scheduler Service Class
 */
class PlantAgeScheduler {
  constructor() {
    this.scheduledTask = null;
  }

  async updateAllPlantAges(db) {
    return updateAllPlantAges(db);
  }

  setupDailyScheduler(db) {
    this.scheduledTask = setupDailyAgeUpdateScheduler(db);
    return this.scheduledTask;
  }

  setupRoutes(app, db) {
    return setupAgeUpdateRoute(app, db);
  }

  stopScheduler() {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      console.log('⏹️  Daily scheduler stopped');
    }
  }
}

export const plantAgeScheduler = new PlantAgeScheduler();
export default plantAgeScheduler;