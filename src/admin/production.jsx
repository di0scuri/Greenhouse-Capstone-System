import React, { useState, useEffect } from 'react'
import Sidebar from './sidebar'
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  getDocs,
  query,
  where,
  serverTimestamp,
  orderBy 
} from 'firebase/firestore'
import { db } from '../firebase'

import { MdReceipt, MdAdd, MdEdit, MdDelete } from 'react-icons/md'
import { FaSeedling } from 'react-icons/fa'

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
  MdAgriculture,
  MdCalculate,
  MdClose,
  MdTrendingUp,
  MdFileDownload 
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
  const EXPENSE_CATEGORIES = [
    'Labor',
    'Seeds',
    'Fertilizer'
  ]
  const [showExpenseTracker, setShowExpenseTracker] = useState(false)
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false)
  const [showEditExpenseModal, setShowEditExpenseModal] = useState(false)
  const [plantExpenses, setPlantExpenses] = useState([])
  const [expenseSummary, setExpenseSummary] = useState(null)
  const [loadingExpenses, setLoadingExpenses] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [expenseFormData, setExpenseFormData] = useState({
    category: 'Labor',
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'Cash',
    receiptNumber: '',
    vendor: '',
    notes: ''
  })

  const [showPricingModal, setShowPricingModal] = useState(false)
  const [profitMargin, setProfitMargin] = useState(30)
  const [pricingResults, setPricingResults] = useState(null)
  const [pricingTiers, setPricingTiers] = useState(null)
  const [selectedTier, setSelectedTier] = useState('standard')
  const [customPrice, setCustomPrice] = useState('')
  const [customPriceAnalysis, setCustomPriceAnalysis] = useState(null)

  const PAYMENT_METHODS = [
    'Cash',
    'Bank Transfer',
    'Credit Card',
    'Check',
    'Other'
  ]

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

  const addPlantExpense = async (plantId, expenseData) => {
  try {
    const expense = {
      plantId: plantId,
      plantName: expenseData.plantName,
      category: expenseData.category, // e.g., 'Labor', 'Electricity', 'Water', 'Seeds', 'Fertilizer', 'Equipment', 'Other'
      description: expenseData.description,
      amount: parseFloat(expenseData.amount),
      date: expenseData.date || serverTimestamp(),
      paymentMethod: expenseData.paymentMethod || 'Cash', // Cash, Bank Transfer, etc.
      receiptNumber: expenseData.receiptNumber || '',
      vendor: expenseData.vendor || '',
      notes: expenseData.notes || '',
      addedBy: expenseData.addedBy || 'admin',
      createdAt: serverTimestamp(),
      lastModifiedAt: serverTimestamp()
    }

    const docRef = await addDoc(collection(db, 'plantExpenses'), expense)
    
    // Update plant's total expense
    await updatePlantTotalExpense(plantId)
    
    console.log('Expense added successfully:', docRef.id)
    return docRef.id
  } catch (error) {
    console.error('Error adding expense:', error)
    throw error
  }
}

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

  const getPlantExpenses = async (plantId) => {
    try {
      const q = query(
        collection(db, 'plantExpenses'),
        where('plantId', '==', plantId),
        orderBy('date', 'desc')
      )
      
      const snapshot = await getDocs(q)
      const expenses = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate ? doc.data().date.toDate() : new Date()
      }))
      
      return expenses
    } catch (error) {
      console.error('Error fetching plant expenses:', error)
      throw error
    }
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

  const getExpensesByCategory = async (plantId, category) => {
    try {
      const q = query(
        collection(db, 'plantExpenses'),
        where('plantId', '==', plantId),
        where('category', '==', category),
        orderBy('date', 'desc')
      )
      
      const snapshot = await getDocs(q)
      const expenses = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate ? doc.data().date.toDate() : new Date()
      }))
      
      return expenses
    } catch (error) {
      console.error('Error fetching expenses by category:', error)
      throw error
    }
  }

  const updatePlantExpense = async (expenseId, updates) => {
    try {
      const expenseRef = doc(db, 'plantExpenses', expenseId)
      
      await updateDoc(expenseRef, {
        ...updates,
        lastModifiedAt: serverTimestamp()
      })
      
      // Get the expense to find plantId
      const expenseDoc = await getDocs(query(
        collection(db, 'plantExpenses'),
        where('__name__', '==', expenseId)
      ))
      
      if (!expenseDoc.empty) {
        const plantId = expenseDoc.docs[0].data().plantId
        await updatePlantTotalExpense(plantId)
      }
      
      console.log('Expense updated successfully')
    } catch (error) {
      console.error('Error updating expense:', error)
      throw error
    }
  }

