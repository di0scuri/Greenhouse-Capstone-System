import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { auth, db } from './firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'

// ============================================
// AUTH & USER PAGES
// ============================================
import User from './admin/user'
import Login from './admin/login'

// ============================================
// ADMIN PAGES
// ============================================
import AdminDashboard from './admin/admindashboard'
import Inventory from './admin/inventory'
import Costing from './admin/costing'
import Planting from './admin/planting'
import Settings from './admin/settings'
import Greenhouse from './admin/greenhousecontrols'
import Sensors from './admin/sensors'
import AdminCalendar from './admin/admincalendar'

// ============================================
// FARMER PAGES
// ============================================
import FarmerDashboard from './farmer/farmerdashboard'
import FarmerPlants from './farmer/farmerplants'
import FarmerInventory from './farmer/farmerinventory'
import FarmerCalendar from './farmer/farmercalendar'

// ============================================
// FINANCE PAGES
// ============================================
import FinanceDashboard from './finance/financedashboard'
import FinanceInventory from './finance/financeinventory'
import FinanceCosting from './finance/financecosting'
import PlantProduction from './admin/production'
import './App.css'
import PlantMasterList from './admin/plantlist'

// ============================================
// PROTECTED ROUTE COMPONENT
// ============================================
const ProtectedRoute = ({ children, allowedRoles, user }) => {
  let currentUser = user;
  
  // Check localStorage if user is not provided
  if (!currentUser) {
    const storedUser = localStorage.getItem('user');
    const isAuthenticated = localStorage.getItem('isAuthenticated');
    
    if (storedUser && isAuthenticated) {
      try {
        currentUser = JSON.parse(storedUser);
      } catch (e) {
        console.error('Error parsing stored user data:', e);
        currentUser = null;
      }
    }
  }

  // Redirect to user selection if not authenticated
  if (!currentUser) {
    return <Navigate to="/user-selection" replace />
  }

  // Check role permissions
  if (allowedRoles) {
    const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const userRole = currentUser.role ? currentUser.role.toLowerCase() : '';
    const hasAccess = rolesArray.some(role => role.toLowerCase() === userRole);
    
    if (!hasAccess) {
      console.log(`Role mismatch: User role "${currentUser.role}" vs Required roles "${rolesArray.join(', ')}"`);
      return <Navigate to="/user-selection" replace />
    }
  }

  return children
}

