import React, { useState, useEffect } from 'react'
import { getDatabase, ref, get, onValue, set, update } from 'firebase/database'
import { 
  MdSearch,
  MdNotifications,
  MdWaterDrop,
  MdAir,
  MdPower,
  MdPowerOff,
  MdCheckCircle,
  MdCancel,
  MdSettings,
  MdRefresh
} from 'react-icons/md'

import Sidebar from "./sidebar"; 
import { useUser } from "../contexts/UserContext"; // Import UserContext

import './sensors.css'
import './greenhousecontrols.css'

const GreenhouseControls = () => {
  const { userRole } = useUser(); // Get userRole
  const hasAccess = userRole === 'admin' || userRole === 'farmer'
  const [searchTerm, setSearchTerm] = useState('')
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState({})

  // Fetch devices from Firebase
  const fetchDevices = async () => {
    setLoading(true)
    try {
      const rtdb = getDatabase()
      const devicesRef = ref(rtdb)
      const snapshot = await get(devicesRef)
      
      if (snapshot.exists()) {
        const data = snapshot.val()
        const devicesArray = []
        
        // Fetch sprinklers (sprinkler1 to sprinkler5)
        for (let i = 1; i <= 5; i++) {
          const sprinklerKey = `sprinkler${i}`
          if (data[sprinklerKey]) {
            devicesArray.push({
              id: sprinklerKey,
              name: `Sprinkler ${i}`,
              type: 'sprinkler',
              isOn: data[sprinklerKey].isOn || false,
              location: data[sprinklerKey].location || `Zone ${i}`,
              lastUpdated: data[sprinklerKey].lastUpdated || new Date().toISOString()
            })
          } else {
            // Create default entry if doesn't exist
            devicesArray.push({
              id: sprinklerKey,
              name: `Sprinkler ${i}`,
              type: 'sprinkler',
              isOn: false,
              location: `Zone ${i}`,
              lastUpdated: new Date().toISOString()
            })
          }
        }
        
        // Fetch fan
        if (data.fan) {
          devicesArray.push({
            id: 'fan',
            name: 'Exhaust Fan',
            type: 'fan',
            isOn: data.fan.isOn || false,
            location: data.fan.location || 'Main Greenhouse',
            lastUpdated: data.fan.lastUpdated || new Date().toISOString()
          })
        } else {
          devicesArray.push({
            id: 'fan',
            name: 'Exhaust Fan',
            type: 'fan',
            isOn: false,
            location: 'Main Greenhouse',
            lastUpdated: new Date().toISOString()
          })
        }
        
        setDevices(devicesArray)
        console.log(`Loaded ${devicesArray.length} devices`)
      } else {
        // Initialize with default devices
        const defaultDevices = []
        for (let i = 1; i <= 5; i++) {
          defaultDevices.push({
            id: `sprinkler${i}`,
            name: `Sprinkler ${i}`,
            type: 'sprinkler',
            isOn: false,
            location: `Zone ${i}`,
            lastUpdated: new Date().toISOString()
          })
        }
        defaultDevices.push({
          id: 'fan',
          name: 'Exhaust Fan',
          type: 'fan',
          isOn: false,
          location: 'Main Greenhouse',
          lastUpdated: new Date().toISOString()
        })
        setDevices(defaultDevices)
        console.log('Initialized default devices')
      }
    } catch (error) {
      console.error('Error fetching devices:', error)
    } finally {
      setLoading(false)
    }
  }

  // Toggle device state
  const toggleDevice = async (deviceId, currentState) => {
    if (updating[deviceId]) return
    
    setUpdating(prev => ({ ...prev, [deviceId]: true }))
    
    try {
      const rtdb = getDatabase()
      const deviceRef = ref(rtdb, deviceId)
      const newState = !currentState
      
      await update(deviceRef, {
        isOn: newState,
        lastUpdated: new Date().toISOString()
      })
      
      // Update local state
      setDevices(prev => prev.map(device => 
        device.id === deviceId 
          ? { ...device, isOn: newState, lastUpdated: new Date().toISOString() }
          : device
      ))
      
      console.log(`${deviceId} turned ${newState ? 'ON' : 'OFF'}`)
    } catch (error) {
      console.error(`Error toggling ${deviceId}:`, error)
      alert(`Failed to toggle ${deviceId}. Please try again.`)
    } finally {
      setUpdating(prev => ({ ...prev, [deviceId]: false }))
    }
  }

  // Turn all devices on/off
  const toggleAllDevices = async (turnOn) => {
    try {
      const rtdb = getDatabase()
      const updates = {}
      const timestamp = new Date().toISOString()
      
      devices.forEach(device => {
        updates[`${device.id}/isOn`] = turnOn
        updates[`${device.id}/lastUpdated`] = timestamp
      })
      
      await update(ref(rtdb), updates)
      
      setDevices(prev => prev.map(device => ({
        ...device,
        isOn: turnOn,
        lastUpdated: timestamp
      })))
      
      console.log(`All devices turned ${turnOn ? 'ON' : 'OFF'}`)
    } catch (error) {
      console.error('Error toggling all devices:', error)
      alert('Failed to toggle all devices. Please try again.')
    }
  }

  useEffect(() => {
    fetchDevices()
    
    // Set up real-time listeners
    const rtdb = getDatabase()
    const devicesRef = ref(rtdb)
    
    const unsubscribe = onValue(devicesRef, (snapshot) => {
      if (snapshot.exists()) {
        console.log('Real-time device data updated')
        setTimeout(fetchDevices, 300)
      }
    })
    
    return () => {
      unsubscribe()
    }
  }, [])

  // Filter devices based on search term
  const filteredDevices = devices.filter(device =>
    device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.id.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Calculate statistics
  const sprinklers = devices.filter(d => d.type === 'sprinkler')
  const fans = devices.filter(d => d.type === 'fan')
  const activeDevices = devices.filter(d => d.isOn)
  const activeSprinklers = sprinklers.filter(s => s.isOn)
  const activeFans = fans.filter(f => f.isOn)

  return (
  <div className="dashboard-container">

    {/* SIDEBAR - SAME AS COSTING */}
    <Sidebar 
      userType={userRole} // Use userRole from context
    />

    {/* MAIN CONTENT */}
    <div className="greenhouse-main">

      <div className="sensors-header">
        <h1 className="sensors-title">Greenhouse Control</h1>

        <div className="sensors-header-actions">
          <div className="sensors-search-box">
            <input
              type="text"
              placeholder="Search devices..."
              className="sensors-search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <span className="sensors-search-icon"><MdSearch /></span>
          </div>

          <button 
            className="refresh-button"
            onClick={fetchDevices}
            title="Refresh data"
          >
            <MdRefresh />
          </button>

          <div className="sensors-bell">
            <MdNotifications />
          </div>
        </div>
      </div>

      <div className="sensors-content">

        {/* Stats Section */}
        <div className="sensors-stats">

          <div className="stat-card">
            <div className="stat-icon online"><MdCheckCircle /></div>
            <div className="stat-content">
              <h3>Active Devices</h3>
              <p>{activeDevices.length}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#dbeafe', color: '#2563eb' }}>
              <MdWaterDrop />
            </div>
            <div className="stat-content">
              <h3>Active Sprinklers</h3>
              <p>{activeSprinklers.length} / {sprinklers.length}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#e0e7ff', color: '#6366f1' }}>
              <MdAir />
            </div>
            <div className="stat-content">
              <h3>Active Fans</h3>
              <p>{activeFans.length} / {fans.length}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon total"><MdSettings /></div>
            <div className="stat-content">
              <h3>Total Devices</h3>
              <p>{devices.length}</p>
            </div>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="control-actions">
          <button 
            className="control-button all-on"
            onClick={() => toggleAllDevices(true)}
          >
            <MdPower /> Turn All ON
          </button>

          <button 
            className="control-button all-off"
            onClick={() => toggleAllDevices(false)}
          >
            <MdPowerOff /> Turn All OFF
          </button>
        </div>

        {/* Device Cards Grid */}
        <div className="sensors-grid">

          {loading ? (
            <div className="loading-state">
              <p>Loading devices...</p>
            </div>
          ) : filteredDevices.length === 0 ? (
            <div className="no-sensors">
              <p>
                {searchTerm ? `No devices found matching "${searchTerm}"` : 'No devices available'}
              </p>
            </div>
          ) : (
            filteredDevices.map(device => (
              <div 
                key={device.id}
                className={`device-card ${device.isOn ? 'active' : ''}`}
              >

                {/* Header */}
                <div className="sensor-header">
                  <div className="sensor-info">
                    <div className="device-icon-name">
                      {device.type === 'sprinkler' ? (
                        <MdWaterDrop className="device-type-icon sprinkler-icon" />
                      ) : (
                        <MdAir className="device-type-icon fan-icon" />
                      )}
                      <h3 className="sensor-name">{device.name}</h3>
                    </div>
                    <p className="sensor-location">{device.location}</p>
                  </div>

                  <div 
                    className="device-status"
                    style={{
                      backgroundColor: device.isOn ? '#10b981' : '#ef4444',
                      color: 'white'
                    }}
                  >
                    {device.isOn ? 'ON' : 'OFF'}
                  </div>
                </div>

                {/* Info */}
                <div className="device-info-grid">
                  <div className="info-item">
                    <span className="info-label">Status</span>
                    <span className="info-value">
                      {device.isOn ? (
                        <>
                          <MdCheckCircle style={{ color: '#10b981', marginRight: 4 }} />
                          Active
                        </>
                      ) : (
                        <>
                          <MdCancel style={{ color: '#ef4444', marginRight: 4 }} />
                          Inactive
                        </>
                      )}
                    </span>
                  </div>

                  <div className="info-item">
                    <span className="info-label">Type</span>
                    <span className="info-value">
                      {device.type === 'sprinkler' ? 'Sprinkler' : 'Fan'}
                    </span>
                  </div>
                </div>

                {/* Footer */}
                <div className="sensor-footer">
                  <span className="last-reading">
                    Updated: {new Date(device.lastUpdated).toLocaleString()}
                  </span>
                </div>

                {/* Toggle Button */}
                <button
                  className={`toggle-button ${device.isOn ? 'turn-off' : 'turn-on'}`}
                  onClick={() => toggleDevice(device.id, device.isOn)}
                  disabled={updating[device.id]}
                >
                  {updating[device.id] ? (
                    <>
                      <MdRefresh className="spinning" /> Updating...
                    </>
                  ) : device.isOn ? (
                    <>
                      <MdPowerOff /> Turn OFF
                    </>
                  ) : (
                    <>
                      <MdPower /> Turn ON
                    </>
                  )}
                </button>

              </div>
            ))
          )}

        </div>
      </div>

    </div>
  </div>
);


}

export default GreenhouseControls