import React, { useState, useEffect } from 'react'
import Sidebar from './sidebar'
import './sensors.css'
import { getDatabase, ref, get, onValue, off } from 'firebase/database'
import { 
  MdSearch,
  MdNotifications,
  MdSignalCellularAlt,
  MdWarning,
  MdCancel,
  MdAssessment,
  MdSensors,
  MdThermostat,
  MdWaterDrop,
  MdScience,
  MdClose
} from 'react-icons/md'

const Sensors = ({ userType = 'admin' }) => {
  const [activeMenu, setActiveMenu] = useState('Sensors')
  const [searchTerm, setSearchTerm] = useState('')
  const [sensors, setSensors] = useState([])
  const [selectedSensor, setSelectedSensor] = useState(null)
  const [sensorHistory, setSensorHistory] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [timeRange, setTimeRange] = useState('24h')

  // Parse timestamp from various formats
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

  // Fetch all sensors from Firebase Realtime Database
  const fetchSensors = async () => {
    setLoading(true)
    try {
      const rtdb = getDatabase()
      const sensorsRef = ref(rtdb)
      const snapshot = await get(sensorsRef)
      
      if (snapshot.exists()) {
        const data = snapshot.val()
        const sensorsArray = []
        
        // Look for SoilSensor, SoilSensor2, SoilSensor3, etc.
        Object.keys(data).forEach(key => {
          if (key.startsWith('SoilSensor') || key === 'SoilSensor') {
            const sensorData = data[key]
            
            let latestReading = null
            let latestTimestamp = new Date(0) // Start with epoch
            let readingCount = 0
            const history = []
            
            // Process all readings
            Object.keys(sensorData).forEach(readingKey => {
              // Skip metadata and configuration fields
              if (readingKey === 'metadata' || readingKey === 'config' || readingKey === 'location') {
                return
              }
              
              const reading = sensorData[readingKey]
              
              // Skip if not a valid reading object
              if (typeof reading !== 'object' || reading === null) {
                return
              }
              
              readingCount++
              
              // Parse timestamp
              const timestamp = parseTimestamp(readingKey, reading)
              
              // Build history entry
              const historyEntry = {
                id: readingKey,
                timestamp,
                nitrogen: reading.Nitrogen || reading.nitrogen || reading.N || 0,
                phosphorus: reading.Phosphorus || reading.phosphorus || reading.P || 0,
                potassium: reading.Potassium || reading.potassium || reading.K || 0,
                ph: reading.pH || reading.ph || 0,
                temperature: reading.Temperature || reading.temperature || reading.temp || 0,
                conductivity: reading.Conductivity || reading.conductivity || 0,
                moisture: reading.Moisture || reading.moisture || 0
              }
              
              history.push(historyEntry)
              
              // Check if this is the latest reading
              if (timestamp > latestTimestamp) {
                latestTimestamp = timestamp
                latestReading = {
                  timestamp,
                  nitrogen: historyEntry.nitrogen,
                  phosphorus: historyEntry.phosphorus,
                  potassium: historyEntry.potassium,
                  ph: historyEntry.ph,
                  temperature: historyEntry.temperature,
                  conductivity: historyEntry.conductivity,
                  moisture: historyEntry.moisture
                }
              }
            })
            
            if (latestReading && readingCount > 0) {
              sensorsArray.push({
                id: key,
                name: `NPK Sensor - ${key}`,
                location: sensorData.location || `Greenhouse ${key.replace('SoilSensor', '') || '1'}`,
                status: 'active',
                lastReading: latestReading.timestamp,
                latestValues: {
                  nitrogen: latestReading.nitrogen,
                  phosphorus: latestReading.phosphorus,
                  potassium: latestReading.potassium,
                  ph: latestReading.ph,
                  temperature: latestReading.temperature,
                  conductivity: latestReading.conductivity,
                  moisture: latestReading.moisture
                },
                readingCount,
                history: history.sort((a, b) => b.timestamp - a.timestamp)
              })
            }
          }
        })
        
        // Sort sensors by name/id
        sensorsArray.sort((a, b) => a.id.localeCompare(b.id))
        
        setSensors(sensorsArray)
        console.log(`Loaded ${sensorsArray.length} sensors with ${sensorsArray.reduce((sum, s) => sum + s.readingCount, 0)} total readings`)
      } else {
        setSensors([])
        console.log('No sensor data found in Firebase')
      }
    } catch (error) {
      console.error('Error fetching sensors from RTDB:', error)
      setSensors([])
    } finally {
      setLoading(false)
    }
  }

  // Fetch sensor history for selected sensor
  const fetchSensorHistory = async (sensorId) => {
    setHistoryLoading(true)
    try {
      const sensor = sensors.find(s => s.id === sensorId)
      if (sensor && sensor.history) {
        let filteredHistory = sensor.history
        
        // Filter by time range
        const now = new Date()
        if (timeRange === '24h') {
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
          filteredHistory = filteredHistory.filter(reading => reading.timestamp >= yesterday)
        } else if (timeRange === '7d') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          filteredHistory = filteredHistory.filter(reading => reading.timestamp >= weekAgo)
        } else if (timeRange === '30d') {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          filteredHistory = filteredHistory.filter(reading => reading.timestamp >= monthAgo)
        }
        
        setSensorHistory(filteredHistory)
        console.log(`Loaded ${filteredHistory.length} history records for ${sensorId}`)
      } else {
        setSensorHistory([])
      }
    } catch (error) {
      console.error('Error processing sensor history:', error)
      setSensorHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    fetchSensors()
    
    // Set up real-time listener for sensor data
    const rtdb = getDatabase()
    const sensorsRef = ref(rtdb)
    
    const unsubscribe = onValue(sensorsRef, (snapshot) => {
      if (snapshot.exists()) {
        console.log('Real-time sensor data updated')
        setTimeout(fetchSensors, 500)
      }
    })
    
    return () => {
      off(sensorsRef, 'value', unsubscribe)
    }
  }, [])

  // Update history when time range changes
  useEffect(() => {
    if (selectedSensor) {
      fetchSensorHistory(selectedSensor.id)
    }
  }, [timeRange, selectedSensor])

  const handleSensorClick = async (sensor) => {
    setSelectedSensor(sensor)
    setShowModal(true)
    await fetchSensorHistory(sensor.id)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setSelectedSensor(null)
    setSensorHistory([])
  }

  // Filter sensors based on search term
  const filteredSensors = sensors.filter(sensor =>
    sensor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sensor.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sensor.id.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Get sensor status color
  const getSensorStatusColor = (sensor) => {
    const timeDiff = new Date() - sensor.lastReading
    const minutesDiff = timeDiff / (1000 * 60)
    
    if (minutesDiff > 60) return '#ef4444'
    if (minutesDiff > 30) return '#f59e0b'
    return '#10b981'
  }

  // Get sensor status text
  const getSensorStatusText = (sensor) => {
    const timeDiff = new Date() - sensor.lastReading
    const minutesDiff = timeDiff / (1000 * 60)
    
    if (minutesDiff > 60) return 'Offline'
    if (minutesDiff > 30) return 'Warning'
    return 'Online'
  }

  const formatValue = (value, unit = '') => {
    if (value === null || value === undefined) return 'N/A'
    return `${(value || 0).toFixed(1)}${unit}`
  }

  return (
    <div className="dashboard-container">
      <Sidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

      <div className="sensors-main">
        <div className="sensors-header">
          <h1 className="sensors-title">
            Sensor Monitoring
          </h1>
          <div className="sensors-header-actions">
            <div className="sensors-search-box">
              <input
                type="text"
                placeholder="Search sensors..."
                className="sensors-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="sensors-search-icon">
                <MdSearch />
              </span>
            </div>
            <div className="sensors-bell">
              <MdNotifications />
            </div>
          </div>
        </div>

        <div className="sensors-content">
          <div className="sensors-stats">
            <div className="stat-card">
              <div className="stat-icon online">
                <MdSignalCellularAlt />
              </div>
              <div className="stat-content">
                <h3>Online Sensors</h3>
                <p>{sensors.filter(s => getSensorStatusText(s) === 'Online').length}</p>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon warning">
                <MdWarning />
              </div>
              <div className="stat-content">
                <h3>Warning Sensors</h3>
                <p>{sensors.filter(s => getSensorStatusText(s) === 'Warning').length}</p>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon offline">
                <MdCancel />
              </div>
              <div className="stat-content">
                <h3>Offline Sensors</h3>
                <p>{sensors.filter(s => getSensorStatusText(s) === 'Offline').length}</p>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon total">
                <MdAssessment />
              </div>
              <div className="stat-content">
                <h3>Total Sensors</h3>
                <p>{sensors.length}</p>
              </div>
            </div>
          </div>

          <div className="sensors-grid">
            {loading ? (
              <div className="loading-state">
                <p>Loading sensors...</p>
              </div>
            ) : filteredSensors.length === 0 ? (
              <div className="no-sensors">
                <p>{searchTerm ? `No sensors found matching "${searchTerm}"` : 'No sensors available'}</p>
              </div>
            ) : (
              filteredSensors.map(sensor => (
                <div
                  key={sensor.id}
                  className="sensor-card"
                  onClick={() => handleSensorClick(sensor)}
                >
                  <div className="sensor-header">
                    <div className="sensor-info">
                      <h3 className="sensor-name">{sensor.name}</h3>
                      <p className="sensor-location">{sensor.location}</p>
                    </div>
                    <div 
                      className="sensor-status"
                      style={{ backgroundColor: getSensorStatusColor(sensor) }}
                    >
                      {getSensorStatusText(sensor)}
                    </div>
                  </div>

                  <div className="sensor-readings">
                    <div className="reading-item">
                      <span className="reading-label">
                        <MdScience style={{ fontSize: '14px', marginRight: '4px' }} />
                        Nitrogen
                      </span>
                      <span className="reading-value">{formatValue(sensor.latestValues.nitrogen, ' ppm')}</span>
                    </div>
                    <div className="reading-item">
                      <span className="reading-label">
                        <MdScience style={{ fontSize: '14px', marginRight: '4px' }} />
                        Phosphorus
                      </span>
                      <span className="reading-value">{formatValue(sensor.latestValues.phosphorus, ' ppm')}</span>
                    </div>
                    <div className="reading-item">
                      <span className="reading-label">
                        <MdScience style={{ fontSize: '14px', marginRight: '4px' }} />
                        Potassium
                      </span>
                      <span className="reading-value">{formatValue(sensor.latestValues.potassium, ' ppm')}</span>
                    </div>
                    <div className="reading-item">
                      <span className="reading-label">
                        <MdWaterDrop style={{ fontSize: '14px', marginRight: '4px' }} />
                        pH Level
                      </span>
                      <span className="reading-value">{formatValue(sensor.latestValues.ph)}</span>
                    </div>
                    <div className="reading-item">
                      <span className="reading-label">
                        <MdThermostat style={{ fontSize: '14px', marginRight: '4px' }} />
                        Temperature
                      </span>
                      <span className="reading-value">{formatValue(sensor.latestValues.temperature, '°C')}</span>
                    </div>
                    <div className="reading-item">
                      <span className="reading-label">
                        <MdScience style={{ fontSize: '14px', marginRight: '4px' }} />
                        Conductivity
                      </span>
                      <span className="reading-value">{formatValue(sensor.latestValues.conductivity, ' µS/cm')}</span>
                    </div>
                  </div>

                  <div className="sensor-footer">
                    <span className="last-reading">
                      Last: {sensor.lastReading.toLocaleString()}
                    </span>
                    <span className="reading-count">
                      {sensor.readingCount} readings
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showModal && selectedSensor && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="sensor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <MdSensors style={{ marginRight: '10px', verticalAlign: 'middle' }} />
                {selectedSensor.name}
              </h2>
              <button className="modal-close" onClick={handleCloseModal}>
                <MdClose />
              </button>
            </div>

            <div className="modal-content">
              <div className="sensor-details">
                <div className="detail-item">
                  <strong>Sensor ID:</strong> {selectedSensor.id}
                </div>
                <div className="detail-item">
                  <strong>Location:</strong> {selectedSensor.location}
                </div>
                <div className="detail-item">
                  <strong>Status:</strong> 
                  <span 
                    className="status-indicator"
                    style={{ 
                      backgroundColor: getSensorStatusColor(selectedSensor),
                      color: 'white',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      marginLeft: '8px',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}
                  >
                    {getSensorStatusText(selectedSensor)}
                  </span>
                </div>
                <div className="detail-item">
                  <strong>Total Readings:</strong> {selectedSensor.readingCount}
                </div>
                <div className="detail-item">
                  <strong>Last Reading:</strong> {selectedSensor.lastReading.toLocaleString()}
                </div>
              </div>

              <div className="time-range-selector">
                <label>Time Range:</label>
                <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
                  <option value="24h">Last 24 Hours</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="all">All Time</option>
                </select>
              </div>

              <div className="history-content">
                {historyLoading ? (
                  <div className="loading-history">Loading sensor history...</div>
                ) : sensorHistory.length === 0 ? (
                  <div className="no-history">No sensor data available for the selected time range</div>
                ) : (
                  <>
                    <div className="current-values">
                      <h3>Latest Readings</h3>
                      <div className="values-grid-3x2">
                        <div className="value-card nitrogen">
                          <span className="value-label">Nitrogen</span>
                          <span className="value-number">{formatValue(selectedSensor.latestValues.nitrogen)}</span>
                          <span className="value-unit">ppm</span>
                        </div>
                        <div className="value-card phosphorus">
                          <span className="value-label">Phosphorus</span>
                          <span className="value-number">{formatValue(selectedSensor.latestValues.phosphorus)}</span>
                          <span className="value-unit">ppm</span>
                        </div>
                        <div className="value-card potassium">
                          <span className="value-label">Potassium</span>
                          <span className="value-number">{formatValue(selectedSensor.latestValues.potassium)}</span>
                          <span className="value-unit">ppm</span>
                        </div>
                        <div className="value-card ph">
                          <span className="value-label">pH Level</span>
                          <span className="value-number">{formatValue(selectedSensor.latestValues.ph)}</span>
                          <span className="value-unit"></span>
                        </div>
                        <div className="value-card temperature">
                          <span className="value-label">Temperature</span>
                          <span className="value-number">{formatValue(selectedSensor.latestValues.temperature)}</span>
                          <span className="value-unit">°C</span>
                        </div>
                        <div className="value-card conductivity">
                          <span className="value-label">Conductivity</span>
                          <span className="value-number">{formatValue(selectedSensor.latestValues.conductivity)}</span>
                          <span className="value-unit">µS/cm</span>
                        </div>
                      </div>
                    </div>

                    <div className="history-table-container">
                      <h3>Reading History ({sensorHistory.length} records)</h3>
                      <div className="history-table">
                        <div className="table-header">
                          <div>Timestamp</div>
                          <div>Nitrogen</div>
                          <div>Phosphorus</div>
                          <div>Potassium</div>
                          <div>pH</div>
                          <div>Temp</div>
                          <div>Conductivity</div>
                        </div>
                        <div className="table-body">
                          {sensorHistory.slice(0, 100).map((reading, index) => (
                            <div key={reading.id || index} className="table-row">
                              <div className="timestamp-cell">
                                {reading.timestamp.toLocaleString()}
                              </div>
                              <div className="value-cell">{formatValue(reading.nitrogen)} ppm</div>
                              <div className="value-cell">{formatValue(reading.phosphorus)} ppm</div>
                              <div className="value-cell">{formatValue(reading.potassium)} ppm</div>
                              <div className="value-cell">{formatValue(reading.ph)}</div>
                              <div className="value-cell">{formatValue(reading.temperature)}°C</div>
                              <div className="value-cell">{formatValue(reading.conductivity)} µS/cm</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Sensors