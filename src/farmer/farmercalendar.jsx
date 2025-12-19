import React, { useState, useEffect } from 'react';
import FarmerSidebar from './farmersidebar';
import './farmercalendar.css';
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, deleteDoc, serverTimestamp, query, where, orderBy, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import inventoryLogger from "../functions/inventoryLogger";
import JobOrderManager, { 
  parsePlotSizeToM2, 
  convertFertilizerToPlotSize 
} from '../functions/jobOrderManager';
import '../admin/custom-alert.css';
import { useUser } from '../contexts/UserContext';

import { 
  FaSeedling, FaLeaf, FaTint, FaBug, FaCut, FaCarrot, FaTools, FaEye, 
  FaClipboardList, FaCalendarAlt, FaClock, FaPlus, FaEdit, FaTrash, FaTimes,
  FaChevronLeft, FaChevronRight, FaThList, FaCalendarDay, FaLock, FaUnlock
} from 'react-icons/fa';
import { GiPlantSeed, GiWateringCan, GiFertilizerBag, GiGrass } from 'react-icons/gi';



const FarmerCalendar = () => {
  const { userId, userName, userRole, loading: userLoading } = useUser();
  const [activeMenu, setActiveMenu] = useState('Calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('Week'); // Day, Week, Month, Year
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jobOrderFilter, setJobOrderFilter] = useState('all');
  const [showEventModal, setShowEventModal] = useState();

  const [customAlert, setCustomAlert] = useState({
    show: false,
    type: 'info',
    title: '',
    message: '',
    details: null,
    onConfirm: null,
    onCancel: null,
    confirmText: 'OK',
    cancelText: 'Cancel',
    showCancel: false
  });

  const [showDetailsModal, setShowDetailsModal] = useState(false); // Add this

  const [eventForm, setEventForm] = useState({
    plantId: '',
    plantName: '',
    type: 'LIFECYCLE_STAGE',
    status: 'info',
    message: '',
    timestamp: '',
    notes: ''
  });

  // Event types with react-icons (you'll need to install react-icons)
const eventTypes = [
  { value: 'LIFECYCLE_STAGE', icon: <FaSeedling />, color: '#10b981', label: 'Lifecycle Stage' },
  { value: 'PLANTING', icon: <GiPlantSeed />, color: '#14b8a6', label: 'Planting' },
  { value: 'WATERING', icon: <GiWateringCan />, color: '#3b82f6', label: 'Watering' },
  { value: 'FERTILIZING', icon: <GiFertilizerBag />, color: '#8b5cf6', label: 'Fertilizing' },
  { value: 'WEEDING', icon: <GiGrass />, color: '#f59e0b', label: 'Weeding' },
  { value: 'PEST_CONTROL', icon: <FaBug />, color: '#ef4444', label: 'Pest Control' },
  { value: 'PRUNING', icon: <FaCut />, color: '#ec4899', label: 'Pruning' },
  { value: 'HARVESTING', icon: <FaCarrot />, color: '#059669', label: 'Harvesting' },
  { value: 'MAINTENANCE', icon: <FaTools />, color: '#6366f1', label: 'Maintenance' },
  { value: 'OBSERVATION', icon: <FaEye />, color: '#06b6d4', label: 'Observation' },
  { value: 'FERTILIZER_JOB_ORDER', icon: <FaClipboardList />, color: '#3b82f6', label: 'Fertilizer Job' },
  { value: 'OTHER', icon: <FaClipboardList />, color: '#64748b', label: 'Other' }
];
  // Status colors
  const statusColors = {
    'info': '#10b981',
    'success': '#10b981',
    'warning': '#f59e0b',
    'error': '#ef4444',
    'pending': '#3b82f6',
    'in-progress': '#f59e0b',
    'completed': '#10b981',
    'cancelled': '#ef4444'
  };


  // Check if job order can be started based on date
const canStartJobOrder = (eventDate) => {
  if (!eventDate) return true; // Allow if no date specified
  
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today
  
  const jobDate = new Date(eventDate);
  jobDate.setHours(0, 0, 0, 0); // Start of job date
  
  return jobDate <= today; // Can start if job date is today or in the past
};

// Custom Alert Helper Functions
const showCustomAlert = (type, title, message, details = null, options = {}) => {
  setCustomAlert({
    show: true,
    type,
    title,
    message,
    details,
    onConfirm: options.onConfirm || null,
    onCancel: options.onCancel || null,
    confirmText: options.confirmText || 'OK',
    cancelText: options.cancelText || 'Cancel',
    showCancel: options.showCancel || false
  });
};

const closeCustomAlert = () => {
  setCustomAlert({
    show: false,
    type: 'info',
    title: '',
    message: '',
    details: null,
    onConfirm: null,
    onCancel: null,
    confirmText: 'OK',
    cancelText: 'Cancel',
    showCancel: false
  });
};

const handleAlertConfirm = () => {
  if (customAlert.onConfirm) {
    customAlert.onConfirm();
  }
  closeCustomAlert();
};

const handleAlertCancel = () => {
  if (customAlert.onCancel) {
    customAlert.onCancel();
  }
  closeCustomAlert();
};

// Get lock status text
const getLockStatus = (eventDate) => {
  if (!eventDate) return { canStart: true, message: '' };
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const jobDate = new Date(eventDate);
  jobDate.setHours(0, 0, 0, 0);
  
  const diffDays = Math.ceil((jobDate - today) / (1000 * 60 * 60 * 24));
  
  if (diffDays > 0) {
    return { 
      canStart: false, 
      message: `Available in ${diffDays} day${diffDays > 1 ? 's' : ''}` 
    };
  } else if (diffDays < 0) {
    return { canStart: true, message: 'Overdue' };
  } else {
    return { canStart: true, message: 'Available today' };
  }
};




  // Render calendar grid (Admin-style)
const renderCalendarGrid = () => {
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const days = [];

  // Empty cells for days before first day of month
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(<div key={`empty-${i}`} className="fc-calendar-day empty" />);
  }

  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const dayEvents = getEventsForDate(cellDate);
    const isToday = cellDate.toDateString() === new Date().toDateString();

    days.push(
      <div
        key={day}
        className={`fc-calendar-day ${isToday ? 'today' : ''} ${dayEvents.length > 0 ? 'has-events' : ''}`}
      >
        <div className="fc-day-number">{day}</div>
        <div className="fc-day-events">
          {dayEvents.slice(0, 3).map((event) => {
            const typeConfig = getEventTypeConfig(event.eventType || event.type);
            const isJobOrder = event.isJobOrder;
            const canStart = isJobOrder ? canStartJobOrder(event.date) : true;
            
            return (
              <div
                key={event.id}
                className={`fc-event-item ${isJobOrder ? 'job-order' : ''} ${!canStart ? 'locked' : ''}`}
                style={{ 
                  background: !canStart ? '#f1f5f9' : (statusColors[event.status] || statusColors.info),
                  borderLeft: `4px solid ${typeConfig.color}`,
                  opacity: !canStart ? 0.7 : 1
                }}
                onClick={() => {
                  if (!canStart) {
                    const lockStatus = getLockStatus(event.date);  // ✅ Define it first
                    showCustomAlert(
                      'warning',
                      '🔒 Job Locked',
                      `This job is scheduled for ${new Date(event.date).toLocaleDateString()}`,
                      [{ label: 'Status', value: lockStatus.message }],
                      { confirmText: 'OK' }
                    );
                    return;
                  }
                  setSelectedEvent(event);
                  setShowDetailsModal(true);
                }}
                title={!canStart ? `Scheduled for ${new Date(event.date).toLocaleDateString()}` : event.title}
              >
                <span className="fc-event-icon">
                  {!canStart ? <FaLock /> : typeConfig.icon}
                </span>
                {isJobOrder && <FaClipboardList className="fc-job-badge" />}
                <span className="fc-event-text">
                  {event.title.substring(0, 20)}
                  {event.title.length > 20 ? '...' : ''}
                </span>
                {!canStart && <FaLock className="fc-lock-icon" />}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return days;
};

  // Render list view
const renderListView = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let allEvents = getAllEventsForView();

  const upcomingEvents = allEvents.filter(event => {
    const eventDate = new Date(event.date);
    eventDate.setHours(0, 0, 0, 0);
    return eventDate >= today;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  const pastEvents = allEvents.filter(event => {
    const eventDate = new Date(event.date);
    eventDate.setHours(0, 0, 0, 0);
    return eventDate < today;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="fc-list-view">
      <div className="fc-list-section">
        <h3 className="fc-list-section-title">
          <FaCalendarDay style={{ marginRight: '8px' }} />
          Upcoming & Today
        </h3>
        {upcomingEvents.length === 0 ? (
          <div className="fc-no-events">No upcoming events</div>
        ) : (
          <div className="fc-events-list">
            {upcomingEvents.map(event => {
              const typeConfig = getEventTypeConfig(event.eventType || event.type);
              const isJobOrder = event.isJobOrder;
              const canStart = isJobOrder ? canStartJobOrder(event.date) : true;
              const lockStatus = getLockStatus(event.date);
              
              return (
                <div
                  key={event.id}
                  className={`fc-event-list-item ${event.isJobOrder ? 'job-order' : ''} ${!canStart ? 'locked' : ''}`}
                  onClick={() => {
                    if (!canStart) {
                      showCustomAlert(
                        'warning',
                        '🔒 Job Locked',
                        `This job is scheduled for ${new Date(event.date).toLocaleDateString()}`,
                        [{ label: 'Status', value: lockStatus.message }],
                        { confirmText: 'OK' }
                      );
                      return;
                    }
                    setSelectedEvent(event);
                    setShowDetailsModal(true);
                  }}
                  style={{ opacity: !canStart ? 0.7 : 1 }}
                >
                  <div className="fc-event-list-icon" style={{ 
                    background: !canStart ? '#94a3b8' : typeConfig.color 
                  }}>
                    {!canStart ? <FaLock /> : typeConfig.icon}
                  </div>
                  <div className="fc-event-list-content">
                    <div className="fc-event-list-header">
                      <span className="fc-event-list-message">
                        {!canStart && '🔒 '}
                        {event.isJobOrder}
                        {event.title}
                        {!canStart && <span className="fc-lock-text"> ({lockStatus.message})</span>}
                      </span>
                      <span 
                        className="fc-event-list-status"
                        style={{ 
                          background: !canStart ? '#94a3b8' : (statusColors[event.status] || statusColors.info) 
                        }}
                      >
                        {!canStart ? 'locked' : event.status}
                      </span>
                    </div>
                    <div className="fc-event-list-details">
                      {event.plantName && (
                        <span className="fc-event-detail">
                          🌱 {event.plantName}
                        </span>
                      )}
                      <span className="fc-event-detail">
                        📅 {new Date(event.date).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric' 
                        })}
                      </span>
                      <span className="fc-event-detail">
                        🕐 {event.time}
                      </span>
                      <span className="fc-event-detail">
                        {!canStart ? '🔒 Locked' : typeConfig.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="fc-list-section">
        <h3 className="fc-list-section-title">
          <FaClock style={{ marginRight: '8px' }} />
          Past Events
        </h3>
        {pastEvents.length === 0 ? (
          <div className="fc-no-events">No past events</div>
        ) : (
          <div className="fc-events-list">
            {pastEvents.map(event => {
              const typeConfig = getEventTypeConfig(event.eventType || event.type);
              return (
                <div
                  key={event.id}
                  className={`fc-event-list-item past ${event.isJobOrder ? 'job-order' : ''}`}
                  onClick={() => {
                    setSelectedEvent(event);
                    setShowDetailsModal(true);
                  }}
                >
                  <div className="fc-event-list-icon" style={{ background: typeConfig.color }}>
                    {typeConfig.icon}
                  </div>
                  <div className="fc-event-list-content">
                    <div className="fc-event-list-header">
                      <span className="fc-event-list-message">
                        {event.isJobOrder}
                        {event.title}
                      </span>
                      <span 
                        className="fc-event-list-status"
                        style={{ background: statusColors[event.status] || statusColors.info }}
                      >
                        {event.status}
                      </span>
                    </div>
                    <div className="fc-event-list-details">
                      {event.plantName && (
                        <span className="fc-event-detail">
                          <FaSeedling style={{ marginRight: '4px' }} />
                          {event.plantName}
                        </span>
                      )}
                      <span className="fc-event-detail">
                        <FaCalendarAlt style={{ marginRight: '4px' }} />
                        {new Date(event.date).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric' 
                        })}
                      </span>
                      <span className="fc-event-detail">
                        <FaClock style={{ marginRight: '4px' }} />
                        {event.time}
                      </span>
                      <span className="fc-event-detail">
                        {typeConfig.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

  const getEventTypeConfig = (type) => {
    return eventTypes.find(t => t.value === type) || eventTypes[eventTypes.length - 1];
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setViewMode('Week'); 
  };


  const fetchPlants = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'plants'));
      const plantsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        datePlanted: doc.data().plantedDate?.toDate ? doc.data().plantedDate.toDate() : 
                     doc.data().datePlanted?.toDate ? doc.data().datePlanted.toDate() : new Date()
      }));
      setPlants(plantsData);
    } catch (error) {
      console.error('Error fetching plants:', error);
    }
  };

  const fetchEvents = async () => {
    try {
      const eventsQuery = query(
        collection(db, 'events'),
        orderBy('createdAt', 'desc')
      );
      const eventsSnapshot = await getDocs(eventsQuery);
      
      const jobOrdersSnapshot = await getDocs(collection(db, 'jobOrders'));
      
      const eventsData = eventsSnapshot.docs.map(doc => {
        const data = doc.data();
        
        // Handle timestamp - can be Firestore Timestamp, string, or missing
        let timestamp;
        if (data.timestamp) {
          if (typeof data.timestamp === 'object' && data.timestamp.toDate) {
            timestamp = data.timestamp.toDate();
          } else if (typeof data.timestamp === 'string') {
            timestamp = new Date(data.timestamp);
          } else {
            timestamp = new Date(data.timestamp);
          }
        } else if (data.createdAt) {
          timestamp = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        } else {
          timestamp = new Date();
        }
        
        return {
          id: doc.id,
          ...data,
          timestamp: timestamp
        };
      });
      
      const jobOrderEvents = jobOrdersSnapshot.docs.map(doc => {
        const data = doc.data();
        
        // Handle scheduledDate - could be Firestore Timestamp or string
        let scheduledDate;
        if (data.scheduledDate) {
          if (data.scheduledDate.toDate && typeof data.scheduledDate.toDate === 'function') {
            scheduledDate = data.scheduledDate.toDate();
          } else if (typeof data.scheduledDate === 'string') {
            scheduledDate = new Date(data.scheduledDate);
          } else {
            scheduledDate = new Date(data.scheduledDate);
          }
        } else {
          scheduledDate = new Date();
        }
        
        return {
          id: `joborder-${doc.id}`,
          jobOrderId: doc.id,
          title: data.title || `${data.applicationStage} - ${data.plantName}`,
          time: data.scheduledTime || '8:00 AM',
          date: scheduledDate.toISOString().split('T')[0],
          type: 'job-order',
          eventType: 'FERTILIZER_JOB_ORDER',
          color: getEventColor('FERTILIZER_JOB_ORDER', data.status),
          originalEvent: data,
          status: data.status || 'pending',
          priority: data.priority || 'medium',
          isJobOrder: true,
          fertilizerName: data.fertilizerName,
          fertilizerAmount: data.fertilizerAmount,
          applicationMethod: data.applicationMethod,
          applicationInstructions: data.applicationInstructions,
          applicationNumber: data.applicationNumber,
          applicationStage: data.applicationStage,
          totalApplications: data.totalApplications,
          plantId: data.plantId,
          plantName: data.plantName,
          plantType: data.plantType,
          plotNumber: data.plotNumber,
          npkRatio: data.npkRatio,
          stage: data.stage,
          description: data.description,
          expectedResult: data.expectedResult,
          inventoryLogged: data.inventoryLogged || false,
          inventoryItemId: data.inventoryItemId || null
        };
      });
      
      const calendarEvents = eventsData.map(event => {
        const eventDate = event.timestamp || event.createdAt || new Date();
        
        return {
          id: `event-${event.id}`,
          jobOrderId: event.jobOrderId,
          title: event.message || event.title || `${event.type} - ${event.status}`,
          time: eventDate.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          }),
          date: eventDate.toISOString().split('T')[0],
          type: 'event',
          eventType: event.type,
          color: getEventColor(event.type, event.status),
          originalEvent: event,
          status: event.status || 'info',
          priority: event.priority || 'medium',
          isJobOrder: false, // Regular events are NOT job orders
          fertilizerName: event.fertilizerName,
          fertilizerAmount: event.fertilizerAmount,
          applicationMethod: event.applicationMethod,
          applicationNumber: event.applicationNumber,
          totalApplications: event.totalApplications,
          plantId: event.plantId,
          plantName: event.plantName,
          plotNumber: event.plotNumber,
          inventoryLogged: event.inventoryLogged || false
        };
      });

      setEvents([...calendarEvents, ...jobOrderEvents]);
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };
  const updateJobOrderStatus = async (jobOrderId, status) => {
    try {
      const jobOrderManager = new JobOrderManager(userId, userName || 'Farmer');
      await jobOrderManager.updateJobOrderStatus(jobOrderId, status);
      await fetchEvents();
      return true;
    } catch (error) {
      console.error('Error updating job order status:', error);
      throw error;
    }
  };

const completeJobOrder = async (jobOrderId, notes = '') => {
  try {
    const jobOrderManager = new JobOrderManager(userId, userName || 'Farmer User');
    await jobOrderManager.completeJobOrder(jobOrderId, notes);
    
    await fetchEvents();
    return true;
  } catch (error) {
    console.error('Error completing job order:', error);
    showCustomAlert(
      'error',
      'Completion Failed',
      `Failed to complete job order: ${error.message}`,
      null,
      { confirmText: 'OK' }
    );
    throw error;
  }
};
  // Generate farming activities based on plant data
  const generatePlantActivities = () => {
    const activities = [];
    const today = new Date();

    plants.forEach(plant => {
      if (!plant.datePlanted && !plant.plantedDate) return;

      const plantedDate = plant.datePlanted || plant.plantedDate;
      const daysSincePlanted = Math.floor((today - plantedDate) / (1000 * 60 * 60 * 24));

      // Generate activities based on plant lifecycle
      const plantActivities = [
        {
          day: 0,
          title: `Plant ${plant.plantName || plant.name || plant.type}`,
          type: 'planting',
          color: '#51cf66'
        },
        {
          day: 7,
          title: `Check seedlings - ${plant.plantName || plant.name || plant.type}`,
          type: 'inspection',
          color: '#4dabf7'
        },
        {
          day: 14,
          title: `First fertilization - ${plant.plantName || plant.name || plant.type}`,
          type: 'fertilizing',
          color: '#ff8787'
        },
        {
          day: 21,
          title: `Watering schedule check - ${plant.plantName || plant.name || plant.type}`,
          type: 'watering',
          color: '#4dabf7'
        },
        {
          day: 30,
          title: `Growth assessment - ${plant.plantName || plant.name || plant.type}`,
          type: 'assessment',
          color: '#9775fa'
        },
        {
          day: 45,
          title: `Mid-season care - ${plant.plantName || plant.name || plant.type}`,
          type: 'care',
          color: '#51cf66'
        }
      ];

      // Add expected harvest date if available
      if (plant.expectedHarvestDate) {
        const harvestDate = plant.expectedHarvestDate.toDate ? plant.expectedHarvestDate.toDate() : new Date(plant.expectedHarvestDate);
        activities.push({
          id: `plant-${plant.id}-harvest`,
          title: `Harvest time - ${plant.plantName || plant.name || plant.type}`,
          time: '9:00 AM',
          date: harvestDate.toISOString().split('T')[0],
          type: 'harvest',
          color: '#ffd43b',
          plantId: plant.id,
          plantData: plant
        });
      }

      plantActivities.forEach(activity => {
        const activityDate = new Date(plantedDate);
        activityDate.setDate(plantedDate.getDate() + activity.day);
        
        // Only include activities within a reasonable time range
        const diffFromToday = Math.abs(activityDate - today) / (1000 * 60 * 60 * 24);
        if (diffFromToday <= 180) { // Within 6 months
          activities.push({
            id: `plant-${plant.id}-${activity.day}`,
            title: activity.title,
            time: '9:00 AM',
            date: activityDate.toISOString().split('T')[0],
            type: activity.type,
            color: activity.color,
            plantId: plant.id,
            plantData: plant
          });
        }
      });
    });

    return activities;
  };

  const normalizeToDate = (value) => {
  try {
    if (!value) return new Date();
    // Firestore Timestamp
    if (typeof value === 'object' && typeof value.toDate === 'function') {
      return value.toDate();
    }
    // Date already
    if (value instanceof Date) return value;
    // numeric epoch (ms)
    if (typeof value === 'number') return new Date(value);
    // string
    if (typeof value === 'string') {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    // fallback
    return new Date();
  } catch (e) {
    console.warn('normalizeToDate error:', e);
    return new Date();
  }
};

  // Get color for event types (updated for job orders)
  const getEventColor = (eventType, status) => {
    // Job order status colors
    if (eventType === 'FERTILIZER_JOB_ORDER') {
      switch (status) {
        case 'pending':
          return '#3b82f6';
        case 'in-progress':
          return '#f59e0b';
        case 'completed':
          return '#10b981';
        case 'cancelled':
          return '#ef4444';
        default:
          return '#3b82f6';
      }
    }

    // Regular event colors
    const colors = {
      'LIFECYCLE_STAGE': '#51cf66',
      'PLANTING': '#51cf66',
      'WATERING': '#4dabf7',
      'FERTILIZING': '#ff8787',
      'HARVESTING': '#ffd43b',
      'HARVEST': '#ffd43b',
      'INSPECTION': '#9775fa',
      'MAINTENANCE': '#ff6b35',
      'PLANT_UPDATE': '#9775fa',
      'FERTILIZER_SCHEDULE_CREATED': '#0ea5e9',
      'default': '#4dabf7'
    };
    return colors[eventType] || colors.default;
  };

  // Load all data
 useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await fetchPlants();
        await fetchEvents();
      } catch (error) {
        console.error('Error loading calendar data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    
    // Refresh every 5 minutes
    const interval = setInterval(() => {
      fetchEvents();
    }, 300000);

    return () => clearInterval(interval);
  }, []);

  // Combine Firebase events with generated plant activities
  useEffect(() => {
    if (plants.length > 0) {
      const plantActivities = generatePlantActivities();
      setEvents(prevEvents => {
        // Filter out old plant activities and add new ones
        const firebaseEvents = prevEvents.filter(event => !event.id.startsWith('plant-'));
        return [...firebaseEvents, ...plantActivities];
      });
    }
  }, [plants]);

  // Get current week dates
  const getWeekDates = (date) => {
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day;
    startOfWeek.setDate(diff);

    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const weekDay = new Date(startOfWeek);
      weekDay.setDate(startOfWeek.getDate() + i);
      weekDates.push(weekDay);
    }
    return weekDates;
  };

  // Get dates based on view mode
  const getViewDates = () => {
    switch (viewMode) {
      case 'Day':
        return [currentDate];
      case 'Week':
        return getWeekDates(currentDate);
      case 'Month':
        const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        const monthDates = [];
        for (let i = 1; i <= lastDay.getDate(); i++) {
          monthDates.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
        }
        return monthDates;
      case 'Year':
        const yearDates = [];
        for (let month = 0; month < 12; month++) {
          const monthDate = new Date(currentDate.getFullYear(), month, 1);
          yearDates.push(monthDate);
        }
        return yearDates;
      default:
        return getWeekDates(currentDate);
    }
  };

  const viewDates = getViewDates();
  const timeSlots = [
    '7 AM', '8 AM', '9 AM', '10 AM', '11 AM', '12 PM',
    '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM'
  ];

  const formatDate = (date) => date.toISOString().split('T')[0];

  const getEventsForDate = (date) => {
    const dateStr = formatDate(date);
    let filteredEvents = events.filter(event => event.date === dateStr);
    
    // Apply job order filter
    if (jobOrderFilter !== 'all') {
      filteredEvents = filteredEvents.filter(event => {
        if (!event.isJobOrder) return true;
        return event.status === jobOrderFilter;
      });
    }
    
    // Apply search filter
    if (searchTerm) {
      filteredEvents = filteredEvents.filter(event => 
        event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (event.fertilizerName && event.fertilizerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (event.plantName && event.plantName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (event.plantData && event.plantData.plantName && event.plantData.plantName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (event.plantData && event.plantData.name && event.plantData.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (event.plantData && event.plantData.type && event.plantData.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (event.originalEvent && event.originalEvent.message && event.originalEvent.message.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    return filteredEvents;
  };

  const formatFertilizerAmount = (fertilizerBagsForPlot, plotSizeM2) => {
  if (!fertilizerBagsForPlot || Object.keys(fertilizerBagsForPlot).length === 0) {
    return 'No fertilizer amount specified';
  }
  
  const FERTILIZER_WEIGHT_PER_BAG = 50; // kg per bag
  
  return Object.entries(fertilizerBagsForPlot)
    .map(([type, bags]) => {
      const bagsNum = parseFloat(bags) || 0;
      const weightKg = bagsNum * FERTILIZER_WEIGHT_PER_BAG;
      
      let displayAmount, displayUnit;
      
      if (weightKg >= 1) {
        displayAmount = weightKg.toFixed(2);
        displayUnit = 'kg';
      } else if (weightKg >= 0.001) {
        displayAmount = (weightKg * 1000).toFixed(1);
        displayUnit = 'g';
      } else {
        displayAmount = (weightKg * 1000000).toFixed(0);
        displayUnit = 'mg';
      }
      
      return `${type}: ${displayAmount}${displayUnit} (${bagsNum.toFixed(4)} bags)`;
    })
    .join(', ');
};


  // Get all events for the current view (filtered by search and job order filter)
  const getAllEventsForView = () => {
    let allEvents = events;
    
    // Filter by date range based on view mode
    const today = new Date();
    switch (viewMode) {
      case 'Day':
        allEvents = events.filter(event => event.date === formatDate(currentDate));
        break;
      case 'Week':
        const weekStart = new Date(currentDate);
        weekStart.setDate(currentDate.getDate() - currentDate.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        allEvents = events.filter(event => {
          const eventDate = new Date(event.date);
          return eventDate >= weekStart && eventDate <= weekEnd;
        });
        break;
      case 'Month':
        allEvents = events.filter(event => {
          const eventDate = new Date(event.date);
          return eventDate.getMonth() === currentDate.getMonth() && 
                 eventDate.getFullYear() === currentDate.getFullYear();
        });
        break;
      case 'Year':
        allEvents = events.filter(event => {
          const eventDate = new Date(event.date);
          return eventDate.getFullYear() === currentDate.getFullYear();
        });
        break;
    }
    
    // Apply job order filter
    if (jobOrderFilter !== 'all') {
      allEvents = allEvents.filter(event => {
        if (!event.isJobOrder) return true;
        return event.status === jobOrderFilter;
      });
    }
    
    // Apply search filter
    if (searchTerm) {
      allEvents = allEvents.filter(event => 
        event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (event.fertilizerName && event.fertilizerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (event.plantName && event.plantName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (event.plantData && event.plantData.plantName && event.plantData.plantName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (event.plantData && event.plantData.name && event.plantData.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (event.plantData && event.plantData.type && event.plantData.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (event.originalEvent && event.originalEvent.message && event.originalEvent.message.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    return allEvents;
  };

  const getTimeSlotIndex = (timeStr) => {
    const time = timeStr.toLowerCase();
    if (time.includes('7') && time.includes('am')) return 0;
    if (time.includes('8') && time.includes('am')) return 1;
    if (time.includes('9') && time.includes('am')) return 2;
    if (time.includes('10') && time.includes('am')) return 3;
    if (time.includes('11') && time.includes('am')) return 4;
    if (time.includes('12') && time.includes('pm')) return 5;
    if (time.includes('1') && time.includes('pm')) return 6;
    if (time.includes('2') && time.includes('pm')) return 7;
    if (time.includes('3') && time.includes('pm')) return 8;
    if (time.includes('4') && time.includes('pm')) return 9;
    if (time.includes('5') && time.includes('pm')) return 10;
    if (time.includes('6') && time.includes('pm')) return 11;
    return 0;
  };

  const navigateView = (direction) => {
    const newDate = new Date(currentDate);
    
    switch (viewMode) {
      case 'Day':
        newDate.setDate(currentDate.getDate() + direction);
        break;
      case 'Week':
        newDate.setDate(currentDate.getDate() + (direction * 7));
        break;
      case 'Month':
        newDate.setMonth(currentDate.getMonth() + direction);
        break;
      case 'Year':
        newDate.setFullYear(currentDate.getFullYear() + direction);
        break;
    }
    
    setCurrentDate(newDate);
  };

  // Get current period string for display
  const getCurrentPeriodString = () => {
    switch (viewMode) {
      case 'Day':
        return currentDate.toLocaleDateString('en-US', { 
          weekday: 'long',
          month: 'long', 
          day: 'numeric', 
          year: 'numeric' 
        });
      case 'Week':
        const weekStart = new Date(currentDate);
        weekStart.setDate(currentDate.getDate() - currentDate.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      case 'Month':
        return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      case 'Year':
        return currentDate.getFullYear().toString();
      default:
        return currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
  };

  const getUpcomingEvents = () => {
    const upcoming = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let filteredEvents = events.filter(event => {
const eventDate = new Date(event.date);
eventDate.setHours(0, 0, 0, 0);
return eventDate >= today;
});
// Apply job order filter to upcoming events
if (jobOrderFilter !== 'all') {
  filteredEvents = filteredEvents.filter(event => {
    if (!event.isJobOrder) return true;
    return event.status === jobOrderFilter;
  });
}


filteredEvents.forEach(event => {
  const eventDate = new Date(event.date);
  const dateKey = eventDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric'
  });

  if (!upcoming[dateKey]) {
    upcoming[dateKey] = [];
  }
  upcoming[dateKey].push(event);
});

return upcoming;
};
const upcomingEvents = getUpcomingEvents();
// Get current month and year for mini calendar
const getCurrentMonthYear = () => {
return {
month: currentDate.toLocaleDateString('en-US', { month: 'long' }),
year: currentDate.getFullYear()
};
};
const { month, year } = getCurrentMonthYear();
// Get job order statistics
const getJobOrderStats = () => {
const jobOrders = events.filter(e => e.isJobOrder);
return {
total: jobOrders.length,
pending: jobOrders.filter(e => e.status === 'pending').length,
inProgress: jobOrders.filter(e => e.status === 'in-progress').length,
completed: jobOrders.filter(e => e.status === 'completed').length
};
};
const jobOrderStats = getJobOrderStats();
return (
<div className="fc-main-layout">
<FarmerSidebar 
activeMenu={activeMenu}
setActiveMenu={setActiveMenu} 
userType={userRole}
/>
  <div className="fc-container">
    <div className="fc-header">
      <h1 className="fc-greeting">Hello, {userName || 'Farmer'}</h1>

      <div className="fc-header-actions">
        <div className="fc-search-container">
          <input
            type="text"
            placeholder="Search activities..."
            className="fc-search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <span className="fc-search-icon">🔍</span>
        </div>

        <div className="fc-notification">
          <span className="fc-notification-icon">🔔</span>
          {jobOrderStats.pending > 0 && (
            <span className="fc-notification-badge">{jobOrderStats.pending}</span>
          )}
        </div>
      </div>
    </div>

    {/* Calendar */}
    <div className="fc-calendar-wrapper">
        <div className="fc-calendar-controls">
          <div className="fc-nav-controls">
            <button className="fc-nav-btn" onClick={() => navigateView(-1)}>&lt;</button>
            <button className="fc-today-btn" onClick={goToToday}>Today</button>
            <span className="fc-current-period">{getCurrentPeriodString()}</span>
            <button className="fc-nav-btn" onClick={() => navigateView(1)}>&gt;</button>
          </div>

          <div className="fc-view-controls">
            <button
              className={`fc-view-btn ${viewMode === 'Month' ? 'active' : ''}`}
              onClick={() => setViewMode('Month')}
            >
              <FaCalendarAlt style={{ marginRight: '6px' }} />
              Month
            </button>
            <button
              className={`fc-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <FaThList style={{ marginRight: '6px' }} />
              List
            </button>
          </div>
          {/* Job Order Filter */}
          <div className="fc-job-filter">
            <select 
              value={jobOrderFilter} 
              onChange={(e) => setJobOrderFilter(e.target.value)}
              className="fc-filter-select"
            >
              <option value="all">All Activities</option>
              <option value="pending">Pending Jobs ({jobOrderStats.pending})</option>
              <option value="in-progress">In Progress ({jobOrderStats.inProgress})</option>
              <option value="completed">Completed ({jobOrderStats.completed})</option>
            </select>
          </div>

          {loading && (
            <div className="fc-loading-indicator">
              Loading activities...
            </div>
          )}
        </div>

      <div className="fc-main-content">
        <div className="fc-calendar-section">
          {viewMode === 'list' ? (
            // List View (keep existing renderListView())
            renderListView()
          ) : (
            // Month View (Admin-style)
            <>
              <div className="fc-calendar-navigation">
                <button className="fc-nav-btn" onClick={() => navigateView(-1)}>
                  <FaChevronLeft style={{ marginRight: '6px' }} />
                  Previous
                </button>
                <button className="fc-today-btn" onClick={goToToday}>
                  Today
                </button>
                <h2 className="fc-month-title">{getCurrentPeriodString()}</h2>
                <button className="fc-nav-btn" onClick={() => navigateView(1)}>
                  Next
                  <FaChevronRight style={{ marginLeft: '6px' }} />
                </button>
              </div>

              <div className="fc-calendar-grid-container">
                <div className="fc-calendar-weekdays">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="fc-weekday">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="fc-calendar-grid">
                  {renderCalendarGrid()}
                </div>
              </div>

              <div className="fc-calendar-legend">
                <div className="fc-legend-title">Event Status:</div>
                {Object.entries(statusColors).slice(0, 4).map(([status, color]) => (
                  <div key={status} className="fc-legend-item">
                    <div className="fc-legend-color" style={{ background: color }} />
                    <span className="fc-legend-label">{status}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        {/* Right Sidebar */}
        <div className="fc-right-sidebar">
          {/* Job Order Stats */}
          <div className="fc-job-stats">
            <h3>Job Orders</h3>
            <div className="fc-stats-grid">
              <div className="fc-stat-item pending">
                <div className="fc-stat-number">{jobOrderStats.pending}</div>
                <div className="fc-stat-label">Pending</div>
              </div>
              <div className="fc-stat-item in-progress">
                <div className="fc-stat-number">{jobOrderStats.inProgress}</div>
                <div className="fc-stat-label">In Progress</div>
              </div>
              <div className="fc-stat-item completed">
                <div className="fc-stat-number">{jobOrderStats.completed}</div>
                <div className="fc-stat-label">Completed</div>
              </div>
            </div>
          </div>

          {/* Upcoming Events */}
          <div className="fc-upcoming-events">
            <h3>Upcoming Activities</h3>

            <div className="fc-upcoming-events-content">
              {Object.entries(upcomingEvents).slice(0, 4).map(([date, dayEvents]) => (
                <div key={date} className="fc-event-group">
                  <div className="fc-event-date">
                    {new Date(dayEvents[0].date).toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'numeric', 
                      day: 'numeric' 
                    })}
                  </div>

                  {dayEvents.slice(0, 3).map(event => {
                    const typeConfig = getEventTypeConfig(event.eventType || event.type);
                    const isJobOrder = event.isJobOrder;
                    const canStart = isJobOrder ? canStartJobOrder(event.date) : true;
                    const lockStatus = getLockStatus(event.date);
                    
                    return (
                      <div 
                        key={event.id} 
                        className={`fc-upcoming-event ${isJobOrder ? 'job-order' : ''} ${!canStart ? 'locked' : ''}`}
                        onClick={() => {
                          if (!canStart) {
                            showCustomAlert(
                              'warning',
                              '🔒 Job Locked',
                              `This job is scheduled for ${new Date(event.date).toLocaleDateString()}`,
                              [{ label: 'Status', value: lockStatus.message }],
                              { confirmText: 'OK' }
                            );
                            return;
                          }
                          setSelectedEvent(event);
                          setShowDetailsModal(true);
                        }}
                        style={{ opacity: !canStart ? 0.7 : 1 }}
                      >
                        <div className="fc-event-indicator" style={{ 
                          backgroundColor: !canStart ? '#94a3b8' : typeConfig.color 
                        }}>
                          {!canStart ? <FaLock /> : typeConfig.icon}
                        </div>

                        <div className="fc-event-details">
                          <div className="fc-event-time-range">
                            {!canStart && '🔒 '}
                            {isJobOrder}
                            {event.time}
                          </div>

                          <div className="fc-event-description">
                            {event.title}
                            {!canStart && <span className="fc-lock-badge"> (Locked)</span>}
                          </div>

                          <div className="fc-event-type">
                            {isJobOrder ? (
                              <span className={`fc-status-badge ${!canStart ? 'locked' : event.status}`}>
                                {!canStart ? 'locked' : event.status}
                              </span>
                            ) : (
                              <span className="fc-type-badge">{typeConfig.label}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {dayEvents.length > 3 && (
                    <div className="fc-more-events">
                      +{dayEvents.length - 3} more activities
                    </div>
                  )}
                </div>
              ))}

              {Object.keys(upcomingEvents).length === 0 && (
                <div className="fc-no-events">
                  No upcoming activities scheduled
                </div>
              )}
            </div>
          </div>


          {/* Event Type Legend */}
          <div className="fc-event-types-legend">
            <h3>Event Types</h3>
            <div className="fc-legend-grid">
              {eventTypes.slice(0, 6).map(type => (
                <div key={type.value} className="fc-legend-type">
                  <span className="fc-legend-type-icon" style={{ color: type.color }}>
                    {type.icon}
                  </span>
                  <span className="fc-legend-type-label">{type.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Event Details Modal */}
    {selectedEvent && (
      <div className="fc-modal-overlay" onClick={() => setSelectedEvent(null)}>
        <div className="fc-modal" onClick={(e) => e.stopPropagation()}>
          <div className="fc-modal-header">
            <h3>
              {selectedEvent.isJobOrder}
              {selectedEvent.title}
            </h3>
            <button className="fc-modal-close" onClick={() => setSelectedEvent(null)}>×</button>
          </div>
          <div className="fc-modal-body">
            <p><strong>Time:</strong> {selectedEvent.time}</p>
            <p><strong>Date:</strong> {new Date(selectedEvent.date).toLocaleDateString()}</p>
            
            {selectedEvent.isJobOrder ? (
              <>

              <div className="fc-date-check">
                <p><strong>Scheduled Date:</strong> {new Date(selectedEvent.date).toLocaleDateString('en-US', { 
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}</p>
                
                {!canStartJobOrder(selectedEvent.date) && (
                  <div className="fc-lock-notice" style={{
                    background: '#fffbeb',
                    border: '1px solid #f59e0b',
                    borderRadius: '6px',
                    padding: '12px',
                    margin: '10px 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <FaLock style={{ color: '#f59e0b', fontSize: '1.2em' }} />
                    <div>
                      <strong>Job Locked</strong>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.9em', color: '#666' }}>
                        This job can only be started on or after its scheduled date.
                        {getLockStatus(selectedEvent.date).message && ` ${getLockStatus(selectedEvent.date).message}`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
                <p>
                  <strong>Status:</strong> 
                  <span className={`fc-modal-status-badge ${selectedEvent.status}`}>
                    {selectedEvent.status}
                  </span>
                </p>
                <p><strong>Priority:</strong> {selectedEvent.priority}</p>
                <p><strong>NPK Range:</strong> {selectedEvent.npkRatio}</p>
                <p><strong>Fertilizer:</strong> {selectedEvent.fertilizerBags}</p>
                <p><strong>Amount:</strong> {selectedEvent.fertilizerAmount}</p>
                <p><strong>Method:</strong> {selectedEvent.applicationMethod}</p>
                {selectedEvent.applicationNumber && (
                  <p><strong>Application:</strong> {selectedEvent.applicationNumber} of {selectedEvent.totalApplications}</p>
                )}
                <p><strong>Plant:</strong> {selectedEvent.plantName}</p>
                {selectedEvent.plotNumber && (
                  <p><strong>Plot:</strong> Plot {selectedEvent.plotNumber}</p>
                )}
                {selectedEvent.inventoryLogged && (
                  <div className="fc-modal-note success">
                    ✅ <strong>Logged to Inventory</strong>
                  </div>
                )}
                {selectedEvent.originalEvent && selectedEvent.originalEvent.expectedResult && (
                  <div className="fc-modal-note success">
                    <strong>Expected Result:</strong> {selectedEvent.originalEvent.expectedResult}
                  </div>
                )}
                
                {selectedEvent.status === 'pending' && (
                  <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                    {canStartJobOrder(selectedEvent.date) ? (
                      <button
                        onClick={async () => {
                          try {
                            const jobId = selectedEvent.jobOrderId || selectedEvent.id.replace('joborder-', '');
                            await updateJobOrderStatus(jobId, 'in-progress');
                            setSelectedEvent(null);
                            showCustomAlert(
                              'success',
                              'Job Started',
                              'The job order has been started successfully!',
                              null,
                              { confirmText: 'OK' }
                            );
                          } catch (error) {
                            showCustomAlert(
                              'error',
                              'Start Failed',
                              `Failed to start job order: ${error.message}`,
                              null,
                              { confirmText: 'OK' }
                            );
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '10px 16px',
                          background: '#f59e0b',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.9em',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        <FaUnlock style={{ marginRight: '6px' }} />
                        Start Job
                      </button>
                    ) : (
                      <button
                        disabled
                        style={{
                          flex: 1,
                          padding: '10px 16px',
                          background: '#94a3b8',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.9em',
                          fontWeight: '600',
                          cursor: 'not-allowed',
                          opacity: 0.7
                        }}
                      >
                        <FaLock style={{ marginRight: '6px' }} />
                        Locked Until {new Date(selectedEvent.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </button>
                    )}
                    
                    {/* Cancel button remains unchanged */}
                    <button
                      onClick={() => {
                        showCustomAlert(
                          'warning',
                          'Cancel Job Order',
                          'Are you sure you want to cancel this job order? This action cannot be undone.',
                          null,
                          {
                            showCancel: true,
                            confirmText: 'Yes, Cancel',
                            cancelText: 'No, Keep It',
                            onConfirm: async () => {
                              try {
                                const jobId = selectedEvent.jobOrderId || selectedEvent.id.replace('joborder-', '');
                                const jobOrderManager = new JobOrderManager(userId, userName  || 'Farmer User');
                                await jobOrderManager.cancelJobOrder(jobId, 'Cancelled by user');
                                await fetchEvents();
                                setSelectedEvent(null);
                                showCustomAlert(
                                  'success',
                                  'Job Cancelled',
                                  'The job order has been cancelled successfully.',
                                  null,
                                  { confirmText: 'OK' }
                                );
                              } catch (error) {
                                showCustomAlert(
                                  'error',
                                  'Cancellation Failed',
                                  `Failed to cancel job order: ${error.message}`,
                                  null,
                                  { confirmText: 'OK' }
                                );
                              }
                            }
                          }
                        );
                      }}
                      style={{
                        padding: '10px 16px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.9em',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      ❌ Cancel
                    </button>
                  </div>
                )}
                
                {selectedEvent.status === 'in-progress' && (
                  <div style={{ marginTop: '20px' }}>
                    <button
                      onClick={() => {
                      const notes = prompt('Add completion notes (optional):');
                      if (notes !== null) {
                        showCustomAlert(
                          'info',
                          'Complete Job Order',
                          'Are you sure you want to mark this job as completed? This will log the fertilizer usage to inventory.',
                          notes ? [{ label: 'Notes', value: notes }] : null,
                          {
                            showCancel: true,
                            confirmText: 'Complete Job',
                            cancelText: 'Cancel',
                            onConfirm: async () => {
                              try {
                                const jobId = selectedEvent.jobOrderId || selectedEvent.id.replace('joborder-', '');
                                await completeJobOrder(jobId, notes);
                                setSelectedEvent(null);
                                showCustomAlert(
                                  'success',
                                  'Job Completed',
                                  'Job completed successfully and logged to inventory!',
                                  [
                                    { label: 'Status', value: 'Completed' },
                                    { label: 'Inventory', value: 'Updated' }
                                  ],
                                  { confirmText: 'OK' }
                                );
                              } catch (error) {
                                console.error('Complete error:', error);
                              }
                            }
                          }
                        );
                      }
                    }}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.95em',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      ✅ Mark as Completed & Log to Inventory
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <p><strong>Type:</strong> {selectedEvent.type}</p>
                {selectedEvent.plantData && (
                  <>
                    <p><strong>Plant:</strong> {selectedEvent.plantData.plantName || selectedEvent.plantData.name || selectedEvent.plantData.type}</p>
                    <p><strong>Location:</strong> {selectedEvent.plantData.locationZone || 'Not specified'}</p>
                    <p><strong>Status:</strong> {selectedEvent.plantData.status || 'Unknown'}</p>
                  </>
                )}
                {selectedEvent.originalEvent && selectedEvent.originalEvent.message && (
                  <p><strong>Details:</strong> {selectedEvent.originalEvent.message}</p>
                )}
              </>
            )}

            
          </div>
        </div>
      </div>
    )}
    {customAlert.show && (
        <div className="custom-alert-overlay" onClick={handleAlertCancel}>
          <div 
            className={`custom-alert-modal ${customAlert.type}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="custom-alert-header">
              <div className="custom-alert-icon">
                {customAlert.type === 'success' && '✅'}
                {customAlert.type === 'error' && '❌'}
                {customAlert.type === 'warning' && '⚠️'}
                {customAlert.type === 'info' && 'ℹ️'}
              </div>
              <div className="custom-alert-content">
                <h3 className="custom-alert-title">{customAlert.title}</h3>
                <p className="custom-alert-message">{customAlert.message}</p>
              </div>
            </div>

            {customAlert.details && customAlert.details.length > 0 && (
              <div className="custom-alert-details">
                {customAlert.details.map((detail, index) => (
                  <div key={index} className="alert-detail-item">
                    <span className="alert-detail-label">{detail.label}:</span>
                    <span className="alert-detail-value">{detail.value}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="custom-alert-footer">
              {customAlert.showCancel && (
                <button 
                  className="custom-alert-btn custom-alert-btn-cancel"
                  onClick={handleAlertCancel}
                >
                  {customAlert.cancelText}
                </button>
              )}
              <button 
                className={`custom-alert-btn ${
                  customAlert.type === 'success' ? 'custom-alert-btn-success' :
                  customAlert.type === 'error' ? 'custom-alert-btn-danger' :
                  customAlert.type === 'warning' ? 'custom-alert-btn-danger' :
                  'custom-alert-btn-primary'
                }`}
                onClick={handleAlertConfirm}
              />
                {customAlert.confirmText}
                </div>
            </div>
      </div>
    )}
  </div>
</div>
);
};

export default FarmerCalendar;