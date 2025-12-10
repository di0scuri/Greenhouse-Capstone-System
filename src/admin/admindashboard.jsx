import React, { useState, useEffect } from 'react'
import Sidebar from './sidebar'
import './admindashboard.css'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db, realtimeDb } from '../firebase'
import {ref, get} from 'firebase/database'
import { 
  FaDollarSign, FaFileInvoiceDollar, FaChartLine, FaPercentage,
  FaSearch, FaBell, FaSeedling, FaThermometerHalf, FaTint
} from 'react-icons/fa'
import { MdCheckBoxOutlineBlank, MdScience, MdWaterDrop } from 'react-icons/md'

const AdminDashboard = ({ userType = 'admin', user = null }) => {
  const [activeMenu, setActiveMenu] = useState('Overview')
  const [currentDateTime, setCurrentDateTime] = useState(new Date())
  const [financialData, setFinancialData] = useState({
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    simpleROI: 0
  })
  const [sensorData, setSensorData] = useState([])
  const [events, setEvents] = useState([])
  const [harvests, setHarvests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date())
    }, 60000) // Update every minute

    return () => clearInterval(timer)
  }, [])

// Fetch financial data from inventory_log
const fetchFinancialData = async () => {
  try {
    // 1. Fetch all four data sources concurrently
    const [
      logsSnapshot,
      costsSnapshot,
      expensesSnapshot,
      harvestsSnapshot
    ] = await Promise.all([
      getDocs(collection(db, 'inventory_log')),
      getDocs(collection(db, 'productionCosts')),
      getDocs(collection(db, 'plantExpenses')),
      getDocs(collection(db, 'harvests'))
    ])

    // 2. Process Inventory Logs (Revenue & Inventory Expenses)
    const logs = logsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date()
    }))

    let totalRevenue = 0
    let inventoryExpenses = 0

    logs.forEach(log => {
      const amount = (log.quantityChange || 0) * (log.costOrValuePerUnit || 0)
      
      // Revenue: Sales, Stock Decrease
      if (log.type === 'Sale' || log.type === 'Stock Decrease') {
        totalRevenue += amount
      }
      
      // Expenses: Purchases, Stock Increase, Initial Stock
      if (log.type === 'Purchase' || log.type === 'Stock Increase' || log.type === 'Initial Stock') {
        inventoryExpenses += amount
      }
    })

    // 3. Process Production Costs [FIXED]
    let productionCostsExpenses = 0
    costsSnapshot.docs.forEach(doc => {
      const data = doc.data()
      // Fix: Check for 'totalCost' (used in production.jsx)
      productionCostsExpenses += data.totalCost || data.cost || data.amount || 0
    })

    // 4. Process Plant Expenses
    let plantExpensesExpenses = 0
    expensesSnapshot.docs.forEach(doc => {
      const data = doc.data()
      plantExpensesExpenses += data.amount || 0
    })

    // 5. Process Harvests
    let harvestRevenue = 0
    harvestsSnapshot.docs.forEach(doc => {
      const data = doc.data()
      harvestRevenue += data.totalRevenue || 0
    })

    // 6. Aggregate totals
    totalRevenue += harvestRevenue
    
    // Total Expenses = Inventory Purchases + Production Costs + Direct Expenses
    // Note: Depending on your workflow, this might double count if Production Costs include Inventory items.
    // For a simple dashboard, summing them ensures no large costs are missed.
    const totalExpenses = inventoryExpenses + productionCostsExpenses + plantExpensesExpenses
    
    // 7. Calculate Net Profit and ROI
    const netProfit = totalRevenue - totalExpenses
    const simpleROI = totalExpenses > 0 ? ((netProfit / totalExpenses) * 100) : 0

    // 8. Update state
    setFinancialData({
      totalRevenue,
      totalExpenses,
      netProfit,
      simpleROI,
      harvestRevenue,
      harvestCount: harvestsSnapshot.docs.length 
    })
  } catch (error) {
    console.error('Error fetching financial data:', error)
  }
}
  // Fetch events data
  const fetchEvents = async () => {
    try {
      const eventsQuery = query(
        collection(db, 'events'),
        orderBy('timestamp', 'desc'),
        limit(5)
      )
      const querySnapshot = await getDocs(eventsQuery)
      const eventsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date(),
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date()
      }))

      setEvents(eventsData)
    } catch (error) {
      console.error('Error fetching events:', error)
    }
  }

  // Fetch sensor readings data
  const fetchSensorData = async () => {
  try {
    // Fetch all sensor paths (SoilSensor1, SoilSensor2, etc.)
    const rootRef = ref(realtimeDb, '/')
    const snapshot = await get(rootRef)
    
    if (snapshot.exists()) {
      const allData = snapshot.val()
      const sensorsReadings = []
      
      // Find all keys that start with "SoilSensor"
      Object.keys(allData).forEach(key => {
        if (key.startsWith('SoilSensor')) {
          const sensorData = allData[key]
          
          // Get the latest timestamp entry
          let latestData = null
          let latestTimestamp = null
          
          Object.keys(sensorData).forEach(dataKey => {
            // Skip non-timestamp keys
            if (dataKey.includes('_') || dataKey.includes('-')) {
              if (!latestTimestamp || dataKey > latestTimestamp) {
                latestTimestamp = dataKey
                latestData = sensorData[dataKey]
              }
            }
          })
          
          // If no timestamped data found, use direct values
          if (!latestData) {
            latestData = sensorData
          }
          
          // Map Firebase field names to expected field names
          sensorsReadings.push({
            id: key,
            plantId: key,
            nitrogen: latestData.Nitrogen || latestData.nitrogen || 0,
            phosphorus: latestData.Phosphorus || latestData.phosphorus || 0,
            potassium: latestData.Potassium || latestData.potassium || 0,
            ph: latestData.pH || latestData.ph || 7,
            moisture: latestData.Moisture || latestData.moisture || 0,
            temperature: latestData.Temperature || latestData.temperature || 0,
            humidity: latestData.Humidity || latestData.humidity || 0,
            conductivity: latestData.Conductivity || latestData.conductivity || 0,
            timestamp: latestTimestamp ? new Date() : new Date()
          })
        }
      })
      
      setSensorData(sensorsReadings)
    }
  } catch (error) {
    console.error('Error fetching sensor data:', error)
  }
}

