import React, { useState, useEffect } from 'react';
import FarmerSidebar from './farmersidebar';
import './farmercalendar.css';
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, deleteDoc, serverTimestamp, query, where, orderB } from 'firebase/firestore';
import { db } from '../firebase';
import inventoryLogger from "../functions/inventoryLogger";

import { 
  FaSeedling, FaLeaf, FaTint, FaBug, FaCut, FaCarrot, FaTools, FaEye, 
  FaClipboardList, FaCalendarAlt, FaClock, FaPlus, FaEdit, FaTrash, FaTimes,
  FaChevronLeft, FaChevronRight, FaThList, FaCalendarDay
} from 'react-icons/fa';
import { GiPlantSeed, GiWateringCan, GiFertilizerBag, GiGrass } from 'react-icons/gi';



const FarmerCalendar = () => {
  const [activeMenu, setActiveMenu] = useState('Calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('Week'); // Day, Week, Month, Year
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jobOrderFilter, setJobOrderFilter] = useState('all'); // all, pending, in-progress, completed
  const userId = 'farmer-user-id'; // Replace with actual user ID from auth
  
  const [showEventModal, setShowEventModal] = useState(false); // Add this
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
            return (
              <div
                key={event.id}
                className={`fc-event-item ${event.isJobOrder ? 'job-order' : ''}`}
                style={{ 
                  background: statusColors[event.status] || statusColors.info,
                  borderLeft: `4px solid ${typeConfig.color}`
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedEvent(event);
                  setShowDetailsModal(true);
                }}
                title={event.title}
              >
                <span className="fc-event-icon">{typeConfig.icon}</span>
                {event.isJobOrder && <FaClipboardList className="fc-job-badge" />}
                <span className="fc-event-text">
                  {event.title.substring(0, 20)}
                  {event.title.length > 20 ? '...' : ''}
                </span>
              </div>
            );
          })}
          {dayEvents.length > 3 && (
            <div className="fc-more-events">+{dayEvents.length - 3} more</div>
          )}
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
              return (
                <div
                  key={event.id}
                  className={`fc-event-list-item ${event.isJobOrder ? 'job-order' : ''}`}
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
                        {event.isJobOrder && '📋 '}
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
                        {event.isJobOrder && '📋 '}
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

  const convertFertilizerToPlotSize = (bagsPerHa, plotSizeM2) => {
    const hectareInM2 = 10000;
    const bagsForPlot = (bagsPerHa * plotSizeM2) / hectareInM2;
    return bagsForPlot.toFixed(2);
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
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : 
                    data.scheduledDate ? new Date(data.scheduledDate) :
                    data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null
        };
      });
      
      const jobOrderEvents = jobOrdersSnapshot.docs.map(doc => {
        const data = doc.data();
        const scheduledDate = data.scheduledDate ? new Date(data.scheduledDate) : new Date();
        
        return {
          id: `joborder-${doc.id}`,
          jobOrderId: doc.id,
          title: data.title,
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
          fertilizerAmount: data.fertilizerAmountForPlot || data.fertilizerAmount,
          applicationMethod: data.applicationMethod,
          applicationNumber: data.applicationNumber,
          totalApplications: data.totalApplications,
          plantId: data.plantId,
          plantName: data.plantName,
          plotNumber: data.plotNumber,
          inventoryLogged: data.inventoryLogged || false
        };
      });
      
      const calendarEvents = eventsData.map(event => {
        const eventDate = event.type === 'FERTILIZER_JOB_ORDER' && event.scheduledDate 
          ? event.scheduledDate 
          : (event.timestamp || event.createdAt);

        const isJobOrder = event.type === 'FERTILIZER_JOB_ORDER';
        
        return {
          id: `event-${event.id}`,
          jobOrderId: event.jobOrderId,
          title: isJobOrder ? event.title : (event.message || `${event.type} - ${event.status}`),
          time: eventDate.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          }),
          date: eventDate.toISOString().split('T')[0],
          type: isJobOrder ? 'job-order' : 'event',
          eventType: event.type,
          color: getEventColor(event.type, event.status),
          originalEvent: event,
          status: event.status || 'info',
          priority: event.priority || 'medium',
          isJobOrder: isJobOrder,
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
      const isEventId = jobOrderId.startsWith('event-');
      const isJobOrderPrefix = jobOrderId.startsWith('joborder-');
      
      let actualJobOrderId = jobOrderId;
      if (isJobOrderPrefix) {
        actualJobOrderId = jobOrderId.replace('joborder-', '');
      }
      
      if (isEventId) {
        const eventRef = doc(db, 'events', jobOrderId.replace('event-', ''));
        const updateData = {
          status: status,
          updatedAt: serverTimestamp(),
          updatedBy: userId
        };
        
        if (status === 'in-progress') {
          updateData.startedAt = serverTimestamp();
          updateData.startedBy = userId;
        }
        
        await updateDoc(eventRef, updateData);
      } else {
        // New job order system
        const jobOrderRef = doc(db, 'jobOrders', actualJobOrderId);
        const updateData = {
          status: status,
          updatedAt: serverTimestamp(),
          updatedBy: userId
        };
        
        if (status === 'in-progress') {
          updateData.startedAt = serverTimestamp();
          updateData.startedBy = userId;
        }
        
        await updateDoc(jobOrderRef, updateData);
        
        // Also update corresponding event
        const eventsQuery = query(
          collection(db, 'events'),
          where('jobOrderId', '==', actualJobOrderId)
        );
        const eventsSnapshot = await getDocs(eventsQuery);
        
        for (const eventDoc of eventsSnapshot.docs) {
          await updateDoc(eventDoc.ref, updateData);
        }
      }
      
      // Refresh events
      await fetchEvents();
      
      console.log(`✅ Job order ${jobOrderId} status updated to ${status}`);
      return true;
    } catch (error) {
      console.error('Error updating job order status:', error);
      throw error;
    }
  };

  // New function to log the financial expense to Firestore
