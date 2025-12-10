import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  getDoc, 
  serverTimestamp, 
  query, 
  where,
  runTransaction 
} from 'firebase/firestore';
import { db } from '../firebase';
import inventoryLogger from "../functions/inventoryLogger";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const parsePlotSizeToM2 = (plotSizeStr) => {
  if (!plotSizeStr) {
    console.warn("parsePlotSizeToM2: No plot size string provided");
    return 0;
  }

  const normalizedStr = String(plotSizeStr).toLowerCase().replace(/\s/g, '');

  const m2Match = normalizedStr.match(/^(\d+(\.\d+)?)(m2|sqm|sqmeters|sqmeter)$/);
  if (m2Match) {
    return parseFloat(m2Match[1]);
  }

  const cmMatch = normalizedStr.match(/^(\d+(\.\d+)?)[x*](\d+(\.\d+)?)cm$/);
  if (cmMatch) {
    const lengthCm = parseFloat(cmMatch[1]);
    const widthCm = parseFloat(cmMatch[3]);
    return (lengthCm * widthCm) / 10000;
  }

  const mMatch = normalizedStr.match(/^(\d+(\.\d+)?)[x*](\d+(\.\d+)?)(m|meter)?$/);
  if (mMatch) {
    const length = parseFloat(mMatch[1]);
    const width = parseFloat(mMatch[3]);
    return length * width;
  }
  
  const numberMatch = normalizedStr.match(/^(\d+(\.\d+)?)$/);
  if (numberMatch) {
    return parseFloat(numberMatch[1]);
  }

  console.warn(`Unable to parse plot size: "${plotSizeStr}"`);
  return 0;
};

const convertFertilizerToPlotSize = (bagsPerHa, plotSizeM2, returnWeight = false) => {
  const hectareInM2 = 10000;
  const FERTILIZER_WEIGHT_PER_BAG = 50; // kg
  
  const validPlotSize = plotSizeM2 || 0;
  
  if (validPlotSize === 0) {
    return returnWeight ? { 
      bags: '0.00',
      amount: '0.00', 
      unit: 'g',
      weightKg: 0,
      weightGrams: 0
    } : '0.00';
  }
  
  const bagsForPlot = (bagsPerHa * validPlotSize) / hectareInM2;
  const weightKg = bagsForPlot * FERTILIZER_WEIGHT_PER_BAG;
  const weightGrams = weightKg * 1000;
  
  if (!returnWeight) {
    return bagsForPlot.toFixed(6);
  }
  
  let displayAmount, displayUnit;
  
  if (weightKg >= 0.1) {
    displayAmount = weightKg.toFixed(3);
    displayUnit = 'kg';
  } else if (weightKg >= 0.0001) {
    displayAmount = (weightKg * 1000).toFixed(1);
    displayUnit = 'g';
  } else {
    displayAmount = (weightKg * 1000000).toFixed(0);
    displayUnit = 'mg';
  }
  
  return {
    bags: bagsForPlot.toFixed(6),
    amount: displayAmount,
    unit: displayUnit,
    weightKg: weightKg,
    weightGrams: weightGrams
  };
};

const findMatchingFertilizer = async (jobOrderData) => {
  try {
    if (jobOrderData.inventoryItemId) {
      const invRef = doc(db, 'inventory', jobOrderData.inventoryItemId);
      const invSnap = await getDoc(invRef);
      if (invSnap.exists()) {
        return { 
          id: invSnap.id, 
          ref: invRef, 
          ...invSnap.data() 
        };
      }
    }

    const inventorySnapshot = await getDocs(collection(db, 'inventory'));
    const inventoryItems = inventorySnapshot.docs.map(d => ({ 
      id: d.id, 
      ref: d.ref, 
      ...d.data() 
    }));

    if (jobOrderData.npkRatio) {
      const wanted = String(jobOrderData.npkRatio).toLowerCase().replace(/\s/g, '');
      const byNpk = inventoryItems.find(item => {
        const npkRatio = String(item.npkRatio || '').toLowerCase().replace(/\s/g, '');
        const npkKey = String(item.npkKey || '').toLowerCase().replace(/\s/g, '');
        return npkRatio === wanted || npkKey === wanted;
      });
      if (byNpk) return byNpk;
    }

    const npkToken = (jobOrderData.npkRatio || 'npk').toString().toLowerCase();
    const fuzzy = inventoryItems.find(item => {
      const cat = String(item.category || '').toLowerCase();
      const name = String(item.name || '').toLowerCase();
      const categoryMatches = cat.includes('fertil');
      const nameMatches = name.includes(npkToken) || name.includes('npk');
      return categoryMatches && (nameMatches || item.npkRatio || item.npkKey);
    });

    return fuzzy || null;
  } catch (error) {
    console.error('findMatchingFertilizer error:', error);
    return null;
  }
};

