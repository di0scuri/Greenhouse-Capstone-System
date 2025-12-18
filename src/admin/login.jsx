import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './login.css';
import { db, auth } from "../firebase"; // Ensure this path is correct
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('1. Attempting Auth for:', formData.username);
      
      // 1. Authenticate with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(
        auth,
        formData.username,
        formData.password
      );
      const user = userCredential.user;
      console.log('2. Auth Successful. UID:', user.uid);

      // 2. Fetch User Data from Firestore (Using UID as Document ID)
      const userDocRef = doc(db, "users", user.uid);
      let userData = {};
      let role = userType; // Default to the prop passed
      let displayName = user.displayName || user.email.split('@')[0];

      try {
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          userData = userDocSnap.data();
          console.log("3. Firestore Data Found:", userData);

          // Use role from DB if it exists, otherwise use the prop
          if (userData.role) {
            role = userData.role;
          }
          
          if (userData.displayName || userData.name) {
            displayName = userData.displayName || userData.name;
          }

          // Update Last Login Timestamp
          // We do this in the background so it doesn't block navigation
          updateDoc(userDocRef, {
            lastLogin: serverTimestamp()
          }).catch(err => console.warn("Failed to update lastLogin:", err));

        } else {
          console.warn("3. User authenticated, but no Firestore document found with ID:", user.uid);
          // If you want to force them to have a profile, you could throw an error here.
          // For now, we allow login but they might see limited data.
        }
      } catch (firestoreError) {
        console.error("Error fetching user profile:", firestoreError);
        // This usually happens if Security Rules block the read
        if (firestoreError.code === 'permission-denied') {
             setError("Access denied. Please check your account permissions.");
             setLoading(false);
             return;
        }
      }

      // 3. Prepare User Object for LocalStorage
      const fullUserData = {
        uid: user.uid,
        email: user.email,
        displayName: displayName,
        role: role, // Keep original casing (e.g., "Farmer") for display
        mobile: userData.mobile || userData.phoneNumber || null,
        photoURL: user.photoURL || userData.photoURL || null,
        isAuthenticated: true
      };

      // 4. Save to LocalStorage
      localStorage.setItem('user', JSON.stringify(fullUserData));
      localStorage.setItem('userRole', role.toLowerCase()); 
      localStorage.setItem('userId', user.uid);
      localStorage.setItem('isAuthenticated', 'true');

      // 5. Navigate based on Role
      const normalizedRole = role.toLowerCase();
      console.log(`4. Navigating to dashboard for role: ${normalizedRole}`);

      if (normalizedRole === 'admin') {
        navigate('/admindashboard');
      } else if (normalizedRole === 'farmer') {
        navigate('/farmer/overview');
      } else if (normalizedRole === 'finance') {
        navigate('/finance/overview');
      } else {
        // Fallback for custom roles or dashboard structure
        navigate(`/dashboard/${normalizedRole}`);
      }
      
    } catch (authError) {
      console.error('Authentication error:', authError);
      handleAuthErrors(authError);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthErrors = (authError) => {
    if (authError.code === 'auth/user-not-found' || authError.code === 'auth/invalid-credential') {
      setError("Invalid email or password.");
    } else if (authError.code === 'auth/wrong-password') {
      setError("Incorrect password.");
    } else if (authError.code === 'auth/invalid-email') {
      setError("Invalid email address format.");
    } else if (authError.code === 'auth/too-many-requests') {
      setError("Too many failed attempts. Try again later.");
    } else {
      setError("Login failed. Please check your connection.");
    }
  };

  const handleBackToUserSelection = () => {
    navigate('/user-selection');
  };

  const togglePassword = () => {
    setShowPassword(!showPassword);
  };

  // Configuration for UI appearance based on selected user type
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
              border: '1px solid #ffcdd2',
              fontSize: '14px',
              textAlign: 'center'
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
              {loading ? 'Logging in...' : `Login`}
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