import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'

class InventoryLogger {

  async createLog(inventoryId, action, details, userId, userName = null) {
    try {
      // Validate required fields
      if (!inventoryId) {
        throw new Error('Inventory ID is required')
      }
      if (!action) {
        throw new Error('Action is required')
      }
      if (!userId) {
        throw new Error('User ID is required')
      }

      // Validate action type
      const validActions = ['ADD', 'REMOVE', 'UPDATE', 'USE', 'ADJUST', 'RESTOCK', 'TRANSFER', 'EXPIRE', 'DAMAGE']
      if (!validActions.includes(action)) {
        console.warn(`Invalid action type: ${action}. Using 'UPDATE' as default.`)
        action = 'UPDATE'
      }

      // Build log entry
      const logEntry = {
        inventoryId: inventoryId,
        action: action,
        previousQuantity: details.previousQuantity || 0,
        newQuantity: details.newQuantity || 0,
        quantityChange: details.quantityChange || 0,
        reason: details.reason || 'No reason provided',
        itemName: details.itemName || 'Unknown Item',
        category: details.category || 'Uncategorized',
        userId: userId,
        userName: userName || 'Unknown User',
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        
        // Optional fields
        ...(details.plantId && { plantId: details.plantId }),
        ...(details.plantName && { plantName: details.plantName }),
        ...(details.notes && { notes: details.notes }),
        ...(details.previousPacks !== undefined && { previousPacks: details.previousPacks }),
        ...(details.newPacks !== undefined && { newPacks: details.newPacks }),
        ...(details.seedsPerPack && { seedsPerPack: details.seedsPerPack }),
        ...(details.unit && { unit: details.unit }),
        ...(details.cost && { cost: details.cost }),
        ...(details.supplier && { supplier: details.supplier })
      }

      // Save to inventory_log collection
      const docRef = await addDoc(collection(db, 'inventory_log'), logEntry)
      
      console.log(`✅ Inventory log created: ${docRef.id} - ${action} - ${details.itemName}`)
      
      return docRef.id
    } catch (error) {
      console.error('❌ Error creating inventory log:', error)
      // Don't throw error - logging failures shouldn't break main operations
      return null
    }
  }

  /**
   * Log seed usage for planting
   * @param {string} inventoryId - Inventory item ID
   * @param {Object} seedData - Seed usage data
   * @param {string} userId - User ID
   * @param {string} userName - User name
   */
  async logSeedUsage(inventoryId, seedData, userId, userName) {
    return await this.createLog(
      inventoryId,
      'USE',
      {
        previousQuantity: seedData.previousPacks,
        newQuantity: seedData.newPacks,
        quantityChange: -seedData.packsUsed,
        previousPacks: seedData.previousPacks,
        newPacks: seedData.newPacks,
        seedsPerPack: seedData.seedsPerPack,
        reason: `Used ${seedData.seedsUsed} seeds (${seedData.packsUsed} pack${seedData.packsUsed !== 1 ? 's' : ''}) for planting ${seedData.plantName}`,
        itemName: seedData.itemName,
        category: seedData.category || 'Seed',
        plantId: seedData.plantId,
        plantName: seedData.plantName,
        notes: `Plot: ${seedData.plotNumber}, Seedlings: ${seedData.seedsUsed}`
      },
      userId,
      userName
    )
  }

  /**
   * Log inventory addition/restock
   * @param {string} inventoryId - Inventory item ID
   * @param {Object} addData - Addition data
   * @param {string} userId - User ID
   * @param {string} userName - User name
   */
  async logInventoryAdd(inventoryId, addData, userId, userName) {
    return await this.createLog(
      inventoryId,
      addData.isNew ? 'ADD' : 'RESTOCK',
      {
        previousQuantity: addData.previousStock || 0,
        newQuantity: addData.newStock,
        quantityChange: addData.quantityAdded,
        reason: addData.isNew ? 'New inventory item added' : `Restocked: ${addData.quantityAdded} units added`,
        itemName: addData.itemName,
        category: addData.category,
        supplier: addData.supplier,
        cost: addData.cost,
        unit: addData.unit,
        notes: addData.notes
      },
      userId,
      userName
    )
  }

  /**
   * Log inventory removal/consumption
   * @param {string} inventoryId - Inventory item ID
   * @param {Object} removeData - Removal data
   * @param {string} userId - User ID
   * @param {string} userName - User name
   */
  async logInventoryRemoval(inventoryId, removeData, userId, userName) {
    return await this.createLog(
      inventoryId,
      'REMOVE',
      {
        previousQuantity: removeData.previousStock,
        newQuantity: removeData.newStock,
        quantityChange: -removeData.quantityRemoved,
        reason: removeData.reason || 'Inventory removed',
        itemName: removeData.itemName,
        category: removeData.category,
        notes: removeData.notes
      },
      userId,
      userName
    )
  }

