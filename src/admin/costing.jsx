import React, { useState, useEffect } from 'react'
import Sidebar from './sidebar'
import './costing.css'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'
import { 
  FaSearch, 
  FaBell, 
  FaDollarSign, 
  FaFileInvoiceDollar, 
  FaChartLine, 
  FaPercentage,
  FaArrowUp,
  FaArrowDown,
  FaArrowRight,
  FaSeedling,
  FaMoneyBillWave
} from 'react-icons/fa'

// Costing Component
const Costing = ({ userType = 'admin' }) => {
  const [activeMenu, setActiveMenu] = useState('Costing & Pricing')
  const [searchTerm, setSearchTerm] = useState('')
  const [productionCosts, setProductionCosts] = useState([])
  const [plantExpenses, setPlantExpenses] = useState([])
  const [inventoryLogs, setInventoryLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [harvests, setHarvests] = useState([])
  const [financialData, setFinancialData] = useState({
    revenue: 0,
    expenses: 0,
    netProfit: 0,
    roi: 0,
    totalProductionCost: 0,
    totalLaborCost: 0,
    totalSeedCost: 0,
    totalFertilizer: 0,
    totalHarvestRevenue: 0,
    totalHarvestProfit: 0,
    averageROI: 0
  })
  const [chartData, setChartData] = useState([])
  const [viewMode, setViewMode] = useState('Monthly View')

  // --- ADDED: DEFINING MISSING CONSTANTS ---
  const SVG_WIDTH = 500
  const SVG_HEIGHT = 220 
  const PADDING_X = 20   
  const PADDING_TOP = 20
  const GRAPH_HEIGHT = 180

  // Helper Functions (Defined before usage)
  const getX = (index, totalLength) => {
    if (totalLength <= 1) return SVG_WIDTH / 2
    return PADDING_X + (index * (SVG_WIDTH - (PADDING_X * 2))) / (totalLength - 1)
  }

  const getY = (value, maxValue) => {
    if (maxValue === 0) return PADDING_TOP + GRAPH_HEIGHT
    return (PADDING_TOP + GRAPH_HEIGHT) - ((value / maxValue) * GRAPH_HEIGHT)
  }

  const getLabelPosition = (index, totalLength) => {
    const xPixel = getX(index, totalLength)
    return (xPixel / SVG_WIDTH) * 100
  }

  // Fetch production costs, plant expenses, and inventory logs from Firebase
  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch production costs
      const costsQuery = query(
        collection(db, 'productionCosts'),
        orderBy('createdAt', 'desc')
      )
      const costsSnapshot = await getDocs(costsQuery)
      const costs = costsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date()
      }))
      
      setProductionCosts(costs)

      // Fetch plant expenses
      const expensesQuery = query(
        collection(db, 'plantExpenses'),
        orderBy('date', 'desc')
      )
      const expensesSnapshot = await getDocs(expensesQuery)
      const expenses = expensesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate ? doc.data().date.toDate() : new Date(),
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date()
      }))

      setPlantExpenses(expenses)

      // Fetch inventory logs
      const logsQuery = query(
        collection(db, 'inventory_log'),
        orderBy('timestamp', 'desc')
      )
      const logsSnapshot = await getDocs(logsQuery)
      const logs = logsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date()
      }))
      
      setInventoryLogs(logs)
      
      // Fetch Harvests
      let harvestsData = []
      try {
        const harvestsQuery = query(
          collection(db, 'harvests'),
          orderBy('createdAt', 'desc')
        )

        const harvestsSnapshot = await getDocs(harvestsQuery)
        harvestsData = harvestsSnapshot.docs.map(doc => {
          const data = doc.data()
          // harvestDate is stored as string (ISO format) or timestamp
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
      } catch (harvestError) {
        console.error('Error fetching harvests:', harvestError)
        setHarvests([]) 
      }

      calculateFinancialData(costs, logs, expenses, harvestsData)
      generateChartDataLogic(costs, logs, expenses, harvestsData)

    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getAreaOccupied = (plant) => {
  if (!plant) return 0;

  // 1. Check for 'plotSizeM2' (Standard)
  if (plant.plotSizeM2 !== undefined && plant.plotSizeM2 !== null) {
    return Number(plant.plotSizeM2);
  }

  // 2. Check for 'plotSizem2' (Lowercase 'm' variant found in your data)
  if (plant.plotSizem2 !== undefined && plant.plotSizem2 !== null) {
    return Number(plant.plotSizem2);
  }

  // 3. Fallback: Calculate from "plotSize" string (e.g., "100x100cm")
  if (typeof plant.plotSize === 'string') {
    const matches = plant.plotSize.match(/(\d+)/g);
    if (matches && matches.length >= 2) {
      const length = parseInt(matches[0]);
      const width = parseInt(matches[1]);
      // Convert cm² to m²: (L * W) / 10,000
      return (length * width) / 10000;
    }
  }

  // 4. Safety Default
  return 0;
};

  // Calculate financial metrics
  const calculateFinancialData = (costs, logs, expenses, harvests) => {
    let totalRevenue = 0
    let totalExpenses = 0
    let totalProductionCost = 0
    let totalLaborCost = 0
    let totalSeedCost = 0
    let totalFertilizer = 0
    let totalHarvestRevenue = 0
    let totalHarvestProfit = 0
    let totalROI = 0
    let harvestCount = 0

    // Calculate production costs
    costs.forEach(cost => {
      const totalCost = cost.totalCost || 0
      totalProductionCost += totalCost
      totalExpenses += totalCost

      if (cost.breakdown) {
        totalLaborCost += cost.breakdown.labor || 0
        totalSeedCost += cost.breakdown.seed || 0
        totalFertilizer += cost.breakdown.fertilizer || 0
      } else if (cost.detailedCosts) {
        totalLaborCost += parseFloat(cost.detailedCosts.labor || 0)
        totalSeedCost += parseFloat(cost.detailedCosts.seed || 0)
        totalFertilizer += parseFloat(cost.detailedCosts.fertilizer || 0)
      }
    })

    // Calculate expenses from plant expenses
    expenses.forEach(expense => {
      const amount = expense.amount || 0
      totalExpenses += amount

      const category = expense.category?.toLowerCase()
      if (category === 'labor') {
        totalLaborCost += amount
      } else if (category === 'seed') {
        totalSeedCost += amount
      } else if (category === 'fertilizer') {
        totalFertilizer += amount
      }
    })

    // Calculate expenses from inventory logs
    logs.forEach(log => {
      const cost = log.cost || 0
      if (['ADD', 'RESTOCK', 'USE', 'REMOVE'].includes(log.action)) {
        if (cost > 0) {
          totalExpenses += cost
        }
      }
    })

    harvests.forEach(harvest => {
      const harvestRevenue = harvest.totalRevenue || 0
      const profit = harvest.profit || 0
      const roi = harvest.roi || 0
      
      totalHarvestRevenue += harvestRevenue
      totalHarvestProfit += profit
      totalROI += roi
      harvestCount++
      
      totalRevenue += harvestRevenue
    })

    const averageROI = harvestCount > 0 ? (totalROI / harvestCount) : 0
    const netProfit = totalRevenue - totalExpenses
    const roi = totalExpenses > 0 ? ((netProfit / totalExpenses) * 100) : 0

    setFinancialData({
      revenue: totalRevenue,
      expenses: totalExpenses,
      netProfit: netProfit,
      roi: roi,
      totalProductionCost: totalProductionCost,
      totalLaborCost: totalLaborCost,
      totalSeedCost: totalSeedCost,
      totalFertilizer: totalFertilizer,
      totalHarvestRevenue: totalHarvestRevenue,
      totalHarvestProfit: totalHarvestProfit,
      averageROI: averageROI
    })
  }

  // Separated logic so it can be called by fetchData AND useEffect
  const generateChartDataLogic = (costs, logs, expenses, harvests = []) => {
    const now = new Date()
    let dataMap = new Map() 
    
    // --- Define the time range ---
    if (viewMode === 'Monthly View') {
      for (let i = 0; i < 12; i++) {
        const month = new Date(now.getFullYear(), i, 1)
        const key = month.toLocaleDateString('en-US', { month: 'short' })
        dataMap.set(key, { month: key, revenue: 0, expenses: 0, productionCosts: 0, harvestRevenue: 0 })
      }
    } else if (viewMode === 'Yearly View') {
      for (let i = 4; i >= 0; i--) {
        const year = now.getFullYear() - i
        const key = String(year)
        dataMap.set(key, { year: key, revenue: 0, expenses: 0, productionCosts: 0, harvestRevenue: 0 })
      }
    } else if (viewMode === 'Weekly View') {
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000)
        const dayOfWeek = (date.getDay() + 6) % 7 
        const startOfWeek = new Date(date)
        startOfWeek.setDate(date.getDate() - dayOfWeek)
        
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(startOfWeek.getDate() + 6)
        
        const startLabel = startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const endLabel = endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const key = `${startLabel}-${endLabel}`
        
        dataMap.set(key, { week: key, revenue: 0, expenses: 0, productionCosts: 0, harvestRevenue: 0, startDate: startOfWeek, endDate: endOfWeek })
      }
    }
    
    const getKeyForDate = (date) => {
      if (viewMode === 'Monthly View') {
        if (date.getFullYear() === now.getFullYear()) {
          return date.toLocaleDateString('en-US', { month: 'short' })
        }
      } else if (viewMode === 'Yearly View') {
        return String(date.getFullYear())
      } else if (viewMode === 'Weekly View') {
        for (const item of dataMap.values()) {
            if (date >= item.startDate && date <= item.endDate) {
                return item.week
            }
        }
      }
      return null
    }

    const processData = (dataArray, dateKey, expenseProp, revenueProp = null) => {
      dataArray.forEach(item => {
        const date = item[dateKey]
        if (date && !isNaN(date.getTime())) {
          const key = getKeyForDate(date)
          if (key && dataMap.has(key)) {
            const entry = dataMap.get(key)
            if (expenseProp) {
              entry.expenses += item[expenseProp] || 0
              if (dateKey === 'createdAt' && item.totalCost !== undefined) {
                 entry.productionCosts += item.totalCost || 0
              }
            }
            if (revenueProp) {
              entry.revenue += item[revenueProp] || 0
              entry.harvestRevenue += item[revenueProp] || 0
            }
          }
        }
      })
    }
    
    const processedHarvests = harvests.map(h => ({
        ...h,
        harvestDate: typeof h.harvestDate === 'string' ? new Date(h.harvestDate) : h.harvestDate
    }))
    
    const inventoryCosts = logs.filter(log => ['ADD', 'RESTOCK', 'USE', 'REMOVE'].includes(log.action) && (log.cost || 0) > 0)
                               .map(log => ({ timestamp: log.timestamp, amount: log.cost || 0 }))

    processData(costs, 'createdAt', 'totalCost') 
    processData(expenses, 'date', 'amount')
    processData(inventoryCosts, 'timestamp', 'amount')
    processData(processedHarvests, 'harvestDate', 'productionCost', 'totalRevenue')
    
    let finalChartData = Array.from(dataMap.values())
    
    if (viewMode === 'Yearly View') {
      finalChartData.sort((a, b) => parseInt(a.year) - parseInt(b.year))
    } else if (viewMode === 'Weekly View') {
      finalChartData.sort((a, b) => a.startDate - b.startDate)
    }

    setChartData(finalChartData)
  }

  // Get combined recent transactions
  const getRecentTransactions = () => {
    const actionToType = {
      'ADD': 'New Stock',
      'RESTOCK': 'Restock',
      'USE': 'Usage',
      'REMOVE': 'Removed',
      'ADJUST': 'Adjustment',
      'UPDATE': 'Update',
      'TRANSFER': 'Transfer',
      'EXPIRE': 'Expired',
      'DAMAGE': 'Damaged'
    }

    const actionToStatus = {
      'ADD': 'expense',
      'RESTOCK': 'expense',
      'USE': 'expense',
      'REMOVE': 'expense',
      'ADJUST': 'neutral',
      'UPDATE': 'neutral',
      'TRANSFER': 'neutral',
      'EXPIRE': 'expense',
      'DAMAGE': 'expense'
    }

    const allTransactions = [
    ...productionCosts.map(cost => ({
      id: cost.id,
      date: cost.createdAt,
      itemName: cost.plantName || 'Production',
      type: 'Production Cost',
      quantity: cost.areaOccupied || 0,
      unit: 'm²',
      amount: cost.totalCost,
      status: 'expense',
      details: cost
    })),
      ...plantExpenses.map(expense => ({
      id: expense.id,
      date: expense.date,
      itemName: expense.plantName || 'Plant Expense',
      type: expense.category || 'Expense',
      quantity: 1,
      unit: 'item',
      amount: expense.amount,
      status: 'expense',
      details: expense
    })),
    ...inventoryLogs.map(log => ({
      id: log.id,
      date: log.timestamp,
      itemName: log.itemName || 'Unknown Item',
      type: actionToType[log.action] || log.action || 'Unknown',
      quantity: Math.abs(log.quantityChange || 0),
      unit: log.unit || 'units',
      amount: log.cost || 0,
      status: actionToStatus[log.action] || 'neutral',
      details: log
    })),
    ...harvests.map(harvest => {
      let harvestDate = harvest.harvestDate
      if (typeof harvestDate === 'string') {
        harvestDate = new Date(harvestDate)
      }
      return {
        id: harvest.id,
        date: harvestDate,
        itemName: harvest.plantName || 'Harvest',
        type: 'Harvest Sale',
        quantity: harvest.actualYield || 0,
        unit: harvest.yieldUnit || 'kg',
        amount: harvest.totalRevenue || 0,
        status: 'revenue',
        profit: harvest.profit || 0,
        roi: harvest.roi || 0,
        details: harvest
      }
    })
  ]

    return allTransactions
      .filter(t => 
        t.itemName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.type?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => b.date - a.date)
      .slice(0, 15) 
  }

  // Update chart when ViewMode changes
  useEffect(() => {
    if (!loading) { 
        generateChartDataLogic(productionCosts, inventoryLogs, plantExpenses, harvests);
    }
  }, [viewMode, loading]) // Keep dependencies as is, or add the data arrays if you want auto-refresh on data change

  useEffect(() => {
    fetchData()
  }, [])

  // Format currency
  const formatCurrency = (amount) => {
    if (amount !== 0 && Math.abs(amount) < 1000) {
      return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amount || 0).replace('₱', '₱') 
    }
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0).replace('₱', '₱')
  }

  const formatPercentage = (value) => {
    const numValue = parseFloat(value);
    const finalValue = isNaN(numValue) ? 0 : numValue;
    return `${finalValue >= 0 ? '+' : ''}${finalValue.toFixed(1)}%`;
  }

  // Generate SVG path for chart line
  const generatePath = (data, key, maxValue) => {
    if (data.length === 0) return ""
    const points = data.map((item, index) => {
      const x = getX(index, data.length)
      const y = getY(item[key], maxValue)
      return `${x},${y}`
    })
    return `M ${points.join(' L ')}`
  }

  // --- Financial Cards Data ---
  const financialCards = [
    {
      icon: <FaDollarSign />,
      title: 'Total Revenue',
      amount: formatCurrency(financialData.revenue),
      since: 'From sales',
      change: formatPercentage(5.2),
      changeType: 'positive',
      changeIcon: <FaArrowUp />
    },
    {
      icon: <FaFileInvoiceDollar />,
      title: 'Total Expenses',
      amount: formatCurrency(financialData.expenses),
      since: 'All costs',
      change: formatPercentage(-2.1),
      changeType: 'positive',
      changeIcon: <FaArrowDown />
    },
    {
      icon: <FaChartLine />,
      title: 'Net Profit',
      amount: formatCurrency(financialData.netProfit),
      since: 'Revenue - Expenses',
      change: formatPercentage(financialData.netProfit >= 0 ? 8.7 : -8.7),
      changeType: financialData.netProfit >= 0 ? 'positive' : 'negative',
      changeIcon: financialData.netProfit >= 0 ? <FaArrowUp /> : <FaArrowDown />
    },
    {
      icon: <FaPercentage />,
      title: 'ROI',
      amount: formatPercentage(financialData.roi),
      since: 'Return on investment',
      change: formatPercentage(1.5),
      changeType: 'positive',
      changeIcon: <FaArrowUp />
    },
    {
      icon: <FaSeedling />, 
      title: 'Harvest Revenue',
      amount: formatCurrency(financialData.totalHarvestRevenue),
      since: 'From harvest sales',
      change: formatPercentage(12.3), 
      changeType: 'positive',
      changeIcon: <FaArrowUp />
    },
    {
      icon: <FaMoneyBillWave />, 
      title: 'Harvest Profit',
      amount: formatCurrency(financialData.totalHarvestProfit),
      since: 'Harvest revenue - cost',
      change: formatPercentage(financialData.averageROI),
      changeType: financialData.totalHarvestProfit >= 0 ? 'positive' : 'negative',
      changeIcon: financialData.totalHarvestProfit >= 0 ? <FaArrowUp /> : <FaArrowDown />
    } 
  ]

  const recentTransactions = getRecentTransactions()
  const maxChartValue = Math.max(
    ...chartData.map(d => Math.max(d.revenue, d.expenses)),
    1000 
  )

  return (
    <div className="dashboard-container">
      <Sidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

      <div className="costing-main">
        {/* Header - You might want to uncomment or add back your header code here if it was removed in the snippet */}
        <div className="costing-header">
           <div className="costing-title">Costing & Pricing</div>
           {/* Add other header elements like search if needed */}
        </div>

        <div className="costing-body">
          {loading ? (
            <div className="costing-loading">
              <div className="loading-spinner">Loading financial data...</div>
            </div>
          ) : (
            <>
              {/* Top Section */}
              <div className="costing-top">
                {financialCards.map((card, index) => (
                  <div key={index} className="costing-card">
                    <div className="costing-card-header">
                      <span className="costing-card-icon">{card.icon}</span>
                      <span className="costing-card-title">{card.title}</span>
                    </div>
                    <div className="costing-card-amount">{card.amount}</div>
                    <div className="costing-card-footer">
                      <span className="costing-card-since">{card.since}</span>
                      <span className={`costing-card-change ${card.changeType}`}>
                        <span className="change-icon">{card.changeIcon}</span>
                        {card.change}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Middle Section */}
              <div className="costing-middle">
                {/* Chart */}
                <div className="costing-chart">
                  <div className="costing-chart-header">
                    <h3>Financial Overview</h3>
                    <div className="costing-chart-controls">
                      <div className="costing-legend">
                        <div className="costing-legend-item">
                          <span className="costing-legend-dot blue"></span>
                          <span>Revenue</span>
                        </div>
                        <div className="costing-legend-item">
                          <span className="costing-legend-dot red"></span>
                          <span>Expenses</span>
                        </div>
                        <div className="costing-legend-item">
                          <span className="costing-legend-dot green"></span>
                          <span>Harvest Revenue</span>
                        </div>
                      </div>
                      <select 
                        className="costing-view-select"
                        value={viewMode}
                        onChange={(e) => setViewMode(e.target.value)}
                      >
                        <option>Monthly View</option>
                        <option>Weekly View</option>
                        <option>Yearly View</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="costing-chart-area">
                    <div className="costing-chart-y-axis">
                      <span>{formatCurrency(maxChartValue)}</span>
                      <span>{formatCurrency(maxChartValue * 0.75)}</span>
                      <span>{formatCurrency(maxChartValue * 0.5)}</span>
                      <span>{formatCurrency(maxChartValue * 0.25)}</span>
                      <span>₱0</span>
                    </div>
                    
                    <div className="costing-chart-canvas">
                      <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} className="costing-svg" preserveAspectRatio="none">
                         <defs>
                          <pattern id="costingGrid" width="100%" height="25%" patternUnits="userSpaceOnUse">
                            <line x1="0" y1="0" x2="100%" y2="0" stroke="#f0f0f0" strokeWidth="1"/>
                          </pattern>
                        </defs>
                        <rect width="100%" height={PADDING_TOP + GRAPH_HEIGHT} fill="url(#costingGrid)" />

                        {chartData.length > 0 && (
                          <>
                            {/* Revenue Line */}
                            <path
                              d={generatePath(chartData, 'revenue', maxChartValue)}
                              fill="none"
                              stroke="#4A90E2"
                              strokeWidth="3"
                              vectorEffect="non-scaling-stroke" 
                            />
                            <path
                              d={`${generatePath(chartData, 'revenue', maxChartValue)} L ${getX(chartData.length-1, chartData.length)} ${PADDING_TOP + GRAPH_HEIGHT} L ${getX(0, chartData.length)} ${PADDING_TOP + GRAPH_HEIGHT} Z`}
                              fill="rgba(74, 144, 226, 0.1)"
                            />
                            {/* Expenses Line */}
                            <path
                              d={generatePath(chartData, 'expenses', maxChartValue)}
                              fill="none"
                              stroke="#E94B3C"
                              strokeWidth="3"
                              vectorEffect="non-scaling-stroke"
                            />
                             {/* Harvest Revenue Line */}
                             <path
                                d={generatePath(chartData, 'harvestRevenue', maxChartValue)}
                                fill="none"
                                stroke="#4CAF50"
                                strokeWidth="3"
                                strokeDasharray="5,5"
                                vectorEffect="non-scaling-stroke"
                              />

                            {/* Dots */}
                            {chartData.map((data, index) => (
                              <g key={index}>
                                <circle 
                                  cx={getX(index, chartData.length)} 
                                  cy={getY(data.revenue, maxChartValue)}
                                  r="4" 
                                  fill="#4A90E2" 
                                  stroke="white"
                                  strokeWidth="2"
                                />
                                <circle 
                                  cx={getX(index, chartData.length)} 
                                  cy={getY(data.expenses, maxChartValue)}
                                  r="4" 
                                  fill="#E94B3C" 
                                  stroke="white"
                                  strokeWidth="2"
                                />
                              </g>
                            ))}
                          </>
                        )}
                      </svg>

                      {/* HTML LABELS OVERLAY */}
                      <div className="costing-labels-overlay">
                        {chartData.map((data, index) => (
                          <div 
                            key={index} 
                            className="costing-label-item"
                            style={{ 
                              left: `${getLabelPosition(index, chartData.length)}%` 
                            }}
                          >
                            {viewMode === 'Monthly View' 
                              ? data.month 
                              : viewMode === 'Yearly View' 
                                ? data.year 
                                : data.week?.split('-')[0]
                            }
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Production Cost Breakdown */}
                <div className="production-breakdown">
                  <div className="breakdown-header">
                    <h3>Production Cost Breakdown</h3>
                    <span className="breakdown-total">
                      Total: {formatCurrency(financialData.totalProductionCost)}
                    </span>
                  </div>
                  <div className="breakdown-items">
                    <div className="breakdown-item">
                      <div className="breakdown-info">
                        <span className="breakdown-label">Labor</span>
                        <span className="breakdown-value">{formatCurrency(financialData.totalLaborCost)}</span>
                      </div>
                      <div className="breakdown-bar">
                        <div 
                          className="breakdown-fill labor" 
                          style={{ 
                            width: `${(financialData.totalLaborCost / financialData.totalProductionCost * 100) || 0}%` 
                          }}
                        />
                      </div>
                    </div>
                    <div className="breakdown-item">
                      <div className="breakdown-info">
                        <span className="breakdown-label">Seed Cost</span>
                        <span className="breakdown-value">{formatCurrency(financialData.totalSeedCost)}</span>
                      </div>
                      <div className="breakdown-bar">
                        <div 
                          className="breakdown-fill seed" 
                          style={{ 
                            width: `${(financialData.totalSeedCost / financialData.totalProductionCost * 100) || 0}%` 
                          }}
                        />
                      </div>
                    </div>
                    <div className="breakdown-item">
                      <div className="breakdown-info">
                        <span className="breakdown-label">Fertilizer Cost</span>
                        <span className="breakdown-value">{formatCurrency(financialData.totalFertilizer)}</span>
                      </div>
                      <div className="breakdown-bar">
                        <div 
                          className="breakdown-fill water" 
                          style={{ 
                            width: `${(financialData.totalFertilizer / financialData.totalProductionCost * 100) || 0}%` 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transactions */}
              <div className="costing-transactions">
                <div className="costing-transactions-header">
                  <h3>Recent Transactions</h3>
                  <button 
                    className="costing-view-all"
                    onClick={() => console.log('View all transactions')}
                  >
                    View all <FaArrowRight style={{ marginLeft: '6px', fontSize: '12px' }} />
                  </button>
                </div>
                
                <div className="costing-table">
                  <div className="costing-table-header">
                    <div>Date</div>
                    <div>Item</div>
                    <div>Type</div>
                    <div>Quantity</div>
                    <div>Amount</div>
                    <div>Status</div>
                  </div>
                  
                  <div className="costing-table-body">
                    {recentTransactions.length === 0 ? (
                      <div className="costing-table-row">
                        <div style={{gridColumn: '1 / -1', textAlign: 'center', padding: '20px'}}>
                          No transactions found
                        </div>
                      </div>
                    ) : (
                      recentTransactions.map((transaction, index) => (
                        <div key={index} className="costing-table-row">
                          <div>
                            {transaction.date.toLocaleDateString('en-US', {
                              month: 'short',
                              day: '2-digit',
                              year: 'numeric'
                            })}
                          </div>
                          <div>{transaction.itemName || 'Unknown Item'}</div>
                          <div>{transaction.type || 'Unknown'}</div>
                          <div>
                            {transaction.quantity} {transaction.unit}
                          </div>
                          <div>
                            {formatCurrency(transaction.amount)}
                          </div>
                          <div>
                            <span className={`costing-status ${
                              transaction.status === 'revenue' ? 'completed' : 
                              transaction.status === 'expense' ? 'pending' : 'neutral'
                            }`}>
                              {transaction.status === 'revenue' ? 'Revenue' : 
                              transaction.status === 'expense' ? 'Expense' : 'Neutral'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Costing