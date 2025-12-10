import React, { useState, useEffect } from 'react'
import Sidebar from './sidebar'
import './planting.css'
import './planting-ranking.css'
import './custom-alert.css'
import { collection, getDocs, doc, getDoc, updateDoc, deleteDoc, addDoc, serverTimestamp, query, where, Timestamp } from 'firebase/firestore'
import { db, realtimeDb } from '../firebase'
import { useNavigate } from 'react-router-dom'
import { ref, get } from 'firebase/database'
import inventoryLogger from "../functions/inventoryLogger";
import JobOrderManager, { 
  parsePlotSizeToM2, 
  convertFertilizerToPlotSize 
} from '../functions/jobOrderManager';
import { useUser } from '../contexts/UserContext'

import {
  MdLocationOn,
  MdSearch,
  MdVisibility,
  MdBolt,
  MdWaterDrop,
  MdPeople,
  MdGrass,
  MdAttachMoney,
  MdCheckCircle,
  MdScience,
  MdLocalFlorist,
  MdThermostat,
  MdOpacity,
  MdEco,
  MdCalendarToday,
  MdInfo,
  MdWarning,
  MdTrendingUp,
  MdAssessment,
  MdTimeline
} from 'react-icons/md'



const Planting = ({ userType = 'admin' }) => {
  const { userId, userName, currentUser } = useUser();
  const [activeMenu, setActiveMenu] = useState('Planting')
  const [searchTerm, setSearchTerm] = useState('')
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAddPlotModal, setShowAddPlotModal] = useState(false)
  const [jobOrderFilter, setJobOrderFilter] = useState('all')
  const [showFertilizerModal, setShowFertilizerModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [showHarvestModal, setShowHarvestModal] = useState(false)
  const [selectedPlant, setSelectedPlant] = useState(null)
  const [plants, setPlantsData] = useState([])
  const [plantsList, setPlantsList] = useState({})
  const [loading, setLoading] = useState(true)
  const [isGeneratingJobOrders, setIsGeneratingJobOrders] = useState(false)
  const [plantAge, setPlantAge] = useState(0)
  const [priceRecommendation, setPriceRecommendation] = useState(null)

  const navigate = useNavigate()


  const [harvestData, setHarvestData] = useState({
    actualYield: '',
    yieldUnit: 'kg',
    quality: 'A',
    notes: '',
    harvestDate: new Date().toISOString().split('T')[0]
  })
  const [editFormData, setEditFormData] = useState({
    locationZone: '',
    status: '',
    currentSellingPrice: '',
    unit: '',
    survivingPlants: ''
  })

  // Custom Alert State
  const [alertConfig, setAlertConfig] = useState({
    show: false,
    type: 'info',
    title: '',
    message: '',
    details: [],
    onConfirm: () => {},
    onCancel: () => {},
    confirmText: 'OK',
    cancelText: 'Cancel',
    showCancel: false
  })

  // Filter States
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [filters, setFilters] = useState({
    locationZone: 'all',
    plantType: 'all',
    status: 'Active',
    plotNumber: 'all'
  })

  const handleViewEvents = () => {
  // 1. Close the alert first (if it's not handled automatically by the CustomAlert component)
  setAlertConfig(prev => ({ ...prev, show: false })); 
  
  // 2. Navigate to the desired route
  navigate('/calendar/admin'); 
};
  
  // Add Plot States
  const [plotStep, setPlotStep] = useState('input')
  const [selectedPlotNumber, setSelectedPlotNumber] = useState('')
  const [selectedSoilSensor, setSelectedSoilSensor] = useState('')
  const [selectedPlantType, setSelectedPlantType] = useState('')
  const [availableSensors, setAvailableSensors] = useState([])
  const [sensorData, setSensorData] = useState(null)
  const [scanProgress, setScanProgress] = useState(0)
  const [recommendedSeedlings, setRecommendedSeedlings] = useState(0)
  const [fertilizerInfo, setFertilizerInfo] = useState(null)
  const [activeDetailTab, setActiveDetailTab] = useState('summary')
  const [plantEvents, setPlantEvents] = useState([])
  const [customPlotSize, setCustomPlotSize] = useState({ length: 30, width: 20 })
  const [isSubmitting, setIsSubmitting] = useState(false)

  

  // Sensor status and ranking states
  const [sensorStatus, setSensorStatus] = useState(null)
  const [rankedPlants, setRankedPlants] = useState([])
  const [loadingSensorStatus, setLoadingSensorStatus] = useState(false)

  const locationZoneOptions = ['Closed Greenhouse', 'Nursery 1', 'Nursery 2']
  
  const plotOptions = [
    { number: 1 },
    { number: 2 },
    { number: 3 },
    { number: 4 },
    { number: 5 }
  ]
  
  const unitOptions = ['per kilo', 'per piece', 'per bundle', 'per pack', 'per dozen']

  // Custom Alert Component
  const CustomAlert = ({ show, type = 'info', title, message, details, onConfirm, onCancel, confirmText = 'OK', cancelText = 'Cancel', showCancel = false }) => {
    if (!show) return null

    const getIcon = () => {
      switch (type) {
        case 'success': return '✅'
        case 'error': return '❌'
        case 'warning': return '⚠️'
        case 'info': return 'ℹ️'
        default: return 'ℹ️'
      }
    }

    return (
      <div className="custom-alert-overlay" onClick={showCancel ? onCancel : null}>
        <div className={`custom-alert-modal ${type}`} onClick={(e) => e.stopPropagation()}>
          <div className="custom-alert-header">
            <div className="custom-alert-icon">{getIcon()}</div>
            <div className="custom-alert-content">
              <h3 className="custom-alert-title">{title}</h3>
              <p className="custom-alert-message">{message}</p>
            </div>
          </div>

          {details && details.length > 0 && (
            <div className="custom-alert-details">
              {details.map((detail, index) => (
                <div key={index} className="alert-detail-item">
                  <span className="alert-detail-label">{detail.label}:</span>
                  <span className="alert-detail-value">{detail.value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="custom-alert-footer">
            {showCancel && (
              <button className="custom-alert-btn custom-alert-btn-cancel" onClick={onCancel}>
                {cancelText}
              </button>
            )}
            <button 
              className={`custom-alert-btn ${type === 'error' ? 'custom-alert-btn-danger' : type === 'success' ? 'custom-alert-btn-success' : 'custom-alert-btn-primary'}`}
              onClick={onConfirm}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    )
  }


  const showAlert = (config) => {
    setAlertConfig({
      show: true,
      type: config.type || 'info',
      title: config.title || 'Alert',
      message: config.message || '',
      details: config.details || [],
      onConfirm: config.onConfirm || (() => closeAlert()),
      onCancel: config.onCancel || (() => closeAlert()),
      confirmText: config.confirmText || 'OK',
      cancelText: config.cancelText || 'Cancel',
      showCancel: config.showCancel || false
    })
  }

  const FERTILIZER_WEIGHT_PER_BAG = 50;



  const fetchSensorData = async (sensorId) => {
  try {
    // Get the main sensor data
    const sensorRef = ref(realtimeDb, sensorId)
    const snapshot = await get(sensorRef)
    
    if (!snapshot.exists()) {
      console.error(`Sensor ${sensorId} not found`)
      return null
    }
    
    const data = snapshot.val()
    
    // Determine sensor number for moisture mapping
    const sensorNumber = sensorId === 'SoilSensor' ? '1' : sensorId.replace('SoilSensor', '')
    
    // Always get moisture data from Moisture node (ignore moisture in sensor readings)
    const moistureRef = ref(realtimeDb, 'Moisture')
    const moistureSnapshot = await get(moistureRef)
    let latestMoistureValue = 0
    
    if (moistureSnapshot.exists()) {
      const moistureData = moistureSnapshot.val()
      const moistureKey = sensorNumber === '1' ? 'Moisture1' : `Moisture${sensorNumber}`
      const moistureNode = moistureData[moistureKey]
      
      if (moistureNode && typeof moistureNode === 'object') {
        // Try different property names for moisture value
        latestMoistureValue = moistureNode.Moisture || moistureNode.moisture || moistureNode.value || 0
      }
    }
    
    let latestReading = null
    let latestTimestamp = new Date(0)
    
    // Process all readings from SoilSensor (matching sensors.jsx pattern)
    Object.keys(data).forEach(readingKey => {
      if (readingKey === 'metadata' || readingKey === 'config' || readingKey === 'location') {
        return
      }
      
      const reading = data[readingKey]
      if (typeof reading !== 'object' || reading === null) {
        return
      }
      
      const timestamp = parseTimestamp(readingKey, reading)
      
      // Use the latest moisture value from Moisture node for all readings
      const moistureValue = latestMoistureValue
      
      const readingData = {
        id: readingKey,
        timestamp,
        nitrogen: reading.Nitrogen || reading.nitrogen || reading.N || 0,
        phosphorus: reading.Phosphorus || reading.phosphorus || reading.P || 0,
        potassium: reading.Potassium || reading.potassium || reading.K || 0,
        ph: reading.pH || reading.ph || 0,
        temperature: reading.Temperature || reading.temperature || reading.temp || 0,
        conductivity: reading.Conductivity || reading.conductivity || 0,
        moisture: moistureValue
      }
      
      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp
        latestReading = { ...readingData }
      }
    })
    
    // Fallback: if no valid timestamped data found, log warning and return null
    if (!latestReading) {
      console.warn(`No valid timestamped readings found for ${sensorId}`)
      return null
    }
    
    // Construct the sensor data object
    const sensorData = {
      nitrogen: latestReading.nitrogen,
      phosphorus: latestReading.phosphorus,
      potassium: latestReading.potassium,
      ph: latestReading.ph,
      moisture: latestReading.moisture,
      temperature: latestReading.temperature,
      conductivity: latestReading.conductivity,
      timestamp: latestReading.id
    }
    
    console.log(`Fetched sensor data for ${sensorId}:`, {
      ...sensorData,
      moistureSource: `Moisture/Moisture${sensorNumber}`,
      timestampUsed: latestReading.id
    })
    
    return sensorData
  } catch (error) {
    console.error(`Error fetching sensor data for ${sensorId}:`, error)
    return null
  }
}
// Add this function near your other helper functions (around line 400)
const calculateNutrientPercentages = (sensorData, plantInfo) => {
  if (!sensorData || !plantInfo || !plantInfo.stages || plantInfo.stages.length === 0) {
    return null
  }
  
  const firstStage = plantInfo.stages[0]
  const percentages = {}
  
  // pH
  if (firstStage.lowpH && firstStage.highpH && sensorData.ph) {
    percentages.ph = calculateSensorPercentage(
      sensorData.ph,
      firstStage.lowpH,
      firstStage.highpH
    )
  }
  
  // Nitrogen
  if (firstStage.lowN && firstStage.highN && sensorData.nitrogen !== undefined) {
    percentages.nitrogen = calculateSensorPercentage(
      sensorData.nitrogen,
      firstStage.lowN,
      firstStage.highN
    )
  }
  
  // Phosphorus
  if (firstStage.lowP && firstStage.highP && sensorData.phosphorus !== undefined) {
    percentages.phosphorus = calculateSensorPercentage(
      sensorData.phosphorus,
      firstStage.lowP,
      firstStage.highP
    )
  }
  
  // Potassium
  if (firstStage.lowK && firstStage.highK && sensorData.potassium !== undefined) {
    percentages.potassium = calculateSensorPercentage(
      sensorData.potassium,
      firstStage.lowK,
      firstStage.highK
    )
  }
  
  // Temperature
  if (firstStage.lowTemp && firstStage.highTemp && sensorData.temperature !== undefined) {
    percentages.temperature = calculateSensorPercentage(
      sensorData.temperature,
      firstStage.lowTemp,
      firstStage.highTemp
    )
  }
  
  // Moisture
  if (firstStage.lowHum && firstStage.highHum && sensorData.moisture !== undefined) {
    percentages.moisture = calculateSensorPercentage(
      sensorData.moisture,
      firstStage.lowHum,
      firstStage.highHum
    )
  }
  
  return percentages
}
  const closeAlert = () => {
    setAlertConfig(prev => ({ ...prev, show: false }))
  }

  // Check if a plot is occupied
  const isPlotOccupied = (plotNumber) => {
    return plants.some(plant => plant.plotNumber === plotNumber.toString())
  }

  // Get available (unoccupied) plots
  const getAvailablePlots = () => {
    return plotOptions.filter(plot => !isPlotOccupied(plot.number.toString()))
  }

  // Calculate survival rate
  const calculateSurvivalRate = (plant) => {
    const recommended = parseInt(plant.recommendedSeedlings) || 0
    const surviving = parseInt(plant.survivingPlants ?? plant.recommendedSeedlings) || 0
    
    if (recommended === 0) return 100
    return Math.round((surviving / recommended) * 100)
  }

  // Get survival rate color
  const getSurvivalRateColor = (rate) => {
    if (rate >= 90) return '#10b981'
    if (rate >= 75) return '#3b82f6'
    if (rate >= 60) return '#f59e0b'
    if (rate >= 40) return '#f97316'
    return '#ef4444'
  }

  // Get survival rate label
  const getSurvivalRateLabel = (rate) => {
    if (rate >= 90) return 'Excellent'
    if (rate >= 75) return 'Good'
    if (rate >= 60) return 'Fair'
    if (rate >= 40) return 'Poor'
    return 'Critical'
  }

  const calculateAge = (plantedDateInput) => {
  if (!plantedDateInput) return 0;
  
  let plantedDate;
  // Handle Firestore Timestamp or String safely
  if (plantedDateInput.toDate) {
    plantedDate = plantedDateInput.toDate();
  } else {
    plantedDate = new Date(plantedDateInput);
  }

  if (isNaN(plantedDate.getTime())) return 0;

  const now = new Date();
  const diffTime = Math.abs(now - plantedDate);
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
};


// Helper to safely format dates from Firestore Timestamps or Strings
const formatDisplayDate = (dateInput) => {
  if (!dateInput) return 'N/A';
  
  try {
    // Check if it's a Firestore Timestamp (has toDate method)
    if (dateInput.toDate && typeof dateInput.toDate === 'function') {
      return dateInput.toDate().toLocaleDateString();
    }
    
    // Handle standard Date object, ISO string, or number
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    return date.toLocaleDateString();
  } catch (error) {
    console.error("Error formatting date:", error);
    return 'Error';
  }
};

  // Calculate sensor data percentage based on ideal range
  // Calculate sensor data percentage based on ideal range (exponential curve)
  const calculateSensorPercentage = (current, low, high) => {
    if (!current || !low || !high) return 0
    
    const mid = (low + high) / 2
    const range = high - low
    
    if (current >= low && current <= high) {
      // Within optimal range: gentle exponential curve that peaks at 100% in the middle
      const distanceFromMid = Math.abs(current - mid)
      const normalizedDistance = distanceFromMid / (range / 2) // 0 to 1
      
      // Gentler exponential decay: e^(-0.5x²)
      // This keeps values within range scoring 85-100%
      const score = 100 * Math.exp(-0.5 * Math.pow(normalizedDistance, 2))
      return Math.max(0, Math.min(100, score))
    }
    
    if (current < low) {
      // Below optimal: exponential penalty
      const deficit = low - current
      const normalizedDeficit = deficit / low // 0 to infinity
      const score = 100 * Math.exp(-1.5 * normalizedDeficit)
      return Math.max(0, score)
    }
    
    // Above optimal: exponential penalty
    const excess = current - high
    const normalizedExcess = excess / high // 0 to infinity
    const score = 100 * Math.exp(-1.5 * normalizedExcess)
    return Math.max(0, score)
  }

  // Get percentage color
  const getPercentageColor = (percentage) => {
    if (percentage >= 80) return '#10b981'
    if (percentage >= 60) return '#3b82f6'
    if (percentage >= 40) return '#f59e0b'
    return '#ef4444'
  }

  // Calculate plot size in square meters from cm dimensions
  const calculatePlotSize = (lengthCm, widthCm) => {
    return (lengthCm * widthCm) / 10000
  }

  // Get display size string
  const getDisplaySize = (lengthCm, widthCm) => {
    return `${lengthCm}x${widthCm}cm`
  }

  // Check sensor status
  const checkSensorStatus = async (sensorId) => {
  try {
    const sensorRef = ref(realtimeDb, sensorId)
    const snapshot = await get(sensorRef)
    
    if (!snapshot.exists()) {
      return { online: false, reason: 'Sensor not found' }
    }
    
    const data = snapshot.val()
    
    let latestTimestamp = null
    Object.keys(data).forEach(key => {
      if (key === 'metadata' || key === 'config' || key === 'location') {
        return
      }
      
      if (key.includes('_') || key.includes('-')) {
        if (!latestTimestamp || key > latestTimestamp) {
          latestTimestamp = key
        }
      }
    })
    
    if (!latestTimestamp) {
      return { online: false, reason: 'No data available' }
    }
    
    const [datePart, timePart] = latestTimestamp.split('_')
    const [year, month, day] = datePart.split('-')
    const [hour, minute, second] = timePart.split(':')
    const lastReadingTime = new Date(year, month - 1, day, hour, minute, second)
    
    const now = new Date()
    const minutesSinceLastReading = (now - lastReadingTime) / (1000 * 60)
    
    if (minutesSinceLastReading <= 5) {
      return { 
        online: true, 
        lastReading: lastReadingTime,
        minutesAgo: Math.floor(minutesSinceLastReading)
      }
    } else {
      return { 
        online: false, 
        reason: 'No recent data',
        lastReading: lastReadingTime,
        minutesAgo: Math.floor(minutesSinceLastReading)
      }
    }
  } catch (error) {
    console.error('Error checking sensor status:', error)
    return { online: false, reason: 'Error checking sensor' }
  }
}

  // Plant ranking system
  const calculatePlantCompatibility = (sensorData, plantInfo) => {
    if (!sensorData || !plantInfo || !plantInfo.stages || plantInfo.stages.length === 0) {
      return 0
    }
    
    const firstStage = plantInfo.stages[0]
    
    let totalScore = 0
    let factors = 0
    
    if (firstStage.lowpH && firstStage.highpH && sensorData.ph) {
      const phMid = (firstStage.lowpH + firstStage.highpH) / 2
      const phRange = firstStage.highpH - firstStage.lowpH
      const phDiff = Math.abs(sensorData.ph - phMid)
      const phScore = Math.max(0, 100 - (phDiff / phRange) * 100)
      totalScore += phScore
      factors++
    }
    
    if (firstStage.lowN && firstStage.highN && sensorData.nitrogen !== undefined) {
      const nMid = (firstStage.lowN + firstStage.highN) / 2
      const nRange = firstStage.highN - firstStage.lowN
      const nDiff = Math.abs(sensorData.nitrogen - nMid)
      const nScore = Math.max(0, 100 - (nDiff / nRange) * 100)
      totalScore += nScore
      factors++
    }
    
    if (firstStage.lowP && firstStage.highP && sensorData.phosphorus !== undefined) {
      const pMid = (firstStage.lowP + firstStage.highP) / 2
      const pRange = firstStage.highP - firstStage.lowP
      const pDiff = Math.abs(sensorData.phosphorus - pMid)
      const pScore = Math.max(0, 100 - (pDiff / pRange) * 100)
      totalScore += pScore
      factors++
    }
    
    if (firstStage.lowK && firstStage.highK && sensorData.potassium !== undefined) {
      const kMid = (firstStage.lowK + firstStage.highK) / 2
      const kRange = firstStage.highK - firstStage.lowK
      const kDiff = Math.abs(sensorData.potassium - kMid)
      const kScore = Math.max(0, 100 - (kDiff / kRange) * 100)
      totalScore += kScore
      factors++
    }
    
    if (firstStage.lowTemp && firstStage.highTemp && sensorData.temperature !== undefined) {
      const tempMid = (firstStage.lowTemp + firstStage.highTemp) / 2
      const tempRange = firstStage.highTemp - firstStage.lowTemp
      const tempDiff = Math.abs(sensorData.temperature - tempMid)
      const tempScore = Math.max(0, 100 - (tempDiff / tempRange) * 100)
      totalScore += tempScore
      factors++
    }
    
    if (firstStage.lowHum && firstStage.highHum && sensorData.moisture !== undefined) {
      const humMid = (firstStage.lowHum + firstStage.highHum) / 2
      const humRange = firstStage.highHum - firstStage.lowHum
      const humDiff = Math.abs(sensorData.moisture - humMid)
      const humScore = Math.max(0, 100 - (humDiff / humRange) * 100)
      totalScore += humScore
      factors++
    }
    
    return factors > 0 ? Math.round(totalScore / factors) : 0
  }

  const getCompatibilityRating = (score) => {
    if (score >= 80) return { text: 'Excellent Match', color: '#10b981', stars: 5 }
    if (score >= 65) return { text: 'Good Match', color: '#3b82f6', stars: 4 }
    if (score >= 50) return { text: 'Fair Match', color: '#f59e0b', stars: 3 }
    if (score >= 35) return { text: 'Poor Match', color: '#f97316', stars: 2 }
    return { text: 'Not Recommended', color: '#ef4444', stars: 1 }
  }

const rankPlantsBySensorData = (sensorData, plantsList) => {
  if (!sensorData || !plantsList) return []
  
  const rankedPlants = Object.entries(plantsList).map(([key, plant]) => {
    const score = calculatePlantCompatibility(sensorData, plant)
    const rating = getCompatibilityRating(score)
    const nutrientPercentages = calculateNutrientPercentages(sensorData, plant) // NEW
    
    return {
      key,
      plant,
      score,
      rating,
      nutrientPercentages // NEW
    }
  })
  
  return rankedPlants.sort((a, b) => b.score - a.score)
}


  
  const fetchAllPlantsWithSeedData = async () => {
  try {
    const plantsCollection = collection(db, 'plants')
    const plantsSnapshot = await getDocs(plantsCollection)
    
    const plantsWithSeedData = await Promise.all(
      plantsSnapshot.docs.map(async (doc) => {
        const plantData = doc.data()
        const seedData = await fetchPlantSeedData(doc.id)
        
        return {
          id: doc.id,
          ...plantData,
          seedData
        }
      })
    )
    
    return plantsWithSeedData
  } catch (error) {
    console.error('Error fetching plants with seed data:', error)
    throw error
  }
}


const fetchRecommendedPriceFromProduction = async (plantId) => {
  try {
    const plantRef = doc(db, 'plants', plantId)
    const plantDoc = await getDoc(plantRef)
    
    if (!plantDoc.exists()) {
      return null
    }
    
    const plantData = plantDoc.data()
    
    // Check if plant has recommended price from production costing
    if (plantData.recommendedPrice) {
      return {
        recommendedPrice: plantData.recommendedPrice,
        profitMargin: plantData.profitMargin || 0,
        sellingPrice: plantData.sellingPrice || plantData.recommendedPrice,
        profitAmount: plantData.profitAmount || 0,
        lastPricingUpdate: plantData.lastPricingUpdate,
        pricingSource: 'production_costing'
      }
    }
    
    // Fallback: Check if there's a production cost record
    const costQuery = query(
      collection(db, 'productionCosts'), 
      where('plantId', '==', plantId)
    )
    const costSnapshot = await getDocs(costQuery)
    
    if (!costSnapshot.empty) {
      const costData = costSnapshot.docs[0].data()
      
      // If cost exists but no recommended price, calculate a basic one (30% margin)
      const totalCost = costData.totalCost || 0
      const recommendedPrice = totalCost * 1.3 // 30% markup
      
      return {
        recommendedPrice: recommendedPrice,
        profitMargin: 30,
        sellingPrice: recommendedPrice,
        profitAmount: totalCost * 0.3,
        totalProductionCost: totalCost,
        costPerUnit: costData.costPerUnit || 0,
        pricingSource: 'calculated_from_cost'
      }
    }
    
    return null
  } catch (error) {
    console.error('Error fetching recommended price from production:', error)
    return null
  }
}




  const fetchPlantSeedData = async (plantId) => {
  try {
    const plantRef = doc(db, 'plants', plantId)
    const plantDoc = await getDoc(plantRef)
    
    if (plantDoc.exists()) {
      const plantData = plantDoc.data()
      
      return {
        plantId: plantId,
        plantName: plantData.plantName,
        plotNumber: plantData.plotNumber,
        
        // Initial seeding data
        initialSeedlings: plantData.recommendedSeedlings || 0,
        plantedDate: plantData.plantedDate,
        
        // Current status
        survivingPlants: plantData.survivingPlants ?? plantData.recommendedSeedlings,
        survivalRate: calculateSurvivalRate(plantData),
        
        // Seed/Seedling details
        seedType: plantData.plantType,
        seedVariety: plantData.scientificName,
        seedSource: plantData.seedSource || 'Not specified',
        seedBatchNumber: plantData.seedBatchNumber || 'N/A',
        seedCost: plantData.seedCost || 0,
        
        // Growth tracking
        germinationRate: plantData.germinationRate || null,
        germinationDate: plantData.germinationDate || null,
        transplantDate: plantData.transplantDate || null,
        
        // Spacing and density
        plantingDensity: plantData.recommendedSeedlings / (parsePlotSizeToM2(plantData.plotSize) || 1),
        spacing: `${plantData.minSpacing} - ${plantData.maxSpacing} cm`,
        
        // Stage information
        currentStage: plantData.status,
        age: plantData.age || 0,
        
        // Historical changes
        plantCountHistory: plantData.plantCountHistory || []
      }
    }
    
    return null
  } catch (error) {
    console.error('Error fetching plant seed data:', error)
    throw error
  }
}

useEffect(() => {
    const updatePlantStages = async () => {
      // Wait until data is fully loaded
      if (loading || plants.length === 0 || Object.keys(plantsList).length === 0) return;

      const updates = [];
      const localUpdates = []; 

      plants.forEach(plant => {
        // Skip already harvested/completed plants to preserve history
        if (plant.status === 'Harvested' || plant.status === 'Completed') return;

        const plantInfo = plantsList[plant.plantType];
        if (!plantInfo) return;

        // Use the FIXED getCurrentStage function
        const calculatedStageInfo = getCurrentStage(plant, plantInfo);
        
        if (calculatedStageInfo) {
          const correctStageName = calculatedStageInfo.stage;
          const correctAge = calculateAge(plant.plantedDate);

          // If the DB status doesn't match the calculated stage, queue an update
          if (plant.status !== correctStageName) {
            console.log(`Auto-correcting ${plant.plantName}: ${plant.status} -> ${correctStageName}`);
            
            // 1. Prepare Firestore Update
            const plantRef = doc(db, 'plants', plant.id);
            const updatePromise = updateDoc(plantRef, {
              status: correctStageName,
              age: correctAge,
              updatedAt: serverTimestamp()
            });
            updates.push(updatePromise);

            // 2. Prepare Local State Update
            localUpdates.push({
              id: plant.id,
              status: correctStageName,
              age: correctAge
            });
          }
        }
      });

      // Execute all updates
      if (updates.length > 0) {
        try {
          await Promise.all(updates);
          
          // 3. Update Local State immediately (Visually fixes the issue instantly)
          setPlantsData(prev => prev.map(p => {
            const update = localUpdates.find(u => u.id === p.id);
            return update ? { ...p, status: update.status, age: update.age } : p;
          }));
          
        } catch (error) {
          console.error("Error auto-updating plant stages:", error);
        }
      }
    };

    updatePlantStages();
  }, [plants.length, plantsList, loading]);

const updatePlantSeedCount = async (plantId, newCount, reason = '') => {
  try {
    const plantRef = doc(db, 'plants', plantId)
    const plantDoc = await getDoc(plantRef)
    
    if (!plantDoc.exists()) {
      throw new Error('Plant not found')
    }
    
    const plantData = plantDoc.data()
    const previousCount = plantData.survivingPlants ?? plantData.recommendedSeedlings
    const change = newCount - previousCount
    
    // Create history entry
    const historyEntry = {
      date: new Date().toISOString(),
      previousCount,
      newCount,
      change,
      reason,
      recordedBy: userId
    }
    
    // Update plant document
    await updateDoc(plantRef, {
      survivingPlants: newCount,
      plantCountHistory: [...(plantData.plantCountHistory || []), historyEntry],
      lastCountUpdate: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    
    // Create event
    await addDoc(collection(db, 'events'), {
      plantId: plantId,
      type: 'PLANT_COUNT_UPDATE',
      status: change < 0 ? 'warning' : 'info',
      message: `Plant count ${change >= 0 ? 'increased' : 'decreased'}: ${previousCount} → ${newCount} (${change >= 0 ? '+' : ''}${change})`,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
      userId: userId,
      details: {
        previousCount,
        newCount,
        change,
        reason,
        survivalRate: ((newCount / plantData.recommendedSeedlings) * 100).toFixed(1) + '%'
      }
    })
    
    return historyEntry
  } catch (error) {
    console.error('Error updating plant seed count:', error)
    throw error
  }
}

const getSeedInventorySummary = async () => {
  try {
    const plantsSnapshot = await getDocs(collection(db, 'plants'))
    
    const summary = {
      totalPlots: 0,
      totalSeedlingsPlanted: 0,
      totalSurvivingPlants: 0,
      averageSurvivalRate: 0,
      byPlantType: {},
      byStage: {},
      recentChanges: []
    }
    
    const plants = []
    
    plantsSnapshot.forEach(doc => {
      const plant = { id: doc.id, ...doc.data() }
      plants.push(plant)
      
      summary.totalPlots++
      summary.totalSeedlingsPlanted += plant.recommendedSeedlings || 0
      summary.totalSurvivingPlants += plant.survivingPlants ?? plant.recommendedSeedlings
      
      // By plant type
      const plantType = plant.plantType || 'Unknown'
      if (!summary.byPlantType[plantType]) {
        summary.byPlantType[plantType] = {
          count: 0,
          seedlings: 0,
          surviving: 0,
          survivalRate: 0
        }
      }
      summary.byPlantType[plantType].count++
      summary.byPlantType[plantType].seedlings += plant.recommendedSeedlings || 0
      summary.byPlantType[plantType].surviving += plant.survivingPlants ?? plant.recommendedSeedlings
      
      // By stage
      const stage = plant.status || 'Unknown'
      if (!summary.byStage[stage]) {
        summary.byStage[stage] = {
          count: 0,
          seedlings: 0,
          surviving: 0
        }
      }
      summary.byStage[stage].count++
      summary.byStage[stage].seedlings += plant.recommendedSeedlings || 0
      summary.byStage[stage].surviving += plant.survivingPlants ?? plant.recommendedSeedlings
    })
    
    // Calculate average survival rate
    summary.averageSurvivalRate = summary.totalSeedlingsPlanted > 0
      ? ((summary.totalSurvivingPlants / summary.totalSeedlingsPlanted) * 100).toFixed(1)
      : 0
    
    // Calculate survival rates by plant type
    Object.keys(summary.byPlantType).forEach(type => {
      const data = summary.byPlantType[type]
      data.survivalRate = data.seedlings > 0
        ? ((data.surviving / data.seedlings) * 100).toFixed(1)
        : 0
    })
    
    return summary
  } catch (error) {
    console.error('Error getting seed inventory summary:', error)
    throw error
  }
}

const recordGermination = async (plantId, germinationRate, germinationDate = new Date()) => {
  try {
    const plantRef = doc(db, 'plants', plantId)
    
    await updateDoc(plantRef, {
      germinationRate: germinationRate,
      germinationDate: germinationDate.toISOString(),
      updatedAt: serverTimestamp()
    })
    
    await addDoc(collection(db, 'events'), {
      plantId: plantId,
      type: 'GERMINATION_RECORDED',
      status: 'success',
      message: `Germination recorded: ${germinationRate}% germination rate`,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
      userId: userId,
      details: {
        germinationRate: `${germinationRate}%`,
        germinationDate: germinationDate.toLocaleDateString()
      }
    })
    
    return true
  } catch (error) {
    console.error('Error recording germination:', error)
    throw error
  }
}

const recordTransplant = async (plantId, survivingCount, transplantDate = new Date()) => {
  try {
    const plantRef = doc(db, 'plants', plantId)
    const plantDoc = await getDoc(plantRef)
    
    if (!plantDoc.exists()) {
      throw new Error('Plant not found')
    }
    
    const plantData = plantDoc.data()
    const previousCount = plantData.survivingPlants ?? plantData.recommendedSeedlings
    
    await updateDoc(plantRef, {
      survivingPlants: survivingCount,
      transplantDate: transplantDate.toISOString(),
      updatedAt: serverTimestamp()
    })
    
    await addDoc(collection(db, 'events'), {
      plantId: plantId,
      type: 'TRANSPLANT_RECORDED',
      status: 'info',
      message: `Transplanted: ${survivingCount} seedlings survived transplanting`,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
      userId: userId,
      details: {
        beforeTransplant: previousCount,
        afterTransplant: survivingCount,
        transplantLoss: previousCount - survivingCount,
        transplantDate: transplantDate.toLocaleDateString(),
        survivalRate: ((survivingCount / plantData.recommendedSeedlings) * 100).toFixed(1) + '%'
      }
    })
    
    return true
  } catch (error) {
    console.error('Error recording transplant:', error)
    throw error
  }
}

const exportSeedDataToCSV = async () => {
  try {
    const plants = await fetchAllPlantsWithSeedData()
    
    const headers = [
      'Plant Name',
      'Plot Number',
      'Plant Type',
      'Planted Date',
      'Initial Seedlings',
      'Surviving Plants',
      'Survival Rate (%)',
      'Current Stage',
      'Age (days)',
      'Seed Source',
      'Batch Number',
      'Germination Rate (%)',
      'Germination Date',
      'Transplant Date'
    ]
    
    const rows = plants.map(plant => [
      plant.plantName || '',
      plant.plotNumber || '',
      plant.plantType || '',
      plant.plantedDate ? new Date(plant.plantedDate).toLocaleDateString() : '',
      plant.recommendedSeedlings || 0,
      plant.survivingPlants ?? plant.recommendedSeedlings,
      plant.seedData?.survivalRate || 0,
      plant.status || '',
      plant.age || 0,
      plant.seedSource || '',
      plant.seedBatchNumber || '',
      plant.germinationRate || '',
      plant.germinationDate ? new Date(plant.germinationDate).toLocaleDateString() : '',
      plant.transplantDate ? new Date(plant.transplantDate).toLocaleDateString() : ''
    ])
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `seed_inventory_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
    
    return true
  } catch (error) {
    console.error('Error exporting seed data:', error)
    throw error
  }
}



  // Fetch plantsList from Firebase
  useEffect(() => {
    const fetchPlantsList = async () => {
      try {
        const plantsListCollection = collection(db, 'plantsList')
        const plantsListSnapshot = await getDocs(plantsListCollection)
        const plantsListData = {}
        
        plantsListSnapshot.docs.forEach(doc => {
          plantsListData[doc.id] = doc.data()
        })
        
        setPlantsList(plantsListData)
      } catch (error) {
        console.error('Error fetching plantsList:', error)
      }
    }

    fetchPlantsList()
  }, [])

  // Fetch available soil sensors from Firebase Realtime Database
  useEffect(() => {
    const fetchSensors = async () => {
      try {
        const rootRef = ref(realtimeDb, '/')
        const snapshot = await get(rootRef)
        
        if (snapshot.exists()) {
          const allData = snapshot.val()
          const sensorsList = []
          
          Object.keys(allData).forEach(key => {
            if (key.startsWith('SoilSensor')) {
              sensorsList.push({
                id: key,
                name: key.replace('SoilSensor', 'Soil Sensor '),
                data: allData[key]
              })
            }
          })
          
          setAvailableSensors(sensorsList)
        }
      } catch (error) {
        console.error('Error fetching sensors:', error)
      }
    }

    fetchSensors()
  }, [])

// Fetch plants data from Firestore
useEffect(() => {
  const fetchPlants = async () => {
    try {
      const plantsCollection = collection(db, 'plants')
      const plantsSnapshot = await getDocs(plantsCollection)
      const plantsData = plantsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setPlantsData(plantsData)
      setLoading(false)
    } catch (error) {
      console.error('Error fetching plants:', error)
      setLoading(false)
    }
  }

  fetchPlants()
}, [])

// Parse timestamp from various formats (matches sensors.jsx)
const parseTimestamp = (timestampStr, reading) => {
  // Try to get timestamp from reading object first
  if (reading.timestamp) {
    return new Date(reading.timestamp)
  }
  
  // Parse from key format: 2025-10-01_00:16:36
  const dateTimeMatch = timestampStr.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2}):(\d{2}):(\d{2})/)
  if (dateTimeMatch) {
    const [, year, month, day, hour, minute, second] = dateTimeMatch
    return new Date(year, month - 1, day, hour, minute, second)
  }
  
  // Fallback: try direct Date parsing
  return new Date(timestampStr)
}

const fetchFertilizerRecommendations = async (plant, sensorData) => {
  try {
    if (!plant || !plant.plantType || !plant.status || !sensorData) {
      console.error('Missing required data for fertilizer recommendations')
      return null
    }

    const plantType = plant.plantType
    const stageName = plant.status
    
    const plantInfo = plantsList[plantType]
    if (!plantInfo || !plantInfo.stages) {
      console.error('No plant info or stages found for:', plantType)
      return null
    }
    
    const currentStage = plantInfo.stages.find(s => s.stage === stageName)
    if (!currentStage) {
      console.error('Stage not found in plantInfo:', stageName)
      return null
    }
    
    // Fetch fertilizer recommendations from Firebase
    const fertilizerDocRef = doc(db, 'fertilizerRecommendations', plantType)
    const fertilizerDoc = await getDoc(fertilizerDocRef)
    
    if (!fertilizerDoc.exists()) {
      console.log(`No fertilizer recommendations found for plant type: "${plantType}"`)
      return null
    }
    
    const plantData = fertilizerDoc.data()
    const scenarios = plantData.scenarios || []
    
    if (scenarios.length === 0) {
      console.log(`No scenarios found for plant: ${plantType}`)
      return null
    }
    
    // Determine current nutrient conditions
    const nCondition = getNutrientCondition(
      sensorData.nitrogen || 0,
      currentStage.lowN,
      currentStage.highN
    )
    const pCondition = getNutrientCondition(
      sensorData.phosphorus || 0,
      currentStage.lowP,
      currentStage.highP
    )
    const kCondition = getNutrientCondition(
      sensorData.potassium || 0,
      currentStage.lowK,
      currentStage.highK
    )
    
    const currentCondition = `${nCondition} N, ${pCondition} P, ${kCondition} K`
    
    // Try to find exact match first
    let matchedScenario = scenarios.find(scenario => 
      scenario.condition === currentCondition
    )
    
    // Fallback matching logic if exact match not found
    if (!matchedScenario) {
      // Try matching by Nitrogen condition
      if (nCondition === 'Low' || nCondition === 'High') {
        matchedScenario = scenarios.find(scenario => 
          scenario.condition && scenario.condition.includes(`${nCondition} N`)
        )
      }
      
      // Try matching by Phosphorus condition
      if (!matchedScenario && (pCondition === 'Low' || pCondition === 'High')) {
        matchedScenario = scenarios.find(scenario => 
          scenario.condition && scenario.condition.includes(`${pCondition} P`)
        )
      };
      
      // Try matching by Potassium condition
      if (!matchedScenario && (kCondition === 'Low' || kCondition === 'High')) {
        matchedScenario = scenarios.find(scenario => 
          scenario.condition && scenario.condition.includes(`${kCondition} K`)
        )
      };
      
      // Try matching all Normal condition
      if (!matchedScenario && nCondition === 'Normal' && pCondition === 'Normal' && kCondition === 'Normal') {
        matchedScenario = scenarios.find(scenario => 
          scenario.condition && scenario.condition.includes('Normal N, Normal P, Normal K')
        )
      };
      
      // Last resort: use first scenario as default
      if (!matchedScenario && scenarios.length > 0) {
        matchedScenario = scenarios[0]
      }
    }
    
    return {
      plantType,
      plantName: plantData.plantName,
      stage: stageName,
      currentCondition,
      nCondition,
      pCondition,
      kCondition,
      matchedScenario,
      allScenarios: scenarios,
      isExactMatch: matchedScenario?.condition === currentCondition
    }
    
  } catch (error) {
    console.error('Error fetching fertilizer recommendations:', error)
    return null
  }
}

// Helper function to determine nutrient condition
const getNutrientCondition = (currentValue, lowThreshold, highThreshold) => {
  if (currentValue < lowThreshold) return 'Low'
  if (currentValue > highThreshold) return 'High'
  return 'Normal'
}

  // Fetch events for a specific plant
const fetchPlantEvents = async (plantId) => {
  try {
    // Fetch events
    const eventsCollection = collection(db, 'events')
    const eventsQuery = query(eventsCollection, where('plantId', '==', plantId))
    const eventsSnapshot = await getDocs(eventsQuery)
    const events = eventsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      isEvent: true  // Mark as event
    }))
    
    // Fetch job orders
    const jobOrdersCollection = collection(db, 'jobOrders')
    const jobOrdersQuery = query(jobOrdersCollection, where('plantId', '==', plantId))
    const jobOrdersSnapshot = await getDocs(jobOrdersQuery)
    const jobOrders = jobOrdersSnapshot.docs.map(doc => ({
      id: `joborder-${doc.id}`,  // ✅ Add prefix for consistency
      jobOrderId: doc.id,         // ✅ Keep original ID
      ...doc.data(),
      isJobOrder: true,
      type: 'FERTILIZER_JOB_ORDER'
    }))
    
    // Merge and sort by timestamp/scheduledDate
    const combined = [...events, ...jobOrders]
    combined.sort((a, b) => {
      const timeA = a.scheduledDate ? new Date(a.scheduledDate) : 
                    a.timestamp?.toDate?.() || new Date(a.timestamp)
      const timeB = b.scheduledDate ? new Date(b.scheduledDate) : 
                    b.timestamp?.toDate?.() || new Date(b.timestamp)
      return timeA - timeB
    })
    
    setPlantEvents(combined)
  } catch (error) {
    console.error('Error fetching plant events:', error)
    setPlantEvents([])
  }
}

const getCurrentStage = (plantData, plantInfo) => {
  // 1. Prioritize the plant's own saved stages, fall back to global info
  const stages = plantData.stages || plantInfo?.stages;

  if (!plantData.plantedDate || !stages || stages.length === 0) return null;

  // 2. Use the helper to get exact age
  const daysSincePlanted = calculateAge(plantData.plantedDate);

  // Default to first stage if just planted
  if (daysSincePlanted <= 0) {
    return stages[0];
  }

  // 3. Find the matching stage
  for (let stage of stages) {
    if (daysSincePlanted >= stage.startDuration && daysSincePlanted <= stage.endDuration) {
      return stage;
    }
  }

  // 4. Only return 'Harvest' (last stage) if we have actually passed the end date
  const lastStage = stages[stages.length - 1];
  if (daysSincePlanted > lastStage.endDuration) {
     return lastStage;
  }
  
  // If we are in a 'gap' (rare), return null instead of defaulting to Harvest
  return null; 
};


  // Calculate recommended seedlings based on spacing
  const calculateRecommendedSeedlings = (plantKey, plotSizeM2) => {
    const plantInfo = plantsList[plantKey]
    if (!plantInfo) return 0
    
    const minSpacing = parseFloat(plantInfo.minSpacingCM) || 20
    const maxSpacing = parseFloat(plantInfo.maxSpacingCM) || 25
    const avgSpacing = (minSpacing + maxSpacing) / 2
    
    const plotSizeCm2 = plotSizeM2 * 10000
    const spacingCm2 = avgSpacing * avgSpacing
    
    return Math.floor(plotSizeCm2 / spacingCm2)
  }

  // Fetch soil sensor data when sensor is selected

  const handleOpenEditModal = (plant) => {
    setSelectedPlant(plant)
    setEditFormData({
      locationZone: plant.locationZone || '',
      status: plant.status || '',
      age: (plant.age || 0).toString(),
      currentSellingPrice: plant.currentSellingPrice || '',
      unit: plant.unit || '',
      survivingPlants: (plant.survivingPlants ?? plant.recommendedSeedlings)?.toString() || ''
    })
    setShowEditModal(true)
  }

  const handleCloseEditModal = () => {
    setShowEditModal(false)
    setSelectedPlant(null)
  }

  const handleEditInputChange = (e) => {
    const { name, value } = e.target
    setEditFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSaveEdit = async () => {
    try {
      if (selectedPlant) {
        const survivingPlants = parseInt(editFormData.survivingPlants)
        const recommendedSeedlings = parseInt(selectedPlant.recommendedSeedlings)
        
        if (survivingPlants > recommendedSeedlings) {
          showAlert({
            type: 'warning',
            title: 'Invalid Number',
            message: 'Surviving plants cannot exceed the initial number of seedlings planted.',
            details: [
              { label: 'Initial Seedlings', value: recommendedSeedlings.toString() },
              { label: 'You entered', value: survivingPlants.toString() }
            ],
            confirmText: 'OK'
          })
          return
        }

        if (survivingPlants < 0) {
          showAlert({
            type: 'warning',
            title: 'Invalid Number',
            message: 'Surviving plants cannot be negative.',
            confirmText: 'OK'
          })
          return
        }

        // Calculate new stage if age changed
        const newAge = parseInt(editFormData.age || selectedPlant.age || 0)
        const plantInfo = plantsList[selectedPlant.plantType]
        let newStage = editFormData.status
        
        if (newAge !== selectedPlant.age && plantInfo?.stages) {
          const calculatedStage = getStageFromAge(newAge, plantInfo.stages)
          if (calculatedStage) {
            newStage = calculatedStage
          }
        }

        const plantRef = doc(db, 'plants', selectedPlant.id)
        const updateData = {
          locationZone: editFormData.locationZone,
          status: newStage,
          age: newAge,
          currentSellingPrice: editFormData.currentSellingPrice,
          unit: editFormData.unit,
          survivingPlants: survivingPlants,
          updatedAt: serverTimestamp()
        }

        // Track changes for event logging
        const changes = []
        
        if (selectedPlant.survivingPlants !== survivingPlants) {
          const previousCount = selectedPlant.survivingPlants ?? selectedPlant.recommendedSeedlings
          const difference = survivingPlants - previousCount
          changes.push(`Plant count: ${previousCount} → ${survivingPlants} (${difference >= 0 ? '+' : ''}${difference})`)
        }
        
        if (selectedPlant.age !== newAge) {
          changes.push(`Age: ${selectedPlant.age || 0} → ${newAge} days`)
        }
        
        if (selectedPlant.status !== newStage) {
          changes.push(`Stage: ${selectedPlant.status} → ${newStage}`)
        }

        await updateDoc(plantRef, updateData)

        // Create event if there are changes
        if (changes.length > 0) {
          const survivalRate = calculateSurvivalRate({ 
            ...selectedPlant, 
            survivingPlants 
          })

          await addDoc(collection(db, 'events'), {
            plantId: selectedPlant.id,
            type: 'PLANT_UPDATE',
            status: 'info',
            message: `Plant updated: ${changes.join(', ')}`,
            timestamp: serverTimestamp(),
            createdAt: serverTimestamp(),
            userId: userId,
            details: {
              changes,
              survivalRate: `${survivalRate}%`,
              survivalRating: getSurvivalRateLabel(survivalRate)
            }
          })
        }
        
        setPlantsData(prev =>
          prev.map(plant =>
            plant.id === selectedPlant.id
              ? { ...plant, ...updateData }
              : plant
          )
        )
        
        showAlert({
          type: 'success',
          title: 'Plant Updated',
          message: 'Plant information has been successfully updated.',
          details: changes.map((change, i) => ({ label: `Change ${i + 1}`, value: change })),
          confirmText: 'OK'
        })
        
        handleCloseEditModal()
      }
    } catch (error) {
      console.error('Error updating plant:', error)
      showAlert({
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update plant information.',
        details: [{ label: 'Error', value: error.message }],
        confirmText: 'OK'
      })
    }
  }

const getStageFromAge = (plantAge, stages) => {
  if (!stages || stages.length === 0) return null

  if (plantAge === 0) {
    return stages[0].stage
  }
  
  for (const stage of stages) {
    if (plantAge >= stage.startDuration && plantAge <= stage.endDuration) {
      return stage.stage
    }
  }
  
  // If age exceeds all stages, return last stage
  return stages[stages.length - 1].stage
}

  const handleOpenAddPlotModal = () => {
    const availablePlots = getAvailablePlots()
    
    if (availablePlots.length === 0) {
      showAlert({
        type: 'warning',
        title: 'All Plots Occupied',
        message: 'All plots are currently occupied. Please harvest or remove existing plants before adding new ones.',
        details: [
          { label: 'Total Plots', value: plotOptions.length.toString() },
          { label: 'Available Plots', value: '0' },
          { label: 'Occupied Plots', value: plotOptions.length.toString() }
        ],
        confirmText: 'Got it'
      })
      return
    }

    setShowAddPlotModal(true)
    setPlotStep('input')
    setSelectedPlotNumber('')
    setSelectedSoilSensor('')
    setSelectedPlantType('')
    setPlantAge(0) // Add this line
    setCustomPlotSize({ length: 30, width: 20 })
    setSensorData(null)
    setScanProgress(0)
    setSensorStatus(null)
    setRankedPlants([])
    setIsSubmitting(false)
  }

  const handleCloseAddPlotModal = () => {
    setShowAddPlotModal(false)
    setPlotStep('input')
    setSelectedPlotNumber('')
    setSelectedSoilSensor('')
    setSelectedPlantType('')
    setCustomPlotSize({ length: 30, width: 20 })
    setSensorData(null)
    setSensorStatus(null)
    setRankedPlants([])
    setIsSubmitting(false)
  }

  const handlePlotSelect = (plotNum) => {
    if (isPlotOccupied(plotNum)) {
      showAlert({
        type: 'warning',
        title: 'Plot Already Occupied',
        message: `Plot ${plotNum} is already occupied. Please select another available plot.`,
        confirmText: 'Choose Another'
      })
      return
    }
    setSelectedPlotNumber(plotNum)
  }

  const handleSensorSelect = async (sensorId) => {
    setSelectedSoilSensor(sensorId)
    setLoadingSensorStatus(true)
    setSensorStatus(null)
    setRankedPlants([])
    setSelectedPlantType('')
    
    if (!sensorId) {
      setLoadingSensorStatus(false)
      return
    }
    
    const status = await checkSensorStatus(sensorId)
    setSensorStatus(status)
    setLoadingSensorStatus(false)
    
    if (!status.online) {
      showAlert({
        type: 'error',
        title: 'Sensor Offline',
        message: `Sensor ${sensorId} is currently offline and cannot be used.`,
        details: [
          { label: 'Reason', value: status.reason },
          ...(status.lastReading ? [{ label: 'Last reading', value: `${status.minutesAgo} minutes ago` }] : [])
        ],
        confirmText: 'Choose Another Sensor',
        onConfirm: () => {
          setSelectedSoilSensor('')
          closeAlert()
        }
      })
      return
    }
    
    const data = await fetchSensorData(sensorId)
    if (data) {
      setSensorData(data)
      const ranked = rankPlantsBySensorData(data, plantsList)
      setRankedPlants(ranked)
    }
  }

  const handlePlantTypeSelect = (plantKey) => {
    setSelectedPlantType(plantKey)
    const plotSizeM2 = calculatePlotSize(customPlotSize.length, customPlotSize.width)
    const seedlings = calculateRecommendedSeedlings(plantKey, plotSizeM2)
    setRecommendedSeedlings(seedlings)
  }

  const handlePlotSizeChange = (dimension, value) => {
    const numValue = parseInt(value) || 0
    const newSize = {
      ...customPlotSize,
      [dimension]: numValue
    }
    setCustomPlotSize(newSize)
    
    if (selectedPlantType) {
      const plotSizeM2 = calculatePlotSize(newSize.length, newSize.width)
      const seedlings = calculateRecommendedSeedlings(selectedPlantType, plotSizeM2)
      setRecommendedSeedlings(seedlings)
    }
  }

  const handleStartScan = async () => {
    if (!selectedPlotNumber || !selectedSoilSensor || !selectedPlantType) {
      showAlert({
        type: 'warning',
        title: 'Missing Information',
        message: 'Please complete all selections before starting the soil scan.',
        details: [
          { label: 'Plot Number', value: selectedPlotNumber || 'Not selected' },
          { label: 'Soil Sensor', value: selectedSoilSensor || 'Not selected' },
          { label: 'Plant Type', value: selectedPlantType ? plantsList[selectedPlantType]?.name : 'Not selected' }
        ],
        confirmText: 'Got it'
      })
      return
    }

    if (isPlotOccupied(selectedPlotNumber)) {
      showAlert({
        type: 'error',
        title: 'Plot Already Occupied',
        message: `Plot ${selectedPlotNumber} is already occupied. Please select another available plot.`,
        confirmText: 'Choose Another Plot',
        onConfirm: () => {
          setPlotStep('input')
          setSelectedPlotNumber('')
          closeAlert()
        }
      })
      return
    }

    setLoadingSensorStatus(true)
    const status = await checkSensorStatus(selectedSoilSensor)
    setLoadingSensorStatus(false)
    
    if (!status.online) {
      showAlert({
        type: 'error',
        title: 'Sensor Went Offline',
        message: `Sensor ${selectedSoilSensor} went offline during the process.`,
        details: [
          { label: 'Reason', value: status.reason }
        ],
        confirmText: 'Back to Selection',
        onConfirm: () => {
          setPlotStep('input')
          closeAlert()
        }
      })
      return
    }

    setPlotStep('scanning')
    setScanProgress(0)

    const data = await fetchSensorData(selectedSoilSensor)
    
    if (!data) {
      showAlert({
        type: 'error',
        title: 'Failed to Fetch Sensor Data',
        message: 'Unable to retrieve data from the sensor. The sensor may have gone offline.',
        confirmText: 'Try Again',
        onConfirm: () => {
          setPlotStep('input')
          closeAlert()
        }
      })
      return
    }

    setSensorData(data)

    for (let i = 0; i <= 100; i += 5) {
      await new Promise(resolve => setTimeout(resolve, 100))
      setScanProgress(i)
    }

    setPlotStep('confirm')
  }

const handleConfirmPlanting = async () => {
  if (isSubmitting) {
    return
  }

  try {
    setIsSubmitting(true)

    if (!userId || userId === 'default-user') {
      showAlert({
        type: 'error',
        title: 'Authentication Required',
        message: 'You must be logged in to add plants.',
        confirmText: 'OK'
      })
      setIsSubmitting(false)
      return
    }

    if (isPlotOccupied(selectedPlotNumber)) {
      showAlert({
        type: 'error',
        title: 'Plot Already Occupied',
        message: `Plot ${selectedPlotNumber} is already occupied. Cannot add plant.`,
        confirmText: 'OK',
        onConfirm: () => {
          handleCloseAddPlotModal()
          closeAlert()
        }
      })
      setIsSubmitting(false)
      return
    }

    const plotSizeM2 = calculatePlotSize(customPlotSize.length, customPlotSize.width)
    const displaySize = getDisplaySize(customPlotSize.length, customPlotSize.width)
    const plantInfo = plantsList[selectedPlantType]

    if (!plantInfo) {
      showAlert({
        type: 'error',
        title: 'Plant Information Not Found',
        message: 'Unable to find information for the selected plant.',
        confirmText: 'OK'
      })
      setIsSubmitting(false)
      return
    }

    if (plantInfo.stages && plantInfo.stages.length > 0) {
      const plantedDate = new Date(currentDate.getTime() - (plantAge * 24 * 60 * 60 * 1000))
      
      for (const stage of plantInfo.stages) {
        // Calculate the date for this stage
        const stageMidpoint = (stage.startDuration + stage.endDuration) / 2
        const stageDate = new Date(plantedDate.getTime() + (stageMidpoint * 24 * 60 * 60 * 1000))
        
        // Determine event status
        let eventStatus = 'scheduled'
        let eventMessage = `Scheduled to reach ${stage.stage} stage`
        
        if (plantAge >= stage.startDuration && plantAge <= stage.endDuration) {
          // Current stage
          eventStatus = 'info'
          eventMessage = `Currently in ${stage.stage} stage`
        } else if (plantAge > stage.endDuration) {
          // Past stage
          eventStatus = 'completed'
          eventMessage = `Completed ${stage.stage} stage`
        }
        
        await addDoc(collection(db, 'events'), {
          plantId: docRef.id,
          type: 'LIFECYCLE_STAGE',
          status: eventStatus,
          message: eventMessage,
          timestamp: Timestamp.fromDate(stageDate),
          createdAt: serverTimestamp(),
          userId: userId,
          details: {
            stage: stage.stage,
            startDay: stage.startDuration,
            endDay: stage.endDuration,
            duration: `${stage.endDuration - stage.startDuration + 1} days`,
            notes: stage.notes,
            watering: stage.watering,
            scheduledDate: stageDate.toLocaleDateString(),
            requirements: {
              nitrogen: `${stage.lowN} - ${stage.highN} ppm`,
              phosphorus: `${stage.lowP} - ${stage.highP} ppm`,
              potassium: `${stage.lowK} - ${stage.highK} ppm`,
              ph: `${stage.lowpH} - ${stage.highpH}`,
              temperature: `${stage.lowTemp} - ${stage.highTemp}°C`,
              moisture: `${stage.lowHum} - ${stage.highHum}%`
            }
          }
        })
      }
    }

    await addDoc(collection(db, 'events'), {
      plantId: docRef.id,
      type: 'PLANTING',
      status: 'success',
      message: `Plant added: ${plantInfo.name} planted in Plot ${selectedPlotNumber}`,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
      userId: userId,
      details: {
        plantType: plantInfo.name,
        plotNumber: selectedPlotNumber,
        plotSize: displaySize,
        seedlingsPlanted: recommendedSeedlings,
        plantedDate: plantedDate.toLocaleDateString(),
        expectedHarvest: expectedHarvestDate.toLocaleDateString(),
        age: plantAge,
        currentStage: currentStage
      }
    })

    // NEW: Fetch seed inventory to check availability
    const inventorySnapshot = await getDocs(collection(db, 'inventory'))
    const inventoryItems = inventorySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    // Find matching seed in inventory (match by plant name)
    const seedName = `${plantInfo.name} Seeds`
    const matchingSeed = inventoryItems.find(item => 
      item.category?.toLowerCase() === 'seed' && 
      item.name.toLowerCase().includes(plantInfo.name.toLowerCase())
    )

    if (!matchingSeed) {
      showAlert({
        type: 'warning',
        title: 'Seeds Not Found in Inventory',
        message: `No seeds found for ${plantInfo.name} in your inventory. Please add seeds to inventory first.`,
        details: [
          { label: 'Plant Type', value: plantInfo.name },
          { label: 'Looking for', value: seedName }
        ],
        confirmText: 'OK'
      })
      setIsSubmitting(false)
      return
    }

    // Check if we have enough seeds (packs or stock)
    const availableSeeds = matchingSeed.packs !== undefined ? matchingSeed.packs : matchingSeed.stock
    const seedsPerPack = matchingSeed.seedsPerPack || 1
    const totalSeedsAvailable = availableSeeds * seedsPerPack
    const seedsNeeded = recommendedSeedlings

    if (totalSeedsAvailable < seedsNeeded) {
      showAlert({
        type: 'error',
        title: 'Insufficient Seeds',
        message: `Not enough seeds in inventory to plant ${seedsNeeded} seedlings.`,
        details: [
          { label: 'Seeds Available', value: `${totalSeedsAvailable} seeds (${availableSeeds} packs × ${seedsPerPack} seeds/pack)` },
          { label: 'Seeds Needed', value: `${seedsNeeded} seeds` },
          { label: 'Shortage', value: `${seedsNeeded - totalSeedsAvailable} seeds` }
        ],
        confirmText: 'OK'
      })
      setIsSubmitting(false)
      return
    }

    // Calculate how many packs to deduct
    const packsToDeduct = Math.ceil(seedsNeeded / seedsPerPack)
    const newPackCount = availableSeeds - packsToDeduct
    // Calculate dates
    const currentDate = new Date()
    const plantedDate = new Date(currentDate.getTime() - (plantAge * 24 * 60 * 60 * 1000))
    
    const daysToHarvest = parseInt(plantInfo.daysToHarvest) || 30
    const remainingDaysToHarvest = Math.max(0, daysToHarvest - plantAge)
    const expectedHarvestDate = new Date(currentDate.getTime() + remainingDaysToHarvest * 24 * 60 * 60 * 1000)

    // Determine current stage based on age
    const currentStage = getStageFromAge(plantAge, plantInfo.stages) || 'Germination'

    const formattedDate = plantedDate.toISOString().split('T')[0]
    const generatedPlantName = `${plantInfo.name} - Plot ${selectedPlotNumber} - ${formattedDate}`

    const newPlant = {
      plotNumber: selectedPlotNumber,
      plotSize: displaySize,
      soilSensor: selectedSoilSensor,
      plantType: selectedPlantType,
      plantName: generatedPlantName,
      scientificName: plantInfo.sName || '',
      recommendedSeedlings,
      survivingPlants: recommendedSeedlings,
      locationZone: 'Nursery 1',
      status: currentStage,
      age: plantAge,
      plantedDate: plantedDate.toISOString(),
      expectedHarvestDate: expectedHarvestDate.toISOString(),
      daysToHarvest: daysToHarvest,
      sensorData: sensorData,
      currentSellingPrice: plantInfo.pricing || '',
      unit: plantInfo.pricingUnit || 'per kilo',
      minSpacing: plantInfo.minSpacingCM || '20',
      maxSpacing: plantInfo.maxSpacingCM || '25',
      description: plantInfo.description || '',
      stages: plantInfo.stages || [],
      // NEW: Track seed usage
      seedInventoryId: matchingSeed.id,
      seedsUsed: seedsNeeded,
      packsUsed: packsToDeduct,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      userId: userId
    }

    // Add plant to database
    const docRef = await addDoc(collection(db, 'plants'), newPlant)
    
    // NEW: Update inventory - deduct seeds
    const inventoryRef = doc(db, 'inventory', matchingSeed.id)
    await updateDoc(inventoryRef, {
      packs: newPackCount,
      stock: newPackCount, // Keep stock in sync with packs
      updatedAt: serverTimestamp(),
      lastUsed: serverTimestamp()
    })

    await inventoryLogger.logSeedUsage(
      matchingSeed.id,
      {
        previousPacks: availableSeeds,
        newPacks: newPackCount,
        packsUsed: packsToDeduct,
        seedsUsed: seedsNeeded,
        seedsPerPack: seedsPerPack,
        itemName: matchingSeed.name,
        category: matchingSeed.category || 'Seed',
        plantId: docRef.id,
        plantName: generatedPlantName,
        plotNumber: selectedPlotNumber
      },
      userId,
      userName
    )

    // Create initial stage event
    await addDoc(collection(db, 'events'), {
      plantId: docRef.id,
      type: 'LIFECYCLE_STAGE',
      status: 'info',
      message: `Plant added at ${currentStage} stage (Day ${plantAge}) - ${plantInfo.name}`,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
      userId: userId,
      details: {
        age: plantAge,
        stage: currentStage,
        plantedDate: plantedDate.toLocaleDateString(),
        seedsUsed: seedsNeeded,
        packsUsed: packsToDeduct
      }
    })

    // NEW: Create inventory usage event
    await addDoc(collection(db, 'events'), {
      plantId: docRef.id,
      type: 'INVENTORY_USAGE',
      status: 'info',
      message: `Used ${packsToDeduct} pack(s) of ${matchingSeed.name} (${seedsNeeded} seeds) for planting`,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
      userId: userId,
      details: {
        inventoryItemId: matchingSeed.id,
        itemName: matchingSeed.name,
        packsUsed: packsToDeduct,
        seedsUsed: seedsNeeded,
        remainingPacks: newPackCount,
        remainingSeeds: newPackCount * seedsPerPack
      }
    })

    setPlantsData(prev => [...prev, { id: docRef.id, ...newPlant }])
    
    handleCloseAddPlotModal()
    
    showAlert({
      type: 'success',
      title: 'Plot Added Successfully!',
      message: `${plantInfo.name} has been added to Plot ${selectedPlotNumber}.`,
      details: [
        { label: 'Plant', value: plantInfo.name },
        { label: 'Plot', value: `Plot ${selectedPlotNumber}` },
        { label: 'Plot Size', value: displaySize },
        { label: 'Age', value: `${plantAge} days old` },
        { label: 'Current Stage', value: currentStage },
        { label: 'Seedlings', value: recommendedSeedlings.toString() },
        { label: 'Seeds Used', value: `${packsToDeduct} pack(s) = ${seedsNeeded} seeds` },
        { label: 'Seeds Remaining', value: `${newPackCount} pack(s) = ${newPackCount * seedsPerPack} seeds` },
        { label: 'Planted Date', value: plantedDate.toLocaleDateString() },
        { label: 'Expected Harvest', value: expectedHarvestDate.toLocaleDateString() },
        { label: 'Days to Harvest', value: `${remainingDaysToHarvest} days` }
      ],
      confirmText: 'View Plants'
    })
  } catch (error) {
    console.error('Error adding plant:', error)
    
    let errorMessage = 'An error occurred while adding the plot.'
    let errorDetails = [{ label: 'Error', value: error.message }]
    
    if (error.code === 'permission-denied') {
      errorMessage = 'You do not have permission to add plants. Please check your authentication.'
      errorDetails = [
        { label: 'Error Code', value: error.code },
        { label: 'User ID', value: userId || 'Not authenticated' },
        { label: 'Solution', value: 'Please log out and log back in' }
      ]
    }
    
    showAlert({
      type: 'error',
      title: 'Failed to Add Plot',
      message: errorMessage,
      details: errorDetails,
      confirmText: 'Try Again'
    })
  } finally {
    setIsSubmitting(false)
  }
}

const handleOpenFertilizerModal = async (plant) => {
  // Save selected plant
  setSelectedPlant(plant);

  const plantInfo = plantsList[plant.plantType];
  const currentStage = getCurrentStage(plant, plantInfo);

  // Validate essential data BEFORE opening modal
  if (!plant || !plant.plotSize) {
    console.error("Cannot calculate fertilizer: Plant data or plot size is missing.");
    showAlert({
      type: "error",
      title: "Missing Plot Size",
      message: "This plant does not have a valid plot size. Fertilizer calculation cannot continue.",
      confirmText: "OK"
    });
    return;
  }

  // Show modal now — but keep it empty until data loads
  setShowFertilizerModal(true);

  // If no sensor data → display notice instead of crashing
  if (!plant.sensorData) {
    setFertilizerInfo({
      plantName: plant.plantName,
      stage: currentStage?.stage || "Unknown",
      current: null,
      ideal: null,
      deficit: null,
      recommendations: null,
      message: "No soil sensor data available for fertilizer calculation."
    });
    return;
  }

  // If sensor data exists → compute recommendation
  if (currentStage) {
    const deficits = {
      nitrogen: Math.max(0, currentStage.highN - (plant.sensorData.nitrogen || 0)),
      phosphorus: Math.max(0, currentStage.highP - (plant.sensorData.phosphorus || 0)),
      potassium: Math.max(0, currentStage.highK - (plant.sensorData.potassium || 0)),
      ph: Math.abs(currentStage.highpH - (plant.sensorData.ph || 7))
    };

    const recommendations = await fetchFertilizerRecommendations(plant, plant.sensorData);

    setFertilizerInfo({
      plantName: plant.plantName,
      stage: currentStage.stage,
      current: plant.sensorData,
      ideal: {
        nitrogen: currentStage.highN,
        phosphorus: currentStage.highP,
        potassium: currentStage.highK,
        ph: currentStage.highpH
      },
      range: {
        nitrogen: `${currentStage.lowN} - ${currentStage.highN}`,
        phosphorus: `${currentStage.lowP} - ${currentStage.highP}`,
        potassium: `${currentStage.lowK} - ${currentStage.highK}`,
        ph: `${currentStage.lowpH} - ${currentStage.highpH}`
      },
      deficit: deficits,
      recommendations,
      // ADD THIS: Include the plant itself in fertilizerInfo
      plant: plant
    });
  }
};


  const handleCloseFertilizerModal = () => {
    setShowFertilizerModal(false)
    setFertilizerInfo(null)
  }

  const handleOpenPriceModal = async (plant) => {
  try {
    // First, try to get pricing from production costing
    const productionPricing = await fetchRecommendedPriceFromProduction(plant.id)
    
    if (productionPricing) {
      // Use pricing from production costing module
      setPriceRecommendation({
        recommendedPrice: productionPricing.sellingPrice || productionPricing.recommendedPrice,
        minPrice: Math.round(productionPricing.recommendedPrice * 0.9), // 10% below
        maxPrice: Math.round(productionPricing.recommendedPrice * 1.1), // 10% above
        avgMarketPrice: productionPricing.recommendedPrice,
        unit: plant.unit || 'per kilo',
        qualityScore: 85,
        priceStrategy: productionPricing.pricingSource === 'production_costing' 
          ? 'Production Costing' 
          : 'Cost-Based Pricing',
        profitMargin: productionPricing.profitMargin,
        profitAmount: productionPricing.profitAmount,
        totalCost: productionPricing.totalProductionCost,
        factors: [
          'Production Cost Analysis',
          productionPricing.profitMargin ? `${productionPricing.profitMargin}% Profit Margin` : 'Cost Recovery',
          'Quality Assessment',
          'Market Positioning'
        ],
        source: productionPricing.pricingSource,
        lastUpdate: productionPricing.lastPricingUpdate
      })
      
      setShowPriceModal(true)
      return
    }
    
    // Fallback: Use plantsList data if no production costing available
    const plantInfo = plantsList[plant.plantType]
    
    if (plantInfo) {
      const basePrice = parseFloat(plantInfo.pricing) || 100
      
      setPriceRecommendation({
        recommendedPrice: basePrice,
        minPrice: Math.round(basePrice * 0.8),
        maxPrice: Math.round(basePrice * 1.2),
        avgMarketPrice: basePrice,
        unit: plantInfo.pricingUnit || 'per kilo',
        qualityScore: 85,
        priceStrategy: 'Market Rate (Default)',
        source: 'plantsList_fallback',
        warning: 'No production costing data available. Using default market rates.'
      })
      
      setShowPriceModal(true)
    } else {
      showAlert({
        type: 'warning',
        title: 'No Pricing Data',
        message: 'Unable to fetch pricing information for this plant.',
        confirmText: 'OK'
      })
    }
  } catch (error) {
    console.error('Error opening price modal:', error)
    showAlert({
      type: 'error',
      title: 'Error',
      message: 'Failed to load pricing information.',
      details: [{ label: 'Error', value: error.message }],
      confirmText: 'OK'
    })
  }
}


  const handleClosePriceModal = () => {
    setShowPriceModal(false)
    setPriceRecommendation(null)
  }

  // Harvest handlers
  const handleOpenHarvestModal = (plant) => {
    setSelectedPlant(plant)
    
    const plantedDate = new Date(plant.plantedDate)
    const expectedHarvestDate = new Date(plant.expectedHarvestDate)
    const today = new Date()
    
    const daysUntilHarvest = Math.ceil((expectedHarvestDate - today) / (1000 * 60 * 60 * 24))
    
    if (daysUntilHarvest > 7) {
      showAlert({
        type: 'warning',
        title: 'Not Ready for Harvest',
        message: `This plant is not ready for harvest yet. Expected harvest date is ${daysUntilHarvest} days away.`,
        details: [
          { label: 'Expected Harvest', value: expectedHarvestDate.toLocaleDateString() },
          { label: 'Days Remaining', value: `${daysUntilHarvest} days` }
        ],
        confirmText: 'OK'
      })
      return
    }
    
    setHarvestData({
      actualYield: '',
      yieldUnit: plant.unit?.replace('per ', '') || 'kg',
      quality: 'A',
      notes: '',
      harvestDate: new Date().toISOString().split('T')[0]
    })
    
    setShowHarvestModal(true)
  }

  const handleCloseHarvestModal = () => {
    setShowHarvestModal(false)
    setSelectedPlant(null)
    setHarvestData({
      actualYield: '',
      yieldUnit: 'kg',
      quality: 'A',
      notes: '',
      harvestDate: new Date().toISOString().split('T')[0]
    })
  }

  const handleHarvestInputChange = (e) => {
    const { name, value } = e.target
    setHarvestData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleConfirmHarvest = async () => {
    try {
      if (!harvestData.actualYield || parseFloat(harvestData.actualYield) <= 0) {
        showAlert({
          type: 'warning',
          title: 'Invalid Yield',
          message: 'Please enter a valid yield amount.',
          confirmText: 'OK'
        })
        return
      }

      const actualYield = parseFloat(harvestData.actualYield)
      const plantInfo = plantsList[selectedPlant.plantType]
      
      const sellingPrice = parseFloat(selectedPlant.currentSellingPrice) || 0
      const totalRevenue = actualYield * sellingPrice
      
      let productionCost = 0
      let profit = 0
      let roi = 0
      
      try {
        const costQuery = query(collection(db, 'productionCosts'), where('plantId', '==', selectedPlant.id))
        const costSnapshot = await getDocs(costQuery)
        if (!costSnapshot.empty) {
          productionCost = costSnapshot.docs[0].data().totalCost || 0
          profit = totalRevenue - productionCost
          roi = productionCost > 0 ? (profit / productionCost) * 100 : 0
        }
      } catch (error) {
        console.error('Error fetching production cost:', error)
      }

      const harvestRecord = {
        plantId: selectedPlant.id,
        plantName: selectedPlant.plantName,
        plantType: selectedPlant.plantType,
        plotNumber: selectedPlant.plotNumber,
        harvestDate: harvestData.harvestDate,
        actualYield: actualYield,
        yieldUnit: harvestData.yieldUnit,
        quality: harvestData.quality,
        sellingPrice: sellingPrice,
        totalRevenue: totalRevenue,
        productionCost: productionCost,
        profit: profit,
        roi: roi,
        notes: harvestData.notes,
        plantedDate: selectedPlant.plantedDate,
        expectedHarvestDate: selectedPlant.expectedHarvestDate,
        survivingPlants: selectedPlant.survivingPlants || selectedPlant.recommendedSeedlings,
        recommendedSeedlings: selectedPlant.recommendedSeedlings,
        createdAt: serverTimestamp(),
        userId: userId
      }

      await addDoc(collection(db, 'harvests'), harvestRecord)

      const plantRef = doc(db, 'plants', selectedPlant.id)
      await updateDoc(plantRef, {
        status: 'Harvested',
        harvestDate: harvestData.harvestDate,
        actualYield: actualYield,
        harvestedAt: serverTimestamp()
      })

      await addDoc(collection(db, 'events'), {
        plantId: selectedPlant.id,
        type: 'HARVEST',
        status: 'success',
        message: `Harvested: ${actualYield} ${harvestData.yieldUnit} of ${plantInfo?.name || selectedPlant.plantType} (Quality: ${harvestData.quality})`,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        userId: userId,
        details: {
          yield: actualYield,
          unit: harvestData.yieldUnit,
          quality: harvestData.quality,
          revenue: totalRevenue,
          profit: profit,
          roi: roi.toFixed(1)
        }
      })

      setPlantsData(prev =>
        prev.map(plant =>
          plant.id === selectedPlant.id
            ? { ...plant, status: 'Harvested', harvestDate: harvestData.harvestDate, actualYield: actualYield }
            : plant
        )
      )

      handleCloseHarvestModal()

      showAlert({
        type: 'success',
        title: '🎉 Harvest Complete!',
        message: `Successfully harvested ${actualYield} ${harvestData.yieldUnit} of ${plantInfo?.name}.`,
        details: [
          { label: 'Yield', value: `${actualYield} ${harvestData.yieldUnit}` },
          { label: 'Quality Grade', value: harvestData.quality },
          { label: 'Revenue', value: `₱${totalRevenue.toLocaleString()}` },
          ...(productionCost > 0 ? [
            { label: 'Production Cost', value: `₱${productionCost.toLocaleString()}` },
            { label: 'Profit', value: `₱${profit.toLocaleString()}` },
            { label: 'ROI', value: `${roi.toFixed(1)}%` }
          ] : [])
        ],
        confirmText: 'View Harvest Records'
      })
    } catch (error) {
      console.error('Error recording harvest:', error)
      showAlert({
        type: 'error',
        title: 'Harvest Failed',
        message: 'Failed to record harvest. Please try again.',
        details: [{ label: 'Error', value: error.message }],
        confirmText: 'OK'
      })
    }
  }

  const handleDeletePlant = async (plant) => {
    showAlert({
      type: 'warning',
      title: 'Delete Plant?',
      message: `Are you sure you want to permanently delete "${plant.plantName}"? This action cannot be undone.`,
      details: [
        { label: 'Plant', value: plant.plantName },
        { label: 'Plot', value: `Plot ${plant.plotNumber}` },
        { label: 'Stage', value: plant.status },
        { label: 'Age', value: `${plant.age || 0} days` }
      ],
      showCancel: true,
      confirmText: 'Yes, Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          // Delete plant document
          await deleteDoc(doc(db, 'plants', plant.id))
          
          // Delete associated events
          const eventsQuery = query(collection(db, 'events'), where('plantId', '==', plant.id))
          const eventsSnapshot = await getDocs(eventsQuery)
          const deletePromises = eventsSnapshot.docs.map(doc => deleteDoc(doc.ref))
          await Promise.all(deletePromises)
          
          // Update local state
          setPlantsData(prev => prev.filter(p => p.id !== plant.id))
          
          closeAlert()
          showAlert({
            type: 'success',
            title: 'Plant Deleted',
            message: `${plant.plantName} and all associated records have been deleted.`,
            confirmText: 'OK'
          })
        } catch (error) {
          console.error('Error deleting plant:', error)
          closeAlert()
          showAlert({
            type: 'error',
            title: 'Delete Failed',
            message: 'Failed to delete plant. Please try again.',
            details: [{ label: 'Error', value: error.message }],
            confirmText: 'OK'
          })
        }
      }
    })
  }


  const handleOpenDetailModal = async (plant) => {
    setSelectedPlant(plant)
    setActiveDetailTab('summary')
    await fetchPlantEvents(plant.id)
    setShowDetailModal(true)

    if (plant.soilSensor) {
      const freshSensorData = await fetchSensorData(plant.soilSensor)
      if (freshSensorData) {
        // Update the selected plant with fresh sensor data
        setSelectedPlant(prev => ({
          ...prev,
          sensorData: freshSensorData
        }))
      }
    }
  }

  const handleCloseDetailModal = () => {
    setShowDetailModal(false)
    setSelectedPlant(null)
    setActiveDetailTab('summary')
    setPlantEvents([])
  }

  // Filter handlers
  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }))
  }

  const handleClearFilters = () => {
    setFilters({
      locationZone: 'all',
      plantType: 'all',
      status: 'all',
      plotNumber: 'all'
    })
  }

  const hasActiveFilters = () => {
    return Object.values(filters).some(value => value !== 'all')
  }

  const getUniqueFilterOptions = () => {
    const uniquePlantTypes = [...new Set(plants.map(p => p.plantType).filter(Boolean))]
    const uniqueLocations = [...new Set(plants.map(p => p.locationZone).filter(Boolean))]
    const uniqueStatuses = [...new Set(plants.map(p => {
      const plantInfo = plantsList[p.plantType]
      const currentStage = getCurrentStage(p, plantInfo)
      return currentStage?.stage || p.status
    }).filter(Boolean))]
    const uniquePlotNumbers = [...new Set(plants.map(p => p.plotNumber).filter(Boolean))].sort((a, b) => a - b)

    return {
      plantTypes: uniquePlantTypes,
      locations: uniqueLocations,
      statuses: uniqueStatuses,
      plotNumbers: uniquePlotNumbers
    }
  }

  const filterOptions = getUniqueFilterOptions()

  const filteredPlants = plants.filter(plant => {
    const matchesSearch = plant.plantName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plant.plantType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plant.locationZone?.toLowerCase().includes(searchTerm.toLowerCase())

    if (!matchesSearch) return false

    if (filters.locationZone !== 'all' && plant.locationZone !== filters.locationZone) {
      return false
    }

    if (filters.plantType !== 'all' && plant.plantType !== filters.plantType) {
      return false
    }

    const plantInfo = plantsList[plant.plantType]
    const currentStage = getCurrentStage(plant, plantInfo)
    const plantStatus = currentStage?.stage || plant.status

    if (filters.status === 'Active') {
      // SCENARIO 1: The new 'Active' default is selected
      // Exclude all plants that are marked as 'Harvested' (check both plantStatus and plant.status)
      if (plantStatus === 'Harvested' || plant.status === 'Harvested') {
        return false
      }
    } else if (filters.status !== 'all') {
      // SCENARIO 2: A specific status (e.g., 'Germination') is selected
      // Only show plants that match the selected status
      if (plantStatus !== filters.status) {
        return false
      }
    }

    if (filters.plotNumber !== 'all' && plant.plotNumber !== filters.plotNumber) {
      return false
    }

    return true
  })

  const getStatusColor = (status) => {
    const colors = {
      'Waiting for Planting': '#FFA500',
      'Seeding': '#FFD700',
      'Germination': '#FFD700',
      'Seedling': '#90EE90',
      'Growing': '#32CD32',
      'Vegetative Growth': '#32CD32',
      'Flowering': '#FF69B4',
      'Fruiting': '#FF8C00',
      'Harvesting': '#8B4513',
      'Harvest': '#8B4513',
      'Ready to Harvest': '#228B22',
      'Completed': '#808080',
      'Harvested': '#808080'
    }
    return colors[status] || '#666'
  }

  const getPlantEmoji = (plantType) => {
    const emojis = {
      'lettuce': '🥬',
      'tomato': '🍅',
      'cabbage': '🥬',
      'siling haba': '🌶️',
      'pepper': '🌶️',
      'eggplant': '🍆',
      'cucumber': '🥒',
      'pechay': '🥬',
      'bokchoy': '🥬',
      'celery': '🌿'
    }
    return emojis[plantType?.toLowerCase()] || '🌱'
  }

  if (loading) {
    return (
      <div className="planting-container">
        <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} userType={userType} />
        <div className="planting-content">
          <div className="loading">Loading...</div>
        </div>
        <CustomAlert
          show={alertConfig.show}
          type={alertConfig.type}
          title={alertConfig.title}
          message={alertConfig.message}
          details={alertConfig.details}
          onConfirm={alertConfig.onConfirm}
          onCancel={alertConfig.onCancel}
          confirmText={alertConfig.confirmText}
          cancelText={alertConfig.cancelText}
          showCancel={alertConfig.showCancel}
        />
      </div>
    )
  }

  const availablePlotsCount = getAvailablePlots().length

  return (
    <div className="planting-container">
      <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} userType={userType} />
      
      <div className="planting-content">
        <div className="planting-header">
          <div className="planting-title-section">
            <h1 className="planting-title">🌱 Planting Management</h1>
            <p className="planting-subtitle">
              Monitor and manage your crops • {availablePlotsCount} of {plotOptions.length} plots available
            </p>
          </div>

          <div className="planting-actions">
            <div className="planting-search">
              <MdSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
              <input
                type="text"
                placeholder="Search plants..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="planting-search-input"
                style={{ paddingLeft: '40px' }}
              />
            </div>

            <div className="filter-container">
              <button 
                className={`planting-filter-btn ${hasActiveFilters() ? 'active' : ''}`}
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              >
                🔍 Filter
                {hasActiveFilters() && <span className="filter-badge">{Object.values(filters).filter(v => v !== 'all').length}</span>}
              </button>

              {showFilterDropdown && (
                <div className="filter-dropdown">
                  <div className="filter-dropdown-header">
                    <h3>Filter Plants</h3>
                    {hasActiveFilters() && (
                      <button 
                        className="clear-filters-btn"
                        onClick={handleClearFilters}
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  <div className="filter-section">
                    <label>Location Zone</label>
                    <select
                      value={filters.locationZone}
                      onChange={(e) => handleFilterChange('locationZone', e.target.value)}
                      className="filter-select"
                    >
                      <option value="all">All Locations</option>
                      {filterOptions.locations.map(location => (
                        <option key={location} value={location}>{location}</option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-section">
                    <label>Plant Type</label>
                    <select
                      value={filters.plantType}
                      onChange={(e) => handleFilterChange('plantType', e.target.value)}
                      className="filter-select"
                    >
                      <option value="all">All Plants</option>
                      {filterOptions.plantTypes.map(type => (
                        <option key={type} value={type}>
                          {plantsList[type]?.name || type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-section">
      <label>Growth Stage</label>
      <select 
        value={filters.status} 
        onChange={(e) => handleFilterChange('status', e.target.value)} 
        className="filter-select"
      >
        <option value="Active">Active Plants (Default)</option>
        <option value="all">All Stages (Including Harvested)</option>
        {filterOptions.statuses.map(status => (
          <option key={status} value={status}>{status}</option>
        ))}
      </select>
    </div>

                  <div className="filter-section">
                    <label>Plot Number</label>
                    <select
                      value={filters.plotNumber}
                      onChange={(e) => handleFilterChange('plotNumber', e.target.value)}
                      className="filter-select"
                    >
                      <option value="all">All Plots</option>
                      {filterOptions.plotNumbers.map(plotNum => (
                        <option key={plotNum} value={plotNum}>Plot {plotNum}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <button 
              className="planting-add-btn" 
              onClick={handleOpenAddPlotModal}
              disabled={availablePlotsCount === 0}
              style={{ 
                opacity: availablePlotsCount === 0 ? 0.5 : 1,
                cursor: availablePlotsCount === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              + Select Plot
            </button>
          </div>
        </div>

        {hasActiveFilters() && (
          <div className="active-filters">
            <span className="active-filters-label">Active Filters:</span>
            {filters.locationZone !== 'all' && (
              <span className="filter-tag">
                Location: {filters.locationZone}
                <button onClick={() => handleFilterChange('locationZone', 'all')}>✕</button>
              </span>
            )}
            {filters.plantType !== 'all' && (
              <span className="filter-tag">
                Plant: {plantsList[filters.plantType]?.name || filters.plantType}
                <button onClick={() => handleFilterChange('plantType', 'all')}>✕</button>
              </span>
            )}
            {filters.status !== 'all' && (
              <span className="filter-tag">
                Stage: {filters.status}
                <button onClick={() => handleFilterChange('status', 'all')}>✕</button>
              </span>
            )}
            {filters.plotNumber !== 'all' && (
              <span className="filter-tag">
                Plot: {filters.plotNumber}
                <button onClick={() => handleFilterChange('plotNumber', 'all')}>✕</button>
              </span>
            )}
          </div>
        )}

        <div className="results-count">
          Showing {filteredPlants.length} of {plants.length} plants
        </div>

        <div className="planting-grid">
          {filteredPlants.length === 0 ? (
            <div className="planting-empty">
              <p>
                {hasActiveFilters() 
                  ? 'No plants match your filters. Try adjusting your filter criteria.'
                  : plants.length === 0
                  ? 'No plants found. Click "Select Plot" to add your first plot!'
                  : 'No plants match your search.'}
              </p>
            </div>
          ) : (
            filteredPlants.map((plant) => {
              const plantInfo = plantsList[plant.plantType]
              const currentStage = getCurrentStage(plant, plantInfo)
              const survivalRate = calculateSurvivalRate(plant)
              const survivalColor = getSurvivalRateColor(survivalRate)
              const survivalLabel = getSurvivalRateLabel(survivalRate)
              const survivingCount = plant.survivingPlants ?? plant.recommendedSeedlings
              
              const expectedHarvestDate = new Date(plant.expectedHarvestDate)
              const today = new Date()
              const daysUntilHarvest = Math.ceil((expectedHarvestDate - today) / (1000 * 60 * 60 * 24))
              const isReadyForHarvest = daysUntilHarvest <= 7 && plant.status !== 'Harvested'
              
              return (
                <div 
                  key={plant.id} 
                  className={`planting-card planting-card-${plant.plantType?.toLowerCase()}`}
                  onClick={() => handleOpenDetailModal(plant)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="planting-card-header">
                    <span className="planting-plant-icon">{getPlantEmoji(plant.plantType)}</span>
                    <div className="planting-plant-info">
                      <h3 className="planting-plant-name">{plant.plantName}</h3>
                      <p className="planting-plant-type">{plant.scientificName}</p>
                    </div>
                  </div>

                  <div className="planting-card-body">
                    <div className="planting-info-row">
                      <span className="planting-info-label">
                        <MdLocationOn style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                        Plot:
                      </span>
                      <span className="planting-info-value">Plot {plant.plotNumber} ({plant.plotSize})</span>
                    </div>
                    
                    <div className="planting-info-row">
                      <span className="planting-info-label">
                        <MdScience style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                        Sensor:
                      </span>
                      <span className="planting-info-value">{plant.soilSensor}</span>
                    </div>

                    <div className="planting-info-row">
                      <span className="planting-info-label">
                        <MdLocationOn style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                        Location:
                      </span>
                      <span className="planting-info-value">{plant.locationZone}</span>
                    </div>

                    <div className="planting-info-row">
                      <span className="planting-info-label">
                        <MdLocalFlorist style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                        Plants:
                      </span>
                      <span className="planting-info-value">
                        <strong style={{ color: survivalColor }}>
                          {survivingCount}
                        </strong>
                        {' / '}{plant.recommendedSeedlings}
                        <span style={{ 
                          marginLeft: '0.5rem', 
                          fontSize: '0.85em',
                          color: survivalColor
                        }}>
                          ({survivalRate}% {survivalLabel})
                        </span>
                      </span>
                    </div>

                    {currentStage && (
                      <div className="planting-info-row">
                        <span className="planting-info-label">
                          <MdEco style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                          Stage:
                        </span>
                        <span className="planting-info-value">{currentStage.stage}</span>
                      </div>
                    )}

                    <div className="planting-status-badge" style={{ backgroundColor: getStatusColor(currentStage?.stage || plant.status) }}>
                      {currentStage?.stage || plant.status}
                    </div>
                  </div>

                  <div className="planting-card-footer" onClick={(e) => e.stopPropagation()}>
                    {plant.status === 'Harvested' ? (
                      <div className="harvested-badge">
                        Harvested on {formatDisplayDate(plant.harvestDate)}
                      </div>
                    ) : isReadyForHarvest ? (
                      <>
                        <button
                          className="planting-card-btn harvest-btn"
                          onClick={() => handleOpenHarvestModal(plant)}
                        >
                          Harvest
                        </button>
                        <button
                          className="planting-card-btn"
                          onClick={() => handleOpenEditModal(plant)}
                        >
                          Edit
                        </button>
                        <button
                          className="planting-card-btn delete-btn"
                          onClick={() => handleDeletePlant(plant)}
                          style={{ background: '#ef4444' }}
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="planting-card-btn"
                          onClick={() => handleOpenEditModal(plant)}
                        >
                          Edit
                        </button>
                        <button
                          className="planting-card-btn"
                          onClick={() => handleOpenFertilizerModal(plant)}
                        >
                          Fertilizer
                        </button>
                        <button
                          className="planting-card-btn"
                          onClick={() => handleOpenPriceModal(plant)}
                        >
                          Price
                        </button>
                        <button
                          className="planting-card-btn delete-btn"
                          onClick={() => handleDeletePlant(plant)}
                          style={{ background: '#ef4444' }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Edit Modal - Updated with surviving plants */}
        {showEditModal && selectedPlant && (
          <div className="planting-modal-overlay" onClick={handleCloseEditModal}>
            <div className="planting-modal" onClick={(e) => e.stopPropagation()}>
              <div className="planting-modal-header">
                <h2 className="planting-modal-title">Edit Plant</h2>
                <button className="planting-modal-close" onClick={handleCloseEditModal}>
                  ✕
                </button>
              </div>

              <div className="planting-modal-body">
                <div className="planting-form-group">
                  <label>
                    <MdCalendarToday style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                    Plant Age (Days) 🌱
                  </label>
                  <input
                    type="number"
                    name="age"
                    value={editFormData.age}
                    onChange={handleEditInputChange}
                    className="planting-form-input"
                    placeholder="Enter plant age in days"
                    min="0"
                  />
                  {editFormData.age && plantsList[selectedPlant.plantType]?.stages && (
                    <small style={{ 
                      display: 'block', 
                      marginTop: '0.5rem',
                      padding: '8px',
                      background: '#f0fdf4',
                      borderLeft: '3px solid #10b981',
                      borderRadius: '4px',
                      color: '#065f46'
                    }}>
                      <strong>Stage for this age:</strong> {getStageFromAge(parseInt(editFormData.age), plantsList[selectedPlant.plantType].stages) || 'Unknown'}
                    </small>
                  )}
                </div>

                <div className="planting-form-group">
                  <label>
                    <MdLocalFlorist style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                    Surviving Plants 🌱
                    <span style={{ 
                      marginLeft: '0.5rem', 
                      fontSize: '0.85em', 
                      color: '#666' 
                    }}>
                      (Initial: {selectedPlant.recommendedSeedlings})
                    </span>
                  </label>
                  <input
                    type="number"
                    name="survivingPlants"
                    value={editFormData.survivingPlants}
                    onChange={handleEditInputChange}
                    className="planting-form-input"
                    placeholder="Enter number of surviving plants"
                    min="0"
                    max={selectedPlant.recommendedSeedlings}
                  />
                  {editFormData.survivingPlants && (
                    <small style={{ 
                      display: 'block', 
                      marginTop: '0.5rem',
                      color: getSurvivalRateColor(
                        (parseInt(editFormData.survivingPlants) / parseInt(selectedPlant.recommendedSeedlings)) * 100
                      )
                    }}>
                      Survival Rate: {Math.round((parseInt(editFormData.survivingPlants) / parseInt(selectedPlant.recommendedSeedlings)) * 100)}% 
                      ({getSurvivalRateLabel(
                        (parseInt(editFormData.survivingPlants) / parseInt(selectedPlant.recommendedSeedlings)) * 100
                      )})
                    </small>
                  )}
                </div>

                <div className="planting-form-group">
                  <label>
                    <MdLocationOn style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                    Location Zone
                  </label>
                  <select
                    name="locationZone"
                    value={editFormData.locationZone}
                    onChange={handleEditInputChange}
                    className="planting-form-select"
                  >
                    <option value="">Select location</option>
                    {locationZoneOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div className="planting-form-group">
                  <label>
                    <MdEco style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                    Current Stage
                  </label>
                  <select
                    name="status"
                    value={editFormData.status}
                    onChange={handleEditInputChange}
                    className="planting-form-select"
                  >
                    <option value="">Select stage</option>
                    {plantsList[selectedPlant.plantType]?.stages?.map(stage => (
                      <option key={stage.stage} value={stage.stage}>
                        {stage.stage} (Day {stage.startDuration}-{stage.endDuration})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="planting-form-group">
                  <label>
                    <MdAttachMoney style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                    Current Selling Price (₱)
                  </label>
                  <input
                    type="number"
                    name="currentSellingPrice"
                    value={editFormData.currentSellingPrice}
                    onChange={handleEditInputChange}
                    className="planting-form-input"
                    placeholder="Enter price"
                  />
                </div>

                <div className="planting-form-group">
                  <label>Unit</label>
                  <select
                    name="unit"
                    value={editFormData.unit}
                    onChange={handleEditInputChange}
                    className="planting-form-select"
                  >
                    <option value="">Select unit</option>
                    {unitOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="planting-modal-footer">
                <button
                  className="planting-modal-btn planting-modal-cancel"
                  onClick={handleCloseEditModal}
                >
                  Cancel
                </button>
                <button
                  className="planting-modal-btn planting-modal-save"
                  onClick={handleSaveEdit}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {showAddPlotModal && (
          <div className="planting-modal-overlay" onClick={handleCloseAddPlotModal}>
            <div className="planting-modal planting-modal-large" onClick={(e) => e.stopPropagation()}>
              <div className="planting-modal-header">
                <h2 className="planting-modal-title">
                  {plotStep === 'input' && (
                    <>
                      <MdLocationOn style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                      Select Plot, Sensor & Plant
                    </>
                  )}
                  {plotStep === 'scanning' && (
                    <>
                      <MdSearch style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                      Scanning Soil...
                    </>
                  )}
                  {plotStep === 'confirm' && (
                    <>
                      <MdCheckCircle style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                      Confirm Planting
                    </>
                  )}
                </h2>
                <button className="planting-modal-close" onClick={handleCloseAddPlotModal}>
                  ✕
                </button>
              </div>

              <div className="planting-modal-body">
                {plotStep === 'input' && (
                  <div className="plot-input-step">
                    {getAvailablePlots().length === 0 ? (
                      <div className="no-plots-available">
                        <p style={{ textAlign: 'center', padding: '2rem', color: '#d32f2f', fontSize: '1.1rem' }}>
                          ⚠️ All plots are currently occupied. Please harvest or remove existing plants before adding new ones.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="planting-form-group">
                          <label>Select Plot Number</label>
                          <select
                            value={selectedPlotNumber}
                            onChange={(e) => handlePlotSelect(e.target.value)}
                            className="planting-form-select"
                          >
                            <option value="">Choose a plot...</option>
                            {getAvailablePlots().map(plot => (
                              <option key={plot.number} value={plot.number}>
                                Plot {plot.number} (Available)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="planting-form-group">
                          <label>Plot Size (cm)</label>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: '0.85em', color: '#666' }}>Length (cm)</label>
                              <input
                                type="number"
                                value={customPlotSize.length}
                                onChange={(e) => handlePlotSizeChange('length', e.target.value)}
                                className="planting-form-input"
                                placeholder="Length"
                                min="10"
                                max="500"
                              />
                            </div>
                            <span style={{ marginTop: '1.5rem', fontSize: '1.2em', color: '#666' }}>×</span>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: '0.85em', color: '#666' }}>Width (cm)</label>
                              <input
                                type="number"
                                value={customPlotSize.width}
                                onChange={(e) => handlePlotSizeChange('width', e.target.value)}
                                className="planting-form-input"
                                placeholder="Width"
                                min="10"
                                max="500"
                              />
                            </div>
                          </div>
                          <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
                            Plot size: {getDisplaySize(customPlotSize.length, customPlotSize.width)} 
                            ({calculatePlotSize(customPlotSize.length, customPlotSize.width).toFixed(4)} m²)
                          </small>
                        </div>

                        <div className="planting-form-group">
                          <label>
                            <MdScience style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                            Assign Soil Sensor
                          </label>
                          <select
                            value={selectedSoilSensor}
                            onChange={(e) => handleSensorSelect(e.target.value)}
                            className="planting-form-select"
                            disabled={loadingSensorStatus}
                          >
                            <option value="">Choose a sensor...</option>
                            {availableSensors.map(sensor => (
                              <option key={sensor.id} value={sensor.id}>
                                {sensor.name}
                              </option>
                            ))}
                          </select>
                          
                          {loadingSensorStatus && (
                            <div className="sensor-status-loading">
                              <span className="loading-spinner">🔄</span>
                              Checking sensor status...
                            </div>
                          )}
                          
                          {sensorStatus && (
                            <div className={`sensor-status ${sensorStatus.online ? 'online' : 'offline'}`}>
                              {sensorStatus.online ? (
                                <>
                                  <span className="status-icon">🟢</span>
                                  <span className="status-text">
                                    Sensor Online • Last reading: {sensorStatus.minutesAgo} min ago
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="status-icon">🔴</span>
                                  <span className="status-text">
                                    Sensor Offline • {sensorStatus.reason}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="planting-form-group">
                          <label>
                            <MdEco style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                            Select Plant Type
                            {rankedPlants.length > 0 && (
                              <span className="ranking-indicator"> (Ranked by Soil Compatibility)</span>
                            )}
                          </label>
                          
                          {rankedPlants.length > 0 ? (
                            <div className="ranked-plants-list">
                              {rankedPlants.map(({ key, plant, score, rating, nutrientPercentages }) => (
                                <div
                                  key={key}
                                  className={`ranked-plant-item ${selectedPlantType === key ? 'selected' : ''}`}
                                  onClick={() => handlePlantTypeSelect(key)}
                                  style={{ 
                                    borderLeft: `4px solid ${rating.color}`,
                                    cursor: 'pointer'
                                  }}
                                >
                                  <div className="plant-item-header">
                                    <div className="plant-name">
                                      {getPlantEmoji(key)} {plant.name}
                                    </div>
                                    <div className="compatibility-badge" style={{ backgroundColor: rating.color }}>
                                      {score}%
                                    </div>
                                  </div>
                                  
                                  <div className="plant-item-details">
                                    <div className="stars">
                                      {'⭐'.repeat(rating.stars)}{'☆'.repeat(5 - rating.stars)}
                                    </div>
                                    <div className="rating-text" style={{ color: rating.color }}>
                                      {rating.text}
                                    </div>
                                  </div>
                                  
                                  {/* NEW: Nutrient Percentages Breakdown */}
                                  {nutrientPercentages && (
                                    <div className="nutrient-percentages" style={{
                                      marginTop: '12px',
                                      padding: '8px',
                                      background: '#f8fafc',
                                      borderRadius: '6px',
                                      fontSize: '0.85em'
                                    }}>
                                      <div style={{ 
                                        fontWeight: '600', 
                                        marginBottom: '6px',
                                        color: '#475569',
                                        fontSize: '0.9em'
                                      }}>
                                        Soil Match Breakdown:
                                      </div>
                                      <div style={{ 
                                        display: 'grid', 
                                        gridTemplateColumns: 'repeat(2, 1fr)',
                                        gap: '6px'
                                      }}>
                                        {nutrientPercentages.nitrogen !== undefined && (
                                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: '#64748b' }}>Nitrogen:</span>
                                            <span style={{ 
                                              fontWeight: '600',
                                              color: getPercentageColor(nutrientPercentages.nitrogen)
                                            }}>
                                              {nutrientPercentages.nitrogen.toFixed(0)}%
                                            </span>
                                          </div>
                                        )}
                                        {nutrientPercentages.phosphorus !== undefined && (
                                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: '#64748b' }}>Phosphorus:</span>
                                            <span style={{ 
                                              fontWeight: '600',
                                              color: getPercentageColor(nutrientPercentages.phosphorus)
                                            }}>
                                              {nutrientPercentages.phosphorus.toFixed(0)}%
                                            </span>
                                          </div>
                                        )}
                                        {nutrientPercentages.potassium !== undefined && (
                                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: '#64748b' }}>Potassium:</span>
                                            <span style={{ 
                                              fontWeight: '600',
                                              color: getPercentageColor(nutrientPercentages.potassium)
                                            }}>
                                              {nutrientPercentages.potassium.toFixed(0)}%
                                            </span>
                                          </div>
                                        )}
                                        {nutrientPercentages.ph !== undefined && (
                                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: '#64748b' }}>pH:</span>
                                            <span style={{ 
                                              fontWeight: '600',
                                              color: getPercentageColor(nutrientPercentages.ph)
                                            }}>
                                              {nutrientPercentages.ph.toFixed(0)}%
                                            </span>
                                          </div>
                                        )}
                                        {nutrientPercentages.temperature !== undefined && (
                                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: '#64748b' }}>Temp:</span>
                                            <span style={{ 
                                              fontWeight: '600',
                                              color: getPercentageColor(nutrientPercentages.temperature)
                                            }}>
                                              {nutrientPercentages.temperature.toFixed(0)}%
                                            </span>
                                          </div>
                                        )}
                                        {nutrientPercentages.moisture !== undefined && (
                                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: '#64748b' }}>Moisture:</span>
                                            <span style={{ 
                                              fontWeight: '600',
                                              color: getPercentageColor(nutrientPercentages.moisture)
                                            }}>
                                              {nutrientPercentages.moisture.toFixed(0)}%
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  
                                  <div className="plant-quick-info">
                                    <span>🕐 {plant.daysToHarvest} days</span>
                                    <span>💰 ₱{plant.pricing} {plant.pricingUnit}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <select
                              value={selectedPlantType}
                              onChange={(e) => handlePlantTypeSelect(e.target.value)}
                              className="planting-form-select"
                              disabled={!selectedSoilSensor || !sensorStatus?.online}
                            >
                              <option value="">
                                {!selectedSoilSensor 
                                  ? 'Select a sensor first...' 
                                  : !sensorStatus?.online
                                  ? 'Sensor is offline...'
                                  : 'Choose a plant...'}
                              </option>
                              {Object.keys(plantsList).map(key => (
                                <option key={key} value={key}>
                                  {plantsList[key].name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {selectedPlantType && plantsList[selectedPlantType] && (
                          <>
                            <div className="planting-form-group">
                              <label>
                                <MdCalendarToday style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                Plant Age (Days Since Planted)
                              </label>
                              <input
                                type="number"
                                value={plantAge}
                                onChange={(e) => {
                                  const age = parseInt(e.target.value) || 0
                                  setPlantAge(age)
                                }}
                                className="planting-form-input"
                                placeholder="Enter plant age in days"
                                min="0"
                                max={plantsList[selectedPlantType].daysToHarvest || 365}
                              />
                              <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
                                {plantAge === 0 
                                  ? 'Enter 0 if planting seeds/seedlings today' 
                                  : `Plant is ${plantAge} day${plantAge !== 1 ? 's' : ''} old`}
                              </small>
                              {plantAge > 0 && plantsList[selectedPlantType].stages && (
                                <small style={{ 
                                  display: 'block', 
                                  marginTop: '0.5rem', 
                                  padding: '8px',
                                  background: '#f0fdf4',
                                  borderLeft: '3px solid #10b981',
                                  borderRadius: '4px',
                                  color: '#065f46'
                                }}>
                                  <strong>Current Stage:</strong> {getStageFromAge(plantAge, plantsList[selectedPlantType].stages) || 'Unknown'}
                                </small>
                              )}
                            </div>

                            <div className="plant-info-display">
                              <h3>Plant Information</h3>
                              <div className="plant-info-grid">
                                <div className="plant-info-item">
                                  <span className="info-label">Scientific Name:</span>
                                  <span className="info-value">{plantsList[selectedPlantType].sName}</span>
                                </div>
                                <div className="plant-info-item">
                                  <span className="info-label">Description:</span>
                                  <span className="info-value">{plantsList[selectedPlantType].description}</span>
                                </div>
                                <div className="plant-info-item">
                                  <span className="info-label">Days to Harvest:</span>
                                  <span className="info-value">{plantsList[selectedPlantType].daysToHarvest} days</span>
                                </div>
                                <div className="plant-info-item">
                                  <span className="info-label">Recommended Seedlings:</span>
                                  <span className="info-value highlight">{recommendedSeedlings} seedlings</span>
                                </div>
                                <div className="plant-info-item">
                                  <span className="info-label">Market Price:</span>
                                  <span className="info-value">
                                    ₱{plantsList[selectedPlantType].pricing} {plantsList[selectedPlantType].pricingUnit}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        <button
                          className="planting-modal-btn planting-modal-save"
                          onClick={handleStartScan}
                          disabled={!selectedPlotNumber || !selectedSoilSensor || !selectedPlantType || loadingSensorStatus || customPlotSize.length < 10 || customPlotSize.width < 10}
                        >
                          {loadingSensorStatus ? 'Checking Sensor...' : 'Start Soil Scan'}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {plotStep === 'scanning' && (
                  <div className="plot-scanning-step">
                    <div className="scanning-animation">
                      <div className="scanning-icon">
                        <MdSearch style={{ fontSize: '48px' }} />
                      </div>
                      <p>Analyzing soil conditions from {selectedSoilSensor}...</p>
                    </div>
                    
                    <div className="progress-bar">
                      <div 
                        className="progress-bar-fill" 
                        style={{ width: `${scanProgress}%` }}
                      ></div>
                    </div>
                    <p className="progress-text">{scanProgress}%</p>

                    {sensorData && (
                      <div className="sensor-readings">
                        <h3>Current Soil Readings</h3>
                        <div className="readings-grid">
                          <div className="reading-item">
                            <span className="reading-label">pH Level:</span>
                            <span className="reading-value">{sensorData.ph?.toFixed(1) || 'N/A'}</span>
                          </div>
                          <div className="reading-item">
                            <span className="reading-label">Nitrogen:</span>
                            <span className="reading-value">{sensorData.nitrogen || 'N/A'} ppm</span>
                          </div>
                          <div className="reading-item">
                            <span className="reading-label">Phosphorus:</span>
                            <span className="reading-value">{sensorData.phosphorus || 'N/A'} ppm</span>
                          </div>
                          <div className="reading-item">
                            <span className="reading-label">Potassium:</span>
                            <span className="reading-value">{sensorData.potassium || 'N/A'} ppm</span>
                          </div>
                          <div className="reading-item">
                            <span className="reading-label">Moisture:</span>
                            <span className="reading-value">{sensorData.moisture || 'N/A'}%</span>
                          </div>
                          <div className="reading-item">
                            <span className="reading-label">Temperature:</span>
                            <span className="reading-value">{sensorData.temperature || 'N/A'}°C</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {plotStep === 'confirm' && (
                  <div className="plot-confirm-step">
                    <div className="confirm-summary">
                      <h3>Planting Confirmation</h3>
                      
                      <div className="confirm-details">
                        <div className="confirm-item">
                          <span className="confirm-label">Plot Number:</span>
                          <span className="confirm-value">Plot {selectedPlotNumber}</span>
                        </div>
                        
                        <div className="confirm-item">
                          <span className="confirm-label">Plot Size:</span>
                          <span className="confirm-value">
                            {getDisplaySize(customPlotSize.length, customPlotSize.width)} 
                            ({calculatePlotSize(customPlotSize.length, customPlotSize.width).toFixed(4)} m²)
                          </span>
                        </div>

                        <div className="confirm-item">
                          <span className="confirm-label">Soil Sensor:</span>
                          <span className="confirm-value">{selectedSoilSensor}</span>
                        </div>

                        <div className="confirm-item">
                          <span className="confirm-label">Selected Plant:</span>
                          <span className="confirm-value">
                            {getPlantEmoji(selectedPlantType)} {plantsList[selectedPlantType]?.name}
                          </span>
                        </div>

                        <div className="confirm-item highlight">
                          <span className="confirm-label">Recommended Seedlings:</span>
                          <span className="confirm-value">{recommendedSeedlings} seedlings</span>
                        </div>

                        <div className="confirm-item">
                          <span className="confirm-label">Expected Harvest:</span>
                          <span className="confirm-value">
                            {plantsList[selectedPlantType]?.daysToHarvest} days
                          </span>
                        </div>
                      </div>

                      <div className="confirm-note">
                        <p>
                          <MdInfo style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                          <strong>Note:</strong> This recommendation is based on current soil analysis 
                          from {selectedSoilSensor}. Monitor regularly and adjust care as needed.
                        </p>
                      </div>
                    </div>

                    <div className="planting-modal-footer">
                      <button
                        className="planting-modal-btn planting-modal-cancel"
                        onClick={() => setPlotStep('input')}
                        disabled={isSubmitting}
                      >
                        Back
                      </button>
                      <button
                        className="planting-modal-btn planting-modal-save"
                        onClick={handleConfirmPlanting}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Adding Plant...' : 'Confirm & Add Plot'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showFertilizerModal && fertilizerInfo && (
          <div className="planting-modal-overlay" onClick={handleCloseFertilizerModal}>
            <div className="fertilizer-modal planting-modal planting-modal-large" onClick={(e) => e.stopPropagation()}>
              <div className="planting-modal-header">
                <h2 className="planting-modal-title">
                  <MdGrass style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                  Fertilizer Recommendations
                </h2>
                <button className="planting-modal-close" onClick={handleCloseFertilizerModal}>
                  ✕
                </button>
              </div>

              <div className="planting-modal-body">
                {/* Plant Info Header */}
                <div className="fertilizer-intro">
                  <h3>{fertilizerInfo.plantName}</h3>
                  <p>Current Stage: <strong>{fertilizerInfo.stage}</strong></p>
                  {fertilizerInfo.recommendations && (
                    <>
                      <p className="nutrient-condition-badge" style={{
                        background: fertilizerInfo.recommendations.isExactMatch ? '#dcfce7' : '#fef3c7',
                        color: fertilizerInfo.recommendations.isExactMatch ? '#166534' : '#92400e',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        display: 'inline-block',
                        marginTop: '8px'
                      }}>
                        <strong>Soil Condition:</strong> {fertilizerInfo.recommendations.currentCondition}
                        {fertilizerInfo.recommendations.isExactMatch ? ' ✓ Exact Match' : ' ~ Closest Match'}
                      </p>
                      {fertilizerInfo.recommendations.matchedScenario && (
                        <div style={{
                          marginTop: '12px',
                          padding: '12px',
                          background: '#f0f9ff',
                          borderRadius: '8px',
                          borderLeft: '4px solid #0ea5e9'
                        }}>
                          <strong>Recommended NPK Ratio:</strong> {fertilizerInfo.recommendations.matchedScenario.npkRatio}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Current Soil Status */}
                <div className="fertilizer-content">
                  <h4>📊 Current Soil Analysis</h4>
                  <div className="nutrients-grid">
                    <div className="nutrient-card">
                      <h4>Nitrogen (N)</h4>
                      <div className="nutrient-values">
                        <span>Current: {fertilizerInfo.current?.nitrogen || 0} ppm</span>
                        <span>Ideal: {fertilizerInfo.ideal?.nitrogen || 0} ppm</span>
                        <span className="range">Range: {fertilizerInfo.range?.nitrogen} ppm</span>
                        {fertilizerInfo.recommendations && (
                          <span className={`condition-badge ${fertilizerInfo.recommendations.nCondition.toLowerCase()}`}>
                            {fertilizerInfo.recommendations.nCondition}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="nutrient-card">
                      <h4>Phosphorus (P)</h4>
                      <div className="nutrient-values">
                        <span>Current: {fertilizerInfo.current?.phosphorus || 0} ppm</span>
                        <span>Ideal: {fertilizerInfo.ideal?.phosphorus || 0} ppm</span>
                        <span className="range">Range: {fertilizerInfo.range?.phosphorus} ppm</span>
                        {fertilizerInfo.recommendations && (
                          <span className={`condition-badge ${fertilizerInfo.recommendations.pCondition.toLowerCase()}`}>
                            {fertilizerInfo.recommendations.pCondition}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="nutrient-card">
                      <h4>Potassium (K)</h4>
                      <div className="nutrient-values">
                        <span>Current: {fertilizerInfo.current?.potassium || 0} ppm</span>
                        <span>Ideal: {fertilizerInfo.ideal?.potassium || 0} ppm</span>
                        <span className="range">Range: {fertilizerInfo.range?.potassium} ppm</span>
                        {fertilizerInfo.recommendations && (
                          <span className={`condition-badge ${fertilizerInfo.recommendations.kCondition.toLowerCase()}`}>
                            {fertilizerInfo.recommendations.kCondition}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="nutrient-card">
                      <h4>pH Level</h4>
                      <div className="nutrient-values">
                        <span>Current: {fertilizerInfo.current?.ph?.toFixed(2) || 0}</span>
                        <span>Ideal: {fertilizerInfo.ideal?.ph?.toFixed(2) || 0}</span>
                        <span className="range">Range: {fertilizerInfo.range?.ph}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recommended Fertilizer Treatment */}
                {fertilizerInfo.recommendations?.matchedScenario && (
                  <div className="fertilizer-recommendation-section">
                    <h4>
                      <MdCheckCircle style={{ marginRight: '8px', verticalAlign: 'middle', color: '#10b981' }} />
                      Recommended Treatment Plan
                    </h4>
                    
                    <div className="recommendation-card">
                      <div className="recommendation-header" style={{
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: 'white',
                        padding: '20px',
                        borderRadius: '12px 12px 0 0',
                        marginBottom: '20px'
                      }}>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.5em' }}>
                          NPK Ratio: {fertilizerInfo.recommendations.matchedScenario.npkRatio}
                        </h3>
                        <p style={{ margin: 0, opacity: 0.9 }}>
                          For condition: {fertilizerInfo.recommendations.matchedScenario.condition}
                        </p>
                      </div>

                      {/* Display Applications */}
                      {fertilizerInfo.recommendations.matchedScenario.applications && 
                      fertilizerInfo.recommendations.matchedScenario.applications.length > 0 && (
                        <div className="applications-section" style={{ padding: '0 20px 20px' }}>
                          <h4 style={{ 
                            marginBottom: '20px', 
                            color: '#0f172a',
                            fontSize: '1.2em',
                            borderBottom: '2px solid #e2e8f0',
                            paddingBottom: '10px'
                          }}>
                            📅 Application Schedule ({fertilizerInfo.recommendations.matchedScenario.applications.length} stages)
                          </h4>
                          
                          {fertilizerInfo.recommendations.matchedScenario.applications.map((app, index) => (
                            <div key={index} className="application-card" style={{
                              background: index === 0 ? '#fef3c7' : '#f8fafc',
                              padding: '20px',
                              borderRadius: '12px',
                              marginBottom: '16px',
                              border: index === 0 ? '2px solid #f59e0b' : '2px solid #e2e8f0',
                              position: 'relative'
                            }}>
                              {/* Stage Badge */}
                              {index === 0 && (
                                <div style={{
                                  position: 'absolute',
                                  top: '-12px',
                                  left: '20px',
                                  background: '#f59e0b',
                                  color: 'white',
                                  padding: '4px 12px',
                                  borderRadius: '12px',
                                  fontSize: '0.75em',
                                  fontWeight: 'bold'
                                }}>
                                  PRIORITY
                                </div>
                              )}
                              
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                marginBottom: '16px',
                                paddingBottom: '12px',
                                borderBottom: '1px solid #cbd5e1'
                              }}>
                                <div style={{
                                  width: '40px',
                                  height: '40px',
                                  borderRadius: '50%',
                                  background: index === 0 ? '#f59e0b' : '#0ea5e9',
                                  color: 'white',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 'bold',
                                  marginRight: '12px',
                                  fontSize: '1.2em'
                                }}>
                                  {index + 1}
                                </div>
                                <div>
                                  <h5 style={{ 
                                    margin: '0 0 4px 0', 
                                    color: '#1e293b',
                                    fontSize: '1.1em',
                                    fontWeight: '600'
                                  }}>
                                    {app.stage}
                                  </h5>
                                  <p style={{ margin: 0, fontSize: '0.85em', color: '#64748b' }}>
                                    <MdCalendarToday style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                                    {app.timing}
                                  </p>
                                </div>
                              </div>

<div className="detail-row" style={{ marginBottom: '12px' }}>
  {/* 1. Label/Header: Put this on its own line */}
  <div className="detail-label-header" style={{ 
    display: 'flex', 
    alignItems: 'center',
    fontWeight: '600',
    color: '#475569',
    marginBottom: '8px'
  }}>
    <MdScience style={{ marginRight: '6px', fontSize: '1.2em', color: '#0ea5e9' }} />
    Fertilizer Requirements:
  </div>
  
                          {/* 2. Content Container: This holds the three fertilizer boxes and must wrap them to fit */}
                          <div className="detail-value-container" style={{
                            background: 'white',
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            // CHANGED: Use grid for better control
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                            gap: '12px',
                          }}>
                        {Object.entries(app.bags).map(([type, amount], i) => {
                          const bagsPerHa = typeof amount === 'string' 
                            ? parseFloat(amount.split('-')[0]) || parseFloat(amount) || 0
                            : amount;
                          
                          const plotSize = parsePlotSizeToM2(fertilizerInfo.plant?.plotSize) || 0;
                          const fertilizerCalc = convertFertilizerToPlotSize(bagsPerHa, plotSize, true);
                          
                          return (
                            <div key={i} style={{ 
                              // CHANGED: Compact card layout
                              background: fertilizerCalc.unit === 'g' || fertilizerCalc.unit === 'mg' ? '#fffbeb' : '#f0f9ff',
                              border: `2px solid ${fertilizerCalc.unit === 'g' || fertilizerCalc.unit === 'mg' ? '#f59e0b' : '#0ea5e9'}`,
                              borderRadius: '8px',
                              padding: '12px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                            }}>
                              {/* Fertilizer Type - Compact Header */}
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '4px'
                              }}>
                                <span style={{ 
                                  fontWeight: '700', 
                                  fontSize: '1.1em',
                                  color: '#1e293b'
                                }}>
                                  {type}
                                </span>
                                <span style={{
                                  fontSize: '0.7em',
                                  fontWeight: '600',
                                  color: fertilizerCalc.unit === 'g' || fertilizerCalc.unit === 'mg' ? '#92400e' : '#0369a1',
                                  background: fertilizerCalc.unit === 'g' || fertilizerCalc.unit === 'mg' ? '#fef3c7' : '#e0f2fe',
                                  padding: '2px 6px',
                                  borderRadius: '10px'
                                }}>
                                  {fertilizerCalc.unit === 'g' ? '⚖️ g' : fertilizerCalc.unit === 'mg' ? '⚖️ mg' : 'kg'}
                                </span>
                              </div>
                              
                              {/* Main Amount - Compact Display */}
                              <div style={{
                                textAlign: 'center',
                                margin: '8px 0'
                              }}>
                                <div style={{
                                  fontSize: '1.4em',
                                  fontWeight: '800',
                                  color: fertilizerCalc.unit === 'g' || fertilizerCalc.unit === 'mg' ? '#b45309' : '#0c4a6e',
                                  lineHeight: '1.2'
                                }}>
                                  {fertilizerCalc.amount} {fertilizerCalc.unit}
                                </div>
                                <div style={{
                                  fontSize: '0.8em',
                                  color: '#64748b',
                                  marginTop: '4px'
                                }}>
                                  {fertilizerCalc.bags} bags
                                </div>
                              </div>
                              
                              {/* Per Hectare Reference - Small text at bottom */}
                              <div style={{
                                fontSize: '0.7em',
                                color: '#94a3b8',
                                textAlign: 'center',
                                marginTop: 'auto',
                                paddingTop: '8px',
                                borderTop: '1px dashed #cbd5e1'
                              }}>
                                <div style={{ marginBottom: '2px' }}>
                                  {amount} bags/ha
                                </div>
                                <div>
                                  = {(bagsPerHa * 50).toFixed(1)} kg/ha
                                </div>
                              </div>
                            </div>
                          );
                        })}
                          </div>
                        </div>
                              {/* Application Method */}
                              <div className="detail-row">
                                <span className="detail-label" style={{ 
                                  display: 'flex', 
                                  alignItems: 'center',
                                  fontWeight: '600',
                                  color: '#475569',
                                  marginBottom: '8px'
                                }}>
                                  <MdTimeline style={{ marginRight: '6px', fontSize: '1.2em', color: '#10b981' }} />
                                  Application Method:
                                </span>
                                <div className="detail-value" style={{
                                  background: '#f0fdf4',
                                  padding: '12px',
                                  borderRadius: '8px',
                                  border: '1px solid #bbf7d0',
                                  fontSize: '0.95em',
                                  lineHeight: '1.6',
                                  color: '#166534'
                                }}>
                                  {app.method}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Job Order Generation Section */}
                      <div className="job-order-section" style={{
                        marginTop: '30px',
                        padding: '20px',
                        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                        borderRadius: '12px',
                        border: '2px solid #0ea5e9'
                      }}>
                        <h4 style={{ 
                          color: '#0369a1', 
                          marginBottom: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: '1.1em'
                        }}>
                          <MdCalendarToday style={{ marginRight: '8px', fontSize: '1.3em' }} />
                          Generate Application Schedule
                        </h4>
                        <p style={{ fontSize: '0.9em', color: '#475569', marginBottom: '15px', lineHeight: '1.6' }}>
                          Create automatic job orders for each application stage in the fertilizer schedule. 
                          {fertilizerInfo.recommendations.matchedScenario.applications && (
                            <><br/>Jobs will include: <strong>{fertilizerInfo.recommendations.matchedScenario.applications.map(app => app.stage).join(', ')}</strong></>
                          )}
                        </p>
                        
                        <button
                            className="generate-job-order-btn"
                            onClick={async () => {
                              setIsGeneratingJobOrders(true)
                              try {
                                const jobOrderManager = new JobOrderManager(userId, 'Admin User');
                                const eventIds = await jobOrderManager.generateFertilizerJobOrders(
                                  selectedPlant,
                                  fertilizerInfo.recommendations
                                )
                                
                                showAlert({
                                  type: 'success',
                                  title: '✅ Job Orders & Events Created!',
                                  message: `Successfully created ${eventIds.length} fertilizer application job orders and events`,
                                  details: [
                                    { label: 'NPK Ratio', value: fertilizerInfo.recommendations.matchedScenario.npkRatio },
                                    { label: 'Condition', value: fertilizerInfo.recommendations.matchedScenario.condition },
                                    { label: 'Total applications', value: eventIds.length.toString() },
                                    { label: 'First application', value: new Date().toLocaleDateString() },
                                    { label: 'Events created', value: `${eventIds.length + 1} events (scheduled + summary)` }
                                  ],
                                  confirmText: 'View Events',
                                  onConfirm: handleViewEvents
                                })
                                
                                handleCloseFertilizerModal()
                              } catch (error) {
                                showAlert({
                                  type: 'error',
                                  title: 'Failed to Create Job Orders',
                                  message: 'An error occurred while generating job orders',
                                  details: [{ label: 'Error', value: error.message }],
                                  confirmText: 'OK'
                                })
                              } finally {
                                setIsGeneratingJobOrders(false)
                              }
                            }}
                            disabled={isGeneratingJobOrders}
                            style={{
                              width: '100%',
                              padding: '14px 20px',
                              background: isGeneratingJobOrders 
                                ? 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)' 
                                : 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              fontSize: '1em',
                              fontWeight: '600',
                              cursor: isGeneratingJobOrders ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '10px',
                              transition: 'all 0.3s',
                              boxShadow: isGeneratingJobOrders ? 'none' : '0 4px 6px rgba(14, 165, 233, 0.3)'
                            }}
                          >
                            {isGeneratingJobOrders ? (
                              <>
                                <span className="loading-spinner" style={{ 
                                  animation: 'spin 1s linear infinite',
                                  display: 'inline-block'
                                }}>🔄</span>
                                Creating Job Orders...
                              </>
                            ) : (
                              <>
                                <MdCalendarToday />
                                Generate {fertilizerInfo.recommendations.matchedScenario.applications?.length || 0} Job Orders
                              </>
                            )}
                          </button>
                        
                        <p style={{ 
                          fontSize: '0.8em', 
                          color: '#64748b', 
                          marginTop: '12px',
                          textAlign: 'center',
                          lineHeight: '1.5'
                        }}>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {fertilizerInfo.recommendations && !fertilizerInfo.recommendations.matchedScenario && (
                  <div className="no-recommendations" style={{
                    padding: '40px',
                    textAlign: 'center',
                    background: '#fef2f2',
                    borderRadius: '12px',
                    border: '2px dashed #fca5a5',
                    color: '#991b1b'
                  }}>
                    <MdWarning style={{ fontSize: '48px', marginBottom: '16px' }} />
                    <p style={{ fontSize: '1.1em', fontWeight: '600', marginBottom: '8px' }}>
                      No specific fertilizer recommendations available
                    </p>
                    <p style={{ fontSize: '0.9em', color: '#7f1d1d' }}>
                      Please consult with an agricultural expert for customized advice for this nutrient condition.
                    </p>
                  </div>
                )}

                <div className="fertilizer-note" style={{
                  marginTop: '20px',
                  padding: '16px',
                  background: '#fffbeb',
                  borderLeft: '4px solid #f59e0b',
                  borderRadius: '8px'
                }}>
                  <p style={{ margin: 0, color: '#92400e', fontSize: '0.9em', lineHeight: '1.6' }}>
                    <MdInfo style={{ marginRight: '8px', verticalAlign: 'middle', color: '#f59e0b' }} />
                    <strong>Important Note:</strong> Apply fertilizers according to package instructions. 
                    Monitor soil regularly and adjust application as needed. Always wear protective equipment when handling fertilizers.
                  </p>
                </div>
              </div>

              <div className="planting-modal-footer">
                <button
                  className="planting-modal-btn planting-modal-cancel"
                  onClick={handleCloseFertilizerModal}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Price Recommendation Modal */}
        {showPriceModal && priceRecommendation && (
          <div className="planting-modal-overlay" onClick={handleClosePriceModal}>
            <div className="price-modal planting-modal" onClick={(e) => e.stopPropagation()}>
              <div className="planting-modal-header">
                <h2 className="planting-modal-title">
                  <MdAttachMoney style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                  Price Recommendation
                  {priceRecommendation.source === 'production_costing' && (
                    <span style={{
                      marginLeft: '12px',
                      fontSize: '0.7em',
                      background: '#10b981',
                      color: 'white',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontWeight: '600'
                    }}>
                      âœ… FROM PRODUCTION COSTING
                    </span>
                  )}
                </h2>
                <button className="planting-modal-close" onClick={handleClosePriceModal}>
                  âœ•
                </button>
              </div>

              <div className="planting-modal-body">
                {/* Warning banner if using fallback data */}
                {priceRecommendation.warning && (
                  <div style={{
                    padding: '12px 16px',
                    background: '#fffbeb',
                    border: '2px solid #f59e0b',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <MdWarning style={{ fontSize: '24px', color: '#f59e0b' }} />
                    <div>
                      <strong style={{ color: '#92400e' }}>Note:</strong>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.9em', color: '#78350f' }}>
                        {priceRecommendation.warning}
                      </p>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.85em', color: '#92400e' }}>
                        Add production costing data in the <strong>Production module</strong> for accurate pricing.
                      </p>
                    </div>
                  </div>
                )}

                <div className="price-strategy-badge">
                  <span className={`strategy-badge strategy-${priceRecommendation.priceStrategy.toLowerCase().replace(' ', '-')}`}>
                    {priceRecommendation.priceStrategy}
                  </span>
                  <span className="quality-score">
                    Quality Score: <strong>{priceRecommendation.qualityScore}%</strong>
                  </span>
                </div>

                {/* Production Cost Breakdown (if available) */}
                {priceRecommendation.totalCost && (
                  <div style={{
                    background: '#f0fdf4',
                    padding: '16px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    border: '2px solid #10b981'
                  }}>
                    <h4 style={{ margin: '0 0 12px 0', color: '#065f46', fontSize: '1em' }}>
                      Production Cost Analysis
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: '0.85em', color: '#047857' }}>Total Production Cost:</p>
                        <p style={{ margin: '4px 0 0 0', fontSize: '1.2em', fontWeight: 'bold', color: '#065f46' }}>
                          ₱{priceRecommendation.totalCost.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: '0.85em', color: '#047857' }}>Profit Amount:</p>
                        <p style={{ margin: '4px 0 0 0', fontSize: '1.2em', fontWeight: 'bold', color: '#065f46' }}>
                          ₱{(priceRecommendation.profitAmount || 0).toLocaleString()}
                        </p>
                      </div>
                      {priceRecommendation.profitMargin && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <p style={{ margin: 0, fontSize: '0.85em', color: '#047857' }}>Profit Margin:</p>
                          <p style={{ margin: '4px 0 0 0', fontSize: '1.2em', fontWeight: 'bold', color: '#065f46' }}>
                            {priceRecommendation.profitMargin}%
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="price-highlight-card">
                  <div className="price-icon">
                    <MdAttachMoney style={{ fontSize: '48px', color: '#10b981' }} />
                  </div>
                  <div className="price-content">
                    <p className="price-label">Recommended Selling Price</p>
                    <h3 className="price-amount">₱{priceRecommendation.recommendedPrice}</h3>
                    <p className="price-unit">{priceRecommendation.unit}</p>
                    {priceRecommendation.lastUpdate && (
                      <p style={{ fontSize: '0.8em', color: '#666', marginTop: '8px' }}>
                        Last updated: {new Date(priceRecommendation.lastUpdate.toDate()).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>

                <div className="price-section">
                  <h3 className="section-title">Price Range Analysis</h3>
                  <div className="price-range-container">
                    <div className="price-range-bar">
                      <div className="range-marker min-marker" style={{ left: '0%' }}>
                        <span className="marker-label">Min</span>
                        <span className="marker-value">₱{priceRecommendation.minPrice}</span>
                      </div>
                      <div 
                        className="range-marker avg-marker" 
                        style={{ left: `${((priceRecommendation.avgMarketPrice - priceRecommendation.minPrice) / (priceRecommendation.maxPrice - priceRecommendation.minPrice)) * 100}%` }}
                      >
                        <span className="marker-label">Avg</span>
                        <span className="marker-value">₱{priceRecommendation.avgMarketPrice}</span>
                      </div>
                      <div 
                        className="range-marker recommended-marker" 
                        style={{ left: `${((priceRecommendation.recommendedPrice - priceRecommendation.minPrice) / (priceRecommendation.maxPrice - priceRecommendation.minPrice)) * 100}%` }}
                      >
                        <span className="marker-label">✓</span>
                        <span className="marker-value">₱{priceRecommendation.recommendedPrice}</span>
                      </div>
                      <div className="range-marker max-marker" style={{ left: '100%' }}>
                        <span className="marker-label">Max</span>
                        <span className="marker-value">₱{priceRecommendation.maxPrice}</span>
                      </div>
                      <div className="range-bar-fill" />
                    </div>
                  </div>
                </div>


                {/* Call to action if no production costing */}
                {priceRecommendation.source === 'plantsList_fallback' && (
                  <div style={{
                    marginTop: '20px',
                    padding: '16px',
                    background: '#eff6ff',
                    border: '2px solid #3b82f6',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <h4 style={{ margin: '0 0 8px 0', color: '#1e40af' }}>
                      Want more accurate pricing?
                    </h4>
                    <p style={{ margin: '0 0 12px 0', fontSize: '0.9em', color: '#1e3a8a' }}>
                      Add production costing data for this plant to get AI-powered price recommendations based on your actual costs.
                    </p>
                    <button
                      onClick={() => {
                        handleClosePriceModal()
                        navigate('/production/admin')
                      }}
                      style={{
                        padding: '10px 20px',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.95em',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      Go to Production Costing →
                    </button>
                  </div>
                )}
              </div>

              <div className="planting-modal-footer">
                <button
                  className="planting-modal-btn planting-modal-cancel"
                  onClick={handleClosePriceModal}
                >
                  Cancel
                </button>
                <button
                  className="planting-modal-btn planting-modal-save"
                  onClick={async () => {
                    try {
                      if (selectedPlant) {
                        const plantRef = doc(db, 'plants', selectedPlant.id)
                        await updateDoc(plantRef, {
                          currentSellingPrice: priceRecommendation.recommendedPrice,
                          priceSource: priceRecommendation.source,
                          updatedAt: serverTimestamp()
                        })
                        
                        setPlantsData(prev =>
                          prev.map(plant =>
                            plant.id === selectedPlant.id
                              ? { 
                                  ...plant, 
                                  currentSellingPrice: priceRecommendation.recommendedPrice,
                                  priceSource: priceRecommendation.source
                                }
                              : plant
                          )
                        )
                        
                        showAlert({
                          type: 'success',
                          title: 'Price Updated',
                          message: `Price set to ₱${priceRecommendation.recommendedPrice} ${priceRecommendation.unit}`,
                          details: [
                            { label: 'Source', value: priceRecommendation.priceStrategy },
                            ...(priceRecommendation.totalCost ? [
                              { label: 'Production Cost', value: `₱${priceRecommendation.totalCost.toLocaleString()}` },
                              { label: 'Profit Margin', value: `${priceRecommendation.profitMargin}%` }
                            ] : [])
                          ],
                          confirmText: 'OK'
                        })
                        handleClosePriceModal()
                      }
                    } catch (error) {
                      console.error('Error updating price:', error)
                      showAlert({
                        type: 'error',
                        title: 'Update Failed',
                        message: 'Failed to update price',
                        confirmText: 'OK'
                      })
                    }
                  }}
                >
                  Apply Price
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Harvest Modal */}
        {showHarvestModal && selectedPlant && (
          <div className="planting-modal-overlay" onClick={handleCloseHarvestModal}>
            <div className="harvest-modal planting-modal" onClick={(e) => e.stopPropagation()}>
              <div className="planting-modal-header">
                <h2 className="planting-modal-title">🌾 Harvest Plant</h2>
                <button className="planting-modal-close" onClick={handleCloseHarvestModal}>
                  ✕
                </button>
              </div>

              <div className="planting-modal-body">
                <div className="harvest-summary-card">
                  <h3>{selectedPlant.plantName}</h3>
                  <div className="harvest-summary-grid">
                    <div className="harvest-summary-item">
                      <span className="summary-label">Plot:</span>
                      <span className="summary-value">Plot {selectedPlant.plotNumber}</span>
                    </div>
                    <div className="harvest-summary-item">
                      <span className="summary-label">Planted:</span>
                      <span className="summary-value">
                        {selectedPlant.plantedDate ? new Date(selectedPlant.plantedDate).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                    <div className="harvest-summary-item">
                      <span className="summary-label">Expected Harvest:</span>
                      <span className="summary-value">
                        {selectedPlant.expectedHarvestDate ? new Date(selectedPlant.expectedHarvestDate).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                    <div className="harvest-summary-item">
                      <span className="summary-label">Surviving Plants:</span>
                      <span className="summary-value">
                        {selectedPlant.survivingPlants ?? selectedPlant.recommendedSeedlings}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="harvest-form">
                  <div className="planting-form-group">
                    <label>
                      Harvest Date <span style={{ color: '#d32f2f' }}>*</span>
                    </label>
                    <input
                      type="date"
                      name="harvestDate"
                      value={harvestData.harvestDate}
                      onChange={handleHarvestInputChange}
                      className="planting-form-input"
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>

                  <div className="harvest-yield-group">
                    <div className="planting-form-group" style={{ flex: 2 }}>
                      <label>
                        Actual Yield <span style={{ color: '#d32f2f' }}>*</span>
                      </label>
                      <input
                        type="number"
                        name="actualYield"
                        value={harvestData.actualYield}
                        onChange={handleHarvestInputChange}
                        className="planting-form-input"
                        placeholder="Enter yield amount"
                        min="0"
                        step="0.1"
                      />
                    </div>

                    <div className="planting-form-group" style={{ flex: 1 }}>
                      <label>Unit</label>
                      <select
                        name="yieldUnit"
                        value={harvestData.yieldUnit}
                        onChange={handleHarvestInputChange}
                        className="planting-form-select"
                      >
                        <option value="kg">kg</option>
                        <option value="piece">piece</option>
                        <option value="bundle">bundle</option>
                        <option value="pack">pack</option>
                        <option value="dozen">dozen</option>
                      </select>
                    </div>
                  </div>

                  <div className="planting-form-group">
                    <label>Quality Grade</label>
                    <select
                      name="quality"
                      value={harvestData.quality}
                      onChange={handleHarvestInputChange}
                      className="planting-form-select"
                    >
                      <option value="A">Grade A - Premium</option>
                      <option value="B">Grade B - Good</option>
                      <option value="C">Grade C - Fair</option>
                      <option value="D">Grade D - Poor</option>
                    </select>
                  </div>

                  <div className="planting-form-group">
                    <label>Notes (Optional)</label>
                    <textarea
                      name="notes"
                      value={harvestData.notes}
                      onChange={handleHarvestInputChange}
                      className="planting-form-textarea"
                      placeholder="Add any notes about the harvest..."
                      rows="3"
                    />
                  </div>
                </div>

                {selectedPlant.currentSellingPrice && harvestData.actualYield && (
                  <div className="harvest-preview">
                    <h4>Revenue Preview</h4>
                    <div className="preview-grid">
                      <div className="preview-item">
                        <span className="preview-label">Yield:</span>
                        <span className="preview-value">
                          {harvestData.actualYield} {harvestData.yieldUnit}
                        </span>
                      </div>
                      <div className="preview-item">
                        <span className="preview-label">Price per unit:</span>
                        <span className="preview-value">
                          ₱{parseFloat(selectedPlant.currentSellingPrice).toLocaleString()}
                        </span>
                      </div>
                      <div className="preview-item highlight">
                        <span className="preview-label">Total Revenue:</span>
                        <span className="preview-value">
                          ₱{(parseFloat(harvestData.actualYield) * parseFloat(selectedPlant.currentSellingPrice)).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {!selectedPlant.currentSellingPrice && (
                  <div className="harvest-warning">
                    ⚠️ No selling price set. Revenue will not be calculated.
                  </div>
                )}
              </div>

              <div className="planting-modal-footer">
                <button
                  className="planting-modal-btn planting-modal-cancel"
                  onClick={handleCloseHarvestModal}
                >
                  Cancel
                </button>
                <button
                  className="planting-modal-btn planting-modal-save harvest-confirm-btn"
                  onClick={handleConfirmHarvest}
                  disabled={!harvestData.actualYield || parseFloat(harvestData.actualYield) <= 0}
                >
                  🌾 Confirm Harvest
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Plant Detail Modal with updated Soil Data visualization */}
        {showDetailModal && selectedPlant && (
          <div className="planting-modal-overlay" onClick={handleCloseDetailModal}>
            <div className="detail-modal planting-modal planting-modal-large" onClick={(e) => e.stopPropagation()}>
              <div className="planting-modal-header">
                <div className="detail-header-content">
                  <span className="detail-plant-icon">
                    {getPlantEmoji(selectedPlant.plantType)}
                  </span>
                  <div>
                    <h2 className="planting-modal-title">{selectedPlant.plantName}</h2>
                    <p className="detail-plant-subtitle">{selectedPlant.scientificName} - Plot {selectedPlant.plotNumber}</p>
                  </div>
                </div>
                <button className="planting-modal-close" onClick={handleCloseDetailModal}>
                  ✕
                </button>
              </div>

              <div className="detail-tabs">
                <button
                  className={`detail-tab ${activeDetailTab === 'summary' ? 'active' : ''}`}
                  onClick={() => setActiveDetailTab('summary')}
                >
                  <MdAssessment style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Summary
                </button>
                <button
                  className={`detail-tab ${activeDetailTab === 'soil' ? 'active' : ''}`}
                  onClick={() => setActiveDetailTab('soil')}
                >
                  <MdEco style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Soil Data
                </button>
                <button
                  className={`detail-tab ${activeDetailTab === 'events' ? 'active' : ''}`}
                  onClick={() => setActiveDetailTab('events')}
                >
                  <MdCalendarToday style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Events
                </button>
              </div>

              <div className="planting-modal-body">
                {activeDetailTab === 'summary' && (
                  <div className="detail-content">
                    <h3>Plant Summary</h3>
                    
                    <div className="detail-grid">
                      <div className="detail-card">
                        <h4>Plot Information</h4>
                        <div className="detail-info-list">
                          <div className="detail-info-item">
                            <span className="detail-label">Plot Number:</span>
                            <span className="detail-value">Plot {selectedPlant.plotNumber}</span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Plot Size:</span>
                            <span className="detail-value">{selectedPlant.plotSize}</span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Location:</span>
                            <span className="detail-value">{selectedPlant.locationZone}</span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Soil Sensor:</span>
                            <span className="detail-value">{selectedPlant.soilSensor}</span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Spacing:</span>
                            <span className="detail-value">{selectedPlant.minSpacing} - {selectedPlant.maxSpacing} cm</span>
                          </div>
                        </div>
                      </div>

                      <div className="detail-card">
                        <h4>Growth Status</h4>
                        <div className="detail-info-list">
                          <div className="detail-info-item">
                            <span className="detail-label">Current Stage:</span>
                            <span className="detail-value">
                              <span 
                                className="status-badge-inline" 
                                style={{ backgroundColor: getStatusColor(getCurrentStage(selectedPlant, plantsList[selectedPlant.plantType])?.stage || selectedPlant.status) }}
                              >
                                {getCurrentStage(selectedPlant, plantsList[selectedPlant.plantType])?.stage || selectedPlant.status}
                              </span>
                            </span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Planted Date:</span>
                            <span className="detail-value">
                              {selectedPlant.plantedDate ? new Date(selectedPlant.plantedDate).toLocaleDateString() : 'N/A'}
                            </span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Expected Harvest:</span>
                            <span className="detail-value">
                              {selectedPlant.expectedHarvestDate ? new Date(selectedPlant.expectedHarvestDate).toLocaleDateString() : 'N/A'}
                            </span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Days to Harvest:</span>
                            <span className="detail-value">{selectedPlant.daysToHarvest} days</span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Seedlings:</span>
                            <span className="detail-value">
                              {selectedPlant.survivingPlants ?? selectedPlant.recommendedSeedlings} / {selectedPlant.recommendedSeedlings}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="detail-card">
                        <h4>Production Details</h4>
                        <div className="detail-info-list">
                          <div className="detail-info-item">
                            <span className="detail-label">Current Price:</span>
                            <span className="detail-value">
                              {selectedPlant.currentSellingPrice ? `₱${selectedPlant.currentSellingPrice}` : 'Not set'}
                            </span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Unit:</span>
                            <span className="detail-value">{selectedPlant.unit}</span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Description:</span>
                            <span className="detail-value">{selectedPlant.description}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeDetailTab === 'soil' && (
                  <div className="detail-content">
                    <h3>Soil Sensor Readings</h3>
                    <p className="detail-subtitle">Data from {selectedPlant.soilSensor}</p>

                    {selectedPlant.sensorData ? (
                      <>
                        <div className="soil-data-grid">
                          {(() => {
                            const plantInfo = plantsList[selectedPlant.plantType]
                            const currentStage = getCurrentStage(selectedPlant, plantInfo)
                            
                            if (!currentStage) return null
                            
                            const phPercent = calculateSensorPercentage(
                              selectedPlant.sensorData.ph,
                              currentStage.lowpH,
                              currentStage.highpH
                            )
                            const nPercent = calculateSensorPercentage(
                              selectedPlant.sensorData.nitrogen,
                              currentStage.lowN,
                              currentStage.highN
                            )
                            const pPercent = calculateSensorPercentage(
                              selectedPlant.sensorData.phosphorus,
                              currentStage.lowP,
                              currentStage.highP
                            )
                            const kPercent = calculateSensorPercentage(
                              selectedPlant.sensorData.potassium,
                              currentStage.lowK,
                              currentStage.highK
                            )
                            const moistPercent = calculateSensorPercentage(
                              selectedPlant.sensorData.moisture,
                              currentStage.lowHum,
                              currentStage.highHum
                            )
                            const tempPercent = calculateSensorPercentage(
                              selectedPlant.sensorData.temperature,
                              currentStage.lowTemp,
                              currentStage.highTemp
                            )
                            
                            return (
                              <>
                                <div className="soil-data-card">
                                  <div className="soil-data-icon">
                                    <MdScience />
                                  </div>
                                  <div className="soil-data-content">
                                    <h4>pH Level</h4>
                                    <p className="soil-value">{selectedPlant.sensorData.ph?.toFixed(2) || 'N/A'}</p>
                                    <p className="soil-label">Acidity/Alkalinity</p>
                                    <p className="soil-range">Range: {currentStage.lowpH} - {currentStage.highpH}</p>
                                    <div style={{
                                      marginTop: '8px',
                                      padding: '6px 12px',
                                      background: getPercentageColor(phPercent),
                                      color: 'white',
                                      borderRadius: '4px',
                                      fontWeight: 'bold',
                                      fontSize: '0.9em'
                                    }}>
                                      {phPercent.toFixed(0)}% Optimal
                                    </div>
                                  </div>
                                </div>

                                <div className="soil-data-card">
                                  <div className="soil-data-icon">
                                    <MdEco />
                                  </div>
                                  <div className="soil-data-content">
                                    <h4>Nitrogen (N)</h4>
                                    <p className="soil-value">{selectedPlant.sensorData.nitrogen || 'N/A'} ppm</p>
                                    <p className="soil-label">Leaf Growth</p>
                                    <p className="soil-range">Range: {currentStage.lowN} - {currentStage.highN} ppm</p>
                                    <div style={{
                                      marginTop: '8px',
                                      padding: '6px 12px',
                                      background: getPercentageColor(nPercent),
                                      color: 'white',
                                      borderRadius: '4px',
                                      fontWeight: 'bold',
                                      fontSize: '0.9em'
                                    }}>
                                      {nPercent.toFixed(0)}% Optimal
                                    </div>
                                  </div>
                                </div>

                                <div className="soil-data-card">
                                  <div className="soil-data-icon">
                                    <MdGrass />
                                  </div>
                                  <div className="soil-data-content">
                                    <h4>Phosphorus (P)</h4>
                                    <p className="soil-value">{selectedPlant.sensorData.phosphorus || 'N/A'} ppm</p>
                                    <p className="soil-label">Root Development</p>
                                    <p className="soil-range">Range: {currentStage.lowP} - {currentStage.highP} ppm</p>
                                    <div style={{
                                      marginTop: '8px',
                                      padding: '6px 12px',
                                      background: getPercentageColor(pPercent),
                                      color: 'white',
                                      borderRadius: '4px',
                                      fontWeight: 'bold',
                                      fontSize: '0.9em'
                                    }}>
                                      {pPercent.toFixed(0)}% Optimal
                                    </div>
                                  </div>
                                </div>

                                <div className="soil-data-card">
                                  <div className="soil-data-icon">
                                    <MdLocalFlorist />
                                  </div>
                                  <div className="soil-data-content">
                                    <h4>Potassium (K)</h4>
                                    <p className="soil-value">{selectedPlant.sensorData.potassium || 'N/A'} ppm</p>
                                    <p className="soil-label">Overall Health</p>
                                    <p className="soil-range">Range: {currentStage.lowK} - {currentStage.highK} ppm</p>
                                    <div style={{
                                      marginTop: '8px',
                                      padding: '6px 12px',
                                      background: getPercentageColor(kPercent),
                                      color: 'white',
                                      borderRadius: '4px',
                                      fontWeight: 'bold',
                                      fontSize: '0.9em'
                                    }}>
                                      {kPercent.toFixed(0)}% Optimal
                                    </div>
                                  </div>
                                </div>

                                <div className="soil-data-card">
                                  <div className="soil-data-icon">
                                    <MdOpacity />
                                  </div>
                                  <div className="soil-data-content">
                                    <h4>Moisture</h4>
                                    <p className="soil-value">{selectedPlant.sensorData.moisture || 'N/A'}%</p>
                                    <p className="soil-label">Water Content</p>
                                    <p className="soil-range">Range: {currentStage.lowHum} - {currentStage.highHum}%</p>
                                    <div style={{
                                      marginTop: '8px',
                                      padding: '6px 12px',
                                      background: getPercentageColor(moistPercent),
                                      color: 'white',
                                      borderRadius: '4px',
                                      fontWeight: 'bold',
                                      fontSize: '0.9em'
                                    }}>
                                      {moistPercent.toFixed(0)}% Optimal
                                    </div>
                                  </div>
                                </div>

                                <div className="soil-data-card">
                                  <div className="soil-data-icon">
                                    <MdThermostat />
                                  </div>
                                  <div className="soil-data-content">
                                    <h4>Temperature</h4>
                                    <p className="soil-value">{selectedPlant.sensorData.temperature || 'N/A'}°C</p>
                                    <p className="soil-label">Soil Temperature</p>
                                    <p className="soil-range">Range: {currentStage.lowTemp} - {currentStage.highTemp}°C</p>
                                    <div style={{
                                      marginTop: '8px',
                                      padding: '6px 12px',
                                      background: getPercentageColor(tempPercent),
                                      color: 'white',
                                      borderRadius: '4px',
                                      fontWeight: 'bold',
                                      fontSize: '0.9em'
                                    }}>
                                      {tempPercent.toFixed(0)}% Optimal
                                    </div>
                                  </div>
                                </div>
                              </>
                            )
                          })()}
                        </div>

                        {(() => {
                          const plantInfo = plantsList[selectedPlant.plantType]
                          const currentStage = getCurrentStage(selectedPlant, plantInfo)
                          if (currentStage) {
                            return (
                              <div className="stage-requirements">
                                <h4>Current Stage: {currentStage.stage}</h4>
                                <p className="stage-duration">
                                  Day {currentStage.startDuration} - {currentStage.endDuration} 
                                  ({currentStage.endDuration - currentStage.startDuration + 1} days)
                                </p>
                                <div className="stage-notes">
                                  <p><strong>Notes:</strong> {currentStage.notes}</p>
                                  <p><strong>Watering:</strong> {currentStage.watering}</p>
                                </div>
                              </div>
                            )
                          }
                        })()}
                      </>
                    ) : (
                      <div className="no-data-message">
                        <p>No soil sensor data available for this plant.</p>
                      </div>
                    )}

                    <div className="soil-actions">
                      <button
                        className="planting-modal-btn planting-modal-save"
                        onClick={() => {
                          handleCloseDetailModal()
                          handleOpenFertilizerModal(selectedPlant)
                        }}
                      >
                        View Fertilizer Recommendations
                      </button>
                    </div>
                  </div>
                )}

                {activeDetailTab === 'events' && (
  <div className="detail-content">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
      <h3>Plant Events & History</h3>
      
      {/* NEW: Filter for job orders */}
      <div className="job-order-filter">
        <label style={{ marginRight: '10px', fontSize: '0.9em', color: '#64748b' }}>Filter:</label>
        <select
          value={jobOrderFilter}
          onChange={(e) => setJobOrderFilter(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            fontSize: '0.9em',
            cursor: 'pointer'
          }}
        >
          <option value="all">All Events</option>
          <option value="pending">Pending Jobs</option>
          <option value="in-progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="lifecycle">Lifecycle Only</option>
        </select>
      </div>
    </div>
    
    <div className="events-timeline">
      {plantEvents.length > 0 ? (
        plantEvents
          .filter(event => {
            if (jobOrderFilter === 'all') return true
            if (jobOrderFilter === 'lifecycle') return event.type === 'LIFECYCLE_STAGE'
            if (jobOrderFilter === 'pending') return event.type === 'FERTILIZER_JOB_ORDER' && event.status === 'pending'
            if (jobOrderFilter === 'in-progress') return event.type === 'FERTILIZER_JOB_ORDER' && event.status === 'in-progress'
            if (jobOrderFilter === 'completed') return event.type === 'FERTILIZER_JOB_ORDER' && event.status === 'completed'
            if (jobOrderFilter === 'cancelled') return event.type === 'FERTILIZER_JOB_ORDER' && event.status === 'cancelled'
            return true
          })
          .map((event, index) => {
            const isJobOrder = event.type === 'FERTILIZER_JOB_ORDER'
            
            return (
              <div key={event.id} className={`timeline-item ${isJobOrder ? 'job-order-item' : ''}`}>
                <div className="timeline-marker">
                  {event.type === 'LIFECYCLE_STAGE' && <MdEco style={{ fontSize: '24px', color: '#10b981' }} />}
                  {event.type === 'FERTILIZER_JOB_ORDER' && (
                    <MdGrass style={{ 
                      fontSize: '24px', 
                      color: event.status === 'completed' ? '#10b981' : 
                             event.status === 'cancelled' ? '#ef4444' : 
                             event.status === 'in-progress' ? '#f59e0b' : '#3b82f6'
                    }} />
                  )}
                  {!['LIFECYCLE_STAGE', 'FERTILIZER_JOB_ORDER'].includes(event.type) && (
                    <MdInfo style={{ fontSize: '24px' }} />
                  )}
                </div>
                
                <div className="timeline-content" style={{ flex: 1 }}>
                  {isJobOrder ? (
                    <div className="job-order-card" style={{
                      background: event.status === 'completed' ? '#f0fdf4' : 
                                 event.status === 'cancelled' ? '#fef2f2' : 
                                 event.status === 'in-progress' ? '#fffbeb' : '#f8fafc',
                      padding: '15px',
                      borderRadius: '8px',
                      border: `2px solid ${
                        event.status === 'completed' ? '#10b981' : 
                        event.status === 'cancelled' ? '#ef4444' : 
                        event.status === 'in-progress' ? '#f59e0b' : '#3b82f6'
                      }`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ margin: '0 0 8px 0', color: '#0f172a' }}>
                            📋 {event.title}
                          </h4>
                          <p style={{ margin: '0 0 12px 0', fontSize: '0.9em', color: '#475569' }}>
                            {event.description}
                          </p>
                          
                          <div className="job-order-details" style={{ fontSize: '0.85em', color: '#64748b' }}>
                            <div style={{ marginBottom: '6px' }}>
                              <strong>📅 Scheduled:</strong> {new Date(event.scheduledDate).toLocaleString()}
                            </div>
                            <div style={{ marginBottom: '6px' }}>
                              <strong>🔄 Application:</strong> {event.applicationNumber} of {event.totalApplications}
                            </div>
                            <div style={{ marginBottom: '6px' }}>
                              <strong>📊 Method:</strong> {event.applicationMethod}
                            </div>
                            {event.expectedResult && (
                              <div style={{ 
                                marginTop: '10px', 
                                padding: '8px', 
                                background: '#f1f5f9', 
                                borderRadius: '4px',
                                borderLeft: '3px solid #10b981'
                              }}>
                                <strong>✨ Expected Result:</strong> {event.expectedResult}
                              </div>
                            )}
                            {event.notes && event.status === 'completed' && (
                              <div style={{ marginTop: '8px' }}>
                                <strong>📝 Notes:</strong> {event.notes}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div style={{ marginLeft: '15px' }}>
                          <span className={`job-status-badge ${event.status}`} style={{
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '0.75em',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            background: event.status === 'completed' ? '#10b981' : 
                                       event.status === 'cancelled' ? '#ef4444' : 
                                       event.status === 'in-progress' ? '#f59e0b' : '#3b82f6',
                            color: 'white'
                          }}>
                            {event.status}
                          </span>
                        </div>
                      </div>
                      
                      {/* Action Buttons */}
                      {event.status === 'pending' && (
                        <div className="job-order-actions" style={{ 
                          marginTop: '15px', 
                          display: 'flex', 
                          gap: '10px',
                          paddingTop: '15px',
                          borderTop: '1px solid #e2e8f0'
                        }}>
                          <button
                            onClick={async () => {
                              try {
                                const jobOrderManager = new JobOrderManager(userId, 'Admin User');
                                await jobOrderManager.updateJobOrderStatus(event.id, 'in-progress');
                                await fetchPlantEvents(selectedPlant.id)
                                showAlert({
                                  type: 'success',
                                  title: 'Job Started',
                                  message: 'Job order marked as in progress',
                                  confirmText: 'OK'
                                })
                              } catch (error) {
                                showAlert({
                                  type: 'error',
                                  title: 'Update Failed',
                                  message: error.message,
                                  confirmText: 'OK'
                                })
                              }
                            }}
                            style={{
                              flex: 1,
                              padding: '8px 16px',
                              background: '#f59e0b',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '0.9em',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            ▶️ Start Job
                          </button>
                          <button
                            onClick={() => {
                              showAlert({
                                type: 'warning',
                                title: 'Cancel Job Order?',
                                message: 'Are you sure you want to cancel this fertilizer application?',
                                showCancel: true,
                                confirmText: 'Yes, Cancel',
                                cancelText: 'No, Keep It',
                                onConfirm: async () => {
                                  try {                                    
                                    const jobOrderManager = new JobOrderManager(userId, 'Admin User');
                                    await jobOrderManager.cancelJobOrder(event.id, "No longer needed"); // Use event.id
                                    await fetchPlantEvents(selectedPlant.id);
                                    closeAlert();
                                    
                                    showAlert({
                                      type: 'success',
                                      title: 'Job Cancelled',
                                      message: 'Job order has been cancelled',
                                      details: [
                                        { label: 'Job Order', value: event.title },
                                        { label: 'Reason', value: reason }
                                      ],
                                      confirmText: 'OK'
                                    });
                                  } catch (error) {
                                    console.error('Error cancelling job order:', error);
                                    showAlert({
                                      type: 'error',
                                      title: 'Cancellation Failed',
                                      message: error.message,
                                      details: [
                                        { label: 'Error', value: error.message }
                                      ],
                                      confirmText: 'OK'
                                    });
                                  }
                                }
                              });
                            }}
                            style={{
                              padding: '8px 16px',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '0.9em',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            ❌ Cancel
                          </button>
                        </div>
                      )}
                      
                      {event.status === 'in-progress' && (
                        <div className="job-order-actions" style={{ 
                          marginTop: '15px',
                          paddingTop: '15px',
                          borderTop: '1px solid #e2e8f0'
                        }}>
                          <button
                            onClick={async () => {
                              const notes = prompt('Add completion notes (optional):');
                              if (notes !== null) {
                                try {
                                  // Use JobOrderManager to complete the job order
                                  const jobOrderManager = new JobOrderManager(userId, 'Admin User');
                                  await jobOrderManager.completeJobOrder(event.id, notes);
                                  
                                  // Refresh plant events to show updated status
                                  await fetchPlantEvents(selectedPlant.id);
                                  
                                  // Get the completed job order data to show in alert
                                  const jobOrderRef = doc(db, 'jobOrders', event.id.replace('joborder-', ''));
                                  const jobOrderDoc = await getDoc(jobOrderRef);
                                  const jobOrderData = jobOrderDoc.exists() ? jobOrderDoc.data() : null;
                                  
                                  // Calculate total cost from the completed job order
                                  const totalCost = jobOrderData?.actualCost || 0;
                                  const bagsUsed = jobOrderData?.fertilizerBagsForPlot 
                                    ? Object.values(jobOrderData.fertilizerBagsForPlot)
                                        .reduce((sum, bags) => sum + parseFloat(bags || 0), 0)
                                    : 0;
                                  
                                  showAlert({
                                    type: 'success',
                                    title: '✅ Job Completed!',
                                    message: 'Fertilizer application has been completed and logged to inventory.',
                                    details: [
                                      { label: 'Job Order', value: event.title || 'Fertilizer Application' },
                                      { label: 'Bags Used', value: `${bagsUsed.toFixed(2)} bags` },
                                      { label: 'Total Cost', value: `₱${totalCost.toFixed(2)}` },
                                      { label: 'Status', value: 'Inventory deducted & expense recorded' }
                                    ],
                                    confirmText: 'OK'
                                  });
                                } catch (error) {
                                  console.error('Error completing job order:', error);
                                  showAlert({
                                    type: 'error',
                                    title: 'Update Failed',
                                    message: error.message,
                                    details: [
                                      { label: 'Error', value: error.message }
                                    ],
                                    confirmText: 'OK'
                                  });
                                }
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              background: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '0.95em',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            ✅ Mark as Completed
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <h4>{event.message}</h4>
                      <p className="timeline-date">
                        {event.timestamp?.toDate 
                          ? event.timestamp.toDate().toLocaleString() 
                          : new Date(event.timestamp).toLocaleString()}
                      </p>
                      <span className={`event-status-badge ${event.status}`}>
                        {event.status}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )
          })
      ) : (
        <div className="no-events-message">
          <p>No events recorded yet for this plant.</p>
        </div>
      )}
    </div>
  </div>
)}
              </div>

              <div className="planting-modal-footer">
                <button
                  className="planting-modal-btn planting-modal-cancel"
                  onClick={handleCloseDetailModal}
                >
                  Close
                </button>
                <button
                  className="planting-modal-btn planting-modal-save"
                  onClick={() => {
                    handleCloseDetailModal()
                    handleOpenEditModal(selectedPlant)
                  }}
                >
                  Edit Plant
                </button>
              </div>
            </div>
          </div>
        )}

        <CustomAlert
          show={alertConfig.show}
          type={alertConfig.type}
          title={alertConfig.title}
          message={alertConfig.message}
          details={alertConfig.details}
          onConfirm={alertConfig.onConfirm}
          onCancel={alertConfig.onCancel}
          confirmText={alertConfig.confirmText}
          cancelText={alertConfig.cancelText}
          showCancel={alertConfig.showCancel}
        />
      </div>
    </div>
  )
}

export default Planting