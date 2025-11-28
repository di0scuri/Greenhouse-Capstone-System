import React, { useState, useEffect } from 'react'
import Sidebar from './financesidebar'
import './financecosting.css'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
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
  FaArrowRight
} from 'react-icons/fa'

const FinanceCosting = ({ userType = 'admin' }) => {
  const [activeMenu, setActiveMenu] = useState('Costing & Pricing')
  const [searchTerm, setSearchTerm] = useState('')
  const [inventoryLogs, setInventoryLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [financialData, setFinancialData] = useState({
    revenue: 0,
    expenses: 0,
    netProfit: 0,
    roi: 0
  })
  const [chartData, setChartData] = useState([])
  const [viewMode, setViewMode] = useState('Monthly View')

  // Fetch inventory logs from Firebase
  const fetchInventoryLogs = async () => {
    setLoading(true)
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
      
      setInventoryLogs(logs)
      calculateFinancialData(logs)
      generateChartData(logs)
    } catch (error) {
      console.error('Error fetching inventory logs:', error)
    } finally {
      setLoading(false)
    }
  }

  // Calculate financial metrics from inventory logs
  const calculateFinancialData = (logs) => {
    let totalRevenue = 0
    let totalExpenses = 0

    logs.forEach(log => {
      const amount = (log.quantityChange || 0) * (log.costOrValuePerUnit || 0)
      
      // Revenue: Sales, Stock Decrease (assuming sales)
      if (log.type === 'Sale' || log.type === 'Stock Decrease') {
        totalRevenue += amount
      }
      
      // Expenses: Purchases, Stock Increase, Initial Stock
      if (log.type === 'Purchase' || log.type === 'Stock Increase' || log.type === 'Initial Stock') {
        totalExpenses += amount
      }
    })

    const netProfit = totalRevenue - totalExpenses
    const roi = totalExpenses > 0 ? ((netProfit / totalExpenses) * 100) : 0

    setFinancialData({
      revenue: totalRevenue,
      expenses: totalExpenses,
      netProfit: netProfit,
      roi: roi
    })
  }

  // Generate chart data based on view mode
  const generateChartData = (logs) => {
    const now = new Date()
    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const month = new Date(now.getFullYear(), i, 1)
      return {
        month: month.toLocaleDateString('en-US', { month: 'short' }),
        revenue: 0,
        expenses: 0
      }
    })

    logs.forEach(log => {
      const logDate = log.timestamp
      const monthIndex = logDate.getMonth()
      const amount = (log.quantityChange || 0) * (log.costOrValuePerUnit || 0)

      if (logDate.getFullYear() === now.getFullYear()) {
        if (log.type === 'Sale' || log.type === 'Stock Decrease') {
          monthlyData[monthIndex].revenue += amount
        }
        if (log.type === 'Purchase' || log.type === 'Stock Increase' || log.type === 'Initial Stock') {
          monthlyData[monthIndex].expenses += amount
        }
      }
    })

    setChartData(monthlyData)
  }

  // Filter logs for recent transactions
  const getRecentTransactions = () => {
    return inventoryLogs
      .filter(log => 
        log.itemName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.type?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .slice(0, 10) // Show only recent 10 transactions
  }

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount || 0)
  }

  // Format percentage
  const formatPercentage = (value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
  }

  // Generate SVG path for chart line
  const generatePath = (data, key, maxValue) => {
    const width = 480
    const height = 220
    const padding = 20
    
    const points = data.map((item, index) => {
      const x = padding + (index * (width - 2 * padding)) / (data.length - 1)
      const y = height - padding - ((item[key] / maxValue) * (height - 2 * padding))
      return `${x},${y}`
    })
    
    return `M ${points.join(' L ')}`
  }

  useEffect(() => {
    fetchInventoryLogs()
  }, [])

  const financialCards = [
    {
      icon: <FaDollarSign />,
      title: 'Total Revenue',
      amount: formatCurrency(financialData.revenue),
      since: 'Since last month',
      change: formatPercentage(5.2),
      changeType: 'positive',
      changeIcon: <FaArrowUp />
    },
    {
      icon: <FaFileInvoiceDollar />,
      title: 'Total Expenses',
      amount: formatCurrency(financialData.expenses),
      since: 'Since last month',
      change: formatPercentage(-2.1),
      changeType: 'positive',
      changeIcon: <FaArrowDown />
    },
    {
      icon: <FaChartLine />,
      title: 'Net Profit',
      amount: formatCurrency(financialData.netProfit),
      since: 'Since last month',
      change: formatPercentage(financialData.netProfit >= 0 ? 8.7 : -8.7),
      changeType: financialData.netProfit >= 0 ? 'positive' : 'negative',
      changeIcon: financialData.netProfit >= 0 ? <FaArrowUp /> : <FaArrowDown />
    },
    {
      icon: <FaPercentage />,
      title: 'ROI',
      amount: formatPercentage(financialData.roi),
      since: 'Since last month',
      change: formatPercentage(1.5),
      changeType: 'positive',
      changeIcon: <FaArrowUp />
    }
  ]

  const recentTransactions = getRecentTransactions()
  const maxChartValue = Math.max(
    ...chartData.map(d => Math.max(d.revenue, d.expenses)),
    1000 // minimum scale
  )

  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <Sidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

      {/* Main Content */}
      <div className="costing-main">
        {/* Header */}
        <div className="costing-header">
          <h1 className="costing-title">Financial Report</h1>
          <div className="costing-header-actions">
            <div className="costing-search-box">
              <input
                type="text"
                placeholder="Search transactions..."
                className="costing-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="costing-search-icon">
                <FaSearch />
              </span>
            </div>
            <div className="costing-bell">
              <FaBell />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="costing-body">
          {loading ? (
            <div className="costing-loading">
              <div className="loading-spinner">Loading financial data...</div>
            </div>
          ) : (
            <>
              {/* Top Section */}
              <div className="costing-top">
                {/* Financial Cards */}
                <div className="costing-cards">
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
                      <svg viewBox="0 0 500 250" className="costing-svg">
                        {/* Background grid */}
                        <defs>
                          <pattern id="costingGrid" width="25" height="25" patternUnits="userSpaceOnUse">
                            <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#f5f5f5" strokeWidth="1"/>
                          </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#costingGrid)" />
                        
                        {chartData.length > 0 && (
                          <>
                            {/* Revenue line (blue) with area fill */}
                            <path
                              d={generatePath(chartData, 'revenue', maxChartValue)}
                              fill="none"
                              stroke="#4A90E2"
                              strokeWidth="3"
                            />
                            <path
                              d={`${generatePath(chartData, 'revenue', maxChartValue)} L 480 220 L 20 220 Z`}
                              fill="rgba(74, 144, 226, 0.2)"
                            />
                            
                            {/* Expenses line (red) */}
                            <path
                              d={generatePath(chartData, 'expenses', maxChartValue)}
                              fill="none"
                              stroke="#E94B3C"
                              strokeWidth="3"
                            />
                            
                            {/* Data points for current values */}
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
                          </>
                        )}
                      </svg>
                    </div>
                    
                    <div className="costing-chart-x-axis">
                      {chartData.map((data, index) => (
                        <span key={index}>{data.month}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Transactions */}
              <div className="costing-transactions">
                <div className="costing-transactions-header">
                  <h3>Recent Inventory Transactions</h3>
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
                            {transaction.timestamp.toLocaleDateString('en-US', {
                              month: 'short',
                              day: '2-digit'
                            })}
                          </div>
                          <div>{transaction.itemName || 'Unknown Item'}</div>
                          <div>{transaction.type || 'Unknown'}</div>
                          <div>
                            {transaction.quantityChange} {transaction.unit}
                          </div>
                          <div>
                            {formatCurrency((transaction.quantityChange || 0) * (transaction.costOrValuePerUnit || 0))}
                          </div>
                          <div>
                            <span className={`costing-status ${
                              ['Sale', 'Stock Decrease'].includes(transaction.type) ? 'completed' : 
                              ['Purchase', 'Stock Increase', 'Initial Stock'].includes(transaction.type) ? 'pending' : 
                              'cancelled'
                            }`}>
                              {['Sale', 'Stock Decrease'].includes(transaction.type) ? 'Revenue' : 
                               ['Purchase', 'Stock Increase', 'Initial Stock'].includes(transaction.type) ? 'Expense' : 
                               'Other'}
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

export default FinanceCosting