const getFertilizerUnitCost = async (inventoryItemId) => {
  try {
    if (!inventoryItemId) return 0;
    const docRef = doc(db, 'inventory', inventoryItemId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return data.pricePerUnit || data.pricePerBag || data.price || 0;
    }
    return 0;
  } catch (error) {
    console.error('getFertilizerUnitCost error:', error);
    return 0;
  }
};

// ============================================================================
// HELPER: Normalize job order ID
// ============================================================================
const normalizeJobOrderId = (jobOrderId) => {
  if (!jobOrderId) return null;
  
  // Remove any prefixes
  if (jobOrderId.startsWith('joborder-')) {
    return jobOrderId.replace('joborder-', '');
  }
  if (jobOrderId.startsWith('event-')) {
    return jobOrderId.replace('event-', '');
  }
  
  return jobOrderId;
};

// ============================================================================
// MAIN JOB ORDER MANAGEMENT CLASS
// ============================================================================

class JobOrderManager {
  constructor(userId, userName = 'Unknown User') {
    this.userId = userId;
    this.userName = userName;
  }

  // ==========================================================================
  // CREATE: Generate fertilizer job orders from recommendations
  // ==========================================================================
  async generateFertilizerJobOrders(plant, fertilizerRecommendations) {
    try {
      if (!fertilizerRecommendations || !fertilizerRecommendations.matchedScenario) {
        console.error('No fertilizer recommendation provided');
        return [];
      }

      const scenario = fertilizerRecommendations.matchedScenario;
      const applications = scenario.applications || [];
      
      if (applications.length === 0) {
        console.error('No applications found in scenario');
        return [];
      }
      
      const plotSizeM2 = parsePlotSizeToM2(plant.plotSize) || 0;
      
      if (plotSizeM2 === 0) {
        console.error('Invalid plot size:', plant.plotSize);
        return [];
      }
      
      const inventorySnapshot = await getDocs(collection(db, 'inventory'));
      const inventoryItems = inventorySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      const npkRatio = scenario.npkRatio.toLowerCase().replace(/\s/g, '');
      const matchingInventoryItem = inventoryItems.find(item => {
        const category = String(item.category || '').toLowerCase();
        const isFertilizer = category.includes('fertil');
        
        if (!isFertilizer) return false;
        
        if (item.npkRatio) {
          const itemNpk = String(item.npkRatio).toLowerCase().replace(/\s/g, '');
          if (itemNpk === npkRatio) return true;
        }
        
        if (item.npkKey) {
          const itemNpk = String(item.npkKey).toLowerCase().replace(/\s/g, '');
          if (itemNpk === npkRatio) return true;
        }
        
        if (item.name) {
          const itemName = String(item.name).toLowerCase().replace(/\s/g, '');
          if (itemName.includes(npkRatio)) return true;
        }
        
        return false;
      });
      
      const createdJobOrderIds = [];
      const applicationEvents = [];
      
      for (let i = 0; i < applications.length; i++) {
        const application = applications[i];
        
        const scheduledDate = new Date();
        scheduledDate.setHours(8, 0, 0, 0);
        
        const timingLower = application.timing.toLowerCase();
        if (timingLower.includes('at planting') || timingLower.includes('immediately')) {
          scheduledDate.setDate(scheduledDate.getDate() + 1);
        } else if (timingLower.includes('10-14 days')) {
          scheduledDate.setDate(scheduledDate.getDate() + 12);
        } else if (timingLower.includes('days after')) {
          const daysMatch = timingLower.match(/(\d+)\s*days?\s*after/);
          if (daysMatch) {
            scheduledDate.setDate(scheduledDate.getDate() + parseInt(daysMatch[1]));
          } else {
            scheduledDate.setDate(scheduledDate.getDate() + (i * 7 + 1));
          }
        } else if (timingLower.includes('weeks after')) {
          const weeksMatch = timingLower.match(/(\d+)\s*weeks?\s*after/);
          if (weeksMatch) {
            scheduledDate.setDate(scheduledDate.getDate() + (parseInt(weeksMatch[1]) * 7));
          } else {
            scheduledDate.setDate(scheduledDate.getDate() + (i * 7 + 1));
          }
        } else {
          scheduledDate.setDate(scheduledDate.getDate() + (i * 7 + 1));
        }
        
        const fertilizerBagsForPlot = {};
        const fertilizerWeightDisplay = {}
        Object.entries(application.bags).forEach(([type, bagsPerHa]) => {
          const bags = typeof bagsPerHa === 'string' 
            ? parseFloat(bagsPerHa.split('-')[0]) || parseFloat(bagsPerHa) || 0
            : parseFloat(bagsPerHa) || 0;
          
          // 1. Get the small number of bags (for inventory logging)
          const bagsForPlot = convertFertilizerToPlotSize(bags, plotSizeM2);
          fertilizerBagsForPlot[type] = parseFloat(bagsForPlot);

          // 2. Get the human-readable weight (for display)
          const weightInfo = convertFertilizerToPlotSize(bags, plotSizeM2, true); // Use returnWeight=true
          fertilizerWeightDisplay[type] = `${weightInfo.amount} ${weightInfo.unit}`; // e.g., "30.0 g" or "0.500 kg"
        });
        
        const bagsInfo = Object.entries(application.bags)
          .map(([type, amount]) => `${type}: ${amount}`)
          .join(', ');
        
        // Update to use toFixed(6) for bags (more precise for tiny plots)
        const bagsForPlotInfo = Object.entries(fertilizerBagsForPlot)
          .map(([type, bags]) => `${type}: ${bags.toFixed(6)} bags`)
          .join(', ');

        const convertedWeightInfo = Object.entries(fertilizerWeightDisplay)
          .map(([type, amount]) => `${type}: ${amount}`)
          .join(', ');
        
        const jobOrderData = {
          plantId: plant.id,
          plantName: plant.plantName,
          plantType: plant.plantType,
          plotNumber: plant.plotNumber,
          plotSize: plant.plotSize,
          plotSizeM2: plotSizeM2,
          
          type: 'FERTILIZER_APPLICATION',
          title: `${application.stage} - ${fertilizerRecommendations.plantName || plant.plantType}`,
          // UPDATE description to use human-readable weight
          description: `Apply fertilizers as per NPK ratio ${scenario.npkRatio}: ${convertedWeightInfo} (for ${plotSizeM2.toFixed(4)}m² plot)`, 
          
          status: 'pending',
          priority: i === 0 ? 'high' : 'medium',
          
          fertilizerName: `NPK ${scenario.npkRatio}`,
          fertilizerBags: application.bags,
          fertilizerBagsForPlot: fertilizerBagsForPlot, 
          fertilizerAmount: convertedWeightInfo,
          fertilizerAmountForPlot: bagsForPlotInfo,
          convertedFertilizerAmount: convertedWeightInfo,
          npkRatio: scenario.npkRatio,
          applicationMethod: application.method,
          applicationInstructions: application.method,
          
          inventoryItemId: matchingInventoryItem?.id || null,
          inventoryItemName: matchingInventoryItem?.name || null,
          
          scheduledDate: scheduledDate.toISOString(),
          scheduledTime: '8:00 AM',
          dueDate: scheduledDate.toISOString(),
          frequency: application.timing,
          applicationNumber: i + 1,
          totalApplications: applications.length,
          applicationStage: application.stage,
          applicationTiming: application.timing,
          
          stage: fertilizerRecommendations.stage,
          nutrientCondition: fertilizerRecommendations.currentCondition,
          soilCondition: scenario.condition,
          reason: `Nutrient levels: N=${fertilizerRecommendations.nCondition}, P=${fertilizerRecommendations.pCondition}, K=${fertilizerRecommendations.kCondition}`,
          
          expectedResult: `Follow ${application.stage} schedule for optimal growth`,
          
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          userId: this.userId,
          createdBy: this.userId,
          assignedTo: null,
          completedAt: null,
          completedBy: null,
          startedAt: null,
          startedBy: null,
          notes: '',
          
          inventoryLogged: false,
          inventoryLogId: null,
          
          estimatedCost: 0,
          actualCost: null
        };
        
        const docRef = await addDoc(collection(db, 'jobOrders'), jobOrderData);
        createdJobOrderIds.push(docRef.id);
        
        const scheduledEvent = {
          plantId: plant.id,
          plantName: plant.plantName,
          plotNumber: plant.plotNumber,
          type: 'FERTILIZER_SCHEDULED',
          status: 'scheduled',
          message: `Fertilizer application scheduled: ${application.stage} on ${scheduledDate.toLocaleDateString()}`,
          scheduledDate: scheduledDate.toISOString(),
          timestamp: serverTimestamp(),
          createdAt: serverTimestamp(),
          userId: this.userId,
          jobOrderId: docRef.id,
          details: {
            applicationStage: application.stage,
            npkRatio: scenario.npkRatio,
            fertilizerAmount: bagsForPlotInfo
          }
        };
        
        applicationEvents.push(scheduledEvent);
      }
      
      for (const event of applicationEvents) {
        await addDoc(collection(db, 'events'), event);
      }
      
      console.log(`✅ Created ${createdJobOrderIds.length} fertilizer job orders`);
      return createdJobOrderIds;
      
    } catch (error) {
      console.error('Error generating fertilizer job orders:', error);
      throw error;
    }
  }

