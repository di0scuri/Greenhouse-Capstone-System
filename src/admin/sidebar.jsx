import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '../firebase'
import './sidebar.css'

// Import professional business-style icons from react-icons
import { 
  HiOutlineHome,
  HiOutlineClipboardList,
  HiOutlineCurrencyDollar,
  HiOutlineCalendar,
  HiOutlineChartBar,
  HiOutlineLogout,
  HiOutlineCog,
  HiOutlineOfficeBuilding
} from 'react-icons/hi'
import { BsBox } from 'react-icons/bs'
import { AiOutlineDatabase } from 'react-icons/ai'
import { RiPlantLine, RiSeedlingLine } from 'react-icons/ri'
import { GiGreenhouse } from 'react-icons/gi'

const Sidebar = ({ activeMenu, setActiveMenu, userType = 'admin' }) => {
  const navigate = useNavigate()
  const location = useLocation()

  // Function to update lastLogout timestamp
  const updateLastLogout = async (userId) => {
    try {
      console.log('Updating lastLogout timestamp for user:', userId);
      const userDocRef = doc(db, "users", userId);
      await updateDoc(userDocRef, {
        lastLogout: serverTimestamp()
      });
      console.log('LastLogout timestamp updated successfully');
    } catch (error) {
      console.error('Error updating lastLogout timestamp:', error);
    }
  }

  const handleLogout = async () => {
    try {
      const currentUser = auth.currentUser;
      
      if (currentUser) {
        await updateLastLogout(currentUser.uid);
      }

      await signOut(auth);
      
      localStorage.removeItem('user');
      localStorage.removeItem('userRole');
      localStorage.removeItem('isAuthenticated');
      
      console.log('User logged out successfully');
      
      navigate('/user-selection');
    } catch (error) {
      console.error('Error during logout:', error);
      
      localStorage.removeItem('user');
      localStorage.removeItem('userRole');
      localStorage.removeItem('isAuthenticated');
      navigate('/user-selection');
    }
  }

  const handleMenuClick = (menuName) => {
    setActiveMenu && setActiveMenu(menuName)
    
    const normalizedUserType = userType?.toLowerCase()
    
    // Admin routes
    const adminRoutes = {
      'Overview': '/overview/admin',
      'Inventory': '/inventory/admin',
      'Costing & Pricing': '/costing/admin',
      'Planting': '/planting/admin',
      'Calendar': '/calendar/admin',
      'Greenhouse': '/greenhousecontrols/admin',
      'Sensors': '/sensors/admin',
      'Production': '/production/admin',
      'Plant List': '/plantlist',
      'Settings': '/settings/admin',
    }
    
    // Farmer routes
    const farmerRoutes = {
      'Overview': '/farmer/overview',
      'Plants': '/farmer/plants',
      'Inventory': '/farmer/inventory',
      'Calendar': '/farmer/calendar',
      'Sensors': '/farmer/sensors',
    }
    
    // Finance routes
    const financeRoutes = {
      'Overview': '/finance/overview',
      'Inventory': '/finance/inventory',
      'Costing & Pricing': '/finance/costing-pricing',
      'Production': '/finance/production',
    }
    
    let route
    if (normalizedUserType === 'farmer') {
      route = farmerRoutes[menuName]
    } else if (normalizedUserType === 'finance') {
      route = financeRoutes[menuName]
    } else {
      route = adminRoutes[menuName]
    }
    
    if (route) {
      navigate(route)
    }
  }

  // Detect current active menu from URL
  const getCurrentActiveMenu = () => {
    const path = location.pathname
    
    // Admin paths
    if (path.includes('/overview')) return 'Overview'
    if (path.includes('/inventory')) return 'Inventory'
    if (path.includes('/costing')) return 'Costing & Pricing'
    if (path.includes('/planting')) return 'Planting'
    if (path.includes('/calendar')) return 'Calendar'
    if (path.includes('/sensors')) return 'Sensors'
    if (path.includes('/greenhousecontrols')) return 'Greenhouse'
    if (path.includes('/settings')) return 'Settings'
    if (path.includes('/plantlist')) return 'Plant List'
    if (path.includes('/production')) return 'Production'
    
    // Farmer paths
    if (path.includes('/plants')) return 'Plants'
    
    return activeMenu || 'Overview'
  }

  const currentActiveMenu = getCurrentActiveMenu()

  // Menu items based on user type with professional icons
  const getMenuItems = () => {
    const normalizedUserType = userType?.toLowerCase()
    
    if (normalizedUserType === 'farmer') {
      return [
        { name: 'Overview', icon: HiOutlineHome },
        { name: 'Plants', icon: RiPlantLine },
        { name: 'Inventory', icon: BsBox },
        { name: 'Calendar', icon: HiOutlineCalendar },
        { name: 'Sensors', icon: AiOutlineDatabase },
      ]
    } else if (normalizedUserType === 'finance') {
      return [
        { name: 'Overview', icon: HiOutlineHome },
        { name: 'Inventory', icon: BsBox },
        { name: 'Production', icon: HiOutlineChartBar },
        { name: 'Costing & Pricing', icon: HiOutlineCurrencyDollar },
      ]
    } else {
      // Admin menu
      return [
        { name: 'Overview', icon: HiOutlineHome },
        { name: 'Plant Management', icon: RiSeedlingLine },
        { name: 'Calendar', icon: HiOutlineCalendar },
        { name: 'Inventory', icon: BsBox },
        { name: 'Sensors', icon: AiOutlineDatabase },
        { name: 'Production', icon: HiOutlineChartBar },
        { name: 'Greenhouse', icon: GiGreenhouse },
        { name: 'Costing & Pricing', icon: HiOutlineCurrencyDollar },        
        { name: 'Plant List', icon: HiOutlineClipboardList },
        { name: 'User Management', icon: HiOutlineCog },
      ]
    }
  }

  const menuItems = getMenuItems()

  // Get user type display name
  const getUserTypeDisplay = () => {
    const normalizedUserType = userType?.toLowerCase()
    if (normalizedUserType === 'farmer') return 'Farmer'
    if (normalizedUserType === 'finance') return 'Finance'
    return 'Admin'
  }

  return (
    <div className="admin-sidebar">
      <div className="admin-sidebar-header">
        <div className="admin-logo-section">
          <div className="admin-logo-icon">
            <HiOutlineOfficeBuilding size={22} />
          </div>
          <div className="admin-logo-text">
            <h2>AGRITRACK</h2>
            <p>{getUserTypeDisplay()}</p>
          </div>
        </div>
      </div>

      <nav className="admin-sidebar-nav">
        {menuItems.map((item, index) => {
          const IconComponent = item.icon
          return (
            <button
              key={index}
              className={`admin-nav-item ${currentActiveMenu === item.name ? 'active' : ''}`}
              onClick={() => handleMenuClick(item.name)}
            >
              <span className="admin-nav-icon">
                <IconComponent size={20} />
              </span>
              <span className="admin-nav-text">{item.name}</span>
            </button>
          )
        })}
      </nav>

      <div className="admin-sidebar-footer">
        <button className="admin-logout-btn" onClick={handleLogout}>
          <span className="admin-nav-icon">
            <HiOutlineLogout size={20} />
          </span>
          <span className="admin-nav-text">Log out</span>
        </button>
      </div>
    </div>
  )
}

export default Sidebar