import React, { useState, useEffect } from 'react'
import Sidebar from './sidebar'
import './production.css'
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { 
  MdAttachMoney,
  MdSearch,
  MdPeople,
  MdBolt,
  MdWaterDrop,
  MdDashboard,
  MdBlock,
  MdInventory2,
  MdStraighten,
  MdAgriculture
} from 'react-icons/md'

const PlantProduction = ({ userType = 'admin' }) => {
  // Access control: Allow both 'admin' and 'finance' users
  const hasAccess = userType === 'admin' || userType === 'finance'
  
  const [activeMenu, setActiveMenu] = useState('Plant Production')
  const [searchTerm, setSearchTerm] = useState('')
  const [plants, setPlants] = useState([])
  const [selectedPlant, setSelectedPlant] = useState(null)
  const [showCostingModal, setShowCostingModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [costingData, setCostingData] = useState(null)

  // Check access before rendering
  if (!hasAccess) {
    return (
      <div className="dashboard-container">
        <Sidebar 
          activeMenu={activeMenu}
          setActiveMenu={setActiveMenu}
          userType={userType}
        />
        <div className="production-main" style={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '20vh',
          padding: '40px',
          textAlign: 'center', 
          overflow: 'auto'
        }}>
          <div style={{
            background: '#fee',
            border: '2px solid #fcc',
            borderRadius: '12px',
            padding: '40px',
            maxWidth: '500px'
          }}>
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>
              <MdBlock />
            </div>
            <h2 style={{ color: '#c33', marginBottom: '10px' }}>Access Denied</h2>
            <p style={{ color: '#666', fontSize: '16px' }}>
              You don't have permission to access Production Costing.
              <br />
              This feature is only available to Admin and Finance users.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Simplified cost categories state - only 3 categories with single input each
  const [costs, setCosts] = useState({
    labor: 0,
    electricity: 0,
    water: 0
  })

  // Fetch plants
  const fetchPlants = async () => {
    setLoading(true)
    try {
      const querySnapshot = await getDocs(collection(db, 'plants'))
      const plantsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        datePlanted: doc.data().datePlanted?.toDate ? doc.data().datePlanted.toDate() : new Date()
      }))
      
      // Debug: Log first plant to see data structure
      if (plantsData.length > 0) {
        console.log('Sample plant data:', plantsData[0])
        console.log('All plant fields:', Object.keys(plantsData[0]))
      }
      
      setPlants(plantsData)
    } catch (error) {
      console.error('Error fetching plants:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlants()
  }, [])

  // Calculate totals
  const calculateGrandTotal = () => {
    return parseFloat(costs.labor || 0) + parseFloat(costs.electricity || 0) + parseFloat(costs.water || 0)
  }

  const getCostBreakdown = () => {
    return {
      labor: parseFloat(costs.labor || 0),
      electricity: parseFloat(costs.electricity || 0),
      water: parseFloat(costs.water || 0)
    }
  }

  // Handle input change
  const handleCostChange = (category, value) => {
    setCosts(prev => ({
      ...prev,
      [category]: value
    }))
  }

  // Open costing modal
  const handleAddCosting = async (plant) => {
    setSelectedPlant(plant)
    
    // If plant has existing costing, load it from database
    if (plant.hasCosting) {
      try {
        const q = query(collection(db, 'productionCosts'), where('plantId', '==', plant.id))
        const snapshot = await getDocs(q)
        
        if (!snapshot.empty) {
          const existingData = snapshot.docs[0].data()
          
          // Load existing costs - handle both structures
          if (existingData.detailedCosts) {
            setCosts({
              labor: existingData.detailedCosts.labor || 0,
              electricity: existingData.detailedCosts.electricity || 0,
              water: existingData.detailedCosts.water || 0
            })
          } else if (existingData.breakdown) {
            setCosts({
              labor: existingData.breakdown.labor || 0,
              electricity: existingData.breakdown.electricity || 0,
              water: existingData.breakdown.water || 0
            })
          }
        } else {
          // No data found, reset to 0
          setCosts({
            labor: 0,
            electricity: 0,
            water: 0
          })
        }
      } catch (error) {
        console.error('Error loading existing costing:', error)
        // Reset costs on error
        setCosts({
          labor: 0,
          electricity: 0,
          water: 0
        })
      }
    } else {
      // New costing, reset costs
      setCosts({
        labor: 0,
        electricity: 0,
        water: 0
      })
    }
    
    setShowCostingModal(true)
  }

  // Save costing
  const handleSaveCosting = async () => {
    if (!selectedPlant) return

    const breakdown = getCostBreakdown()
    const grandTotal = calculateGrandTotal()
    const costPerSqm = grandTotal / (selectedPlant.areaOccupiedSqM || 1)
    const estimatedYield = selectedPlant.totalEstimatedYield || selectedPlant.initialSeedQuantity || 0
    const costPerUnit = estimatedYield > 0 ? grandTotal / estimatedYield : 0

    const costingRecord = {
      plantId: selectedPlant.id,
      plantName: selectedPlant.name,
      plantType: selectedPlant.type,
      plotNumber: selectedPlant.plotNumber,
      areaOccupied: selectedPlant.areaOccupiedSqM,
      detailedCosts: costs,
      breakdown,
      totalCost: grandTotal,
      costPerSqm: costPerSqm,
      estimatedYield: estimatedYield,
      costPerUnit: costPerUnit,
      profitMargin: 0,
      lastModifiedBy: userType,
      lastModifiedAt: serverTimestamp()
    }

    try {
      // Check if costing already exists
      const q = query(collection(db, 'productionCosts'), where('plantId', '==', selectedPlant.id))
      const snapshot = await getDocs(q)
      
      if (!snapshot.empty) {
        // Update existing record
        const docId = snapshot.docs[0].id
        await updateDoc(doc(db, 'productionCosts', docId), costingRecord)
        
        alert(`✅ Production costing updated!\n\nTotal Cost: ₱${grandTotal.toLocaleString()}\nCost per m²: ₱${costPerSqm.toFixed(2)}\nCost per unit: ₱${costPerUnit.toFixed(2)}\n\nUpdated by: ${userType.toUpperCase()}`)
      } else {
        // Create new record
        costingRecord.createdAt = serverTimestamp()
        costingRecord.createdBy = userType
        
        await addDoc(collection(db, 'productionCosts'), costingRecord)
        
        alert(`✅ Production costing saved!\n\nTotal Cost: ₱${grandTotal.toLocaleString()}\nCost per m²: ₱${costPerSqm.toFixed(2)}\nCost per unit: ₱${costPerUnit.toFixed(2)}\n\nSaved by: ${userType.toUpperCase()}`)
      }
      
      // Update plant with costing info
      await updateDoc(doc(db, 'plants', selectedPlant.id), {
        hasCosting: true,
        totalProductionCost: grandTotal,
        costPerUnit: costPerUnit,
        lastCostingUpdate: serverTimestamp(),
        lastCostingBy: userType
      })

      setShowCostingModal(false)
      fetchPlants()
    } catch (error) {
      console.error('Error saving costing:', error)
      alert('Error saving costing data')
    }
  }

  // View costing details
  const handleViewCosting = async (plant) => {
    setSelectedPlant(plant)
    try {
      const q = query(collection(db, 'productionCosts'), where('plantId', '==', plant.id))
      const snapshot = await getDocs(q)
      
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data()
        setCostingData(data)
        setShowViewModal(true)
      } else {
        alert('No costing data found for this plant')
      }
    } catch (error) {
      console.error('Error fetching costing:', error)
      alert('Error loading costing data')
    }
  }

  const filteredPlants = plants.filter(plant =>
    plant.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plant.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plant.plotNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatDate = (date) => {
    if (!date) return 'N/A'
    if (date.toDate) date = date.toDate()
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div className="dashboard-container-prod">
      <Sidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

      <div className="production-main-ad">
        {/* Header */}
        <div className="production-header">
          <div className="production-header-left">
            <h1 className="production-title">
              Production Costing
            </h1>
          </div>
          <div className="production-search-box">
            <input
              type="text"
              placeholder="Search plants..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="production-search"
            />
            <span className="production-search-icon">
              <MdSearch />
            </span>
          </div>
        </div>

        {/* Plants Table */}
        <div className="production-body">
          <h2 className="production-section-title">Plants Production Costs</h2>
          
          {loading ? (
            <div className="production-loading">Loading plants...</div>
          ) : (
            <div className="production-table-container-ad">
              <table className="production-table-ad">
                <thead>
                  <tr>
                    <th>Plant Name</th>
                    <th>Type</th>
                    <th>Plot</th>
                    <th>Area (m²)</th>
                    <th>Status</th>
                    <th>Total Cost</th>
                    <th>Cost/Unit</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlants.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '40px' }}>
                        No plants found
                      </td>
                    </tr>
                  ) : (
                    filteredPlants.map(plant => (
                      <tr key={plant.id}>
                        <td>{plant.name || plant.plantName || plant.cropName || 'Unnamed Plant'}</td>
                        <td>{plant.type || plant.plantType || plant.category || 'N/A'}</td>
                        <td><span className="plot-badge">{plant.plotNumber || plant.plot || 'N/A'}</span></td>
                        <td>{plant.areaOccupiedSqM || plant.area || 0}</td>
                        <td>
                          <span className="status-badge" style={{ 
                            background: plant.status === 'Completed' ? '#10b981' : 
                                       plant.status === 'Growing' ? '#3b82f6' : '#f59e0b' 
                          }}>
                            {plant.status || 'Unknown'}
                          </span>
                        </td>
                        <td>
                          {plant.totalProductionCost ? (
                            <span className="cost-value">₱{plant.totalProductionCost.toLocaleString()}</span>
                          ) : (
                            <span className="no-cost">—</span>
                          )}
                        </td>
                        <td>
                          {plant.costPerUnit ? (
                            <span className="cost-value">₱{plant.costPerUnit.toFixed(2)}</span>
                          ) : (
                            <span className="no-cost">—</span>
                          )}
                        </td>
                        <td>
                          <div className="action-buttons">
                            {!plant.hasCosting ? (
                              <button 
                                className="action-btn add-btn"
                                onClick={() => handleAddCosting(plant)}
                              >
                                Add Costing
                              </button>
                            ) : (
                              <>
                                <button 
                                  className="action-btn view-btn"
                                  onClick={() => handleViewCosting(plant)}
                                >
                                  View
                                </button>
                                <button 
                                  className="action-btn edit-btn"
                                  onClick={() => handleAddCosting(plant)}
                                >
                                  Update
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add/Edit Costing Modal */}
        {showCostingModal && selectedPlant && (
          <div className="production-modal-overlay" onClick={() => setShowCostingModal(false)}>
            <div className="production-modal" onClick={(e) => e.stopPropagation()}>
              <div className="production-modal-header">
                <h2 className="production-modal-title">
                  <MdAttachMoney style={{ marginRight: '10px', verticalAlign: 'middle' }} />
                  Production Costing - {selectedPlant.name}
                </h2>
                <button className="production-modal-close" onClick={() => setShowCostingModal(false)}>
                  ✕
                </button>
              </div>

              <div className="production-modal-body">
                {/* Plant Info */}
                <div className="plant-info-card">
                  <div className="info-row">
                    <span className="info-label">Plot:</span>
                    <span className="info-value">{selectedPlant.plotNumber}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Area:</span>
                    <span className="info-value">{selectedPlant.areaOccupiedSqM} m²</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Status:</span>
                    <span className="info-value">{selectedPlant.status}</span>
                  </div>
                </div>

                {/* Cost Categories - Only 3 categories with single input each */}
                <div className="cost-categories">
                  {/* 1. Labor Costs */}
                  <div className="cost-category">
                    <div className="category-header">
                      <span className="category-icon"><MdPeople /></span>
                      <h3 className="category-title">1. Labor Costs</h3>
                      <span className="category-total">₱{parseFloat(costs.labor || 0).toLocaleString()}</span>
                    </div>
                    <div className="category-inputs">
                      <input 
                        type="number" 
                        placeholder="Enter total labor costs" 
                        value={costs.labor}
                        onChange={(e) => handleCostChange('labor', e.target.value)} 
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>

                  {/* 2. Electricity */}
                  <div className="cost-category">
                    <div className="category-header">
                      <span className="category-icon"><MdBolt /></span>
                      <h3 className="category-title">2. Electricity</h3>
                      <span className="category-total">₱{parseFloat(costs.electricity || 0).toLocaleString()}</span>
                    </div>
                    <div className="category-inputs">
                      <input 
                        type="number" 
                        placeholder="Enter total electricity costs" 
                        value={costs.electricity}
                        onChange={(e) => handleCostChange('electricity', e.target.value)} 
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>

                  {/* 3. Water */}
                  <div className="cost-category">
                    <div className="category-header">
                      <span className="category-icon"><MdWaterDrop /></span>
                      <h3 className="category-title">3. Water</h3>
                      <span className="category-total">₱{parseFloat(costs.water || 0).toLocaleString()}</span>
                    </div>
                    <div className="category-inputs">
                      <input 
                        type="number" 
                        placeholder="Enter total water costs" 
                        value={costs.water}
                        onChange={(e) => handleCostChange('water', e.target.value)} 
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Total Summary */}
                <div className="cost-summary">
                  <div className="summary-row">
                    <span className="summary-label">Total Production Cost:</span>
                    <span className="summary-value grand-total">₱{calculateGrandTotal().toLocaleString()}</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Cost per m²:</span>
                    <span className="summary-value">₱{(calculateGrandTotal() / (selectedPlant.areaOccupiedSqM || 1)).toFixed(2)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Estimated Yield:</span>
                    <span className="summary-value">{selectedPlant.totalEstimatedYield || selectedPlant.initialSeedQuantity || 0} kg</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Cost per Unit:</span>
                    <span className="summary-value">
                      ₱{((selectedPlant.totalEstimatedYield || selectedPlant.initialSeedQuantity) > 0 
                        ? calculateGrandTotal() / (selectedPlant.totalEstimatedYield || selectedPlant.initialSeedQuantity) 
                        : 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="production-modal-footer">
                <button 
                  className="production-modal-btn cancel-btn"
                  onClick={() => setShowCostingModal(false)}
                >
                  Cancel
                </button>
                <button 
                  className="production-modal-btn save-btn"
                  onClick={handleSaveCosting}
                >
                  Save Costing
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Costing Modal */}
        {showViewModal && costingData && (
          <div className="production-modal-overlay" onClick={() => setShowViewModal(false)}>
            <div className="production-modal view-modal" onClick={(e) => e.stopPropagation()}>
              <div className="production-modal-header">
                <h2 className="production-modal-title">
                  <MdDashboard style={{ marginRight: '10px', verticalAlign: 'middle' }} />
                  Production Cost Details - {costingData.plantName}
                </h2>
                <button className="production-modal-close" onClick={() => setShowViewModal(false)}>
                  ✕
                </button>
              </div>

              <div className="production-modal-body">
                {/* Summary Cards */}
                <div className="summary-cards">
                  <div className="summary-card">
                    <span className="card-icon"><MdAttachMoney /></span>
                    <div className="card-content">
                      <p className="card-label">Total Cost</p>
                      <p className="card-value">₱{costingData.totalCost.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="summary-card">
                    <span className="card-icon"><MdStraighten /></span>
                    <div className="card-content">
                      <p className="card-label">Cost per m²</p>
                      <p className="card-value">₱{costingData.costPerSqm.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="summary-card">
                    <span className="card-icon"><MdInventory2 /></span>
                    <div className="card-content">
                      <p className="card-label">Cost per Unit</p>
                      <p className="card-value">₱{costingData.costPerUnit.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="summary-card">
                    <span className="card-icon"><MdAgriculture /></span>
                    <div className="card-content">
                      <p className="card-label">Est. Yield</p>
                      <p className="card-value">{costingData.estimatedYield} kg</p>
                    </div>
                  </div>
                </div>

                {/* Created/Modified By Info */}
                {costingData.createdBy && (
                  <div style={{ 
                    background: '#f3f4f6', 
                    padding: '12px', 
                    borderRadius: '8px', 
                    marginBottom: '20px',
                    fontSize: '14px',
                    color: '#6b7280'
                  }}>
                    <strong>Created by:</strong> {costingData.createdBy.toUpperCase()}
                    {costingData.lastModifiedBy && costingData.lastModifiedBy !== costingData.createdBy && (
                      <span style={{ marginLeft: '20px' }}>
                        <strong>Last modified by:</strong> {costingData.lastModifiedBy.toUpperCase()}
                      </span>
                    )}
                  </div>
                )}

                {/* Cost Breakdown */}
                <div className="breakdown-section">
                  <h3 className="section-title">Cost Breakdown by Category</h3>
                  <div className="breakdown-list">
                    {Object.entries(costingData.breakdown).map(([key, value]) => {
                      const percentage = (value / costingData.totalCost * 100).toFixed(1)
                      const labels = {
                        labor: { icon: <MdPeople />, text: 'Labor Costs' },
                        electricity: { icon: <MdBolt />, text: 'Electricity' },
                        water: { icon: <MdWaterDrop />, text: 'Water' }
                      }
                      return (
                        <div key={key} className="breakdown-item">
                          <div className="breakdown-header">
                            <span className="breakdown-label">
                              <span style={{ marginRight: '8px' }}>{labels[key].icon}</span>
                              {labels[key].text}
                            </span>
                            <span className="breakdown-value">₱{value.toLocaleString()}</span>
                          </div>
                          <div className="breakdown-bar">
                            <div 
                              className="breakdown-fill" 
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="breakdown-percentage">{percentage}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="production-modal-footer">
                <button 
                  className="production-modal-btn save-btn"
                  onClick={() => setShowViewModal(false)}
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

export default PlantProduction