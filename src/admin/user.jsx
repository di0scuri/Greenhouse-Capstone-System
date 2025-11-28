import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './user.css'

const User = () => {
  const [selectedUser, setSelectedUser] = useState('')
  const navigate = useNavigate()

  const handleUserSelect = (userType) => {
    setSelectedUser(userType)
    console.log(`Selected user type: ${userType}`)
    
    // Add a small delay for visual feedback, then navigate
    setTimeout(() => {
      navigate(`/login/${userType}`)
    }, 300)
  }

  const userTypes = [
    { 
      id: 'admin', 
      label: 'ADMIN', 
      color: '#4CAF50',
      description: 'System Administrator Access' 
    },
    { 
      id: 'farmer', 
      label: 'FARMER', 
      color: '#4CAF50',
      description: 'Farm Management Portal' 
    },
    { 
      id: 'finance', 
      label: 'FINANCE', 
      color: '#4CAF50',
      description: 'Financial Operations Dashboard' 
    }
  ]

  return (
    <div className="user-selection-page">
      <div className="user-content">
        {/* Logo Section */}
        <div className="logo-section">
          <div className="logo-circle">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path 
                d="M16 4C16 4 10 8 10 14C10 18.4183 13.5817 22 18 22C22.4183 22 26 18.4183 26 14C26 8 20 4 20 4C20 4 18.5 6 16 4Z" 
                fill="currentColor"
              />
              <path 
                d="M14 24C14 24 12 26 16 28C20 26 18 24 18 24" 
                fill="currentColor"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1 className="app-title">AGRITRACK</h1>
        
        {/* Subtitle */}
        <p className="app-subtitle">Select your user type to continue</p>

        {/* User Type Buttons */}
        <div className="user-buttons-container">
          {userTypes.map((user) => (
            <button
              key={user.id}
              className={`user-button ${selectedUser === user.id ? 'selected' : ''}`}
              onClick={() => handleUserSelect(user.id)}
              style={{
                '--button-color': user.color
              }}
            >
              <span className="button-label">{user.label}</span>
              <span className="button-description">{user.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default User