// ============================================
// MAIN APP COMPONENT
// ============================================
function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in with Firebase
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid))
          if (userDoc.exists()) {
            const userData = { uid: firebaseUser.uid, ...userDoc.data() };
            setUser(userData);
            localStorage.setItem('user', JSON.stringify(userData));
            localStorage.setItem('isAuthenticated', 'true');
            console.log('Firebase user authenticated:', userData);
          } else {
            console.log('No Firestore document for user:', firebaseUser.uid);
            setUser(null);
          }
        } catch (error) {
          console.error('Error fetching user document:', error);
          // Fallback to localStorage
          const storedUser = localStorage.getItem('user');
          const isAuthenticated = localStorage.getItem('isAuthenticated');
          
          if (storedUser && isAuthenticated) {
            try {
              const parsedUser = JSON.parse(storedUser);
              setUser(parsedUser);
              console.log('Using stored user data:', parsedUser);
            } catch (e) {
              console.error('Error parsing stored user:', e);
              setUser(null);
            }
          } else {
            setUser(null);
          }
        }
      } else {
        // No Firebase user, check localStorage
        console.log('No Firebase user, checking localStorage...');
        const storedUser = localStorage.getItem('user');
        const isAuthenticated = localStorage.getItem('isAuthenticated');
        
        if (storedUser && isAuthenticated) {
          try {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
            console.log('Using localStorage user:', parsedUser);
          } catch (e) {
            console.error('Error parsing stored user:', e);
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  // Loading screen
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#666'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <Router>
      <div className="App">
        <Routes>
          {/* ============================================ */}
          {/* ROOT & AUTH ROUTES */}
          {/* ============================================ */}
          <Route path="/" element={<Navigate to="/user-selection" replace />} />
          <Route path="/user-selection" element={<User />} />
          
          <Route path="/login/admin" element={<Login userType="admin" />} />
          <Route path="/login/farmer" element={<Login userType="farmer" />} />
          <Route path="/login/finance" element={<Login userType="finance" />} />

          {/* ============================================ */}
          {/* DASHBOARD ROUTES (ROLE-BASED) */}
          {/* ============================================ */}
          <Route 
            path="/dashboard/admin" 
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <AdminDashboard userType="admin" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/dashboard/farmer" 
            element={
              <ProtectedRoute user={user} allowedRoles="Farmer">
                <FarmerDashboard userType="farmer" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/dashboard/finance" 
            element={
              <ProtectedRoute user={user} allowedRoles="Finance">
                <FinanceDashboard userType="finance" user={user} />
              </ProtectedRoute>
            } 
          />

          {/* ============================================ */}
          {/* ADMIN ROUTES */}
          {/* ============================================ */}
          <Route 
            path="/overview/admin" 
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <AdminDashboard userType="admin" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admindashboard" 
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <AdminDashboard userType="admin" user={user} />
              </ProtectedRoute>
            } 
          />
          
          {/* Inventory */}
          <Route 
            path="/inventory/admin" 
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Inventory userType="admin" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/inventory" 
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Inventory userType="admin" user={user} />
              </ProtectedRoute>
            } 
          />
          
          {/* Costing */}
          <Route 
            path="/costing/admin" 
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Costing userType="admin" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/costing" 
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Costing userType="admin" user={user} />
              </ProtectedRoute>
            } 
          />
          
          {/* Planting */}
          <Route 
            path="/planting/admin" 
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Planting userType="admin" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/planting" 
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Planting userType="admin" user={user} />
              </ProtectedRoute>
            } 
          />
          
          {/* Settings */}
          <Route 
            path="/settings/admin" 
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Settings userType="admin" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/settings" 
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Settings userType="admin" user={user} />
              </ProtectedRoute>
            } 
          />

          <Route path='/admincalendar' element={
            <ProtectedRoute user={user} allowedRoles="Admin">
              <AdminCalendar userType="admin" userId={user?.uid} />
            </ProtectedRoute>
          } />

          <Route path='/admincalendar/admin' element={
            <ProtectedRoute user={user} allowedRoles="Admin">
              <AdminCalendar userType="admin" userId={user?.uid} />
            </ProtectedRoute>
          } />

          <Route path='/farmercalendar' element={
            <ProtectedRoute user={user} allowedRoles="Farmer">
              <FarmerCalendar userType="farmer" userId={user?.uid} />
            </ProtectedRoute>
          } />


          
          {/* Greenhouse - ADMIN ONLY */}
          <Route 
            path="/greenhousecontrols/admin" 
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Greenhouse userType="admin" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/greenhousecontrols" 
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Greenhouse userType="admin" user={user} />
              </ProtectedRoute>
            } 
          />
          
          {/* Plant List */}
          <Route 
            path='/plantList/admin' 
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <PlantMasterList userType="admin" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path='/plantList' 
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <PlantMasterList userType="admin" user={user} />
              </ProtectedRoute>
            } 
          />

          {/* ============================================ */}
          {/* PRODUCTION ROUTES (ADMIN & FINANCE) */}
          {/* ============================================ */}
          <Route 
            path="/production/admin" 
            element={
              <ProtectedRoute user={user} allowedRoles={["Admin", "Finance"]}>
                <PlantProduction userType="admin" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/production/finance" 
            element={
              <ProtectedRoute user={user} allowedRoles={["Admin", "Finance"]}>
                <PlantProduction userType="finance" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/production" 
            element={
              <ProtectedRoute user={user} allowedRoles={["Admin", "Finance"]}>
                <PlantProduction 
                  userType={user?.role?.toLowerCase() === 'finance' ? 'finance' : 'admin'} 
                  user={user} 
                />
              </ProtectedRoute>
            } 
          />

          {/* ============================================ */}
          {/* SENSORS ROUTES (ADMIN & FARMER) */}
          {/* ============================================ */}
          <Route 
            path="/sensors/admin" 
            element={
              <ProtectedRoute user={user} allowedRoles={["Admin", "Farmer"]}>
                <Sensors userType="admin" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/sensors/farmer" 
            element={
              <ProtectedRoute user={user} allowedRoles="Farmer">
                <Sensors userType="farmer" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/sensors" 
            element={
              <ProtectedRoute user={user} allowedRoles={["Admin", "Farmer"]}>
                <Sensors 
                  userType={user?.role?.toLowerCase() === 'farmer' ? 'farmer' : 'admin'} 
                  user={user} 
                />
              </ProtectedRoute>
            } 
          />

          {/* ============================================ */}
          {/* CALENDAR ROUTES (ADMIN & FARMER) */}
          {/* ============================================ */}
          <Route 
            path="/calendar/admin" 
            element={
              <ProtectedRoute user={user} allowedRoles={["Admin", "Farmer"]}>
                <AdminCalendar userType="admin" userId={user?.uid} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/calendar/farmer" 
            element={
              <ProtectedRoute user={user} allowedRoles="Farmer">
                <AdminCalendar userType="farmer" userId={user?.uid} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/calendar" 
            element={
              <ProtectedRoute user={user} allowedRoles={["Admin", "Farmer"]}>
                <AdminCalendar 
                  userType={user?.role?.toLowerCase() === 'farmer' ? 'farmer' : 'admin'} 
                  userId={user?.uid}
                />
              </ProtectedRoute>
            } 
          />

          {/* ============================================ */}
          {/* FARMER ROUTES */}
          {/* ============================================ */}
          <Route 
            path="/farmer/overview" 
            element={
              <ProtectedRoute user={user} allowedRoles="Farmer">
                <FarmerDashboard userType="farmer" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/farmer/plants" 
            element={
              <ProtectedRoute user={user} allowedRoles="Farmer">
                <FarmerPlants userType="farmer" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/farmer/calendar" 
            element={
              <ProtectedRoute user={user} allowedRoles="Farmer">
                <FarmerCalendar userType="farmer" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/farmercalendar" 
            element={
              <ProtectedRoute user={user} allowedRoles="Farmer">
                <FarmerCalendar userType="farmer" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/farmer/inventory" 
            element={
              <ProtectedRoute user={user} allowedRoles="Farmer">
                <FarmerInventory userType="farmer" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/farmer/sensors" 
            element={
              <ProtectedRoute user={user} allowedRoles="Farmer">
                <Sensors userType="farmer" user={user} />
              </ProtectedRoute>
            } 
          />

          {/* ============================================ */}
          {/* FINANCE ROUTES */}
          {/* ============================================ */}
          <Route 
            path="/finance/overview" 
            element={
              <ProtectedRoute user={user} allowedRoles="Finance">
                <FinanceDashboard userType="finance" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/finance/inventory" 
            element={
              <ProtectedRoute user={user} allowedRoles="Finance">
                <FinanceInventory userType="finance" user={user} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/finance/production" 
            element={
              <ProtectedRoute user={user} allowedRoles={["Admin", "Finance"]}>
                <PlantProduction userType="finance" user={user} />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/finance/costing-pricing" 
            element={
              <ProtectedRoute user={user} allowedRoles="Finance">
                <FinanceCosting userType="finance" user={user} />
              </ProtectedRoute>
            } 
          />

          {/* ============================================ */}
          {/* CATCH-ALL ROUTE */}
          {/* ============================================ */}
          <Route path="*" element={<Navigate to="/user-selection" replace />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App