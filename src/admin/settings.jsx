import React, { useState, useEffect } from 'react'
import Sidebar from './sidebar'
import './settings.css'
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { initializeApp } from 'firebase/app'
import { 
  MdSearch,
  MdNotifications,
  MdSettings,
  MdFilterList,
  MdAdd,
  MdDelete,
  MdClose,
  MdPeople,
  MdExpandMore,
  MdKeyboardArrowDown,
  MdMoreVert
} from 'react-icons/md'

const Settings = ({ userType = 'admin' }) => {
  const [activeMenu, setActiveMenu] = useState('Settings')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUsers, setSelectedUsers] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [popup, setPopup] = useState({ show: false, message: '', type: 'success' })
  const [error, setError] = useState('')
  const [addUserData, setAddUserData] = useState({
    displayName: '',
    email: '',
    mobile: '',
    password: '',
    confirmPassword: '',
    role: 'Farmer'
  })
  const [addUserLoading, setAddUserLoading] = useState(false)
  const [activeFilter, setActiveFilter] = useState('All')
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)

  // Filter options
  const filterOptions = ['All', 'Admin', 'Farmer', 'Finance']

  // Fetch users from Firebase
  const fetchUsers = async () => {
    setLoading(true)
    try {
      const querySnapshot = await getDocs(collection(db, 'users'))
      const usersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(),
        lastLogin: doc.data().lastLogin?.toDate ? doc.data().lastLogin.toDate() : null,
        lastLogout: doc.data().lastLogout?.toDate ? doc.data().lastLogout.toDate() : null
      }))
      
      setUsers(usersData)
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  // Filter users based on active filter and search term
  const filteredUsers = users.filter(user => {
    const matchesSearch = user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesFilter = activeFilter === 'All' || user.role === activeFilter
    
    return matchesSearch && matchesFilter
  })

  const showPopup = (message, type = 'success') => {
    setPopup({ show: true, message, type })
  }

  const closePopup = () => {
    setPopup({ show: false, message: '', type: 'success' })
  }

  // Custom Popup Component - Add after imports, before Settings component
