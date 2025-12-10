import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './login.css';
import { db, auth } from "../firebase";
import { collection, query, where, getDoc, doc, getDocs, updateDoc, serverTimestamp } from "firebase/firestore";
import { signInWithEmailAndPassword } from "firebase/auth";
import { HiOutlineArrowLeft, HiOutlineOfficeBuilding } from 'react-icons/hi';
import { AiOutlineEye, AiOutlineEyeInvisible } from 'react-icons/ai';

const Login = ({ userType = 'admin' }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (error) setError('');
  };

  const updateLastLogin = async (userId) => {
    try {
      console.log('Updating lastLogin timestamp for user:', userId);
      const userDocRef = doc(db, "users", userId);
      await updateDoc(userDocRef, {
        lastLogin: serverTimestamp()
      });
      console.log('LastLogin timestamp updated successfully');
    } catch (error) {
      console.error('Error updating lastLogin timestamp:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('Attempting login with:', formData.username);
      
      const userCredential = await signInWithEmailAndPassword(
        auth,
        formData.username,
        formData.password
      );
      const user = userCredential.user;
      console.log('Authentication successful for user:', user.uid);

      // Fetch complete user data from Firestore
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      
      let userData = {};
      let role = userType;
      let displayName = user.displayName || 'Unknown User';
      
      if (userDoc.exists()) {
        userData = userDoc.data();
        role = userData.role || userType;
        displayName = userData.displayName || userData.name || user.displayName || user.email.split('@')[0];
        
        // Update last login
        await updateLastLogin(user.uid);
      } else {
        // Try finding by email
        console.log('No user document found, searching by email...');
        const usersRef = collection(db, "users");
        const emailQuery = query(usersRef, where("email", "==", user.email));
        const querySnapshot = await getDocs(emailQuery);
        
        if (!querySnapshot.empty) {
          const foundUserDoc = querySnapshot.docs[0];
          userData = foundUserDoc.data();
          role = userData.role || userType;
          displayName = userData.displayName || userData.name || user.displayName || user.email.split('@')[0];
          
          await updateLastLogin(foundUserDoc.id);
        } else {
          console.log('No Firestore document found, using userType as fallback');
          role = userType;
          try {
            await updateLastLogin(user.uid);
          } catch (updateError) {
            console.warn('Could not update lastLogin for user without Firestore document');
          }
        }
      }

      // Create comprehensive user object
      const fullUserData = {
        uid: user.uid,
        email: user.email,
        displayName: displayName,
        role: role,
        photoURL: user.photoURL || userData.photoURL || null,
        department: userData.department || null,
        position: userData.position || null,
        phoneNumber: userData.phoneNumber || null,
        createdAt: userData.createdAt || null,
        lastLogin: new Date().toISOString()
      };

      // Store in localStorage
      localStorage.setItem('user', JSON.stringify(fullUserData));
      localStorage.setItem('userRole', role.toLowerCase());
      localStorage.setItem('userId', user.uid);
      localStorage.setItem('userName', displayName);
      localStorage.setItem('isAuthenticated', 'true');

      console.log('User data stored:', fullUserData);

      // Navigate based on role
      const normalizedRole = role.toLowerCase();
      if (normalizedRole === 'admin') {
        window.location.href = '/admindashboard';
      } else if (normalizedRole === 'farmer') {
        window.location.href = '/farmer/overview';
      } else if (normalizedRole === 'finance') {
        window.location.href = '/finance/overview';
      } else {
        window.location.href = `/dashboard/${normalizedRole}`;
      }
      
    } catch (authError) {
      console.error('Authentication error:', authError);
      
      if (authError.code === 'auth/user-not-found') {
        setError("No account found with this email address.");
      } else if (authError.code === 'auth/wrong-password') {
        setError("Incorrect password. Please try again.");
      } else if (authError.code === 'auth/invalid-email') {
        setError("Invalid email address format.");
      } else if (authError.code === 'auth/too-many-requests') {
        setError("Too many failed attempts. Please try again later.");
      } else if (authError.code === 'auth/invalid-credential') {
        setError("Invalid credentials. Please check your email and password.");
      } else {
        setError("Login failed. Please check your credentials and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackToUserSelection = () => {
    navigate('/user-selection');
  };

  const togglePassword = () => {
    setShowPassword(!showPassword);
  };

  const getUserConfig = () => {
    const configs = {
      admin: {
        title: 'ADMIN LOGIN',
        subtitle: 'System Administrator Access',
        primaryColor: '#4CAF50',
        secondaryColor: '#388E3C'
      },
      farmer: {
        title: 'FARMER LOGIN',
        subtitle: 'Farm Management Portal',
        primaryColor: '#8BC34A',
        secondaryColor: '#689F38'
      },
      finance: {
        title: 'FINANCE LOGIN',
        subtitle: 'Financial Operations Dashboard',
        primaryColor: '#66BB6A',
        secondaryColor: '#4CAF50'
      }
    };
    return configs[userType] || configs.admin;
  };

  const config = getUserConfig();
  
  return (
    <div className="login-page">
      <div className="background-image"></div>
      <div className="green-overlay"></div>
      
      <div className="login-content">
        <button className="back-button" onClick={handleBackToUserSelection}>
          <HiOutlineArrowLeft size={18} />
          Back to User Selection
        </button>

        <div className="logo-container">
          <div className="logo-circle">
            <HiOutlineOfficeBuilding size={28} />
          </div>
        </div>
        
        <h1 className="site-title">AGRITRACK</h1>
        
        <div className="login-form-container">
          <h2 className="form-title" style={{ color: config.primaryColor }}>
            {config.title}
          </h2>
          <p className="form-subtitle">{config.subtitle}</p>
          
          {error && (
            <div className="error-message" style={{ 
              background: '#ffebee', 
              color: '#c62828', 
              padding: '12px', 
              borderRadius: '6px', 
              marginBottom: '16px',
              border: '1px solid #ffcdd2'
            }}>
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="login-form">
            <div className="input-group">
              <input
                type="email"
                name="username"
                placeholder="Email"
                value={formData.username}
                onChange={handleInputChange}
                className="form-input"
                required
                disabled={loading}
              />
            </div>
            
            <div className="input-group password-group">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Password"
                value={formData.password}
                onChange={handleInputChange}
                className="form-input"
                required
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={togglePassword}
                disabled={loading}
              >
                {showPassword ? (
                  <AiOutlineEyeInvisible size={20} />
                ) : (
                  <AiOutlineEye size={20} />
                )}
              </button>
            </div>
            
            <button 
              type="submit" 
              className="login-button"
              style={{
                background: loading ? '#ccc' : `linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor})`,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
              disabled={loading}
            >
              {loading ? 'Logging in...' : `Login as ${userType.charAt(0).toUpperCase() + userType.slice(1)}`}
            </button>
            
            <button type="button" className="switch-user-button" onClick={handleBackToUserSelection}>
              Switch User Type
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};


export default Login;