// Function to log the financial expense to the 'plantExpenses' collection
const logFertilizerExpense = async (event, quantityBags, costPerBag, plantData, userId) => {
    if (!event || !event.plantId || !quantityBags || !costPerBag) {
        console.warn("Cannot log expense: Missing event data, quantity, or cost.");
        return;
    }

    const totalCost = quantityBags * costPerBag;

    const expenseData = {
        // Use fallbacks for plant details
        plantId: event.plantId,
        plantName: plantData?.plantName || plantData?.name || 'N/A',
        date: serverTimestamp(),
        category: 'Fertilizer', // Explicitly set the category for production.jsx
        description: `Used ${quantityBags.toFixed(2)} bags (${costPerBag.toFixed(2)}/bag) for task: ${event.title}`,
        amount: totalCost,
        vendor: 'Internal Inventory Withdrawal', 
        paymentMethod: 'Internal',
        user: userId, 
        createdAt: serverTimestamp(),
    };

    try {
        await addDoc(collection(db, 'plantExpenses'), expenseData);
        console.log(`Successfully logged ₱${totalCost.toFixed(2)} fertilizer expense for Plant ID: ${event.plantId}`);
    } catch (error) {
        console.error("Error logging fertilizer expense:", error);
        // Do not use 'alert' here, let the main handler manage user feedback
    }
};