  async updateJobOrderStatus(jobOrderId, status) {
    try {
      const actualJobOrderId = normalizeJobOrderId(jobOrderId);
      
      if (!actualJobOrderId) {
        throw new Error('Invalid job order ID');
      }
      
      const jobOrderRef = doc(db, 'jobOrders', actualJobOrderId);
      const jobOrderDoc = await getDoc(jobOrderRef);
      
      if (!jobOrderDoc.exists()) {
        throw new Error('Job order not found');
      }
      
      const jobOrderData = jobOrderDoc.data();
      const previousStatus = jobOrderData.status;
      
      const updateData = {
        status: status,
        updatedAt: serverTimestamp(),
        updatedBy: this.userId
      };
      
      // Add status-specific fields
      if (status === 'in-progress') {
        updateData.startedAt = serverTimestamp();
        updateData.startedBy = this.userId;
        
        // Create "in progress" event
        await addDoc(collection(db, 'events'), {
          plantId: jobOrderData.plantId,
          plantName: jobOrderData.plantName,
          plotNumber: jobOrderData.plotNumber,
          type: 'FERTILIZER_IN_PROGRESS',
          status: 'info',
          message: `Fertilizer application started: ${jobOrderData.applicationStage}`,
          timestamp: serverTimestamp(),
          startedDate: new Date().toISOString(),
          createdAt: serverTimestamp(),
          userId: this.userId,
          details: {
            jobOrderId: actualJobOrderId,
            applicationStage: jobOrderData.applicationStage,
            npkRatio: jobOrderData.npkRatio,
            scheduledDate: jobOrderData.scheduledDate
          }
        });
      }
      
      await updateDoc(jobOrderRef, updateData);
      
      // Create status change event
      await addDoc(collection(db, 'events'), {
        plantId: jobOrderData.plantId,
        plantName: jobOrderData.plantName,
        plotNumber: jobOrderData.plotNumber,
        type: 'FERTILIZER_STATUS_CHANGE',
        status: 'info',
        message: `Fertilizer application status changed: ${previousStatus} → ${status}`,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        userId: this.userId,
        details: {
          jobOrderId: actualJobOrderId,
          applicationStage: jobOrderData.applicationStage,
          previousStatus: previousStatus,
          newStatus: status,
          scheduledDate: jobOrderData.scheduledDate
        }
      });
      
      // Update related events
      const eventsQuery = query(
        collection(db, 'events'),
        where('jobOrderId', '==', actualJobOrderId)
      );
      const eventsSnapshot = await getDocs(eventsQuery);
      
      for (const eventDoc of eventsSnapshot.docs) {
        await updateDoc(eventDoc.ref, {
          status: status,
          updatedAt: serverTimestamp()
        });
      }
      
      console.log(`✅ Job order ${actualJobOrderId} status updated to ${status}`);
      return true;
      
    } catch (error) {
      console.error('Error updating job order status:', error);
      throw error;
    }
  }

