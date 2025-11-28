import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, realtimeDb } from '../firebase';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import FarmerSidebar from './farmersidebar';
import './farmerdashboard.css';

const FarmerDashboard = ({ userType = 'farmer' }) => {
  // Authentication state
  const [authLoading, setAuthLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const navigate = useNavigate();

  // Dashboard state
  const [activeMenu, setActiveMenu] = useState('Overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date().getDate());
  const [sensorData, setSensorData] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Authentication check - MUST happen first
  useEffect(() => {
    console.log('Setting up authentication listener...');
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('Auth state changed:', user ? 'User logged in' : 'No user');
      
      if (user) {
        console.log('User authenticated:', user.email);
        setCurrentUser(user);
        setAuthenticated(true);
        
        // Verify user role
        const userRole = localStorage.getItem('userRole');
        console.log('User role from localStorage:', userRole);
        
        if (userRole !== 'farmer') {
          console.warn('User role mismatch. Expected: farmer, Got:', userRole);
        }
      } else {
        console.log('No authenticated user, redirecting to login...');
        setAuthenticated(false);
        navigate('/user-selection', { replace: true });
      }
      
      setAuthLoading(false);
    });

    return () => {
      console.log('Cleaning up auth listener');
      unsubscribe();
    };
  }, [navigate]);

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Fetch latest sensor readings from realtimeDb
  const fetchSensorData = async () => {
    try {
      // Fetch all sensor paths
      const rootRef = ref(realtimeDb, '/');
      const snapshot = await get(rootRef);
      
      if (snapshot.exists()) {
        const allData = snapshot.val();
        const allSensors = [];
        
        // Collect all sensor data
        Object.keys(allData).forEach(key => {
          if (key.startsWith('SoilSensor')) {
            const sensorData = allData[key];
            
            // Get the latest timestamp entry
            let latestData = null;
            let latestTimestamp = null;
            
            Object.keys(sensorData).forEach(dataKey => {
              if (dataKey.includes('_') || dataKey.includes('-')) {
                if (!latestTimestamp || dataKey > latestTimestamp) {
                  latestTimestamp = dataKey;
                  latestData = sensorData[dataKey];
                }
              }
            });
            
            if (!latestData) {
              latestData = sensorData;
            }
            
            allSensors.push({
              temperature: latestData.Temperature || latestData.temperature || 0,
              humidity: latestData.Humidity || latestData.humidity || latestData.Moisture || latestData.moisture || 0,
              ph: latestData.pH || latestData.ph || 0,
              ec: latestData.Conductivity || latestData.conductivity || 0
            });
          }
        });
        
        // Average all sensor readings if multiple sensors
        if (allSensors.length > 0) {
          const avgTemp = allSensors.reduce((sum, s) => sum + s.temperature, 0) / allSensors.length;
          const avgHumidity = allSensors.reduce((sum, s) => sum + s.humidity, 0) / allSensors.length;
          const avgPh = allSensors.reduce((sum, s) => sum + s.ph, 0) / allSensors.length;
          const avgEc = allSensors.reduce((sum, s) => sum + s.ec, 0) / allSensors.length;
          
          setSensorData([
            { type: 'Temp', value: `${avgTemp.toFixed(1)}°C`, icon: '🌡️', color: '#FF9500' },
            { type: 'Humidity', value: `${avgHumidity.toFixed(1)}%`, icon: '💧', color: '#007AFF' },
            { type: 'pH', value: avgPh.toFixed(1), icon: '⚗️', color: '#AF52DE' },
            { type: 'EC', value: `${avgEc.toFixed(1)} mS/cm`, icon: '⚡', color: '#34C759' }
          ]);
        } else {
          setFallbackSensorData();
        }
      } else {
        setFallbackSensorData();
      }
    } catch (error) {
      console.error('Error fetching sensor data:', error);
      setFallbackSensorData();
    }
  };

  const setFallbackSensorData = () => {
    setSensorData([
      { type: 'Temp', value: '--°C', icon: '🌡️', color: '#FF9500' },
      { type: 'Humidity', value: '--%', icon: '💧', color: '#007AFF' },
      { type: 'pH', value: '--', icon: '⚗️', color: '#AF52DE' },
      { type: 'EC', value: '-- mS/cm', icon: '⚡', color: '#34C759' }
    ]);
  };

  // Fetch NPK data for chart from real-time sensor database
  const fetchChartData = async () => {
    try {
      // Fetch all sensor paths (SoilSensor1, SoilSensor2, etc.)
      const rootRef = ref(realtimeDb, '/');
      const snapshot = await get(rootRef);
      
      if (snapshot.exists()) {
        const allData = snapshot.val();
        const sensorsReadings = [];
        
        // Find all keys that start with "SoilSensor"
        Object.keys(allData).forEach(key => {
          if (key.startsWith('SoilSensor')) {
            const sensorData = allData[key];
            
            // Get the latest timestamp entry
            let latestData = null;
            let latestTimestamp = null;
            
            Object.keys(sensorData).forEach(dataKey => {
              // Skip non-timestamp keys
              if (dataKey.includes('_') || dataKey.includes('-')) {
                if (!latestTimestamp || dataKey > latestTimestamp) {
                  latestTimestamp = dataKey;
                  latestData = sensorData[dataKey];
                }
              }
            });
            
            // If no timestamped data found, use direct values
            if (!latestData) {
              latestData = sensorData;
            }
            
            // Extract sensor number for display
            const match = key.match(/\d+/);
            const sensorNum = match ? match[0] : sensorsReadings.length + 1;
            
            sensorsReadings.push({
              plant: `Sensor ${sensorNum}`,
              nitrogen: latestData.Nitrogen || latestData.nitrogen || 0,
              phosphorus: latestData.Phosphorus || latestData.phosphorus || 0,
              potassium: latestData.Potassium || latestData.potassium || 0,
              ph: (latestData.pH || latestData.ph || 0) * 50 // Scale pH for visualization
            });
          }
        });
        
        setChartData(sensorsReadings.slice(0, 5)); // Limit to 5 sensors for display
      } else {
        // Fallback chart data
        setChartData([
          { plant: 'Sensor 1', nitrogen: 0, phosphorus: 0, potassium: 0, ph: 0 },
          { plant: 'Sensor 2', nitrogen: 0, phosphorus: 0, potassium: 0, ph: 0 }
        ]);
      }
    } catch (error) {
      console.error('Error fetching chart data:', error);
      // Fallback chart data
      setChartData([
        { plant: 'Sensor 1', nitrogen: 120, phosphorus: 80, potassium: 140, ph: 150 },
        { plant: 'Sensor 2', nitrogen: 100, phosphorus: 70, potassium: 120, ph: 140 },
        { plant: 'Sensor 3', nitrogen: 80, phosphorus: 60, potassium: 100, ph: 130 }
      ]);
    }
  };

  // Fetch events from Firebase
  const fetchEvents = async () => {
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const eventsQuery = query(
        collection(db, 'events'),
        where('date', '>=', startOfDay),
        where('date', '<', endOfDay),
        orderBy('date', 'asc')
      );
      
      const eventsSnapshot = await getDocs(eventsQuery);
      
      const todayEvents = eventsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          time: data.time || '00:00',
          title: data.title || 'Untitled Event',
          description: data.description || '',
          participants: data.participants || ['👤'],
          color: data.color || '#8BC34A',
          type: data.type || 'task'
        };
      });

      setEvents(todayEvents);
    } catch (error) {
      console.error('Error fetching events:', error);
      // Fallback events
      setEvents([
        {
          id: 1,
          time: '08:00',
          title: 'Water Plants - Zone A',
          participants: ['🌱'],
          color: '#8BC34A',
          type: 'task'
        },
        {
          id: 2,
          time: '10:00',
          title: 'Check Sensor Readings',
          participants: ['📊'],
          color: '#007AFF',
          type: 'task'
        }
      ]);
    }
  };

  // Fetch all data on component mount - ONLY after authentication is confirmed
  useEffect(() => {
    if (!authenticated || authLoading) {
      console.log('Waiting for authentication before fetching data...');
      return;
    }

    console.log('Authentication confirmed, fetching dashboard data...');

    const fetchAllData = async () => {
      setLoading(true);
      await Promise.all([
        fetchSensorData(),
        fetchChartData(),
        fetchEvents()
      ]);
      setLoading(false);
    };

    fetchAllData();

    // Refresh sensor data every 5 minutes
    const sensorTimer = setInterval(() => {
      fetchSensorData();
      fetchChartData();
    }, 5 * 60 * 1000);
    
    return () => {
      clearInterval(sensorTimer);
    };
  }, [authenticated, authLoading]);

  // Calendar dates generation
  const generateCalendarDates = () => {
    const today = new Date();
    const dates = [];
    
    for (let i = -3; i <= 3; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      
      const dayNames = ['Su', 'Mo', 'Tu', 'Wed', 'Th', 'Fr', 'Sa'];
      
      dates.push({
        date: date.getDate(),
        day: dayNames[date.getDay()],
        isToday: i === 0,
        fullDate: date
      });
    }
    
    return dates;
  };

  const calendarDates = generateCalendarDates();

  // Filter events and tasks
  const scheduleToday = events.filter(event => event.type !== 'reminder');
  const reminderTasks = events.filter(event => event.type === 'reminder');

  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();

  // Show loading screen while checking authentication
  if (authLoading) {
    return (
      <div className="farmer-dashboard">
        <div className="farmer-main" style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}>
          <div style={{ 
            textAlign: 'center', 
            color: 'white',
            padding: '40px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{ 
              fontSize: '48px', 
              marginBottom: '20px',
              animation: 'spin 2s linear infinite'
            }}>
              🌱
            </div>
            <h2 style={{ margin: '10px 0', fontSize: '24px' }}>Checking Authentication...</h2>
            <p style={{ margin: '5px 0', opacity: 0.8 }}>Please wait</p>
          </div>
        </div>
      </div>
    );
  }

  // Don't render anything if not authenticated (will redirect)
  if (!authenticated) {
    return null;
  }

  // Show loading screen while fetching dashboard data
  if (loading) {
    return (
      <div className="farmer-dashboard">
        <FarmerSidebar 
          activeMenu={activeMenu}
          setActiveMenu={setActiveMenu}
        />
        <div className="farmer-main">
          <div className="farmer-header">
            <h1 className="farmer-title">Loading Dashboard...</h1>
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '60vh' 
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '64px', marginBottom: '20px' }}>📊</div>
              <p>Fetching your farm data...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="farmer-dashboard">
      {/* Farmer Sidebar */}
      <FarmerSidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
      />

      {/* Main Content */}
      <div className="farmer-main">
        {/* Header */}
        <div className="farmer-header">
          <h1 className="farmer-title">
            Hello, {currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Farmer'}!
          </h1>
          <div className="farmer-header-actions">
            <div className="farmer-search-box">
              <input
                type="text"
                placeholder="Search..."
                className="farmer-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="farmer-search-icon">🔍</span>
            </div>
            <div className="farmer-bell">🔔</div>
          </div>
        </div>

        {/* Content */}
        <div className="farmer-content">
          {/* Left Section */}
          <div className="farmer-left-section">
            {/* NPK Chart */}
            <div className="farmer-chart-card">
              <div className="chart-header">
                <h3>NPK & pH Level For Each Sensor</h3>
                <div className="chart-legend">
                  <div className="legend-item">
                    <span className="legend-dot nitrogen"></span>
                    <span>Nitrogen</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot phosphorus"></span>
                    <span>Phosphorus</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot potassium"></span>
                    <span>Potassium</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot ph"></span>
                    <span>pH</span>
                  </div>
                </div>
              </div>
              
              <div className="chart-container">
                <div className="chart-y-axis">
                  <span>200</span>
                  <span>150</span>
                  <span>100</span>
                  <span>50</span>
                  <span>0</span>
                </div>
                <div className="chart-bars">
                  {chartData.map((data, index) => (
                    <div key={index} className="bar-group">
                      <div className="bars">
                        <div 
                          className="bar nitrogen-bar" 
                          style={{ height: `${Math.min(Math.max((data.nitrogen / 200) * 100, 2), 100)}%` }}
                          title={`N: ${data.nitrogen}`}
                        ></div>
                        <div 
                          className="bar phosphorus-bar" 
                          style={{ height: `${Math.min(Math.max((data.phosphorus / 200) * 100, 2), 100)}%` }}
                          title={`P: ${data.phosphorus}`}
                        ></div>
                        <div 
                          className="bar potassium-bar" 
                          style={{ height: `${Math.min(Math.max((data.potassium / 200) * 100, 2), 100)}%` }}
                          title={`K: ${data.potassium}`}
                        ></div>
                        <div 
                          className="bar ph-bar" 
                          style={{ height: `${Math.min(Math.max((data.ph / 200) * 100, 2), 100)}%` }}
                          title={`pH: ${(data.ph / 50).toFixed(1)}`}
                        ></div>
                      </div>
                      <span className="bar-label">{data.plant}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sensor Data */}
            <div className="farmer-sensor-card">
              <h3>Real-time Sensor Data</h3>
              <div className="sensor-grid">
                {sensorData.map((sensor, index) => (
                  <div key={index} className="sensor-item" style={{ backgroundColor: sensor.color + '20' }}>
                    <div className="sensor-icon" style={{ color: sensor.color }}>
                      {sensor.icon}
                    </div>
                    <div className="sensor-info">
                      <span className="sensor-type">{sensor.type}</span>
                      <span className="sensor-value">{sensor.value}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="sensor-timestamp">
                Last updated: {currentTime.toLocaleTimeString()}
              </p>
            </div>
          </div>

          {/* Right Section */}
          <div className="farmer-right-section">
            {/* Calendar */}
            <div className="farmer-calendar-card">
              <div className="calendar-header">
                <h3>{currentMonth}</h3>
              </div>
              <div className="calendar-dates">
                {calendarDates.map((date, index) => (
                  <div 
                    key={index} 
                    className={`calendar-date ${date.isToday ? 'today' : ''} ${selectedDate === date.date ? 'selected' : ''}`}
                    onClick={() => setSelectedDate(date.date)}
                  >
                    <span className="date-number">{date.date}</span>
                    <span className="date-day">{date.day}</span>
                  </div>
                ))}
              </div>

              {/* Schedule Today */}
              <div className="schedule-section">
                <h4>Schedule Today</h4>
                {scheduleToday.length === 0 ? (
                  <p className="no-events">No scheduled tasks for today</p>
                ) : (
                  <div className="schedule-timeline">
                    <div className="timeline-hours">
                      <span>08:00</span>
                      <span>10:00</span>
                      <span>12:00</span>
                      <span>14:00</span>
                      <span>16:00</span>
                    </div>
                    <div className="schedule-items">
                      {scheduleToday.map((item) => (
                        <div 
                          key={item.id} 
                          className="schedule-item"
                          style={{ backgroundColor: item.color }}
                        >
                          <span className="schedule-time">{item.time}</span>
                          <span className="schedule-title">{item.title}</span>
                          <div className="schedule-participants">
                            {item.participants.map((participant, i) => (
                              <span key={i} className="participant">{participant}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Reminder */}
              <div className="reminder-section">
                <h4>Farm Reminders</h4>
                <p className="reminder-subtitle">Important tasks and notifications</p>
                {reminderTasks.length === 0 ? (
                  <p className="no-reminders">No reminders for today</p>
                ) : (
                  <div className="reminder-items">
                    {reminderTasks.map((task) => (
                      <div 
                        key={task.id} 
                        className="reminder-item"
                        style={{ backgroundColor: task.color }}
                      >
                        <div className="reminder-icon">📋</div>
                        <div className="reminder-info">
                          <span className="reminder-title">{task.title}</span>
                          <span className="reminder-time">⏰ {task.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FarmerDashboard;