const CustomPopup = ({ message, type = 'success', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="custom-popup-overlay">
      <div className={`custom-popup ${type}`}>
        <div className="popup-icon">
          {type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}
        </div>
        <p className="popup-message">{message}</p>
        <button className="popup-close" onClick={onClose}>×</button>
      </div>
    </div>
  )
}

  // Calculate user counts for each filter
  const userCounts = {
    All: users.length,
    Admin: users.filter(u => u.role === 'Admin').length,
    Farmer: users.filter(u => u.role === 'Farmer').length,
    Finance: users.filter(u => u.role === 'Finance').length
  }

  // Handle filter change
  const handleFilterChange = (filter) => {
    setActiveFilter(filter)
    setShowFilterDropdown(false)
    setSelectedUsers([])
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedUsers(filteredUsers.map(user => user.id))
    } else {
      setSelectedUsers([])
    }
  }

  const handleSelectUser = (userId) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const handleAddNew = () => {
    setShowAddModal(true)
    setAddUserData({
      displayName: '',
      email: '',
      mobile: '',
      password: '',
      confirmPassword: '',
      role: 'Farmer'
    })
    setError('')
  }

  const handleCloseModal = () => {
    setShowAddModal(false)
    setAddUserData({
      displayName: '',
      email: '',
      mobile: '',
      password: '',
      confirmPassword: '',
      role: 'Farmer'
    })
    setError('')
  }

  const handleInputChange = (field, value) => {
    setAddUserData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Validate mobile number (Philippine format)
  const validateMobile = (mobile) => {
    const cleaned = mobile.replace(/\D/g, '')
    
    if (cleaned.length === 11 && cleaned.startsWith('09')) {
      return true
    }
    if (cleaned.length === 12 && cleaned.startsWith('639')) {
      return true
    }
    return false
  }

  // Format mobile number to 639XXXXXXXXX format
  const formatMobileNumber = (mobile) => {
    const cleaned = mobile.replace(/\D/g, '')
    
    if (cleaned.startsWith('09')) {
      return '63' + cleaned.substring(1)
    }
    
    if (cleaned.startsWith('639')) {
      return cleaned
    }
    
    if (cleaned.startsWith('9') && cleaned.length === 10) {
      return '63' + cleaned
    }
    
    return cleaned
  }

 const handleCreateUser = async () => {
    if (!addUserData.displayName.trim() || !addUserData.email.trim() || !addUserData.mobile.trim() || !addUserData.password.trim() || !addUserData.confirmPassword.trim()) {
      setError('Please fill in all required fields')
      return
    }

    if (!validateMobile(addUserData.mobile)) {
      setError('Please enter a valid Philippine mobile number (e.g., 09171234567 or 639171234567)')
      return
    }

    if (addUserData.password.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }

    if (addUserData.password !== addUserData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    // Confirmation dialog
    const confirmCreate = window.confirm(
      `Are you sure you want to create this user?\n\nName: ${addUserData.displayName}\nEmail: ${addUserData.email}\nRole: ${addUserData.role}`
    )
    
    if (!confirmCreate) return

    setAddUserLoading(true)
    setError('')

    const currentUser = auth.currentUser

    try {
      const firebaseConfig = auth.app.options
      const secondaryApp = initializeApp(firebaseConfig, 'Secondary')
      const secondaryAuth = getAuth(secondaryApp)

      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        addUserData.email,
        addUserData.password
      )
      
      const newUser = userCredential.user
      const formattedMobile = formatMobileNumber(addUserData.mobile)

      const userDocData = {
        displayName: addUserData.displayName,
        email: addUserData.email,
        mobile: formattedMobile,
        role: addUserData.role,
        createdAt: serverTimestamp(),
        lastLogin: null,
        lastLogout: null,
        isActive: true
      }

      await setDoc(doc(db, 'users', newUser.uid), userDocData)
      await signOut(secondaryAuth)
      await secondaryApp.delete()

      const userToAdd = {
        id: newUser.uid,
        ...userDocData,
        createdAt: new Date(),
        lastLogin: null,
        lastLogout: null
      }

      setUsers(prev => [...prev, userToAdd])
      handleCloseModal()

      // Show custom popup instead of alert
      showPopup(`User "${addUserData.displayName}" created successfully!`, 'success')
    } catch (error) {
      console.error('Error creating user:', error)
      
      if (error.code === 'auth/email-already-in-use') {
        setError('Email is already in use')
      } else if (error.code === 'auth/invalid-email') {
        setError('Invalid email address')
      } else if (error.code === 'auth/weak-password') {
        setError('Password is too weak')
      } else {
        setError('Failed to create user. Please try again.')
      }
    } finally {
      setAddUserLoading(false)
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showFilterDropdown && !event.target.closest('.settings-filter')) {
        setShowFilterDropdown(false)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showFilterDropdown])

  const handleDeleteUser = async (userId) => {
    const user = users.find(u => u.id === userId)
    
    const confirmDelete = window.confirm(
      `Are you sure you want to delete this user?\n\nName: ${user?.displayName || 'Unknown'}\nEmail: ${user?.email || 'Unknown'}\n\nThis action cannot be undone.`
    )
    
    if (!confirmDelete) return

    try {
      await deleteDoc(doc(db, 'users', userId))
      setUsers(prev => prev.filter(user => user.id !== userId))
      setSelectedUsers(prev => prev.filter(id => id !== userId))
      showPopup('User deleted successfully', 'success')
    } catch (error) {
      console.error('Error deleting user:', error)
      showPopup('Failed to delete user. Please try again.', 'error')
    }
}

  const handleBulkDelete = async () => {
    if (selectedUsers.length === 0) return
    
    const confirmBulkDelete = window.confirm(
      `Are you sure you want to delete ${selectedUsers.length} user(s)?\n\nThis action cannot be undone.`
    )
    
    if (!confirmBulkDelete) return

    try {
      const deletePromises = selectedUsers.map(userId => 
        deleteDoc(doc(db, 'users', userId))
      )
      
      await Promise.all(deletePromises)
      
      setUsers(prev => prev.filter(user => !selectedUsers.includes(user.id)))
      setSelectedUsers([])
      showPopup(`Successfully deleted ${selectedUsers.length} user(s)`, 'success')
    } catch (error) {
      console.error('Error deleting users:', error)
      showPopup('Failed to delete some users. Please try again.', 'error')
    }
  }

  const handleAction = (userId) => {
    const user = users.find(u => u.id === userId)
    if (user) {
      const action = window.confirm(`Delete user: ${user.displayName}?`)
      if (action) {
        handleDeleteUser(userId)
      }
    }
  }

  const getUserAvatar = (user) => {
    if (user.photoURL) return user.photoURL
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=10b981&color=fff`
  }

  const formatDateTime = (date) => {
    if (!date) return '--'
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  return (
    <div className="dashboard-container">
      <Sidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

      <div className="settings-main">
        <div className="settings-header">
          <h1 className="settings-title">
            <MdPeople style={{ marginRight: '10px', verticalAlign: 'middle' }} />
            User Management
          </h1>
          <div className="settings-header-actions">
            <div className="settings-search-box">
              <input
                type="text"
                placeholder="Search users..."
                className="settings-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="settings-search-icon">
                <MdSearch />
              </span>
            </div>
            <div className="settings-bell">
              <MdNotifications />
            </div>
          </div>
        </div>

        <div className="settings-body">
          <div className="settings-controls">
            <div className="settings-filter" onClick={() => setShowFilterDropdown(!showFilterDropdown)}>
              <MdFilterList style={{ fontSize: '18px' }} />
              <span className="filter-text">{activeFilter} ({userCounts[activeFilter]})</span>
              <span className="filter-arrow">
                <MdKeyboardArrowDown />
              </span>
              
              {showFilterDropdown && (
                <div className="filter-dropdown">
                  {filterOptions.map(option => (
                    <div
                      key={option}
                      className={`filter-option ${activeFilter === option ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleFilterChange(option)
                      }}
                    >
                      <span className="option-text">{option}</span>
                      <span className="option-count">({userCounts[option]})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="settings-actions">
              {selectedUsers.length > 0 && (
                <button className="settings-delete-btn" onClick={handleBulkDelete}>
                  <MdDelete style={{ marginRight: '6px', fontSize: '16px' }} />
                  Delete Selected ({selectedUsers.length})
                </button>
              )}
              
              <button className="settings-add-btn" onClick={handleAddNew}>
                <MdAdd style={{ fontSize: '18px' }} />
                ADD NEW
              </button>
            </div>

            <div className="settings-menu-icon">
              <MdSettings />
            </div>
          </div>

          <div className="settings-table">
            <div className="settings-table-header">
              <div className="header-cell checkbox-cell">
                <input
                  type="checkbox"
                  onChange={handleSelectAll}
                  checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                />
              </div>
              <div className="header-cell image-cell">Avatar</div>
              <div className="header-cell name-cell">
                Name
              </div>
              <div className="header-cell email-cell">Email</div>
              <div className="header-cell date-cell">Date Added</div>
              <div className="header-cell title-cell">
                Role
              </div>
              <div className="header-cell login-cell">Last Login</div>
              <div className="header-cell logout-cell">Last Logout</div>
              <div className="header-cell action-cell">Action</div>
            </div>

            <div className="settings-table-body">
              {loading ? (
                <div className="settings-table-row loading-row">
                  <div className="table-cell" style={{gridColumn: '1 / -1', textAlign: 'center', padding: '40px'}}>
                    Loading users...
                  </div>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="settings-table-row no-data-row">
                  <div className="table-cell" style={{gridColumn: '1 / -1', textAlign: 'center', padding: '40px'}}>
                    {searchTerm ? `No users found matching "${searchTerm}"` : 'No users found'}
                  </div>
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <div key={user.id} className="settings-table-row">
                    <div className="table-cell checkbox-cell">
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={() => handleSelectUser(user.id)}
                      />
                    </div>
                    <div className="table-cell image-cell">
                      <img 
                        src={getUserAvatar(user)} 
                        alt={user.displayName || user.email} 
                        className="user-avatar" 
                      />
                    </div>
                    <div className="table-cell name-cell">
                      {user.displayName || 'Unnamed User'}
                    </div>
                    <div className="table-cell email-cell">
                      {user.email}
                    </div>
                    <div className="table-cell date-cell">
                      {user.createdAt ? user.createdAt.toLocaleDateString() : 'Unknown'}
                    </div>
                    <div className="table-cell title-cell">
                      <span className={`role-badge ${user.role?.toLowerCase() || 'unknown'}`}>
                        {user.role || 'Unknown'}
                      </span>
                    </div>
                    <div className="table-cell login-cell">
                      {formatDateTime(user.lastLogin)}
                    </div>
                    <div className="table-cell logout-cell">
                      {formatDateTime(user.lastLogout)}
                    </div>
                    <div className="table-cell action-cell">
                      <button 
                        className="action-btn"
                        onClick={() => handleAction(user.id)}
                        title="Delete User"
                      >
                        <MdDelete />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>
                <MdPeople style={{ marginRight: '10px', verticalAlign: 'middle' }} />
                Add New User
              </h3>
              <button className="modal-close" onClick={handleCloseModal}>
                <MdClose />
              </button>
            </div>
            
            <div className="modal-body">
              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}
              
              <div className="form-group">
                <label>Display Name *</label>
                <input
                  type="text"
                  value={addUserData.displayName}
                  onChange={(e) => handleInputChange('displayName', e.target.value)}
                  className="form-input"
                  placeholder="Enter user's full name"
                  required
                />
              </div>

              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  value={addUserData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="form-input"
                  placeholder="Enter email address"
                  required
                />
              </div>

              <div className="form-group">
                <label>Mobile Number *</label>
                <input
                  type="tel"
                  value={addUserData.mobile}
                  onChange={(e) => handleInputChange('mobile', e.target.value)}
                  className="form-input"
                  placeholder="09171234567 or 639171234567"
                  required
                />
                <small style={{ color: '#64748b', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                  Enter Philippine mobile number (e.g., 09171234567)
                </small>
              </div>

              <div className="form-group">
                <label>Password *</label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={addUserData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className="form-input"
                    placeholder="Enter password (min. 6 characters)"
                    minLength="6"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Confirm Password *</label>
                <div className="password-input-wrapper">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={addUserData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    className="form-input"
                    placeholder="Confirm password"
                    minLength="6"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                {addUserData.password && addUserData.confirmPassword && addUserData.password !== addUserData.confirmPassword && (
                  <small className="password-mismatch">Passwords do not match</small>
                )}
              </div>

              <div className="form-group">
                <label>Role *</label>
                <select
                  value={addUserData.role}
                  onChange={(e) => handleInputChange('role', e.target.value)}
                  className="form-select"
                  required
                >
                  <option value="Admin">Administrator</option>
                  <option value="Farmer">Farmer</option>
                  <option value="Finance">Finance</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn btn-cancel" 
                onClick={handleCloseModal}
                disabled={addUserLoading}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleCreateUser}
                disabled={addUserLoading}
              >
                {addUserLoading ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {popup.show && (
        <CustomPopup
          message={popup.message}
          type={popup.type}
          onClose={closePopup}
        />
      )}
    </div>
    
  )
}

export default Settings