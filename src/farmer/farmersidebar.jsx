import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '../firebase'
import './farmersidebar.css'
import {
  MdDashboard,
  MdEco,
  MdCalendarToday,
  MdInventory,
  MdLogout,
  MdAgriculture
} from 'react-icons/md'

const FarmerSidebar = ({ activeMenu, setActiveMenu }) => {
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
      // Don't throw error since logout should continue even if timestamp update fails
    }
  }

  const handleLogout = async () => {
    try {
      // Get current user before signing out
      const currentUser = auth.currentUser;
      
      if (currentUser) {
        // Update lastLogout timestamp
        await updateLastLogout(currentUser.uid);
      }

      // Sign out from Firebase Auth
      await signOut(auth);
      
      // Clear localStorage
      localStorage.removeItem('user');
      localStorage.removeItem('userRole');
      
      console.log('User logged out successfully');
      
      // Navigate to user selection
      navigate('/user-selection');
    } catch (error) {
      console.error('Error during logout:', error);
      
      // Even if there's an error, still navigate to user selection
      // Clear localStorage as a fallback
      localStorage.removeItem('user');
      localStorage.removeItem('userRole');
      navigate('/user-selection');
    }
  }

  const handleMenuClick = (menuName) => {
    setActiveMenu && setActiveMenu(menuName)

    // Farmer routes (direct sa tamang components)
    const routes = {
      'Overview': '/farmer/overview',
      'Plants': '/farmer/plants',
      'Calendar': '/farmer/calendar',
      'Inventory': '/farmer/inventory'
    }

    const route = routes[menuName]
    if (route) navigate(route)
  }

  const getCurrentActiveMenu = () => {
    const path = location.pathname
    if (path.startsWith('/farmer/overview') || path.startsWith('/dashboard/farmer')) return 'Overview'
    if (path.startsWith('/farmer/plants')) return 'Plants'
    if (path.startsWith('/farmer/calendar')) return 'Calendar'
    if (path.startsWith('/farmer/inventory')) return 'Inventory'
    return activeMenu || 'Overview'
  }

  const currentActiveMenu = getCurrentActiveMenu()

  const menuItems = [
    { name: 'Overview', icon: <MdDashboard /> },
    { name: 'Plants', icon: <MdEco /> },
    { name: 'Calendar', icon: <MdCalendarToday /> },
    { name: 'Inventory', icon: <MdInventory /> }
  ]

  return (
    <div className="farmer-sidebar">
      {/* Sidebar Header */}
      <div className="farmer-sidebar-header">
        <div className="farmer-logo-section">
          <div className="farmer-logo-icon">
            <MdAgriculture style={{ fontSize: '24px' }} />
          </div>
          <div className="farmer-logo-text">
            <h2>AGRITRACK</h2>
            <p>Farmer</p>
          </div>
        </div>
      </div>

      {/* Nav Menu */}
      <nav className="farmer-sidebar-nav">
        {menuItems.map((item, index) => (
          <button
            key={index}
            className={`farmer-nav-item ${currentActiveMenu === item.name ? 'active' : ''}`}
            onClick={() => handleMenuClick(item.name)}
          >
            <span className="farmer-nav-icon">{item.icon}</span>
            <span className="farmer-nav-text">{item.name}</span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="farmer-sidebar-footer">
        <button className="farmer-logout-btn" onClick={handleLogout}>
          <span className="farmer-nav-icon"><MdLogout /></span>
          <span className="farmer-nav-text">Log out</span>
        </button>
      </div>
    </div>
  )
}

export default FarmerSidebar