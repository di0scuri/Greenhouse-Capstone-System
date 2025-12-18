import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, realtimeDb } from '../firebase';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import FarmerSidebar from './farmersidebar';
import './farmerdashboard.css'; 
import { 
  FaClipboardList, FaExclamationTriangle, FaLeaf,
  FaSearch, FaBell, FaThermometerHalf, FaTint, FaSeedling
} from 'react-icons/fa';
import { MdCheckBoxOutlineBlank } from 'react-icons/md';

const FarmerDashboard = ({ userType = 'farmer' }) => {
  const [authLoading, setAuthLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const navigate = useNavigate();

  const [activeMenu, setActiveMenu] = useState('Overview');
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  
  const [stats, setStats] = useState({
    pendingTasks: 0,
    activeAlerts: 0,
    harvestCount: 0
  });
  const [sensorData, setSensorData] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. Authentication Check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setAuthenticated(true);
      } else {
        setAuthenticated(false);
        navigate('/user-selection', { replace: true });
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  // 2. Time Update
  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // 3. Helper: NPK Status Color
  const getNPKStatus = (nutrient, value) => {
    const optimalRanges = {
      nitrogen: { min: 30, max: 60 },
      phosphorus: { min: 30, max: 70 },
      potassium: { min: 60, max: 90 },
      ph: { min: 5.5, max: 7.0 }
    };
    const range = optimalRanges[nutrient];
    if (!range || value === null || value === undefined) return '#9E9E9E';
    if (value >= range.min && value <= range.max) return '#10b981';
    if (value < range.min * 0.7 || value > range.max * 1.3) return '#ef4444';
    return '#f59e0b';
  };

  // 4. Data Fetching
  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // --- A. Fetch Sensors ---
      const rootRef = ref(realtimeDb, '/');
      const sensorSnapshot = await get(rootRef);
      let activeAlertsCount = 0;
      let parsedSensors = [];

      if (sensorSnapshot.exists()) {
        const allData = sensorSnapshot.val();
        Object.keys(allData).forEach(key => {
          if (key.startsWith('SoilSensor')) {
            const rawData = allData[key];
            let latest = null;
            let latestTs = null;
            Object.keys(rawData).forEach(k => {
              if ((k.includes('_') || k.includes('-')) && (!latestTs || k > latestTs)) {
                latestTs = k;
                latest = rawData[k];
              }
            });
            if (!latest) latest = rawData;

            const n = latest.Nitrogen || 0;
            const p = latest.Phosphorus || 0;
            const k = latest.Potassium || 0;
            if (getNPKStatus('nitrogen', n) === '#ef4444' || 
                getNPKStatus('phosphorus', p) === '#ef4444' || 
                getNPKStatus('potassium', k) === '#ef4444') {
              activeAlertsCount++;
            }

            parsedSensors.push({
              id: key,
              plantId: key,
              nitrogen: n,
              phosphorus: p,
              potassium: k,
              ph: latest.pH || 7,
              moisture: latest.Moisture || 0,
              temperature: latest.Temperature || 0,
              timestamp: latestTs ? new Date() : new Date()
            });
          }
        });
      }
      setSensorData(parsedSensors);

      // --- B. Fetch Tasks ---
      const today = new Date();
      const startOfDay = new Date(today.setHours(0,0,0,0));
      const eventsQuery = query(
        collection(db, 'events'),
        where('date', '>=', startOfDay),
        orderBy('date', 'asc'),
        limit(10)
      );
      const eventsSnap = await getDocs(eventsQuery);
      const fetchedTasks = eventsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        time: doc.data().time || '00:00'
      }));
      setTasks(fetchedTasks);

      // --- C. Fetch Harvests ---
      const harvestsQuery = query(
        collection(db, 'harvests'),
        orderBy('createdAt', 'desc'),
        limit(5)
      );
      const harvestsSnap = await getDocs(harvestsQuery);
      const fetchedHarvests = harvestsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setHarvests(fetchedHarvests);

      setStats({
        pendingTasks: fetchedTasks.length,
        activeAlerts: activeAlertsCount,
        harvestCount: fetchedHarvests.length
      });

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated) {
      fetchDashboardData();
      const interval = setInterval(fetchDashboardData, 30000);
      return () => clearInterval(interval);
    }
  }, [authenticated]);

  const formatDateTime = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  };

  const getSensorDisplayName = (plantId) => {
    const match = plantId.match(/\d+/);
    return match ? `Plot Sensor ${match[0]}` : 'Unknown Sensor';
  };

  if (authLoading || (!authenticated && loading)) {
    return <div className="loading-indicator">Loading Farmer Dashboard...</div>;
  }
  if (!authenticated) return null;

  const statsCards = [
    {
      title: 'Pending Tasks',
      amount: `${stats.pendingTasks} Tasks`,
      color: '#2E7D32',
      bgColor: '#E8F5E9',
      icon: <FaClipboardList />
    },
    {
      title: 'Active Alerts',
      amount: `${stats.activeAlerts} Alerts`,
      color: stats.activeAlerts > 0 ? '#C62828' : '#F9A825',
      bgColor: stats.activeAlerts > 0 ? '#FFEBEE' : '#FFFDE7',
      icon: <FaExclamationTriangle />
    },
    {
      title: 'Recent Harvests',
      amount: `${stats.harvestCount} Batches`,
      color: '#1565C0',
      bgColor: '#E3F2FD',
      icon: <FaLeaf />
    }
  ];

  return (
    <div className="dashboard-container-ad">
      <FarmerSidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} />

      <div className="main-content">
        {/* Header */}
        <div className="dashboard-header">
          <div className="header-left">
            <h1>Welcome, {currentUser?.displayName || 'Farmer'}!</h1>
            <p className="date-text">{formatDateTime(currentDateTime)}</p>
            <p className="time-text">
              {currentDateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="header-right">
            <div className="search-container-ad">
              <input type="text" placeholder="Search tasks..." className="search-input-ad" />
              <div className="search-icon-ad"><FaSearch /></div>
            </div>
            <div className="notification-icon"><FaBell /></div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="stats-grid">
          {statsCards.map((card, index) => (
            <div key={index} className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: card.bgColor, color: card.color }}>
                {card.icon}
              </div>
              <div className="stat-content-ad">
                <h3 className="stat-title">{card.title}</h3>
                <p className="stat-amount-10">{card.amount}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Content Grid */}
        <div className="content-grid">
          
          {/* 1. Tasks Card (Left Column) */}
          <div className="content-card tasks-card">
            <h3 className="card-title">Today's Tasks</h3>
            <div className="tasks-list">
              {tasks.length === 0 ? (
                <div className="task-item" style={{justifyContent:'center', color:'#999'}}>
                  No pending tasks for today
                </div>
              ) : (
                tasks.map((task) => (
                  <div key={task.id} className="task-item">
                    <div className="task-checkbox"><MdCheckBoxOutlineBlank /></div>
                    <div style={{display:'flex', flexDirection:'column', flex:1}}>
                      <span className="task-text" style={{fontWeight:'500'}}>{task.title || 'Untitled Task'}</span>
                      <span style={{fontSize:'12px', color:'#666'}}>
                        {task.time} • {task.description || 'No description'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 2. Harvest Summary Card (Right Column) */}
          <div className="content-card harvest-summary-section">
            <h3 className="card-title">Recent Harvests</h3>
            <div className="harvest-list">
              {harvests.length === 0 ? (
                <div className="harvest-empty">No recent harvests recorded</div>
              ) : (
                harvests.map((h) => (
                  <div key={h.id} className="harvest-item">
                    <div className="harvest-item-header">
                      <span className="harvest-plant-name">{h.plantName}</span>
                      <span className="harvest-status-badge positive">Completed</span>
                    </div>
                    <div className="harvest-item-details">
                      <div className="harvest-detail">
                        <small>Date</small>
                        <strong>
                          {h.harvestDate ? new Date(h.harvestDate).toLocaleDateString() : 'N/A'}
                        </strong>
                      </div>
                      <div className="harvest-detail">
                        <small>Weight</small>
                        <strong>{h.totalWeight || 0} kg</strong>
                      </div>
                      <div className="harvest-detail">
                        <small>Zone</small>
                        <strong>{h.zone || 'Main'}</strong>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 3. Real-time Sensors (Bottom - Full Width) */}
          <div className="content-card sensor-cards-wrapper chart-full-width">
            <div className="chart-header">
              <h3 className="card-title">Real-time Field Conditions</h3>
              <div className="last-update">
                Updated: {currentDateTime.toLocaleTimeString()}
              </div>
            </div>

            <div className="sensor-cards-grid">
              {loading ? (
                <div className="chart-loading">Fetching sensor data...</div>
              ) : sensorData.length === 0 ? (
                <div className="chart-loading">No active sensors found</div>
              ) : (
                sensorData.map((data) => (
                  <div key={data.id} className="sensor-mini-card">
                    <div className="sensor-mini-header">
                      <div className="sensor-icon-wrapper">
                        <FaSeedling />
                      </div>
                      <div className="sensor-title-info">
                        <h4>{getSensorDisplayName(data.plantId)}</h4>
                        <span className="sensor-status-dot online">Active</span>
                      </div>
                    </div>

                    <div className="sensor-readings-grid">
                      {/* Nitrogen */}
                      <div className="reading-mini-item">
                        <div className="reading-label">Nitrogen</div>
                        <div className="reading-value" style={{ color: getNPKStatus('nitrogen', data.nitrogen) }}>
                          {data.nitrogen} <span className="reading-unit">ppm</span>
                        </div>
                      </div>

                      {/* Phosphorus */}
                      <div className="reading-mini-item">
                        <div className="reading-label">Phosphorus</div>
                        <div className="reading-value" style={{ color: getNPKStatus('phosphorus', data.phosphorus) }}>
                          {data.phosphorus} <span className="reading-unit">ppm</span>
                        </div>
                      </div>

                      {/* Potassium */}
                      <div className="reading-mini-item">
                        <div className="reading-label">Potassium</div>
                        <div className="reading-value" style={{ color: getNPKStatus('potassium', data.potassium) }}>
                          {data.potassium} <span className="reading-unit">ppm</span>
                        </div>
                      </div>

                      {/* pH */}
                      <div className="reading-mini-item">
                        <div className="reading-label">pH Level</div>
                        <div className="reading-value" style={{ color: getNPKStatus('ph', data.ph) }}>
                          {data.ph?.toFixed(1)}
                        </div>
                      </div>

                      {/* Temp */}
                      <div className="reading-mini-item">
                        <div className="reading-label">
                          <FaThermometerHalf style={{fontSize:'10px', marginRight:'2px'}}/> Temp
                        </div>
                        <div className="reading-value text-default">
                          {data.temperature}°C
                        </div>
                      </div>

                      {/* Moisture */}
                      <div className="reading-mini-item">
                        <div className="reading-label">
                          <FaTint style={{fontSize:'10px', marginRight:'2px'}}/> Moisture
                        </div>
                        <div className="reading-value text-default">
                          {data.moisture}%
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default FarmerDashboard;