const deletePlantExpense = async (expenseId, plantId) => {
    try {
      await deleteDoc(doc(db, 'plantExpenses', expenseId))
      
      // Update plant's total expense
      await updatePlantTotalExpense(plantId)
      
      console.log('Expense deleted successfully')
    } catch (error) {
      console.error('Error deleting expense:', error)
      throw error
    }
  }


  const updatePlantTotalExpense = async (plantId) => {
    try {
      const expenses = await getPlantExpenses(plantId)
      
      const totalExpense = expenses.reduce((sum, expense) => sum + expense.amount, 0)
      
      // Calculate breakdown by category
      const breakdown = expenses.reduce((acc, expense) => {
        const category = expense.category.toLowerCase()
        acc[category] = (acc[category] || 0) + expense.amount
        return acc
      }, {})
      
      // Update plant document
      const plantRef = doc(db, 'plants', plantId)
      await updateDoc(plantRef, {
        totalExpenses: totalExpense,
        expenseBreakdown: breakdown,
        lastExpenseUpdate: serverTimestamp()
      })
      
      console.log('Plant total expenses updated:', totalExpense)
    } catch (error) {
      console.error('Error updating plant total expenses:', error)
      throw error
    }
  }


  const getExpenseSummary = async (plantId) => {
    try {
      const expenses = await getPlantExpenses(plantId)
      
      const summary = {
        totalExpenses: 0,
        expenseCount: expenses.length,
        byCategory: {},
        recentExpenses: expenses.slice(0, 5)
      }
      
      expenses.forEach(expense => {
        summary.totalExpenses += expense.amount
        
        const category = expense.category
        if (!summary.byCategory[category]) {
          summary.byCategory[category] = {
            total: 0,
            count: 0,
            percentage: 0
          }
        }
        
        summary.byCategory[category].total += expense.amount
        summary.byCategory[category].count += 1
      })
      
      // Calculate percentages
      Object.keys(summary.byCategory).forEach(category => {
        summary.byCategory[category].percentage = 
          (summary.byCategory[category].total / summary.totalExpenses) * 100
      })
      
      return summary
    } catch (error) {
      console.error('Error getting expense summary:', error)
      throw error
    }
  }

  // Open expense tracker
  const handleOpenExpenseTracker = async (plant) => {
    setSelectedPlant(plant)
    setLoadingExpenses(true)
    setShowExpenseTracker(true)
    
    try {
      const expenses = await getPlantExpenses(plant.id)
      const summary = await getExpenseSummary(plant.id)
      setPlantExpenses(expenses)
      setExpenseSummary(summary)
    } catch (error) {
      console.error('Error loading expenses:', error)
    } finally {
      setLoadingExpenses(false)
    }
  }

  // Handle expense form input change
  const handleExpenseInputChange = (e) => {
    const { name, value } = e.target
    setExpenseFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  // Handle add expense submit
  const handleAddExpenseSubmit = async (e) => {
    e.preventDefault()
    try {
      await addPlantExpense(selectedPlant.id, {
        ...expenseFormData,
        plantName: selectedPlant.name,
        addedBy: userType
      })
      
      alert('✅ Expense added successfully!')
      setShowAddExpenseModal(false)
      resetExpenseForm()
      
      // Refresh expense data
      const expenses = await getPlantExpenses(selectedPlant.id)
      const summary = await getExpenseSummary(selectedPlant.id)
      setPlantExpenses(expenses)
      setExpenseSummary(summary)
      fetchPlants() // Refresh plants table
    } catch (error) {
      alert('Error adding expense')
      console.error(error)
    }
  }

  // Handle edit expense
  const handleEditExpense = (expense) => {
    setEditingExpense(expense)
    setExpenseFormData({
      category: expense.category,
      description: expense.description,
      amount: expense.amount,
      date: expense.date.toISOString().split('T')[0],
      paymentMethod: expense.paymentMethod,
      receiptNumber: expense.receiptNumber,
      vendor: expense.vendor,
      notes: expense.notes
    })
    setShowEditExpenseModal(true)
  }

  // Handle edit expense submit
  const handleEditExpenseSubmit = async (e) => {
    e.preventDefault()
    try {
      await updatePlantExpense(editingExpense.id, expenseFormData)
      
      alert('✅ Expense updated successfully!')
      setShowEditExpenseModal(false)
      setEditingExpense(null)
      resetExpenseForm()
      
      // Refresh expense data
      const expenses = await getPlantExpenses(selectedPlant.id)
      const summary = await getExpenseSummary(selectedPlant.id)
      setPlantExpenses(expenses)
      setExpenseSummary(summary)
      fetchPlants()
    } catch (error) {
      alert('Error updating expense')
      console.error(error)
    }
  }

  // Handle delete expense
  const handleDeleteExpense = async (expenseId) => {
    if (window.confirm('Are you sure you want to delete this expense?')) {
      try {
        await deletePlantExpense(expenseId, selectedPlant.id)
        alert('✅ Expense deleted successfully!')
        
        // Refresh expense data
        const expenses = await getPlantExpenses(selectedPlant.id)
        const summary = await getExpenseSummary(selectedPlant.id)
        setPlantExpenses(expenses)
        setExpenseSummary(summary)
        fetchPlants()
      } catch (error) {
        alert('Error deleting expense')
        console.error(error)
      }
    }
  }

  // Reset expense form
  const resetExpenseForm = () => {
    setExpenseFormData({
      category: 'Labor',
      description: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      paymentMethod: 'Cash',
      receiptNumber: '',
      vendor: '',
      notes: ''
    })
  }


  const bulkAddExpenses = async (plantId, expensesArray) => {
    try {
      const promises = expensesArray.map(expense => 
        addPlantExpense(plantId, expense)
      )
      
      await Promise.all(promises)
      console.log('Bulk expenses added successfully')
    } catch (error) {
      console.error('Error bulk adding expenses:', error)
      throw error
    }
  }

  const calculateRecommendedPrice = (totalCost, profitMarginPercent) => {
    const profitAmount = (totalCost * profitMarginPercent) / 100
    const sellingPrice = totalCost + profitAmount
    
    return {
      totalCost: totalCost,
      profitMarginPercent: profitMarginPercent,
      profitAmount: profitAmount,
      recommendedPrice: sellingPrice,
      costPercentage: (totalCost / sellingPrice) * 100,
      profitPercentage: (profitAmount / sellingPrice) * 100
    }
  }

  const getCompetitivePricingSuggestions = (totalCost) => {
    return {
      competitive: {
        name: 'Competitive',
        margin: 20,
        ...calculateRecommendedPrice(totalCost, 20),
        description: 'Lower margin for market penetration'
      },
      standard: {
        name: 'Standard',
        margin: 30,
        ...calculateRecommendedPrice(totalCost, 30),
        description: 'Balanced pricing for normal sales'
      },
      premium: {
        name: 'Premium',
        margin: 50,
        ...calculateRecommendedPrice(totalCost, 50),
        description: 'Higher margin for quality positioning'
      }
    }
  }


  const savePlantPricing = async (plantId, pricingData) => {
    try {
      const plantRef = doc(db, 'plants', plantId)
      await updateDoc(plantRef, {
        recommendedPrice: pricingData.recommendedPrice,
        profitMargin: pricingData.profitMarginPercent,
        sellingPrice: pricingData.sellingPrice || pricingData.recommendedPrice,
        profitAmount: pricingData.profitAmount,
        lastPricingUpdate: serverTimestamp(),
        pricingUpdatedBy: pricingData.updatedBy || 'admin'
      })
      
      console.log('Pricing saved successfully')
    } catch (error) {
      console.error('Error saving pricing:', error)
      throw error
    }
  }


  const calculateBreakEven = (totalCost, sellingPrice, fixedCosts = 0) => {
    const profitPerUnit = sellingPrice - totalCost
    const breakEvenUnits = fixedCosts > 0 ? Math.ceil(fixedCosts / profitPerUnit) : 0
    
    return {
      profitPerUnit: profitPerUnit,
      breakEvenUnits: breakEvenUnits,
      breakEvenRevenue: breakEvenUnits * sellingPrice,
      isViable: profitPerUnit > 0
    }
  }

  const BreakEvenAnalysis = ({ totalCost, sellingPrice, fixedCosts = 0 }) => {
    const profitPerUnit = sellingPrice - totalCost
    const breakEvenUnits = fixedCosts > 0 ? Math.ceil(fixedCosts / profitPerUnit) : 0
    const breakEvenRevenue = breakEvenUnits * sellingPrice
    const isViable = profitPerUnit > 0

    return (
      <div style={{ padding: '20px', background: '#f9fafb', borderRadius: '8px', marginTop: '20px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '15px', display: 'flex', alignItems: 'center' }}>
          <MdTrendingUp style={{ marginRight: '8px' }} />
          Break-Even Analysis
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
          <div style={{ background: 'white', padding: '15px', borderRadius: '8px' }}>
            <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>Profit per Unit</p>
            <p style={{ fontSize: '24px', fontWeight: 'bold', color: isViable ? '#059669' : '#dc2626' }}>
              ₱{profitPerUnit.toFixed(2)}
            </p>
          </div>
          
          {fixedCosts > 0 && (
            <>
              <div style={{ background: 'white', padding: '15px', borderRadius: '8px' }}>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>Break-Even Units</p>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#111' }}>
                  {breakEvenUnits}
                </p>
              </div>
              
              <div style={{ background: 'white', padding: '15px', borderRadius: '8px' }}>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>Break-Even Revenue</p>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#111' }}>
                  ₱{breakEvenRevenue.toLocaleString()}
                </p>
              </div>
            </>
          )}
        </div>
        
        {!isViable && (
          <div style={{ marginTop: '15px', padding: '10px', background: '#fee2e2', borderRadius: '8px', color: '#dc2626' }}>
            ⚠️ Warning: Current pricing results in a loss. Consider increasing the selling price.
          </div>
        )}
      </div>
    )
  }

  const calculateProfitMargin = (totalCost, sellingPrice) => {
    const profitAmount = sellingPrice - totalCost
    const profitMarginPercent = ((profitAmount / totalCost) * 100)
    const profitPercentage = ((profitAmount / sellingPrice) * 100)
    
    return {
      profitAmount: profitAmount,
      profitMarginPercent: profitMarginPercent,
      profitPercentage: profitPercentage,
      costPercentage: (totalCost / sellingPrice) * 100,
      isProfit: profitAmount > 0
    }
  }

  const exportExpensesToCSV = async (plantId) => {
    try {
      const expenses = await getPlantExpenses(plantId)
      
      const headers = ['Date', 'Category', 'Description', 'Amount', 'Vendor', 'Payment Method', 'Receipt Number', 'Notes']
      const rows = expenses.map(expense => [
        expense.date.toLocaleDateString(),
        expense.category,
        expense.description,
        expense.amount,
        expense.vendor,
        expense.paymentMethod,
        expense.receiptNumber,
        expense.notes
      ])
      
      const csv = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n')
      
      return csv
    } catch (error) {
      console.error('Error exporting expenses to CSV:', error)
      throw error
    }
  }

  const ExportCSVButton = ({ plantId, plantName, exportExpensesToCSV }) => {
    const handleExport = async () => {
      try {
        const csv = await exportExpensesToCSV(plantId)
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${plantName}_expenses_${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
        alert('✅ Expenses exported successfully!')
      } catch (error) {
        alert('Error exporting expenses')
        console.error(error)
      }
    }

    return (
      <button 
        onClick={handleExport}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 20px',
          background: '#059669',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: '500',
          fontSize: '14px'
        }}
      >
        <MdFileDownload size={20} />
        Export to CSV
      </button>
    )
  }

  const PricingButton = ({ plant, onClick }) => (
    <button 
      className="action-btn pricing-btn"
      onClick={onClick}
      title="Calculate Pricing"
      style={{
        background: '#8b5cf6',
        color: 'white',
        padding: '8px 12px',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        fontSize: '14px',
        fontWeight: '500'
      }}
    >
      <MdAttachMoney />
      Pricing
    </button>
  )
  


  const getExpensesByDateRange = async (plantId, startDate, endDate) => {
    try {
      const allExpenses = await getPlantExpenses(plantId)
      
      const filtered = allExpenses.filter(expense => {
        const expenseDate = expense.date
        return expenseDate >= startDate && expenseDate <= endDate
      })
      
      return filtered
    } catch (error) {
      console.error('Error fetching expenses by date range:', error)
      throw error
    }
  }
const PricingCalculatorModal = ({ 
  showPricingModal, 
  setShowPricingModal, 
  selectedPlant,
  profitMargin,
  setProfitMargin,
  pricingResults,
  setPricingResults,
  pricingTiers,
  setPricingTiers,
  selectedTier,
  setSelectedTier,
  customPrice,
  setCustomPrice,
  customPriceAnalysis,
  setCustomPriceAnalysis,
  calculateRecommendedPrice,
  getCompetitivePricingSuggestions,
  calculateProfitMargin,
  savePlantPricing,
  userType
}) => {
  if (!showPricingModal || !selectedPlant) return null

  const totalCost = selectedPlant.totalProductionCost || 0

  const handleCalculatePrice = () => {
    const pricing = calculateRecommendedPrice(totalCost, profitMargin)
    const tiers = getCompetitivePricingSuggestions(totalCost)
    setPricingResults(pricing)
    setPricingTiers(tiers)
  }

  const handleTierSelect = (tierName) => {
    setSelectedTier(tierName)
    setProfitMargin(pricingTiers[tierName].margin)
    setPricingResults(pricingTiers[tierName])
  }

  const handleCustomPriceAnalysis = () => {
    const price = parseFloat(customPrice)
    if (price > 0) {
      const analysis = calculateProfitMargin(totalCost, price)
      setCustomPriceAnalysis(analysis)
    }
  }

  const handleSavePricing = async () => {
    if (pricingResults) {
      try {
        await savePlantPricing(selectedPlant.id, {
          ...pricingResults,
          sellingPrice: customPrice || pricingResults.recommendedPrice,
          updatedBy: userType
        })
        alert('✅ Pricing saved successfully!')
        setShowPricingModal(false)
      } catch (error) {
        alert('Error saving pricing')
        console.error(error)
      }
    }
  }

  return (
    <div className="production-modal-overlay" onClick={() => setShowPricingModal(false)}>
      <div className="production-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px' }}>
        <div className="production-modal-header">
          <h2 className="production-modal-title">
            <MdCalculate style={{ marginRight: '10px', verticalAlign: 'middle' }} />
            Pricing Calculator - {selectedPlant.name}
          </h2>
          <button className="production-modal-close" onClick={() => setShowPricingModal(false)}>
            <MdClose />
          </button>
        </div>

        <div className="production-modal-body">
          {/* Cost Info */}
          <div style={{ background: '#f3f4f6', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '5px' }}>Total Production Cost</p>
                <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#111' }}>₱{totalCost.toLocaleString()}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '14px', color: '#6b7280' }}>Cost per Unit</p>
                <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#111' }}>
                  ₱{(selectedPlant.costPerUnit || 0).toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Profit Margin Input */}
          <div style={{ marginBottom: '30px' }}>
            <label style={{ display: 'block', marginBottom: '10px', fontWeight: '500' }}>
              Target Profit Margin (%)
            </label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input 
                type="number"
                value={profitMargin}
                onChange={(e) => setProfitMargin(parseFloat(e.target.value) || 0)}
                style={{ flex: 1, padding: '10px', fontSize: '16px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                min="0"
                max="200"
              />
              <button 
                onClick={handleCalculatePrice}
                style={{
                  padding: '10px 30px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '16px'
                }}
              >
                Calculate
              </button>
            </div>
          </div>

          {/* Pricing Results */}
          {pricingResults && (
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ marginBottom: '15px', fontSize: '18px', fontWeight: '600' }}>Pricing Results</h3>
              <div style={{ background: '#dbeafe', padding: '20px', borderRadius: '8px', border: '2px solid #3b82f6' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div>
                    <p style={{ fontSize: '14px', color: '#1e40af', marginBottom: '5px' }}>Recommended Selling Price</p>
                    <p style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e40af' }}>
                      ₱{pricingResults.recommendedPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: '14px', color: '#1e40af', marginBottom: '5px' }}>Profit Amount</p>
                    <p style={{ fontSize: '28px', fontWeight: 'bold', color: '#059669' }}>
                      ₱{pricingResults.profitAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: '14px', color: '#1e40af' }}>Cost Percentage</p>
                    <p style={{ fontSize: '18px', fontWeight: '600', color: '#1e40af' }}>
                      {pricingResults.costPercentage.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: '14px', color: '#1e40af' }}>Profit Percentage</p>
                    <p style={{ fontSize: '18px', fontWeight: '600', color: '#059669' }}>
                      {pricingResults.profitPercentage.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>

              {/* ADD BREAK-EVEN ANALYSIS HERE: */}
              <BreakEvenAnalysis 
                totalCost={totalCost}
                sellingPrice={customPrice ? parseFloat(customPrice) : pricingResults.recommendedPrice}
                fixedCosts={0}
              />
            </div>
          )}

          {/* Pricing Tiers */}
          {pricingTiers && (
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ marginBottom: '15px', fontSize: '18px', fontWeight: '600' }}>Pricing Strategies</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                {Object.entries(pricingTiers).map(([key, tier]) => (
                  <div 
                    key={key}
                    onClick={() => handleTierSelect(key)}
                    style={{
                      padding: '20px',
                      border: selectedTier === key ? '2px solid #3b82f6' : '1px solid #d1d5db',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: selectedTier === key ? '#eff6ff' : 'white',
                      transition: 'all 0.2s'
                    }}
                  >
                    <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px' }}>{tier.name}</p>
                    <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px' }}>{tier.description}</p>
                    <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#111', marginBottom: '5px' }}>
                      ₱{tier.recommendedPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p style={{ fontSize: '14px', color: '#059669' }}>+{tier.margin}% profit</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom Price Analysis */}
          <div>
            <h3 style={{ marginBottom: '15px', fontSize: '18px', fontWeight: '600' }}>Custom Price Analysis</h3>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <input 
                type="number"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                placeholder="Enter your selling price"
                style={{ flex: 1, padding: '10px', fontSize: '16px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                step="0.01"
              />
              <button 
                onClick={handleCustomPriceAnalysis}
                style={{
                  padding: '10px 30px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Analyze
              </button>
            </div>

            {customPriceAnalysis && (
              <>
                <div style={{ 
                  padding: '20px', 
                  borderRadius: '8px', 
                  background: customPriceAnalysis.isProfit ? '#d1fae5' : '#fee2e2',
                  border: customPriceAnalysis.isProfit ? '1px solid #10b981' : '1px solid #ef4444'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                    <div>
                      <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>Profit/Loss</p>
                      <p style={{ fontSize: '20px', fontWeight: 'bold', color: customPriceAnalysis.isProfit ? '#059669' : '#dc2626' }}>
                        {customPriceAnalysis.isProfit ? '+' : ''}₱{customPriceAnalysis.profitAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>Profit Margin</p>
                      <p style={{ fontSize: '20px', fontWeight: 'bold' }}>
                        {customPriceAnalysis.profitMarginPercent.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>Profit %</p>
                      <p style={{ fontSize: '20px', fontWeight: 'bold' }}>
                        {customPriceAnalysis.profitPercentage.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* ADD BREAK-EVEN ANALYSIS FOR CUSTOM PRICE: */}
                <BreakEvenAnalysis 
                  totalCost={totalCost}
                  sellingPrice={parseFloat(customPrice)}
                  fixedCosts={0}
                />
              </>
            )}
          </div>
        </div>

        <div className="production-modal-footer">
          <button 
            className="production-modal-btn cancel-btn"
            onClick={() => setShowPricingModal(false)}
          >
            Cancel
          </button>
          <button 
            className="production-modal-btn save-btn"
            onClick={handleSavePricing}
            disabled={!pricingResults}
          >
            Save Pricing
          </button>
        </div>
      </div>
    </div>
  )
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
                                <button 
                                  className="action-btn expense-btn"
                                  onClick={() => handleOpenExpenseTracker(plant)}
                                  title="Track Expenses"
                                >
                                  <MdReceipt />
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

        {/* Expense Tracker Modal */}
        {showExpenseTracker && selectedPlant && (
          <div className="production-modal-overlay" onClick={() => setShowExpenseTracker(false)}>
            <div className="production-modal expense-modal" onClick={(e) => e.stopPropagation()}>
              <div className="production-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 className="production-modal-title" style={{ margin: 0 }}>
                  <MdReceipt style={{ marginRight: '10px', verticalAlign: 'middle' }} />
                  Expense Tracker - {selectedPlant.name}
                </h2>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <ExportCSVButton 
                    plantId={selectedPlant.id}
                    plantName={selectedPlant.name}
                    exportExpensesToCSV={exportExpensesToCSV}
                  />
                  <button 
                    className="production-modal-close" 
                    onClick={() => setShowExpenseTracker(false)}
                    style={{ 
                      background: 'none',
                      border: 'none',
                      fontSize: '24px',
                      cursor: 'pointer',
                      color: '#666'
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="production-modal-body">
                {/* Summary Cards */}
                {expenseSummary && (
                  <div className="expense-summary-cards">
                    <div className="expense-summary-card total">
                      <div className="card-icon">
                        <MdAttachMoney />
                      </div>
                      <div className="card-content">
                        <p className="card-label">Total Expenses</p>
                        <p className="card-value">₱{expenseSummary.totalExpenses.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="expense-summary-card count">
                      <div className="card-icon">
                        <MdReceipt />
                      </div>
                      <div className="card-content">
                        <p className="card-label">Total Entries</p>
                        <p className="card-value">{expenseSummary.expenseCount}</p>
                      </div>
                    </div>

                    {Object.entries(expenseSummary.byCategory).map(([category, data]) => (
                      <div key={category} className="expense-summary-card category">
                        <div className="card-icon">
                          {category === 'Labor' && <MdPeople />}
                          {category === 'Seeds' && <FaSeedling />}
                          {category === 'Fertilizer' && <MdAgriculture />}
                        </div>
                        <div className="card-content">
                          <p className="card-label">{category}</p>
                          <p className="card-value">₱{data.total.toLocaleString()}</p>
                          <p className="card-percentage">{data.percentage.toFixed(1)}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Expense Button */}
                <div className="expense-actions">
                  <button 
                    className="btn-add-expense"
                    onClick={() => setShowAddExpenseModal(true)}
                  >
                    <MdAdd /> Add Expense
                  </button>
                </div>

                {/* Expenses Table */}
                <div className="expense-table-container">
                  <table className="expense-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Description</th>
                        <th>Vendor</th>
                        <th>Amount</th>
                        <th>Payment</th>
                        <th>Receipt #</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingExpenses ? (
                        <tr>
                          <td colSpan="8" style={{ textAlign: 'center', padding: '40px' }}>
                            Loading expenses...
                          </td>
                        </tr>
                      ) : plantExpenses.length === 0 ? (
                        <tr>
                          <td colSpan="8" style={{ textAlign: 'center', padding: '40px' }}>
                            No expenses recorded yet
                          </td>
                        </tr>
                      ) : (
                        plantExpenses.map(expense => (
                          <tr key={expense.id}>
                            <td>{expense.date.toLocaleDateString()}</td>
                            <td>
                              <span className="category-badge">
                                {expense.category === 'Labor' && <MdPeople />}
                                {expense.category === 'Seeds' && <FaSeedling />}
                                {expense.category === 'Fertilizer' && <MdAgriculture />}
                                {expense.category}
                              </span>
                            </td>
                            <td>{expense.description}</td>
                            <td>{expense.vendor || '—'}</td>
                            <td className="amount-cell">₱{expense.amount.toLocaleString()}</td>
                            <td>{expense.paymentMethod}</td>
                            <td>{expense.receiptNumber || '—'}</td>
                            <td>
                              <div className="action-buttons">
                                <button 
                                  className="btn-icon edit"
                                  onClick={() => handleEditExpense(expense)}
                                  title="Edit"
                                >
                                  <MdEdit />
                                </button>
                                <button 
                                  className="btn-icon delete"
                                  onClick={() => handleDeleteExpense(expense.id)}
                                  title="Delete"
                                >
                                  <MdDelete />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="production-modal-footer">
                <button 
                  className="production-modal-btn save-btn"
                  onClick={() => setShowExpenseTracker(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Expense Modal */}
        {showAddExpenseModal && (
          <div className="production-modal-overlay" onClick={() => setShowAddExpenseModal(false)}>
            <div className="production-modal small-modal" onClick={(e) => e.stopPropagation()}>
              <div className="production-modal-header">
                <h3>Add New Expense</h3>
                <button className="production-modal-close" onClick={() => setShowAddExpenseModal(false)}>✕</button>
              </div>
              
              <form onSubmit={handleAddExpenseSubmit} className="expense-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Category *</label>
                    <select 
                      name="category" 
                      value={expenseFormData.category}
                      onChange={handleExpenseInputChange}
                      required
                    >
                      <option value="Labor">Labor</option>
                      <option value="Seeds">Seeds</option>
                      <option value="Fertilizer">Fertilizer</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Date *</label>
                    <input 
                      type="date" 
                      name="date"
                      value={expenseFormData.date}
                      onChange={handleExpenseInputChange}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Description *</label>
                  <input 
                    type="text" 
                    name="description"
                    value={expenseFormData.description}
                    onChange={handleExpenseInputChange}
                    placeholder="e.g., Hired 3 workers for planting"
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Amount (₱) *</label>
                    <input 
                      type="number" 
                      name="amount"
                      value={expenseFormData.amount}
                      onChange={handleExpenseInputChange}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Payment Method</label>
                    <select 
                      name="paymentMethod"
                      value={expenseFormData.paymentMethod}
                      onChange={handleExpenseInputChange}
                    >
                      <option value="Cash">Cash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Credit Card">Credit Card</option>
                      <option value="Check">Check</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Vendor/Supplier</label>
                    <input 
                      type="text" 
                      name="vendor"
                      value={expenseFormData.vendor}
                      onChange={handleExpenseInputChange}
                      placeholder="Optional"
                    />
                  </div>

                  <div className="form-group">
                    <label>Receipt Number</label>
                    <input 
                      type="text" 
                      name="receiptNumber"
                      value={expenseFormData.receiptNumber}
                      onChange={handleExpenseInputChange}
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea 
                    name="notes"
                    value={expenseFormData.notes}
                    onChange={handleExpenseInputChange}
                    rows="3"
                    placeholder="Additional notes (optional)"
                  />
                </div>

                <div className="production-modal-footer">
                  <button 
                    type="button" 
                    className="production-modal-btn cancel-btn"
                    onClick={() => setShowAddExpenseModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="production-modal-btn save-btn">
                    Save Expense
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Expense Modal */}
        {showEditExpenseModal && editingExpense && (
          <div className="production-modal-overlay" onClick={() => setShowEditExpenseModal(false)}>
            <div className="production-modal small-modal" onClick={(e) => e.stopPropagation()}>
              <div className="production-modal-header">
                <h3>Edit Expense</h3>
                <button className="production-modal-close" onClick={() => setShowEditExpenseModal(false)}>✕</button>
              </div>
              
              <form onSubmit={handleEditExpenseSubmit} className="expense-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Category *</label>
                    <select 
                      name="category" 
                      value={expenseFormData.category}
                      onChange={handleExpenseInputChange}
                      required
                    >
                      <option value="Labor">Labor</option>
                      <option value="Seeds">Seeds</option>
                      <option value="Fertilizer">Fertilizer</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Date *</label>
                    <input 
                      type="date" 
                      name="date"
                      value={expenseFormData.date}
                      onChange={handleExpenseInputChange}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Description *</label>
                  <input 
                    type="text" 
                    name="description"
                    value={expenseFormData.description}
                    onChange={handleExpenseInputChange}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Amount (₱) *</label>
                    <input 
                      type="number" 
                      name="amount"
                      value={expenseFormData.amount}
                      onChange={handleExpenseInputChange}
                      step="0.01"
                      min="0"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Payment Method</label>
                    <select 
                      name="paymentMethod"
                      value={expenseFormData.paymentMethod}
                      onChange={handleExpenseInputChange}
                    >
                      <option value="Cash">Cash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Credit Card">Credit Card</option>
                      <option value="Check">Check</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Vendor/Supplier</label>
                    <input 
                      type="text" 
                      name="vendor"
                      value={expenseFormData.vendor}
                      onChange={handleExpenseInputChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>Receipt Number</label>
                    <input 
                      type="text" 
                      name="receiptNumber"
                      value={expenseFormData.receiptNumber}
                      onChange={handleExpenseInputChange}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea 
                    name="notes"
                    value={expenseFormData.notes}
                    onChange={handleExpenseInputChange}
                    rows="3"
                  />
                </div>

                <div className="production-modal-footer">
                  <button 
                    type="button" 
                    className="production-modal-btn cancel-btn"
                    onClick={() => setShowEditExpenseModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="production-modal-btn save-btn">
                    Update Expense
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <PricingCalculatorModal 
          showPricingModal={showPricingModal}
          setShowPricingModal={setShowPricingModal}
          selectedPlant={selectedPlant}
          profitMargin={profitMargin}
          setProfitMargin={setProfitMargin}
          pricingResults={pricingResults}
          setPricingResults={setPricingResults}
          pricingTiers={pricingTiers}
          setPricingTiers={setPricingTiers}
          selectedTier={selectedTier}
          setSelectedTier={setSelectedTier}
          customPrice={customPrice}
          setCustomPrice={setCustomPrice}
          customPriceAnalysis={customPriceAnalysis}
          setCustomPriceAnalysis={setCustomPriceAnalysis}
          calculateRecommendedPrice={calculateRecommendedPrice}
          getCompetitivePricingSuggestions={getCompetitivePricingSuggestions}
          calculateProfitMargin={calculateProfitMargin}
          savePlantPricing={savePlantPricing}
          userType={userType}
        />
      </div>
    </div>
  )
}

export default PlantProduction