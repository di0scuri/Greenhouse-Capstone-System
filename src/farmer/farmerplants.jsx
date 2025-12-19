import React, { useState, useEffect } from 'react'
import Sidebar from './farmersidebar'
import './farmerplants.css'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db, realtimeDb } from '../firebase'
import { ref, get } from 'firebase/database'
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
import { useUser } from '../contexts/UserContext'

const FarmerPlants = () => {
  const { userRole, loading: userLoading } = useUser();
  const [activeMenu, setActiveMenu] = useState('FarmerPlants')
  const [searchTerm, setSearchTerm] = useState('')
  const [showFertilizerModal, setShowFertilizerModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedPlant, setSelectedPlant] = useState(null)
  const [plants, setPlantsData] = useState([])
  const [plantsList, setPlantsList] = useState({})
  const [loading, setLoading] = useState(true)
  
  const [fertilizerInfo, setFertilizerInfo] = useState(null)
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [priceRecommendation, setPriceRecommendation] = useState(null)
  const [activeDetailTab, setActiveDetailTab] = useState('summary')
  const [plantEvents, setPlantEvents] = useState([])

  const locationZoneOptions = ['Closed Greenhouse', 'Nursery 1', 'Nursery 2']
  
  const unitOptions = ['per kilo', 'per piece', 'per bundle', 'per pack', 'per dozen']

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

  // Fetch events for a specific plant
  const fetchPlantEvents = async (plantId) => {
    try {
      const eventsCollection = collection(db, 'events')
      const q = query(eventsCollection, where('plantId', '==', plantId))
      const eventsSnapshot = await getDocs(q)
      const events = eventsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      // Sort by timestamp
      events.sort((a, b) => {
        const timeA = a.timestamp?.toDate?.() || new Date(a.timestamp)
        const timeB = b.timestamp?.toDate?.() || new Date(b.timestamp)
        return timeA - timeB
      })
      setPlantEvents(events)
    } catch (error) {
      console.error('Error fetching plant events:', error)
      setPlantEvents([])
    }
  }

  // Get current stage based on plant age
  const getCurrentStage = (plantData, plantInfo) => {
    if (!plantData.plantedDate || !plantInfo?.stages) return null
    
    const plantedDate = new Date(plantData.plantedDate)
    const now = new Date()
    const daysSincePlanted = Math.floor((now - plantedDate) / (1000 * 60 * 60 * 24))
    
    // Find the current stage based on days
    for (let stage of plantInfo.stages) {
      if (daysSincePlanted >= stage.startDuration && daysSincePlanted <= stage.endDuration) {
        return stage
      }
    }
    
    // If past all stages, return the last stage
    return plantInfo.stages[plantInfo.stages.length - 1]
  }

  const handleOpenFertilizerModal = (plant) => {
    const plantInfo = plantsList[plant.plantType]
    const currentStage = getCurrentStage(plant, plantInfo)
    
    if (currentStage && plant.sensorData) {
      const deficits = {
        nitrogen: Math.max(0, currentStage.highN - (plant.sensorData.nitrogen || 0)),
        phosphorus: Math.max(0, currentStage.highP - (plant.sensorData.phosphorus || 0)),
        potassium: Math.max(0, currentStage.highK - (plant.sensorData.potassium || 0)),
        ph: Math.abs(currentStage.highpH - (plant.sensorData.ph || 7))
      }

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
        deficit: deficits
      })
      
      setShowFertilizerModal(true)
    }
  }

  const handleCloseFertilizerModal = () => {
    setShowFertilizerModal(false)
    setFertilizerInfo(null)
  }

  const handleOpenPriceModal = (plant) => {
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
        priceStrategy: 'Market Rate',
        factors: ['Quality', 'Season', 'Demand']
      })
      
      setShowPriceModal(true)
    }
  }

  const handleClosePriceModal = () => {
    setShowPriceModal(false)
    setPriceRecommendation(null)
  }

  const handleOpenDetailModal = async (plant) => {
    setSelectedPlant(plant)
    setActiveDetailTab('summary')
    await fetchPlantEvents(plant.id)
    setShowDetailModal(true)
  }

  const handleCloseDetailModal = () => {
    setShowDetailModal(false)
    setSelectedPlant(null)
    setActiveDetailTab('summary')
    setPlantEvents([])
  }

  const filteredPlants = plants.filter(plant =>
    plant.plantName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plant.plantType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plant.locationZone?.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
      'Completed': '#808080'
    }
    return colors[status] || '#666'
  }

  const getPlantEmoji = (plantType) => {
    const emojis = {
      'lettuce': '🥬',
      'tomato': '🍅',
      'cabbage': '🥬',
      'siling haba': '🌶️',
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
        <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} userType={userRole} />
        <div className="planting-content">
          <div className="loading">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="planting-container">
      <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} userType={userRole} />
      
      <div className="planting-content">
        <div className="planting-header">
          <div className="planting-title-section">
            <h1 className="planting-title">Planting Management</h1>
          </div>

          <div className="planting-actions">
            <div className="planting-search">
              <input
                type="text"
                placeholder="Search plants..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="planting-search-input"
              />
            </div>
          </div>
        </div>

        <div className="planting-grid">
          {filteredPlants.length === 0 ? (
            <div className="planting-empty">
              <p>No plants found</p>
            </div>
          ) : (
            filteredPlants.map((plant) => {
              const plantInfo = plantsList[plant.plantType]
              const currentStage = getCurrentStage(plant, plantInfo)
              
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
                      <span className="planting-info-label">Plot:</span>
                      <span className="planting-info-value">Plot {plant.plotNumber} ({plant.plotSize})</span>
                    </div>
                    
                    <div className="planting-info-row">
                      <span className="planting-info-label">Sensor:</span>
                      <span className="planting-info-value">{plant.soilSensor}</span>
                    </div>

                    <div className="planting-info-row">
                      <span className="planting-info-label">Location:</span>
                      <span className="planting-info-value">{plant.locationZone}</span>
                    </div>

                    <div className="planting-info-row">
                      <span className="planting-info-label">Seedlings:</span>
                      <span className="planting-info-value">{plant.recommendedSeedlings}</span>
                    </div>

                    {currentStage && (
                      <div className="planting-info-row">
                        <span className="planting-info-label">Stage:</span>
                        <span className="planting-info-value">{currentStage.stage}</span>
                      </div>
                    )}

                    <div className="planting-status-badge" style={{ backgroundColor: getStatusColor(currentStage?.stage || plant.status) }}>
                      {currentStage?.stage || plant.status}
                    </div>
                  </div>

                  <div className="planting-card-footer" onClick={(e) => e.stopPropagation()}>
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
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Fertilizer Modal */}
        {showFertilizerModal && fertilizerInfo && (
          <div className="planting-modal-overlay" onClick={handleCloseFertilizerModal}>
            <div className="fertilizer-modal planting-modal" onClick={(e) => e.stopPropagation()}>
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
                <div className="fertilizer-intro">
                  <h3>{fertilizerInfo.plantName}</h3>
                  <p>Current Stage: <strong>{fertilizerInfo.stage}</strong></p>
                  <p>Based on current soil analysis, here are the nutrient adjustments needed:</p>
                </div>

                <div className="fertilizer-content">
                  <div className="nutrients-grid">
                    <div className="nutrient-card">
                      <h4>Nitrogen (N)</h4>
                      <div className="nutrient-values">
                        <span>Current: {fertilizerInfo.current?.nitrogen || 0} ppm</span>
                        <span>Ideal: {fertilizerInfo.ideal?.nitrogen || 0} ppm</span>
                        <span className="range">Range: {fertilizerInfo.range?.nitrogen} ppm</span>
                        {fertilizerInfo.deficit?.nitrogen > 0 && (
                          <span className="deficit">
                            Deficit: {fertilizerInfo.deficit.nitrogen.toFixed(0)} ppm
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
                        {fertilizerInfo.deficit?.phosphorus > 0 && (
                          <span className="deficit">
                            Deficit: {fertilizerInfo.deficit.phosphorus.toFixed(0)} ppm
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
                        {fertilizerInfo.deficit?.potassium > 0 && (
                          <span className="deficit">
                            Deficit: {fertilizerInfo.deficit.potassium.toFixed(0)} ppm
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
                        {fertilizerInfo.deficit?.ph > 0.5 && (
                          <span className="deficit">
                            Adjustment needed: {fertilizerInfo.deficit.ph.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="fertilizer-note">
                  <p>
                    <strong>Note:</strong> Apply fertilizers according to package instructions. 
                    Monitor soil regularly and adjust application as needed. These recommendations 
                    are based on the {fertilizerInfo.stage} stage requirements.
                  </p>
                </div>
              </div>

              <div className="planting-modal-footer">
                <button
                  className="planting-modal-btn planting-modal-save"
                  onClick={handleCloseFertilizerModal}
                >
                  Got it!
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
                </h2>
                <button className="planting-modal-close" onClick={handleClosePriceModal}>
                  ✕
                </button>
              </div>

              <div className="planting-modal-body">
                <div className="price-strategy-badge">
                  <span className={`strategy-badge strategy-${priceRecommendation.priceStrategy.toLowerCase().replace(' ', '-')}`}>
                    {priceRecommendation.priceStrategy}
                  </span>
                  <span className="quality-score">
                    Quality Score: <strong>{priceRecommendation.qualityScore}%</strong>
                  </span>
                </div>

                <div className="price-highlight-card">
                  <div className="price-icon">
                    <MdAttachMoney style={{ fontSize: '48px', color: '#10b981' }} />
                  </div>
                  <div className="price-content">
                    <p className="price-label">Recommended Selling Price</p>
                    <h3 className="price-amount">₱{priceRecommendation.recommendedPrice}</h3>
                    <p className="price-unit">{priceRecommendation.unit}</p>
                  </div>
                </div>

                <div className="price-section">
                  <h3 className="section-title">Market Price Analysis</h3>
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
                        <span className="marker-label"></span>
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

                <div className="price-section">
                  <h3 className="section-title">Key Pricing Factors</h3>
                  <div className="factors-list">
                    {priceRecommendation.factors?.map((factor, index) => (
                      <div key={index} className="factor-item">
                        <span className="factor-icon">
                          <MdCheckCircle />
                        </span>
                        <span className="factor-text">{factor}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="price-note">
                  <p>
                    <MdInfo style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                    <strong>Pricing Tip:</strong> This recommendation is based on current market trends 
                    and your crop information. Adjust based on local demand and seasonality.
                  </p>
                </div>
              </div>

              <div className="planting-modal-footer">
                <button
                  className="planting-modal-btn planting-modal-cancel"
                  onClick={handleClosePriceModal}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Plant Detail Modal with Tabs */}
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
                  className={`detail-tab ${activeDetailTab === 'costs' ? 'active' : ''}`}
                  onClick={() => setActiveDetailTab('costs')}
                >
                  <MdAttachMoney style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Production Costs
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
                            <span className="detail-value">{selectedPlant.recommendedSeedlings}</span>
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
                          <div className="soil-data-card">
                            <div className="soil-data-icon">
                              <MdScience />
                            </div>
                            <div className="soil-data-content">
                              <h4>pH Level</h4>
                              <p className="soil-value">{selectedPlant.sensorData.ph?.toFixed(2) || 'N/A'}</p>
                              <p className="soil-label">Acidity/Alkalinity</p>
                              {(() => {
                                const plantInfo = plantsList[selectedPlant.plantType]
                                const currentStage = getCurrentStage(selectedPlant, plantInfo)
                                if (currentStage) {
                                  return <p className="soil-range">Range: {currentStage.lowpH} - {currentStage.highpH}</p>
                                }
                              })()}
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
                              {(() => {
                                const plantInfo = plantsList[selectedPlant.plantType]
                                const currentStage = getCurrentStage(selectedPlant, plantInfo)
                                if (currentStage) {
                                  return <p className="soil-range">Range: {currentStage.lowN} - {currentStage.highN} ppm</p>
                                }
                              })()}
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
                              {(() => {
                                const plantInfo = plantsList[selectedPlant.plantType]
                                const currentStage = getCurrentStage(selectedPlant, plantInfo)
                                if (currentStage) {
                                  return <p className="soil-range">Range: {currentStage.lowP} - {currentStage.highP} ppm</p>
                                }
                              })()}
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
                              {(() => {
                                const plantInfo = plantsList[selectedPlant.plantType]
                                const currentStage = getCurrentStage(selectedPlant, plantInfo)
                                if (currentStage) {
                                  return <p className="soil-range">Range: {currentStage.lowK} - {currentStage.highK} ppm</p>
                                }
                              })()}
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
                              {(() => {
                                const plantInfo = plantsList[selectedPlant.plantType]
                                const currentStage = getCurrentStage(selectedPlant, plantInfo)
                                if (currentStage) {
                                  return <p className="soil-range">Range: {currentStage.lowHum} - {currentStage.highHum}%</p>
                                }
                              })()}
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
                              {(() => {
                                const plantInfo = plantsList[selectedPlant.plantType]
                                const currentStage = getCurrentStage(selectedPlant, plantInfo)
                                if (currentStage) {
                                  return <p className="soil-range">Range: {currentStage.lowTemp} - {currentStage.highTemp}°C</p>
                                }
                              })()}
                            </div>
                          </div>
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

                {activeDetailTab === 'costs' && (
                  <div className="detail-content">
                    <h3>Production Costs</h3>
                    
                    <div className="costs-summary-card">
                      <h4>Cost Breakdown</h4>
                      <div className="costs-list">
                        <div className="cost-item">
                          <span className="cost-label">
                            <MdPeople style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                            Labor:
                          </span>
                          <span className="cost-value">₱1,000</span>
                        </div>
                        <div className="cost-item">
                          <span className="cost-label">
                            <MdBolt style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                            Electricity:
                          </span>
                          <span className="cost-value">₱300</span>
                        </div>
                        <div className="cost-item">
                          <span className="cost-label">
                            <MdWaterDrop style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                            Water:
                          </span>
                          <span className="cost-value">₱200</span>
                        </div>
                        <div className="cost-item">
                          <span className="cost-label">
                            <MdGrass style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                            Fertilizer:
                          </span>
                          <span className="cost-value">₱500</span>
                        </div>
                        <div className="cost-item total">
                          <span className="cost-label"><strong>Total Cost:</strong></span>
                          <span className="cost-value">
                            <strong>₱2,000</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="costs-actions">
                      <button
                        className="planting-modal-btn planting-modal-save"
                        onClick={() => {
                          handleCloseDetailModal()
                          handleOpenPriceModal(selectedPlant)
                        }}
                      >
                        Get Price Recommendation
                      </button>
                    </div>
                  </div>
                )}

                {activeDetailTab === 'events' && (
                  <div className="detail-content">
                    <h3>Plant Events & History</h3>
                    
                    <div className="events-timeline">
                      {plantEvents.length > 0 ? (
                        plantEvents.map((event, index) => (
                          <div key={event.id} className="timeline-item">
                            <div className="timeline-marker">
                              {event.type === 'LIFECYCLE_STAGE' ? (
                                <MdEco style={{ fontSize: '24px' }} />
                              ) : (
                                <MdInfo style={{ fontSize: '24px' }} />
                              )}
                            </div>
                            <div className="timeline-content">
                              <h4>{event.message}</h4>
                              <p className="timeline-date">
                                {event.timestamp?.toDate 
                                  ? event.timestamp.toDate().toLocaleString() 
                                  : new Date(event.timestamp).toLocaleString()}
                              </p>
                              <span className={`event-status-badge ${event.status}`}>
                                {event.status}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="no-events-message">
                          <p>No events recorded yet for this plant.</p>
                        </div>
                      )}
                    </div>

                    <div className="events-note">
                      <p>
                        <strong>Note:</strong> Event tracking helps you monitor plant progress and make informed decisions.
                        Stage changes are automatically tracked based on the plant's lifecycle.
                      </p>
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
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default FarmerPlants