  /**
   * Log inventory adjustment (corrections, damages, etc.)
   * @param {string} inventoryId - Inventory item ID
   * @param {Object} adjustData - Adjustment data
   * @param {string} userId - User ID
   * @param {string} userName - User name
   */
  async logInventoryAdjustment(inventoryId, adjustData, userId, userName) {
    return await this.createLog(
      inventoryId,
      'ADJUST',
      {
        previousQuantity: adjustData.previousStock,
        newQuantity: adjustData.newStock,
        quantityChange: adjustData.adjustment,
        reason: adjustData.reason || 'Inventory adjustment',
        itemName: adjustData.itemName,
        category: adjustData.category,
        notes: adjustData.notes
      },
      userId,
      userName
    )
  }

  /**
   * Log inventory update (price changes, info updates, etc.)
   * @param {string} inventoryId - Inventory item ID
   * @param {Object} updateData - Update data
   * @param {string} userId - User ID
   * @param {string} userName - User name
   */
  async logInventoryUpdate(inventoryId, updateData, userId, userName) {
    const changes = []
    
    if (updateData.priceChanged) {
      changes.push(`Price: ₱${updateData.oldPrice} → ₱${updateData.newPrice}`)
    }
    if (updateData.nameChanged) {
      changes.push(`Name: ${updateData.oldName} → ${updateData.newName}`)
    }
    if (updateData.categoryChanged) {
      changes.push(`Category: ${updateData.oldCategory} → ${updateData.newCategory}`)
    }
    
    const changesSummary = changes.length > 0 ? changes.join(', ') : 'Information updated'
    
    return await this.createLog(
      inventoryId,
      'UPDATE',
      {
        previousQuantity: updateData.stock || 0,
        newQuantity: updateData.stock || 0,
        quantityChange: 0,
        reason: `Inventory updated: ${changesSummary}`,
        itemName: updateData.newName || updateData.itemName,
        category: updateData.newCategory || updateData.category,
        notes: updateData.notes
      },
      userId,
      userName
    )
  }

  /**
   * Get logs for a specific inventory item
   * @param {string} inventoryId - Inventory item ID
   * @returns {Promise<Array>} Array of log entries
   */
  async getLogsForItem(inventoryId) {
    try {
      const { query, collection, where, orderBy, getDocs } = await import('firebase/firestore')
      
      const q = query(
        collection(db, 'inventory_log'),
        where('inventoryId', '==', inventoryId),
        orderBy('timestamp', 'desc')
      )
      
      const snapshot = await getDocs(q)
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || new Date(doc.data().timestamp)
      }))
      
      return logs
    } catch (error) {
      console.error('Error fetching inventory logs:', error)
      return []
    }
  }

  /**
   * Get logs for a specific plant (seed usage tracking)
   * @param {string} plantId - Plant ID
   * @returns {Promise<Array>} Array of log entries
   */
  async getLogsForPlant(plantId) {
    try {
      const { query, collection, where, orderBy, getDocs } = await import('firebase/firestore')
      
      const q = query(
        collection(db, 'inventory_log'),
        where('plantId', '==', plantId),
        orderBy('timestamp', 'desc')
      )
      
      const snapshot = await getDocs(q)
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || new Date(doc.data().timestamp)
      }))
      
      return logs
    } catch (error) {
      console.error('Error fetching plant inventory logs:', error)
      return []
    }
  }

  /**
   * Get all logs for a date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Array of log entries
   */
  async getLogsByDateRange(startDate, endDate) {
    try {
      const { query, collection, where, orderBy, getDocs, Timestamp } = await import('firebase/firestore')
      
      const q = query(
        collection(db, 'inventory_log'),
        where('timestamp', '>=', Timestamp.fromDate(startDate)),
        where('timestamp', '<=', Timestamp.fromDate(endDate)),
        orderBy('timestamp', 'desc')
      )
      
      const snapshot = await getDocs(q)
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || new Date(doc.data().timestamp)
      }))
      
      return logs
    } catch (error) {
      console.error('Error fetching logs by date range:', error)
      return []
    }
  }

  /**
   * Get summary statistics for an inventory item
   * @param {string} inventoryId - Inventory item ID
   * @returns {Promise<Object>} Summary statistics
   */
  async getItemSummary(inventoryId) {
    try {
      const logs = await this.getLogsForItem(inventoryId)
      
      const summary = {
        totalLogs: logs.length,
        totalAdded: 0,
        totalRemoved: 0,
        totalUsed: 0,
        totalAdjustments: 0,
        lastAction: logs[0] || null,
        actionBreakdown: {}
      }
      
      logs.forEach(log => {
        // Count by action type
        summary.actionBreakdown[log.action] = (summary.actionBreakdown[log.action] || 0) + 1
        
        // Sum quantities
        if (log.action === 'ADD' || log.action === 'RESTOCK') {
          summary.totalAdded += Math.abs(log.quantityChange)
        } else if (log.action === 'REMOVE') {
          summary.totalRemoved += Math.abs(log.quantityChange)
        } else if (log.action === 'USE') {
          summary.totalUsed += Math.abs(log.quantityChange)
        } else if (log.action === 'ADJUST') {
          summary.totalAdjustments += log.quantityChange
        }
      })
      
      return summary
    } catch (error) {
      console.error('Error getting item summary:', error)
      return null
    }
  }
}

// Export singleton instance
const inventoryLogger = new InventoryLogger()
export default inventoryLogger

// Also export the class for testing/extending
export { InventoryLogger }