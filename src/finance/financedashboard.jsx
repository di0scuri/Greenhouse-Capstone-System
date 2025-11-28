import React, { useState, useEffect } from 'react'
import FinanceSidebar from './financesidebar'
import './financedashboard.css'
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore'
import { db } from '../firebase'

const FinanceDashboard = ({ userType = 'finance' }) => {
  const [activeMenu, setActiveMenu] = useState('Overview')
  const [searchTerm, setSearchTerm] = useState('')
  const [financialData, setFinancialData] = useState({
    totalRevenue: 0,
    netProfit: 0,
    totalExpenses: 0,
    roi: 0
  })
  const [transactions, setTransactions] = useState([])
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('Monthly View')

  // Fetch inventory logs for financial calculations
  const fetchInventoryLogs = async () => {
    try {
      const logsQuery = query(
        collection(db, 'inventory_log'),
        orderBy('timestamp', 'desc')
      )
      const querySnapshot = await getDocs(logsQuery)
      const logs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date()
      }))
      
      return logs
    } catch (error) {
      console.error('Error fetching inventory logs:', error)
      return []
    }
  }

  // Calculate financial metrics
  const calculateFinancials = (logs) => {
    let totalRevenue = 0
    let totalExpenses = 0
    const transactions = []

    logs.forEach(log => {
      const amount = (log.quantityChange || 0) * (log.costOrValuePerUnit || 0)
      
      // Revenue: Sales, Stock Decrease (assuming sales)
      if (log.type === 'Sale' || log.type === 'Stock Decrease') {
        totalRevenue += amount
      }
      
      // Expenses: Purchases, Stock Increase, Initial Stock
      if (log.type === 'Purchase' || log.type === 'Stock Increase' || log.type === 'Initial Stock') {
        totalExpenses += amount
        
        // Add to transactions list for display
        transactions.push({
          date: log.timestamp.toLocaleDateString('en-US', { 
            year: 'numeric',
            month: '2-digit', 
            day: '2-digit' 
          }).replace(/\//g, '.'),
          product: log.itemName || 'Unknown Item',
          amount: formatCurrency(amount),
          status: 'Completed',
          type: log.type
        })
      }
    })

    const netProfit = totalRevenue - totalExpenses
    const roi = totalExpenses > 0 ? ((netProfit / totalExpenses) * 100) : 0

    return {
      totalRevenue,
      totalExpenses,
      netProfit,
      roi,
      transactions: transactions.slice(0, 10) // Show recent 10 transactions
    }
  }

  // Generate chart data for the last 12 months
  const generateChartData = (logs) => {
    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const date = new Date()
      date.setMonth(date.getMonth() - (11 - i))
      return {
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        revenue: 0,
        expenses: 0
      }
    })

    logs.forEach(log => {
      const logDate = log.timestamp
      const monthIndex = logDate.getMonth()
      const currentYear = new Date().getFullYear()
      
      if (logDate.getFullYear() === currentYear) {
        const amount = (log.quantityChange || 0) * (log.costOrValuePerUnit || 0)
        
        if (log.type === 'Sale' || log.type === 'Stock Decrease') {
          monthlyData[monthIndex].revenue += amount
        }
        if (log.type === 'Purchase' || log.type === 'Stock Increase' || log.type === 'Initial Stock') {
          monthlyData[monthIndex].expenses += amount
        }
      }
    })

    return monthlyData
  }

  // Load all financial data
  useEffect(() => {
    const loadFinancialData = async () => {
      setLoading(true)
      try {
        const logs = await fetchInventoryLogs()
        const financials = calculateFinancials(logs)
        const chartData = generateChartData(logs)
        
        setFinancialData({
          totalRevenue: financials.totalRevenue,
          netProfit: financials.netProfit,
          totalExpenses: financials.totalExpenses,
          roi: financials.roi
        })
        
        setTransactions(financials.transactions)
        setChartData(chartData)
      } catch (error) {
        console.error('Error loading financial data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadFinancialData()
    
    // Refresh data every 5 minutes
    const interval = setInterval(loadFinancialData, 300000)
    return () => clearInterval(interval)
  }, [])

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount || 0)
  }

  // Calculate percentage change (simulated for now)
  const calculatePercentageChange = (current, previous = 0) => {
    if (previous === 0) return current > 0 ? '+100.00%' : '0.00%'
    const change = ((current - previous) / previous) * 100
    return `${change >= 0 ? '↑' : '↓'} ${Math.abs(change).toFixed(2)}%`
  }

  // Generate SVG path for chart
  const generateChartPath = (data, key, maxValue) => {
    const width = 480
    const height = 200
    const padding = 20
    
    const points = data.map((item, index) => {
      const x = padding + (index * (width - 2 * padding)) / (data.length - 1)
      const y = height - padding - ((item[key] / maxValue) * (height - 2 * padding))
      return `${x},${y}`
    })
    
    return `M ${points.join(' L ')}`
  }

  // Filter transactions by search term
  const filteredTransactions = transactions.filter(transaction =>
    transaction.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
    transaction.type.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const financialCards = [
    {
      title: 'Total Revenue',
      amount: formatCurrency(financialData.totalRevenue),
      change: calculatePercentageChange(financialData.totalRevenue),
      since: 'Since last month',
      icon: '↗'
    },
    {
      title: 'Net Profit',
      amount: formatCurrency(financialData.netProfit), 
      change: calculatePercentageChange(financialData.netProfit),
      since: 'Since last month',
      icon: financialData.netProfit >= 0 ? '↗' : '↘'
    },
    {
      title: 'Expenses',
      amount: formatCurrency(financialData.totalExpenses),
      change: calculatePercentageChange(financialData.totalExpenses), 
      since: 'Since last month',
      icon: '↗'
    },
    {
      title: 'ROI',
      amount: `${financialData.roi.toFixed(2)}%`,
      change: calculatePercentageChange(financialData.roi),
      since: 'Since last month', 
      icon: financialData.roi >= 0 ? '↗' : '↘'
    }
  ]

  const maxChartValue = Math.max(
    ...chartData.map(d => Math.max(d.revenue, d.expenses)),
    1000 // minimum scale
  )

  if (loading) {
    return (
      <div className="fd-dashboard-container">
        <FinanceSidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} userType={userType} />
        <div className="fd-main">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
            Loading financial data...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fd-dashboard-container">
      {/* Sidebar */}
      <FinanceSidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

      {/* Main Content */}
      <div className="fd-main">
        {/* Header */}
        <div className="fd-header">
          <h1 className="fd-title">Financial Report</h1>
          <div className="fd-header-actions">
            <div className="fd-search-box">
              <input
                type="text"
                placeholder="Search transactions..."
                className="fd-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="fd-search-icon">🔍</span>
            </div>
            <div className="fd-bell">🔔</div>
          </div>
        </div>

        {/* Content */}
        <div className="fd-body">
          {/* Top Section */}
          <div className="fd-top">
            {/* Financial Cards */}
            <div className="fd-cards">
              {financialCards.map((card, index) => (
                <div key={index} className="fd-card">
                  <div className="fd-card-header">
                    <span className="fd-card-icon">{card.icon}</span>
                    <span className="fd-card-title">{card.title}</span>
                  </div>
                  <div className="fd-card-amount">{card.amount}</div>
                  <div className="fd-card-footer">
                    <span className="fd-card-since">{card.since}</span>
                    <span className="fd-card-change">{card.change}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="fd-chart">
              <div className="fd-chart-header">
                <h3>Financial Overview</h3>
                <div className="fd-chart-controls">
                  <div className="fd-legend">
                    <div className="fd-legend-item">
                      <span className="fd-legend-dot blue"></span>
                      <span>Revenue</span>
                    </div>
                    <div className="fd-legend-item">
                      <span className="fd-legend-dot red"></span>
                      <span>Expenses</span>
                    </div>
                  </div>
                  <select 
                    className="fd-view-select"
                    value={viewMode}
                    onChange={(e) => setViewMode(e.target.value)}
                  >
                    <option>Monthly View</option>
                    <option>Weekly View</option>
                    <option>Yearly View</option>
                  </select>
                </div>
              </div>
              
              <div className="fd-chart-area">
                <div className="fd-chart-y-axis">
                  <span>{formatCurrency(maxChartValue)}</span>
                  <span>{formatCurrency(maxChartValue * 0.75)}</span>
                  <span>{formatCurrency(maxChartValue * 0.5)}</span>
                  <span>{formatCurrency(maxChartValue * 0.25)}</span>
                  <span>₱0</span>
                </div>
                
                <div className="fd-chart-canvas">
                  {chartData.length > 0 ? (
                    <svg viewBox="0 0 500 250" className="fd-svg">
                      {/* Background grid */}
                      <defs>
                        <pattern id="fdGrid" width="25" height="25" patternUnits="userSpaceOnUse">
                          <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#f5f5f5" strokeWidth="1"/>
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#fdGrid)" />
                      
                      {/* Revenue area fill */}
                      <path
                        d={`${generateChartPath(chartData, 'revenue', maxChartValue)} L 480 220 L 20 220 Z`}
                        fill="rgba(74, 144, 226, 0.2)"
                      />
                      
                      {/* Revenue line (blue) */}
                      <path
                        d={generateChartPath(chartData, 'revenue', maxChartValue)}
                        fill="none"
                        stroke="#4A90E2"
                        strokeWidth="3"
                      />
                      
                      {/* Expenses line (red) */}
                      <path
                        d={generateChartPath(chartData, 'expenses', maxChartValue)}
                        fill="none"
                        stroke="#E94B3C"
                        strokeWidth="3"
                      />
                      
                      {/* Data points */}
                      {chartData.map((data, index) => (
                        <g key={index}>
                          <circle 
                            cx={20 + (index * 460) / (chartData.length - 1)} 
                            cy={220 - 20 - ((data.revenue / maxChartValue) * 180)}
                            r="3" 
                            fill="#4A90E2" 
                          />
                          <circle 
                            cx={20 + (index * 460) / (chartData.length - 1)} 
                            cy={220 - 20 - ((data.expenses / maxChartValue) * 180)}
                            r="3" 
                            fill="#E94B3C" 
                          />
                        </g>
                      ))}
                    </svg>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '250px' }}>
                      No chart data available
                    </div>
                  )}
                </div>
                
                <div className="fd-chart-x-axis">
                  {chartData.map((data, index) => (
                    <span key={index}>{data.month}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Expense Transactions */}
          <div className="fd-transactions">
            <div className="fd-transactions-header">
              <h3>Recent Transactions</h3>
              <button className="fd-view-all">View all →</button>
            </div>
            
            <div className="fd-table">
              <div className="fd-table-header">
                <div>Date</div>
                <div>Product</div>
                <div>Amount</div>
                <div>Status</div>
              </div>
              
              <div className="fd-table-body">
                {filteredTransactions.length === 0 ? (
                  <div className="fd-table-row">
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '20px', color: '#666' }}>
                      {searchTerm ? `No transactions found for "${searchTerm}"` : 'No transactions available'}
                    </div>
                  </div>
                ) : (
                  filteredTransactions.map((transaction, index) => (
                    <div key={index} className="fd-table-row">
                      <div>{transaction.date}</div>
                      <div>{transaction.product}</div>
                      <div>{transaction.amount}</div>
                      <div>
                        <span className={`fd-status ${transaction.status.toLowerCase()}`}>
                          {transaction.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Summary Statistics */}
          <div className="fd-summary">
            <div className="fd-summary-card">
              <h4>This Month</h4>
              <p>Revenue: {formatCurrency(chartData[chartData.length - 1]?.revenue || 0)}</p>
              <p>Expenses: {formatCurrency(chartData[chartData.length - 1]?.expenses || 0)}</p>
              <p>Profit: {formatCurrency((chartData[chartData.length - 1]?.revenue || 0) - (chartData[chartData.length - 1]?.expenses || 0))}</p>
            </div>
            
            <div className="fd-summary-card">
              <h4>Year to Date</h4>
              <p>Total Revenue: {formatCurrency(financialData.totalRevenue)}</p>
              <p>Total Expenses: {formatCurrency(financialData.totalExpenses)}</p>
              <p>Net Profit: {formatCurrency(financialData.netProfit)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FinanceDashboard