  // ==========================================================================
  // COMPLETE: Mark job order as completed and update inventory
  // ==========================================================================
// ==========================================================================
  // COMPLETE: Mark job order as completed and update inventory
  // ==========================================================================
  async completeJobOrder(jobOrderId, notes = '', bagsUsedOverride = null) {
    try {
      const actualJobOrderId = normalizeJobOrderId(jobOrderId);
      
      if (!actualJobOrderId) {
        throw new Error('Invalid job order ID');
      }
      
      const jobOrderRef = doc(db, 'jobOrders', actualJobOrderId);
      const jobOrderDoc = await getDoc(jobOrderRef);
      
      if (!jobOrderDoc.exists()) {
        throw new Error('Job order not found');
      }
      
      const jobOrderData = jobOrderDoc.data();

      const matchingInventoryItem = await findMatchingFertilizer(jobOrderData);
      
      if (!matchingInventoryItem) {
        console.warn('No matching fertilizer found in inventory');
      }

      let totalBagsUsed = 0;
      if (bagsUsedOverride !== null) {
        totalBagsUsed = parseFloat(bagsUsedOverride);
      } else if (jobOrderData.fertilizerBagsForPlot) {
        totalBagsUsed = Object.values(jobOrderData.fertilizerBagsForPlot)
          .reduce((sum, bags) => sum + parseFloat(bags || 0), 0);
      }

      let inventoryLogId = null;
      let totalCost = 0;

      if (matchingInventoryItem && totalBagsUsed > 0) {
        const unitCost = await getFertilizerUnitCost(matchingInventoryItem.id);
        totalCost = totalBagsUsed * unitCost;

        const logResult = await inventoryLogger.logTransaction(
          matchingInventoryItem.id,
          -totalBagsUsed,
          'fertilizer_application',
          this.userId,
          {
            jobOrderId: actualJobOrderId,
            plantId: jobOrderData.plantId,
            plantName: jobOrderData.plantName,
            plotNumber: jobOrderData.plotNumber,
            npkRatio: jobOrderData.npkRatio,
            applicationStage: jobOrderData.applicationStage,
            notes: notes
          }
        );

        inventoryLogId = logResult?.logId || null;
      }

      // 1. Update the Job Order status
      await updateDoc(jobOrderRef, {
        status: 'completed',
        completedAt: serverTimestamp(),
        completedBy: this.userId,
        notes: notes,
        actualCost: totalCost,
        inventoryLogged: matchingInventoryItem ? true : false,
        inventoryLogId: inventoryLogId,
        updatedAt: serverTimestamp()
      });

      // 2. Create the Completion Event
      await addDoc(collection(db, 'events'), {
        plantId: jobOrderData.plantId,
        plantName: jobOrderData.plantName,
        plotNumber: jobOrderData.plotNumber,
        type: 'FERTILIZER_COMPLETED',
        status: 'success',
        message: `Fertilizer application completed: ${jobOrderData.applicationStage}`,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        userId: this.userId,
        details: {
          jobOrderId: actualJobOrderId,
          fertilizerName: jobOrderData.fertilizerName,
          bagsUsed: totalBagsUsed,
          cost: totalCost,
          applicationNumber: jobOrderData.applicationNumber,
          totalApplications: jobOrderData.totalApplications,
          notes: notes,
          inventoryLogged: true,
          inventoryLogId: inventoryLogId,
          inventoryItemId: matchingInventoryItem?.id || null,
          inventoryItemName: matchingInventoryItem?.name || null
        }
      });

      // 3. Log the Expense to plantExpenses (FIXED SYNTAX)
      if (totalCost > 0) {
        await addDoc(collection(db, 'plantExpenses'), {
          plantId: jobOrderData.plantId,
          plantName: jobOrderData.plantName,
          category: 'Fertilizer',
          description: `Fertilizer Application: ${jobOrderData.fertilizerName || 'NPK'} (${totalBagsUsed.toFixed(2)} bags)`,
          amount: totalCost,
          date: serverTimestamp(),
          paymentMethod: 'Inventory Usage', // Added for clarity in reports
          vendor: 'Internal Inventory',     // Added for clarity
          addedBy: this.userId,
          type: 'AUTOMATED_JOB_ORDER'
        });
      }

      // 4. Update related events in the event history
      const eventsQuery = query(
        collection(db, 'events'),
        where('jobOrderId', '==', actualJobOrderId)
      );
      const eventsSnapshot = await getDocs(eventsQuery);
      
      for (const eventDoc of eventsSnapshot.docs) {
        await updateDoc(eventDoc.ref, {
          status: 'completed',
          completedAt: serverTimestamp(),
          completedBy: this.userId,
          notes: notes,
          updatedAt: serverTimestamp()
        });
      }

      console.log(
        `✅ Job order completed: ${totalBagsUsed.toFixed(2)} bags deducted, ` +
        `₱${totalCost.toFixed(2)} expense logged`
      );
      return true;

    } catch (error) {
      console.error('Error completing job order:', error);
      throw error;
    }
  }