// Fetch harvests data
const fetchHarvests = async () => {
  try {
    const harvestsQuery = query(
      collection(db, 'harvests'),
      orderBy('createdAt', 'desc')
    )
    const harvestsSnapshot = await getDocs(harvestsQuery)
    const harvestsData = harvestsSnapshot.docs.map(doc => {
      const data = doc.data()
      // harvestDate is stored as string (ISO format)
      let harvestDate = new Date()
      if (data.harvestDate) {
        harvestDate = typeof data.harvestDate === 'string' 
          ? new Date(data.harvestDate) 
          : data.harvestDate.toDate?.() || new Date()
      }
      
      return {
        id: doc.id,
        ...data,
        harvestDate: harvestDate
      }
    })
    
    setHarvests(harvestsData)
  } catch (error) {
    console.error('Error fetching harvests:', error)
    setHarvests([]) // Set empty array on error
  }
}

// Load all data
useEffect(() => {
  const loadAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchFinancialData(),
        fetchEvents(),
        fetchSensorData(),
        fetchHarvests()
      ])
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  loadAllData()
  
  // Set up real-time updates every 30 seconds
  const interval = setInterval(() => {
    fetchSensorData()
    fetchEvents()
    fetchHarvests()
  }, 30000)
  
  return () => clearInterval(interval)
}, [])


  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2
    }).format(amount)
  }

  // Format date and time
  const formatDateTime = (date) => {
    const options = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }
    return date.toLocaleDateString('en-US', options)
  }

  // Get user greeting name
  const getUserName = () => {
    if (user && user.name) {
      return user.name
    }
    if (user && user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`
    }
    if (user && user.username) {
      return user.username
    }
    return 'Admin' // Fallback
  }

  const statsCards = [
    {
      title: 'Total Revenue',
      amount: formatCurrency(financialData.totalRevenue),
      color: '#2E7D32',
      bgColor: '#E8F5E9',
      icon: <FaDollarSign />
    },
    {
      title: 'Total Expenses',
      amount: formatCurrency(financialData.totalExpenses),
      color: '#C62828',
      bgColor: '#FFEBEE',
      icon: <FaFileInvoiceDollar />
    },
    {
      title: 'Net Profit',
      amount: formatCurrency(financialData.netProfit),
      color: financialData.netProfit >= 0 ? '#2E7D32' : '#C62828',
      bgColor: financialData.netProfit >= 0 ? '#E8F5E9' : '#FFEBEE',
      icon: <FaChartLine />
    },
    {
      title: 'Simple ROI',
      amount: `${financialData.simpleROI.toFixed(1)}%`,
      color: '#1565C0',
      bgColor: '#E3F2FD',
      icon: <FaPercentage />
    },

    {
    title: 'Harvest Revenue',
    amount: formatCurrency(financialData.harvestRevenue || 0),
    color: '#059669',
    bgColor: '#ECFDF5',
    icon: <FaSeedling />,
    isHarvest: true
  },
  {
    title: 'Harvest Count',
    amount: `${financialData.harvestCount || 0} batches`,
    color: '#D97706',
    bgColor: '#FEF3C7',
    icon: <FaSeedling />,
    isHarvest: true
  }
  ]

  // Generate tasks from events
  const generateTasks = () => {
    const tasks = events.slice(0, 5).map(event => {
      if (event.type === 'LIFECYCLE_STAGE' && event.message) {
        return event.message
      }
      return `Check ${event.plantId || 'plant'} - ${event.status || event.type || 'update'}`
    })

    // Add some default tasks if no events
    if (tasks.length === 0) {
      return [
        'Water the plants in greenhouse',
        'Check NPK levels in all sensors',
        'Monitor temperature and humidity',
        'Review inventory levels',
        'Update plant growth stages'
      ]
    }

    return tasks
  }

  // Get NPK status color based on optimal ranges
  const getNPKStatus = (nutrient, value) => {
    const optimalRanges = {
      nitrogen: { min: 30, max: 60 },
      phosphorus: { min: 30, max: 70 },
      potassium: { min: 60, max: 90 },
      ph: { min: 5.5, max: 7.0 }
    }

    const range = optimalRanges[nutrient]
    if (!range || value === null || value === undefined) {
      return '#9E9E9E' // Gray for unknown
    }

    if (value >= range.min && value <= range.max) {
      return '#10b981' // Green - optimal
    } else if (value < range.min * 0.7 || value > range.max * 1.3) {
      return '#ef4444' // Red - critical
    } else {
      return '#f59e0b' // Orange - warning
    }
  }

  // Get plant name from plantId (you might want to fetch this from plants collection)
  const getSensorDisplayName = (plantId) => {
    const match = plantId.match(/\d+/)
    return match ? `Sensor ${match[0]}` : 'Unknown Sensor'
  }

  const tasks = generateTasks()

  return (
    <div className="dashboard-container-ad">
      {/* Sidebar Component */}
      <Sidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

      {/* Main Content */}
      <div className="main-content">
        {/* Header */}
        <div className="dashboard-header">
          <div className="header-left">
            <h1>Hello, {getUserName()}!</h1>
            <p className="date-text">{formatDateTime(currentDateTime)}</p>
            <p className="time-text">{currentDateTime.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}</p>
          </div>
          <div className="header-right">
            <div className="search-container-ad">
              <input
                type="text"
                placeholder="Search..."
                className="search-input-ad"
              />
              <div className="search-icon-ad">
                <FaSearch />
              </div>
            </div>
            <div className="notification-icon">
              <FaBell />
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="stats-grid">
          {statsCards.map((card, index) => (
            <div key={index} className="stat-card">
              <div 
                className="stat-icon" 
                style={{ 
                  backgroundColor: card.bgColor,
                  color: card.color 
                }}
              >
                {card.icon}
              </div>
              <div className="stat-content-ad">
                <h3 className="stat-title">{card.title}</h3>
                <p className="stat-amount-10">{card.amount}</p>
                {loading && index < 3 && (
                  <div className="loading-indicator">Loading...</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Content Grid */}
        <div className="content-grid">
          {/* Upcoming Events/Tasks */}
          <div className="content-card tasks-card">
            <h3 className="card-title">Recent Events & Tasks</h3>
            <div className="tasks-list">
              {loading ? (
                <div className="task-item">Loading events...</div>
              ) : tasks.length === 0 ? (
                <div className="task-item">No recent events</div>
              ) : (
                tasks.map((task, index) => (
                  <div key={index} className="task-item">
                    <div className="task-checkbox">
                      <MdCheckBoxOutlineBlank />
                    </div>
                    <span className="task-text">{task}</span>
                  </div>
                ))
              )}
            </div>
            {events.length > 0 && (
              <div className="events-summary">
                <small>
                  Latest event: {events[0]?.timestamp?.toLocaleString() || 'Unknown'}
                </small>
              </div>
            )}
          </div>

          <div className="content-card harvest-summary-section">
            <h3 className="card-title">Recent Harvests</h3>
            <div className="harvest-list">
              {loading ? (
                <div className="harvest-loading">Loading harvests...</div>
              ) : harvests.length === 0 ? (
                <div className="harvest-empty">No recent harvests</div>
              ) : (
                harvests.slice(0, 5).map((harvest) => (
                  <div key={harvest.id} className="harvest-item">
                    <div className="harvest-item-header">
                      <span className="harvest-plant-name">
                        {harvest.plantName || 'Unknown Plant'}
                      </span>
                      <span className={`harvest-status-badge ${
                        (harvest.profit || 0) >= 0 ? 'positive' : 'negative'
                      }`}>
                        {(harvest.profit || 0) >= 0 ? '✓ Profitable' : '✗ Loss'}
                      </span>
                    </div>
                    <div className="harvest-item-details">
                      <div className="harvest-detail">
                        <small>Revenue:</small>
                        <strong>{formatCurrency(harvest.totalRevenue || 0)}</strong>
                      </div>
                      <div className="harvest-detail">
                        <small>Profit:</small>
                        <strong style={{ 
                          color: (harvest.profit || 0) >= 0 ? '#10b981' : '#ef4444' 
                        }}>
                          {formatCurrency(harvest.profit || 0)}
                        </strong>
                      </div>
                      <div className="harvest-detail">
                        <small>ROI:</small>
                        <strong>{harvest.roi?.toFixed(1) || 0}%</strong>
                      </div>
                    </div>
                    <div className="harvest-item-footer">
                      <small>
                        Harvested: {harvest.harvestDate ? 
                          new Date(harvest.harvestDate).toLocaleDateString() : 
                          'Unknown date'}
                      </small>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Real-time Plant Cards (Replaced Chart) */}
          <div className="content-card chart-full-width sensor-cards-wrapper">
            <div className="chart-header">
              <h3 className="card-title">
                Real-time Plant Status & Soil Analysis
              </h3>
              <div className="last-update">
                Last updated: {sensorData.length > 0 ? sensorData[0].timestamp.toLocaleTimeString() : 'No data'}
              </div>
            </div>
            
            <div className="sensor-cards-grid">
              {loading ? (
                <div className="chart-loading">Loading sensor data...</div>
              ) : sensorData.length === 0 ? (
                <div className="chart-loading">No sensor data available</div>
              ) : (
                sensorData.map((data) => (
                  <div key={data.id} className="sensor-mini-card">
                    <div className="sensor-mini-header">
                      <div className="sensor-icon-wrapper">
                        <FaSeedling />
                      </div>
                      <div className="sensor-title-info">
                        <h4>{getSensorDisplayName(data.plantId)}</h4>
                        <span className="sensor-status-dot online">Active</span>
                      </div>
                    </div>

                    <div className="sensor-readings-grid">
                      {/* Nitrogen */}
                      <div className="reading-mini-item">
                        <div className="reading-label">Nitrogen</div>
                        <div className="reading-value" style={{ color: getNPKStatus('nitrogen', data.nitrogen) }}>
                          {data.nitrogen || 0}
                          <span className="reading-unit">ppm</span>
                        </div>
                      </div>

                      {/* Phosphorus */}
                      <div className="reading-mini-item">
                        <div className="reading-label">Phosphorus</div>
                        <div className="reading-value" style={{ color: getNPKStatus('phosphorus', data.phosphorus) }}>
                          {data.phosphorus || 0}
                          <span className="reading-unit">ppm</span>
                        </div>
                      </div>

                      {/* Potassium */}
                      <div className="reading-mini-item">
                        <div className="reading-label">Potassium</div>
                        <div className="reading-value" style={{ color: getNPKStatus('potassium', data.potassium) }}>
                          {data.potassium || 0}
                          <span className="reading-unit">ppm</span>
                        </div>
                      </div>

                      {/* pH */}
                      <div className="reading-mini-item">
                        <div className="reading-label">pH Level</div>
                        <div className="reading-value" style={{ color: getNPKStatus('ph', data.ph) }}>
                          {data.ph?.toFixed(1) || 7.0}
                        </div>
                      </div>

                      {/* Temperature */}
                      <div className="reading-mini-item">
                        <div className="reading-label">
                          <FaThermometerHalf style={{ fontSize: '10px', marginRight: '2px' }} /> Temp
                        </div>
                        <div className="reading-value text-default">
                          {data.temperature || 0}
                          <span className="reading-unit">°C</span>
                        </div>
                      </div>

                      {/* Moisture */}
                      <div className="reading-mini-item">
                        <div className="reading-label">
                          <FaTint style={{ fontSize: '10px', marginRight: '2px' }} /> Moisture
                        </div>
                        <div className="reading-value text-default">
                          {data.moisture || 0}
                          <span className="reading-unit">%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard