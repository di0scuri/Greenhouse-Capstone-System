import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const UserContext = createContext();

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

export const UserProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Fetch user data from Firestore
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const fullUserData = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || userData.displayName || userData.name || 'Unknown User',
              role: userData.role || 'user',
              photoURL: user.photoURL || userData.photoURL,
              ...userData
            };
            
            setCurrentUser(fullUserData);
            
            // Store in localStorage for persistence
            localStorage.setItem('user', JSON.stringify(fullUserData));
            localStorage.setItem('userRole', fullUserData.role.toLowerCase());
          } else {
            // If no Firestore doc, use basic auth data
            const basicUserData = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || 'Unknown User',
              role: 'user'
            };
            setCurrentUser(basicUserData);
            localStorage.setItem('user', JSON.stringify(basicUserData));
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
        }
      } else {
        setCurrentUser(null);
        localStorage.removeItem('user');
        localStorage.removeItem('userRole');
      }
      setLoading(false);
    });

    // Check localStorage on mount
    const storedUser = localStorage.getItem('user');
    if (storedUser && !currentUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Error parsing stored user:', error);
      }
    }

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    loading,
    userId: currentUser?.uid || 'unknown',
    userName: currentUser?.displayName || 'Unknown User',
    userRole: currentUser?.role || 'user',
    userEmail: currentUser?.email || ''
  };

  return (
    <UserContext.Provider value={value}>
      {!loading && children}
    </UserContext.Provider>
  );
};