  // ==========================================================================
  // CANCEL: Cancel a job order
  // ==========================================================================
  async cancelJobOrder(jobOrderId, reason = '') {
    try {
      const actualJobOrderId = normalizeJobOrderId(jobOrderId);
      
      if (!actualJobOrderId) {
        throw new Error('Invalid job order ID');
      }
      
      const jobOrderRef = doc(db, 'jobOrders', actualJobOrderId);
      const jobOrderDoc = await getDoc(jobOrderRef);
      
      if (!jobOrderDoc.exists()) {
        throw new Error('Job order not found');
      }
      
      const jobOrderData = jobOrderDoc.data();
      
      await updateDoc(jobOrderRef, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: this.userId,
        cancellationReason: reason,
        updatedAt: serverTimestamp()
      });
      
      const eventsQuery = query(
        collection(db, 'events'),
        where('jobOrderId', '==', actualJobOrderId)
      );
      const eventsSnapshot = await getDocs(eventsQuery);
      
      for (const eventDoc of eventsSnapshot.docs) {
        await updateDoc(eventDoc.ref, {
          status: 'cancelled',
          cancelledAt: serverTimestamp(),
          cancelledBy: this.userId,
          cancellationReason: reason,
          updatedAt: serverTimestamp()
        });
      }
      
      await addDoc(collection(db, 'events'), {
        plantId: jobOrderData.plantId,
        plantName: jobOrderData.plantName,
        plotNumber: jobOrderData.plotNumber,
        type: 'FERTILIZER_CANCELLED',
        status: 'warning',
        message: `Fertilizer application cancelled: ${jobOrderData.applicationStage}`,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        userId: this.userId,
        details: {
          jobOrderId: actualJobOrderId,
          applicationStage: jobOrderData.applicationStage,
          npkRatio: jobOrderData.npkRatio,
          scheduledDate: jobOrderData.scheduledDate,
          reason: reason
        }
      });
      
      console.log(`❌ Job order ${actualJobOrderId} cancelled`);
      return true;
    } catch (error) {
      console.error('Error cancelling job order:', error);
      throw error;
    }
  }

  // ==========================================================================
  // UTILITY: Get job order statistics
  // ==========================================================================
  async getJobOrderStats(plantId = null) {
    try {
      let jobOrdersQuery = collection(db, 'jobOrders');
      
      if (plantId) {
        jobOrdersQuery = query(jobOrdersQuery, where('plantId', '==', plantId));
      }
      
      const snapshot = await getDocs(jobOrdersQuery);
      const jobOrders = snapshot.docs.map(doc => doc.data());
      
      return {
        total: jobOrders.length,
        pending: jobOrders.filter(j => j.status === 'pending').length,
        inProgress: jobOrders.filter(j => j.status === 'in-progress').length,
        completed: jobOrders.filter(j => j.status === 'completed').length,
        cancelled: jobOrders.filter(j => j.status === 'cancelled').length
      };
    } catch (error) {
      console.error('Error getting job order stats:', error);
      throw error;
    }
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default JobOrderManager;

export { 
  parsePlotSizeToM2, 
  convertFertilizerToPlotSize, 
  findMatchingFertilizer, 
  getFertilizerUnitCost,
  normalizeJobOrderId
};