// NEW: Function to handle the button click and log the expense
const handleCompleteTask = async () => {
    if (!selectedEvent || selectedEvent.type !== 'fertilization') return;

    const eventRef = doc(db, 'calendarEvents', selectedEvent.id);
    
    try {
        // 1. Mark the calendar event as completed
        await updateDoc(eventRef, {
            status: 'completed',
            completedAt: serverTimestamp(),
            completedBy: userId,
        });

        // 2. Calculate quantity used (existing logic)
        const quantityUsed = convertFertilizerToPlotSize(
            selectedEvent.bagsPerHa, 
            selectedEvent.plantData.areaOccupiedSqM
        );
        
        // 3. Get the cost of the fertilizer (using the placeholder utility)
        // In a real app, 'selectedEvent.fertilizerType' would be used here.
        const costPerBag = getFertilizerUnitCost(selectedEvent.fertilizerType); 

        // 4. Log the quantity consumed to Inventory (Existing inventoryLogger logic)
        // NOTE: This call relies on the imported inventoryLogger function
        await inventoryLogger(
            selectedEvent.inventoryItem || 'Fertilizer-Standard', // Item Key
            parseFloat(quantityUsed),
            'consumed'
        ); 

        // 5. NEW: Log the financial expense to plantExpenses
        if (costPerBag > 0) {
             await logFertilizerExpense(
                selectedEvent, 
                parseFloat(quantityUsed), 
                costPerBag, 
                selectedEvent.plantData, 
                userId
            );
        }

        alert('✅ Task completed and expenses/inventory successfully logged!'); // Update feedback
        
        // Close modal and refresh data
        setSelectedEvent(null);
        fetchEvents(); 

    } catch (error) {
        console.error('Error completing task and logging expense:', error);
        alert('❌ Error completing task. Check console for details.');
    }
};

  // Helper function to cancel a job order
  const cancelJobOrder = async (jobOrderId, reason = '') => {
    try {
      const isEventId = jobOrderId.startsWith('event-');
      const isJobOrderPrefix = jobOrderId.startsWith('joborder-');
      
      let actualJobOrderId = jobOrderId;
      if (isJobOrderPrefix) {
        actualJobOrderId = jobOrderId.replace('joborder-', '');
      }
      
      if (isEventId) {
        // Old event-based system
        const eventRef = doc(db, 'events', jobOrderId.replace('event-', ''));
        await updateDoc(eventRef, {
          status: 'cancelled',
          cancelledAt: serverTimestamp(),
          cancelledBy: userId,
          cancellationReason: reason,
          updatedAt: serverTimestamp()
        });
      } else {
        // New job order system
        const jobOrderRef = doc(db, 'jobOrders', actualJobOrderId);
        await updateDoc(jobOrderRef, {
          status: 'cancelled',
          cancelledAt: serverTimestamp(),
          cancelledBy: userId,
          cancellationReason: reason,
          updatedAt: serverTimestamp()
        });
        
        // Also update corresponding event
        const eventsQuery = query(
          collection(db, 'events'),
          where('jobOrderId', '==', actualJobOrderId)
        );
        const eventsSnapshot = await getDocs(eventsQuery);
        
        for (const eventDoc of eventsSnapshot.docs) {
          await updateDoc(eventDoc.ref, {
            status: 'cancelled',
            cancelledAt: serverTimestamp(),
            cancelledBy: userId,
            cancellationReason: reason,
            updatedAt: serverTimestamp()
          });
        }
      }
      
      // Refresh events
      await fetchEvents();
      
      console.log(`❌ Job order ${jobOrderId} cancelled`);
      return true;
    } catch (error) {
      console.error('Error cancelling job order:', error);
      throw error;
    }
  };


  
  // Complete job order and log to inventory
  const completeJobOrder = async (jobOrderId, notes = '') => {
    try {
      const isJobOrderPrefix = jobOrderId.startsWith('joborder-');
      let actualJobOrderId = jobOrderId;
      if (isJobOrderPrefix) {
        actualJobOrderId = jobOrderId.replace('joborder-', '');
      }

      // Update in jobOrders collection
      const jobOrderRef = doc(db, 'jobOrders', actualJobOrderId);
      const jobOrderDoc = await getDoc(jobOrderRef);
      
      if (!jobOrderDoc.exists()) {
        throw new Error('Job order not found');
      }
      
      const jobOrderData = jobOrderDoc.data();
      
      // Log fertilizer usage to inventory
      let inventoryLogId = null;
      
      if (jobOrderData.fertilizerBagsForPlot && !jobOrderData.inventoryLogged) {
        try {
          // Find matching fertilizer in inventory
          const inventorySnapshot = await getDocs(collection(db, 'inventory'));
          const inventoryItems = inventorySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          // Try to match fertilizer by NPK ratio or name
          const matchingFertilizer = inventoryItems.find(item => 
            item.category?.toLowerCase() === 'fertilizer' && 
            (item.name.toLowerCase().includes(jobOrderData.npkRatio.toLowerCase()) ||
             item.name.toLowerCase().includes('npk'))
          );
          
          if (matchingFertilizer) {
            // Calculate total bags used
            const totalBagsUsed = Object.values(jobOrderData.fertilizerBagsForPlot)
              .reduce((sum, bags) => sum + parseFloat(bags), 0);
            
            const previousStock = matchingFertilizer.stock || matchingFertilizer.packs || 0;
            const newStock = Math.max(0, previousStock - totalBagsUsed);
            
            // Update inventory
            const inventoryRef = doc(db, 'inventory', matchingFertilizer.id);
            await updateDoc(inventoryRef, {
              stock: newStock,
              packs: newStock,
              updatedAt: serverTimestamp(),
              lastUsed: serverTimestamp()
            });
            
            // Log the usage
            inventoryLogId = await inventoryLogger.createLog(
              matchingFertilizer.id,
              'USE',
              {
                previousQuantity: previousStock,
                newQuantity: newStock,
                quantityChange: -totalBagsUsed,
                previousPacks: previousStock,
                newPacks: newStock,
                reason: `Applied ${totalBagsUsed.toFixed(2)} bags of ${jobOrderData.fertilizerName} - ${jobOrderData.title}`,
                itemName: matchingFertilizer.name,
                category: matchingFertilizer.category || 'Fertilizer',
                plantId: jobOrderData.plantId,
                plantName: jobOrderData.plantName,
                notes: `${jobOrderData.description}. Application ${jobOrderData.applicationNumber} of ${jobOrderData.totalApplications}. ${notes || ''}`
              },
              userId,
              'Farmer'
            );
            
            console.log(`✅ Logged fertilizer usage to inventory: ${totalBagsUsed.toFixed(2)} bags`);
          } else {
            console.warn(`⚠️ No matching fertilizer found in inventory for ${jobOrderData.fertilizerName}`);
          }
        } catch (error) {
          console.error('Error logging fertilizer to inventory:', error);
          // Continue even if inventory logging fails
        }
      }
      
      // Update job order
      await updateDoc(jobOrderRef, {
        status: 'completed',
        completedAt: serverTimestamp(),
        completedBy: userId,
        appliedAt: serverTimestamp(),
        appliedBy: userId,
        notes: notes,
        updatedAt: serverTimestamp(),
        inventoryLogged: inventoryLogId ? true : false,
        inventoryLogId: inventoryLogId
      });
      
      // Update corresponding event if exists
      const eventsQuery = query(
        collection(db, 'events'),
        where('jobOrderId', '==', actualJobOrderId)
      );
      const eventsSnapshot = await getDocs(eventsQuery);
      
      for (const eventDoc of eventsSnapshot.docs) {
        await updateDoc(eventDoc.ref, {
          status: 'completed',
          completedAt: serverTimestamp(),
          completedBy: userId,
          notes: notes,
          updatedAt: serverTimestamp()
        });
      }
      
      // Create completion event
      await addDoc(collection(db, 'events'), {
        plantId: jobOrderData.plantId,
        type: 'FERTILIZER_APPLIED',
        status: 'success',
        message: `Fertilizer applied: ${jobOrderData.fertilizerName} - ${jobOrderData.title}`,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        userId: userId,
        details: {
          jobOrderId: actualJobOrderId,
          fertilizerName: jobOrderData.fertilizerName,
          amount: jobOrderData.fertilizerAmountForPlot,
          applicationNumber: jobOrderData.applicationNumber,
          totalApplications: jobOrderData.totalApplications,
          notes: notes,
          inventoryLogged: inventoryLogId ? true : false
        }
      });
      
      // Refresh events
      await fetchEvents();
      
      console.log(`✅ Job order ${jobOrderId} marked as completed and logged to inventory`);
      return true;
    } catch (error) {
      console.error('Error completing job order:', error);
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
<FarmerSidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} />
  <div className="fc-container">
    {/* Header */}
    <div className="fc-header">
      <h1 className="fc-greeting">Hello, Farmer!</h1>

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
            <h3>📋 Job Orders</h3>
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

          {/* Mini Calendar */}
          <div className="fc-mini-calendar">
            <div className="fc-mini-header">
              <button className="fc-mini-nav" onClick={() => navigateView(-1)}>&lt;</button>
              <span className="fc-mini-title">{month} <span className="fc-year">{year}</span></span>
              <button className="fc-mini-nav" onClick={() => navigateView(1)}>&gt;</button>
            </div>

            <div className="fc-mini-grid">
              <div className="fc-mini-days">
                {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                  <div key={day} className="fc-mini-day-header">{day}</div>
                ))}
              </div>
              <div className="fc-mini-dates">
                {Array.from({ length: 35 }, (_, i) => {
                  const firstDay = new Date(year, currentDate.getMonth(), 1);
                  const startDate = new Date(firstDay);
                  startDate.setDate(startDate.getDate() - firstDay.getDay());
                  
                  const cellDate = new Date(startDate);
                  cellDate.setDate(startDate.getDate() + i);
                  
                  const isCurrentMonth = cellDate.getMonth() === currentDate.getMonth();
                  const isToday = cellDate.toDateString() === new Date().toDateString();
                  const hasEvents = events.some(event => event.date === formatDate(cellDate));
                  const hasJobOrders = events.some(event => event.date === formatDate(cellDate) && event.isJobOrder);

                  return (
                    <div
                      key={i}
                      className={`fc-mini-date ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${hasEvents ? 'has-events' : ''} ${hasJobOrders ? 'has-jobs' : ''}`}
                      onClick={() => {
                        setCurrentDate(cellDate);
                        setViewMode('Day');
                      }}
                    >
                      {cellDate.getDate()}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="fc-today-info">
              <div className="fc-today-label">TODAY {new Date().toLocaleDateString()}</div>
              <div className="fc-stats">{events.length} Activities Scheduled</div>
            </div>
          </div>

          {/* Upcoming Events */}
          <div className="fc-upcoming-events">
            <h3>Upcoming Activities</h3>
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
                  return (
                    <div 
                      key={event.id} 
                      className={`fc-upcoming-event ${event.isJobOrder ? 'job-order' : ''}`}
                      onClick={() => {
                        setSelectedEvent(event);
                        setShowDetailsModal(true);
                      }}
                    >
                      <div className="fc-event-indicator" style={{ backgroundColor: typeConfig.color }}>
                        {typeConfig.icon}
                      </div>
                      <div className="fc-event-details">
                        <div className="fc-event-time-range">
                          {event.isJobOrder && '📋 '}
                          {event.time}
                        </div>
                        <div className="fc-event-description">{event.title}</div>
                        <div className="fc-event-type">
                          {event.isJobOrder ? (
                            <span className={`fc-status-badge ${event.status}`}>
                              {event.status}
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
              {selectedEvent.isJobOrder && '📋 '}
              {selectedEvent.title}
            </h3>
            <button className="fc-modal-close" onClick={() => setSelectedEvent(null)}>×</button>
          </div>
          <div className="fc-modal-body">
            <p><strong>Time:</strong> {selectedEvent.time}</p>
            <p><strong>Date:</strong> {new Date(selectedEvent.date).toLocaleDateString()}</p>
            
            {selectedEvent.isJobOrder ? (
              <>
                <p>
                  <strong>Status:</strong> 
                  <span className={`fc-modal-status-badge ${selectedEvent.status}`}>
                    {selectedEvent.status}
                  </span>
                </p>
                <p><strong>Priority:</strong> {selectedEvent.priority}</p>
                <p><strong>Fertilizer:</strong> {selectedEvent.fertilizerName}</p>
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
                
                {/* Action Buttons */}
                {selectedEvent.status === 'pending' && (
                  <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                    <button
                      onClick={async () => {
                        try {
                          await updateJobOrderStatus(selectedEvent.jobOrderId || selectedEvent.id, 'in-progress');
                          setSelectedEvent(null);
                          alert('Job order started!');
                        } catch (error) {
                          alert('Failed to start job order: ' + error.message);
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
                      ▶️ Start Job
                    </button>
                    <button
                      onClick={async () => {
                        if (window.confirm('Are you sure you want to cancel this job order?')) {
                          try {
                            await cancelJobOrder(selectedEvent.jobOrderId || selectedEvent.id, 'Cancelled by user');
                            setSelectedEvent(null);
                            alert('Job order cancelled!');
                          } catch (error) {
                            alert('Failed to cancel job order: ' + error.message);
                          }
                        }
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
                      onClick={async () => {
                        const notes = prompt('Add completion notes (optional):');
                        if (notes !== null) {
                          try {
                            await completeJobOrder(selectedEvent.jobOrderId || selectedEvent.id, notes);
                            setSelectedEvent(null);
                            onClick={handleCompleteTask}
                            alert('✅ Job completed and logged to inventory!');
                          } catch (error) {
                            alert('Failed to complete job order: ' + error.message);
                          }
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
  </div>
</div>
);
};

export default FarmerCalendar;