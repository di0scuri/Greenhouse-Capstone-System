import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database'; 

const firebaseConfig = {
  apiKey: "AIzaSyBv5VayQ8ybcZYfnCPiezafjpbrBDXUW4U",
  authDomain: "greenhouse-management-sy-7713b.firebaseapp.com",
  databaseURL: "https://greenhouse-management-sy-7713b-default-rtdb.firebaseio.com",
  projectId: "greenhouse-management-sy-7713b",
  storageBucket: "greenhouse-management-sy-7713b.firebasestorage.app",
  messagingSenderId: "120549657650",
  appId: "1:120549657650:web:fd516168d6b3f0e270802b",
  measurementId: "G-R8PVF02EK6"
};

const app = initializeApp(firebaseConfig);

export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const realtimeDb = getDatabase(app); // ← ADD THIS
export const database = getDatabase(app); 

export default app;