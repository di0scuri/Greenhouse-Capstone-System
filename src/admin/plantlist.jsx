import React, { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import Sidebar from './sidebar'
import './plantlist.css'
import { 
  MdSearch,
  MdNotifications,
  MdLocalFlorist,
  MdInfo,
  MdClose,
  MdOpacity,
  MdScience,
  MdThermostat,
  MdWaterDrop,
  MdSpa,
  MdNotes,
  MdAdd,
  MdEdit,
  MdSave
} from 'react-icons/md'
import { useUser } from '../contexts/UserContext' // Import UserContext

const PlantMasterList = ({ userType = 'admin' }) => {
  const { userRole, loading: userLoading } = useUser()
  const [activeMenu, setActiveMenu] = useState('PlantList')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPlant, setSelectedPlant] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [plantsDatabase, setPlantsDatabase] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editingPlant, setEditingPlant] = useState(null)

  const getInitialFormState = () => ({
    name: '',
    sName: '',
    daysToHarvest: '',
    pricing: '',
    pricingUnit: 'per kg',
    minSpacingCM: '',
    maxSpacingCM: '',
    description: '',
    stages: []
  })

  const [formData, setFormData] = useState(getInitialFormState())

  useEffect(() => {
    fetchPlants()
  }, [])

  const fetchPlants = async () => {
    try {
      setLoading(true)
      const plantsRef = collection(db, 'plantsList')
      const querySnapshot = await getDocs(plantsRef)
      
      const plantsData = []
      let idCounter = 1
      
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data()
        
        const plantData = {
          id: idCounter++,
          docId: docSnap.id,
          name: data.name || '',
          scientificName: data.sName || '',
          daysToHarvest: data.daysToHarvest || 0,
          pricing: data.pricing ? `₱${data.pricing}` : '',
          unit: data.pricingUnit || '',
          spacing: `${data.minSpacingCM || ''}-${data.maxSpacingCM || ''} cm`,
          description: data.description || '',
          rawData: data,
          stages: data.stages ? data.stages.map(stage => ({
            stage: stage.stage || '',
            duration: `Day ${stage.startDuration || 0}-${stage.endDuration || 0}`,
            watering: stage.watering || '',
            N: `${stage.lowN || 0}-${stage.highN || 0}`,
            P: `${stage.lowP || 0}-${stage.highP || 0}`,
            K: `${stage.lowK || 0}-${stage.highK || 0}`,
            temperature: `${stage.lowTemp || 0}-${stage.highTemp || 0}°C`,
            ec: `${stage.lowEc || 0}-${stage.highEc || 0} mS/cm`,
            humidity: `${stage.lowHum || 0}-${stage.highHum || 0}%`,
            pH: `${stage.lowpH || 0}-${stage.highpH || 0}`,
            notes: stage.notes || ''
          })) : []
        }
        
        plantsData.push(plantData)
      })
      
      setPlantsDatabase(plantsData)
      setError(null)
    } catch (err) {
      console.error('Error fetching plants:', err)
      setError('Failed to load plant data. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  const filteredPlants = plantsDatabase.filter(plant =>
    plant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plant.scientificName.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleRowClick = (plant) => {
    setSelectedPlant(plant)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setSelectedPlant(null)
  }

  const handleAddNew = () => {
    setIsEditing(false)
    setEditingPlant(null)
    setFormData(getInitialFormState())
    setShowEditModal(true)
  }

  const handleEdit = (plant) => {
    setIsEditing(true)
    setEditingPlant(plant)
    setFormData(plant.rawData)
    setShowEditModal(true)
  }

  const handleCloseEditModal = () => {
    setShowEditModal(false)
    setFormData(getInitialFormState())
    setEditingPlant(null)
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleStageChange = (index, field, value) => {
    const updatedStages = [...formData.stages]
    updatedStages[index] = {
      ...updatedStages[index],
      [field]: value
    }
    setFormData(prev => ({
      ...prev,
      stages: updatedStages
    }))
  }

  const addStage = () => {
    setFormData(prev => ({
      ...prev,
      stages: [...prev.stages, {
        stage: '',
        startDuration: '',
        endDuration: '',
        watering: '',
        lowN: '',
        highN: '',
        lowP: '',
        highP: '',
        lowK: '',
        highK: '',
        lowTemp: '',
        highTemp: '',
        lowEc: '',
        highEc: '',
        lowHum: '',
        highHum: '',
        lowpH: '',
        highpH: '',
        notes: ''
      }]
    }))
  }

  const removeStage = (index) => {
    setFormData(prev => ({
      ...prev,
      stages: prev.stages.filter((_, i) => i !== index)
    }))
  }

  const handleSubmit = async () => {
    try {
      setLoading(true)
      
      const dataToSave = {
        ...formData,
        daysToHarvest: parseInt(formData.daysToHarvest) || 0,
        pricing: parseFloat(formData.pricing) || 0,
        minSpacingCM: parseInt(formData.minSpacingCM) || 0,
        maxSpacingCM: parseInt(formData.maxSpacingCM) || 0,
      }

      if (isEditing && editingPlant) {
        const plantRef = doc(db, 'plantsList', editingPlant.docId)
        await updateDoc(plantRef, dataToSave)
      } else {
        await addDoc(collection(db, 'plantsList'), dataToSave)
      }

      await fetchPlants()
      handleCloseEditModal()
      alert(isEditing ? 'Plant updated successfully!' : 'Plant added successfully!')
    } catch (err) {
      console.error('Error saving plant:', err)
      alert('Failed to save plant. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  
  

  const getStageColor = (stage) => {
    const colors = {
      'Germination': '#ef4444',
      'Seedling': '#06b6d4',
      'Vegetative Growth': '#3b82f6',
      'Flowering': '#10b981',
      'Fruit Development': '#f59e0b',
      'Head Formation': '#0ea5e9',
      'Stalk Development': '#14b8a6',
      'Maturation & Harvest': '#8b5cf6',
      'Ripening & Harvest': '#ec4899',
      'Harvest': '#a855f7'
    }
    return colors[stage] || '#64748b'
  }

  return (
    <div className="dashboard-container">
      <Sidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userRole}
      />

      <div className="plantlist-main">
        <div className="plantlist-header">
          <h1 className="plantlist-title">Plant Database</h1>
          <div className="plantlist-header-actions">
            <button className="btn-add-plant" onClick={handleAddNew}>
              <MdAdd /> Add New Plant
            </button>
            <div className="plantlist-search-box">
              <input
                type="text"
                placeholder="Search plants..."
                className="plantlist-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="plantlist-search-icon">
                <MdSearch />
              </span>
            </div>
            <div className="plantlist-bell">
              <MdNotifications />
            </div>
          </div>
        </div>

        <div className="plantlist-body">
          <div className="plantlist-info-card">
            <MdInfo style={{ fontSize: '20px' }} />
            <p>Comprehensive plant database with growth requirements for each stage</p>
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '40px', fontSize: '15px', color: '#64748b', fontWeight: '500' }}>
              Loading plant data...
            </div>
          )}

          {error && (
            <div style={{ 
              backgroundColor: '#fee2e2', 
              color: '#991b1b', 
              padding: '20px', 
              borderRadius: '6px', 
              marginBottom: '20px',
              textAlign: 'center',
              border: '1px solid #fecaca',
              fontWeight: '600',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="plantlist-table-container">
              <table className="plantlist-table">
                <thead>
                  <tr>
                    <th>Plant Name</th>
                    <th>Scientific Name</th>
                    <th>Days to Harvest</th>
                    <th>Pricing</th>
                    <th>Spacing</th>
                    <th>Description</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlants.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="no-data">
                        {searchTerm 
                          ? `No plants found matching "${searchTerm}"`
                          : 'No plants available in database'
                        }
                      </td>
                    </tr>
                  ) : (
                    filteredPlants.map((plant) => (
                      <tr key={plant.id}>
                        <td className="plant-name-cell" onClick={() => handleRowClick(plant)} style={{ cursor: 'pointer' }}>
                          <MdSpa style={{ marginRight: '8px', color: '#10b981', fontSize: '18px' }} />
                          <span className="plant-name">{plant.name}</span>
                        </td>
                        <td onClick={() => handleRowClick(plant)} style={{ cursor: 'pointer' }} className="scientific-name">{plant.scientificName}</td>
                        <td onClick={() => handleRowClick(plant)} style={{ cursor: 'pointer' }}>{plant.daysToHarvest} days</td>
                        <td onClick={() => handleRowClick(plant)} style={{ cursor: 'pointer' }}>{plant.pricing} {plant.unit}</td>
                        <td onClick={() => handleRowClick(plant)} style={{ cursor: 'pointer' }}>{plant.spacing}</td>
                        <td onClick={() => handleRowClick(plant)} style={{ cursor: 'pointer' }} className="description">{plant.description}</td>
                        <td>
                          <button className="btn-edit-small" onClick={(e) => { e.stopPropagation(); handleEdit(plant); }}>
                            <MdEdit /> Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* View Modal */}
        {showModal && selectedPlant && (
          <div className="plantlist-modal-overlay" onClick={handleCloseModal}>
            <div className="plantlist-modal" onClick={(e) => e.stopPropagation()}>
              <div className="plantlist-modal-header">
                <div>
                  <h2 className="plantlist-modal-title">
                    <MdLocalFlorist style={{ marginRight: '10px', verticalAlign: 'middle' }} />
                    {selectedPlant.name}
                  </h2>
                  <p className="plantlist-modal-subtitle">{selectedPlant.scientificName}</p>
                </div>
                <button className="plantlist-modal-close" onClick={handleCloseModal}>
                  <MdClose />
                </button>
              </div>
              
              <div className="plantlist-modal-body">
                <div className="modal-info-grid">
                  <div className="info-item">
                    <span className="info-label">Days to Harvest:</span>
                    <span className="info-value">{selectedPlant.daysToHarvest} days</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Pricing:</span>
                    <span className="info-value">{selectedPlant.pricing} {selectedPlant.unit}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Spacing:</span>
                    <span className="info-value">{selectedPlant.spacing}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Description:</span>
                    <span className="info-value">{selectedPlant.description}</span>
                  </div>
                </div>

                <h3 className="stages-title">Growth Stage Requirements</h3>
                <div className="stages-container">
                  {selectedPlant.stages.map((stage, index) => (
                    <div key={index} className="stage-card">
                      <div className="stage-header" style={{ backgroundColor: getStageColor(stage.stage) }}>
                        <h4>{stage.stage}</h4>
                        <span className="stage-duration">{stage.duration}</span>
                      </div>
                      
                      <div className="stage-body">
                        <div className="stage-section">
                          <h5><MdOpacity style={{ fontSize: '16px' }} /> Watering</h5>
                          <p>{stage.watering}</p>
                        </div>

                        <div className="stage-section">
                          <h5><MdScience style={{ fontSize: '16px' }} /> NPK Requirements</h5>
                          <div className="npk-grid">
                            <div className="npk-item">
                              <span className="npk-label">Nitrogen (N):</span>
                              <span className="npk-value">{stage.N} ppm</span>
                            </div>
                            <div className="npk-item">
                              <span className="npk-label">Phosphorus (P):</span>
                              <span className="npk-value">{stage.P} ppm</span>
                            </div>
                            <div className="npk-item">
                              <span className="npk-label">Potassium (K):</span>
                              <span className="npk-value">{stage.K} ppm</span>
                            </div>
                          </div>
                        </div>

                        <div className="stage-section">
                          <h5><MdThermostat style={{ fontSize: '16px' }} /> Environmental Conditions</h5>
                          <div className="conditions-grid">
                            <div className="condition-item">
                              <span className="condition-label">Temperature:</span>
                              <span className="condition-value">{stage.temperature}</span>
                            </div>
                            <div className="condition-item">
                              <span className="condition-label">EC:</span>
                              <span className="condition-value">{stage.ec}</span>
                            </div>
                            <div className="condition-item">
                              <span className="condition-label">Humidity:</span>
                              <span className="condition-value">{stage.humidity}</span>
                            </div>
                            <div className="condition-item">
                              <span className="condition-label">pH:</span>
                              <span className="condition-value">{stage.pH}</span>
                            </div>
                          </div>
                        </div>

                        {stage.notes && (
                          <div className="stage-section">
                            <h5><MdNotes style={{ fontSize: '16px' }} /> Notes</h5>
                            <p className="stage-notes">{stage.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="plantlist-modal-footer">
                <button className="btn-close" onClick={handleCloseModal}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit/Add Modal */}
        {showEditModal && (
          <div className="plantlist-modal-overlay" onClick={handleCloseEditModal}>
            <div className="plantlist-modal plantlist-edit-modal" onClick={(e) => e.stopPropagation()}>
              <div className="plantlist-modal-header">
                <h2 className="plantlist-modal-title">
                  {isEditing ? <><MdEdit style={{ marginRight: '10px' }} /> Edit Plant</> : <><MdAdd style={{ marginRight: '10px' }} /> Add New Plant</>}
                </h2>
                <button className="plantlist-modal-close" onClick={handleCloseEditModal}>
                  <MdClose />
                </button>
              </div>
              
              <div className="plantlist-modal-body">
                <div className="form-section">
                  <h3>Basic Information</h3>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Plant Name *</label>
                      <input type="text" name="name" value={formData.name} onChange={handleInputChange} />
                    </div>
                    <div className="form-group">
                      <label>Scientific Name *</label>
                      <input type="text" name="sName" value={formData.sName} onChange={handleInputChange} />
                    </div>
                    <div className="form-group">
                      <label>Days to Harvest *</label>
                      <input type="number" name="daysToHarvest" value={formData.daysToHarvest} onChange={handleInputChange} />
                    </div>
                    <div className="form-group">
                      <label>Pricing *</label>
                      <input type="number" step="0.01" name="pricing" value={formData.pricing} onChange={handleInputChange} />
                    </div>
                    <div className="form-group">
                      <label>Pricing Unit *</label>
                      <input type="text" name="pricingUnit" value={formData.pricingUnit} onChange={handleInputChange} />
                    </div>
                    <div className="form-group">
                      <label>Min Spacing (cm) *</label>
                      <input type="number" name="minSpacingCM" value={formData.minSpacingCM} onChange={handleInputChange} />
                    </div>
                    <div className="form-group">
                      <label>Max Spacing (cm) *</label>
                      <input type="number" name="maxSpacingCM" value={formData.maxSpacingCM} onChange={handleInputChange} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Description *</label>
                    <textarea name="description" value={formData.description} onChange={handleInputChange} rows="3" />
                  </div>
                </div>

                <div className="form-section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3>Growth Stages</h3>
                    <button type="button" className="btn-add-stage" onClick={addStage}>
                      <MdAdd /> Add Stage
                    </button>
                  </div>
                  
                  {formData.stages.map((stage, index) => (
                    <div key={index} className="stage-form-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h4>Stage {index + 1}</h4>
                        <button type="button" className="btn-remove-stage" onClick={() => removeStage(index)}>
                          <MdClose /> Remove
                        </button>
                      </div>
                      
                      <div className="form-grid">
                        <div className="form-group">
                          <label>Stage Name</label>
                          <input type="text" value={stage.stage} onChange={(e) => handleStageChange(index, 'stage', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>Start Day</label>
                          <input type="number" value={stage.startDuration} onChange={(e) => handleStageChange(index, 'startDuration', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>End Day</label>
                          <input type="number" value={stage.endDuration} onChange={(e) => handleStageChange(index, 'endDuration', e.target.value)} />
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                          <label>Watering</label>
                          <input type="text" value={stage.watering} onChange={(e) => handleStageChange(index, 'watering', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>N (Low)</label>
                          <input type="number" value={stage.lowN} onChange={(e) => handleStageChange(index, 'lowN', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>N (High)</label>
                          <input type="number" value={stage.highN} onChange={(e) => handleStageChange(index, 'highN', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>P (Low)</label>
                          <input type="number" value={stage.lowP} onChange={(e) => handleStageChange(index, 'lowP', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>P (High)</label>
                          <input type="number" value={stage.highP} onChange={(e) => handleStageChange(index, 'highP', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>K (Low)</label>
                          <input type="number" value={stage.lowK} onChange={(e) => handleStageChange(index, 'lowK', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>K (High)</label>
                          <input type="number" value={stage.highK} onChange={(e) => handleStageChange(index, 'highK', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>Temp Low (°C)</label>
                          <input type="number" value={stage.lowTemp} onChange={(e) => handleStageChange(index, 'lowTemp', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>Temp High (°C)</label>
                          <input type="number" value={stage.highTemp} onChange={(e) => handleStageChange(index, 'highTemp', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>EC Low (mS/cm)</label>
                          <input type="number" step="0.1" value={stage.lowEc} onChange={(e) => handleStageChange(index, 'lowEc', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>EC High (mS/cm)</label>
                          <input type="number" step="0.1" value={stage.highEc} onChange={(e) => handleStageChange(index, 'highEc', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>Humidity Low (%)</label>
                          <input type="number" value={stage.lowHum} onChange={(e) => handleStageChange(index, 'lowHum', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>Humidity High (%)</label>
                          <input type="number" value={stage.highHum} onChange={(e) => handleStageChange(index, 'highHum', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>pH Low</label>
                          <input type="number" step="0.1" value={stage.lowpH} onChange={(e) => handleStageChange(index, 'lowpH', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>pH High</label>
                          <input type="number" step="0.1" value={stage.highpH} onChange={(e) => handleStageChange(index, 'highpH', e.target.value)} />
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                          <label>Notes</label>
                          <textarea value={stage.notes} onChange={(e) => handleStageChange(index, 'notes', e.target.value)} rows="2" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="plantlist-modal-footer">
                <button type="button" className="btn-cancel" onClick={handleCloseEditModal}>Cancel</button>
                <button type="button" className="btn-save" onClick={handleSubmit}>
                  <MdSave /> {isEditing ? 'Update Plant' : 'Add Plant'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default PlantMasterList