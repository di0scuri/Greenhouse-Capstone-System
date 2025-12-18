import React, { useState, useEffect } from 'react'
import Sidebar from './sidebar'
import './admincalendar.css'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { 
  FaSeedling, FaLeaf, FaTint, FaBug, FaCut, FaCarrot, FaTools, FaEye, 
  FaClipboardList, FaCalendarAlt, FaClock, FaPlus, FaEdit, FaTrash, FaTimes,
  FaChevronLeft, FaChevronRight, FaThList, FaCalendarDay
} from 'react-icons/fa'
import { GiPlantSeed, GiWateringCan, GiFertilizerBag, GiGrass } from 'react-icons/gi'

const AdminCalendar = ({ userType = 'admin', userId = 'default-user' }) => {
  const [activeMenu, setActiveMenu] = useState('Calendar')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState([])
  const [plants, setPlants] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showEventModal, setShowEventModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('month') // 'month' or 'list'
  
  // Check if user has edit permissions (admin or farmer)
  const canEdit = userType === 'admin' || userType === 'farmer'
  
  // Event form state
  const [eventForm, setEventForm] = useState({
    plantId: '',
    plantName: '',
    type: 'LIFECYCLE_STAGE',
    status: 'info',
    message: '',
    timestamp: '',
    notes: ''
  })

  // Event types with react-icons
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
    { value: 'OTHER', icon: <FaClipboardList />, color: '#64748b', label: 'Other' }
  ]

  // Status colors
  const statusColors = {
    'info': '#10b981',
    'success': '#10b981',
    'warning': '#f59e0b',
    'error': '#ef4444'
  }

  // Fetch plants
  const fetchPlants = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'plants'))
      const plantsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setPlants(plantsData)
    } catch (error) {
      console.error('Error fetching plants:', error)
    }
  }

  // Fetch events from events collection
  const fetchEvents = async () => {
    setLoading(true)
    try {
      const querySnapshot = await getDocs(collection(db, 'events'))
      const eventsData = querySnapshot.docs.map(doc => {
        const data = doc.data()
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt)
        }
      })
      
      // Sort by timestamp
      eventsData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      
      setEvents(eventsData)
    } catch (error) {
      console.error('Error fetching events:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlants()
    fetchEvents()
  }, [])

  // Calendar helpers
  const getDaysInMonth = (date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    return new Date(year, month + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay()
  }

  const getMonthName = (date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const getDayEvents = (day) => {
    const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
    targetDate.setHours(0, 0, 0, 0)
    
    return events.filter(event => {
      const eventDate = new Date(event.timestamp)
      eventDate.setHours(0, 0, 0, 0)
      return eventDate.getTime() === targetDate.getTime()
    })
  }

  const isToday = (day) => {
    const today = new Date()
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    )
  }

  // Navigation
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))
  }

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Handle event click - show details
  const handleEventClick = (event) => {
    setSelectedEvent(event)
    setShowDetailsModal(true)
  }

  // Handle add event
  const handleAddEvent = () => {
    setEventForm({
      plantId: '',
      plantName: '',
      type: 'LIFECYCLE_STAGE',
      status: 'info',
      message: '',
      timestamp: '',
      notes: ''
    })
    setSelectedEvent(null)
    setShowEventModal(true)
  }

  // Handle edit event
  const handleEditEvent = (event) => {
    setSelectedEvent(event)
    setEventForm({
      plantId: event.plantId || '',
      plantName: event.plantName || '',
      type: event.type || 'LIFECYCLE_STAGE',
      status: event.status || 'info',
      message: event.message || '',
      timestamp: event.timestamp ? new Date(event.timestamp).toISOString().split('T')[0] : '',
      notes: event.notes || ''
    })
    setShowDetailsModal(false)
    setShowEventModal(true)
  }

  // Handle plant selection
  const handlePlantSelect = (e) => {
    const plantId = e.target.value
    const plant = plants.find(p => p.id === plantId)
    
    if (plant) {
      setEventForm(prev => ({
        ...prev,
        plantId: plantId,
        plantName: plant.plantName || plant.plantType || plant.name || plant.type
      }))
    } else {
      setEventForm(prev => ({
        ...prev,
        plantId: '',
        plantName: ''
      }))
    }
  }

  // Handle save event
  const handleSaveEvent = async () => {
    try {
      if (!eventForm.message || !eventForm.timestamp) {
        alert('Please fill in required fields (message and date)')
        return
      }

      const eventData = {
        plantId: eventForm.plantId || null,
        plantName: eventForm.plantName || null,
        type: eventForm.type,
        status: eventForm.status,
        message: eventForm.message,
        timestamp: new Date(eventForm.timestamp),
        notes: eventForm.notes || '',
        userId: userId,
        updatedAt: serverTimestamp()
      }

      if (selectedEvent) {
        // Update existing
        await updateDoc(doc(db, 'events', selectedEvent.id), eventData)
        alert('✅ Event updated successfully!')
      } else {
        // Create new
        await addDoc(collection(db, 'events'), {
          ...eventData,
          createdAt: serverTimestamp()
        })
        alert('✅ Event added successfully!')
      }

      setShowEventModal(false)
      fetchEvents()
    } catch (error) {
      console.error('Error saving event:', error)
      alert('❌ Failed to save event')
    }
  }

  // Handle delete event
  const handleDeleteEvent = async (eventId) => {
    if (window.confirm('Are you sure you want to delete this event?')) {
      try {
        await deleteDoc(doc(db, 'events', eventId))
        alert('✅ Event deleted successfully!')
        setShowDetailsModal(false)
        fetchEvents()
      } catch (error) {
        console.error('Error deleting event:', error)
        alert('❌ Failed to delete event')
      }
    }
  }

  // Get event type config
  const getEventTypeConfig = (type) => {
    return eventTypes.find(t => t.value === type) || eventTypes[eventTypes.length - 1]
  }

  // Render calendar grid
  // Replace your existing renderCalendarGrid with this:
const renderCalendarGrid = () => {
  const daysInMonth = getDaysInMonth(currentDate);
  const firstDayOfMonth = getFirstDayOfMonth(currentDate); // 0=Sun, 1=Mon, etc.
  const days = [];

  // 1. Create empty cells for days before the 1st of the month
  // This ensures if the 1st is a Monday (1), there is exactly 1 empty box for Sunday (0).
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(<div key={`empty-${i}`} className="calendar-day empty" />);
  }

  // 2. Map the actual days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dayEvents = getDayEvents(day);
    const isTodayDate = isToday(day);

    days.push(
      <div
        key={day}
        className={`calendar-day ${isTodayDate ? 'today' : ''} ${dayEvents.length > 0 ? 'has-events' : ''}`}
      >
        <div className="day-number">{day}</div>
        <div className="day-events">
          {dayEvents.slice(0, 3).map((event) => {
            const typeConfig = getEventTypeConfig(event.type);
            return (
              <div
                key={event.id}
                className="event-item"
                style={{ 
                  background: statusColors[event.status] || statusColors.info,
                  borderLeft: `4px solid ${typeConfig.color}`
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleEventClick(event);
                }}
                title={event.message}
              >
                <span className="event-icon">{typeConfig.icon}</span>
                <span className="event-text">
                  {event.message.substring(0, 20)}
                  {event.message.length > 20 ? '...' : ''}
                </span>
              </div>
            );
          })}
          {dayEvents.length > 3 && (
            <div className="more-events">+{dayEvents.length - 3} more</div>
          )}
        </div>
      </div>
    );
  }

  return days;
};

  // Render list view
  const renderListView = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const upcomingEvents = events.filter(event => {
      const eventDate = new Date(event.timestamp)
      eventDate.setHours(0, 0, 0, 0)
      return eventDate >= today
    })

    const pastEvents = events.filter(event => {
      const eventDate = new Date(event.timestamp)
      eventDate.setHours(0, 0, 0, 0)
      return eventDate < today
    })

    return (
      <div className="list-view">
        <div className="list-section">
          <h3 className="list-section-title">
            <FaCalendarDay style={{ marginRight: '8px' }} />
            Upcoming & Today
          </h3>
          {upcomingEvents.length === 0 ? (
            <div className="no-events">No upcoming events</div>
          ) : (
            <div className="events-list">
              {upcomingEvents.map(event => {
                const typeConfig = getEventTypeConfig(event.type)
                return (
                  <div
                    key={event.id}
                    className="event-list-item"
                    onClick={() => handleEventClick(event)}
                  >
                    <div className="event-list-icon" style={{ background: typeConfig.color }}>
                      {typeConfig.icon}
                    </div>
                    <div className="event-list-content">
                      <div className="event-list-header">
                        <span className="event-list-message">{event.message}</span>
                        <span 
                          className="event-list-status"
                          style={{ background: statusColors[event.status] }}
                        >
                          {event.status}
                        </span>
                      </div>
                      <div className="event-list-details">
                        {event.plantName && (
                          <span className="event-detail">
                            <FaSeedling style={{ marginRight: '4px' }} />
                            {event.plantName}
                          </span>
                        )}
                        <span className="event-detail">
                          <FaCalendarAlt style={{ marginRight: '4px' }} />
                          {new Date(event.timestamp).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </span>
                        <span className="event-detail">
                          {typeConfig.label}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="list-section">
          <h3 className="list-section-title">
            <FaClock style={{ marginRight: '8px' }} />
            Past Events
          </h3>
          {pastEvents.length === 0 ? (
            <div className="no-events">No past events</div>
          ) : (
            <div className="events-list">
              {pastEvents.map(event => {
                const typeConfig = getEventTypeConfig(event.type)
                return (
                  <div
                    key={event.id}
                    className="event-list-item past"
                    onClick={() => handleEventClick(event)}
                  >
                    <div className="event-list-icon" style={{ background: typeConfig.color }}>
                      {typeConfig.icon}
                    </div>
                    <div className="event-list-content">
                      <div className="event-list-header">
                        <span className="event-list-message">{event.message}</span>
                        <span 
                          className="event-list-status"
                          style={{ background: statusColors[event.status] }}
                        >
                          {event.status}
                        </span>
                      </div>
                      <div className="event-list-details">
                        {event.plantName && (
                          <span className="event-detail">
                            <FaSeedling style={{ marginRight: '4px' }} />
                            {event.plantName}
                          </span>
                        )}
                        <span className="event-detail">
                          <FaCalendarAlt style={{ marginRight: '4px' }} />
                          {new Date(event.timestamp).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </span>
                        <span className="event-detail">
                          {typeConfig.label}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="calendar-container">
        <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} userType={userType} />
        <div className="calendar-content">
          <div className="loading">Loading calendar...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="calendar-container">
      <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} userType={userType} />
      
      <div className="calendar-content">
        <div className="calendar-header">
          <div className="calendar-title-section">
            <h1 className="calendar-title">
              <FaCalendarAlt style={{ marginRight: '12px' }} />
              Event Calendar
            </h1>
          </div>

          <div className="calendar-actions">
            <div className="view-toggle">
              <button
                className={`view-toggle-btn ${viewMode === 'month' ? 'active' : ''}`}
                onClick={() => setViewMode('month')}
              >
                <FaCalendarAlt style={{ marginRight: '6px' }} />
                Month
              </button>
              <button
                className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
              >
                <FaThList style={{ marginRight: '6px' }} />
                List
              </button>
            </div>

            <button className="calendar-add-btn" onClick={handleAddEvent}>
              <FaPlus style={{ marginRight: '6px' }} />
              Add Event
            </button>
          </div>
        </div>

        {viewMode === 'month' ? (
          <>
            <div className="calendar-navigation">
              <button className="nav-btn" onClick={goToPreviousMonth}>
                <FaChevronLeft style={{ marginRight: '6px' }} />
                Previous
              </button>
              <button className="today-btn" onClick={goToToday}>
                Today
              </button>
              <h2 className="month-title">{getMonthName(currentDate)}</h2>
              <button className="nav-btn" onClick={goToNextMonth}>
                Next
                <FaChevronRight style={{ marginLeft: '6px' }} />
              </button>
            </div>

            <div className="calendar-grid-container">
              <div className="calendar-weekdays">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="weekday">
                    {day}
                  </div>
                ))}
              </div>
              <div className="calendar-grid">
                {renderCalendarGrid()}
              </div>
            </div>
          </>
        ) : (
          renderListView()
        )}

        <div className="calendar-legend">
          <div className="legend-title">Event Status:</div>
          {Object.entries(statusColors).map(([status, color]) => (
            <div key={status} className="legend-item">
              <div className="legend-color" style={{ background: color }} />
              <span className="legend-label">{status}</span>
            </div>
          ))}
        </div>

        {/* Add/Edit Event Modal */}
        {showEventModal && (
          <div className="calendar-modal-overlay" onClick={() => setShowEventModal(false)}>
            <div className="calendar-modal" onClick={(e) => e.stopPropagation()}>
              <div className="calendar-modal-header">
                <h2 className="calendar-modal-title">
                  {selectedEvent ? (
                    <>
                      <FaEdit style={{ marginRight: '8px' }} />
                      Edit Event
                    </>
                  ) : (
                    <>
                      <FaPlus style={{ marginRight: '8px' }} />
                      Add New Event
                    </>
                  )}
                </h2>
                <button 
                  className="calendar-modal-close"
                  onClick={() => setShowEventModal(false)}
                >
                  <FaTimes />
                </button>
              </div>

              <div className="calendar-modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Plant (Optional)</label>
                    <select
                      className="form-input"
                      value={eventForm.plantId}
                      onChange={handlePlantSelect}
                    >
                      <option value="">No plant (General event)</option>
                      {plants.map(plant => (
                        <option key={plant.id} value={plant.id}>
                          {plant.plantName || plant.plantType} - Plot {plant.plotNumber}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Event Type</label>
                    <select
                      className="form-input"
                      value={eventForm.type}
                      onChange={(e) => setEventForm({ ...eventForm, type: e.target.value })}
                    >
                      {eventTypes.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label">Event Message *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g., Stage start: Germination for Lettuce"
                      value={eventForm.message}
                      onChange={(e) => setEventForm({ ...eventForm, message: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Event Date *</label>
                    <input
                      type="date"
                      className="form-input"
                      value={eventForm.timestamp}
                      onChange={(e) => setEventForm({ ...eventForm, timestamp: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select
                      className="form-input"
                      value={eventForm.status}
                      onChange={(e) => setEventForm({ ...eventForm, status: e.target.value })}
                    >
                      <option value="info">Info</option>
                      <option value="success">Success</option>
                      <option value="warning">Warning</option>
                      <option value="error">Error</option>
                    </select>
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label">Notes (Optional)</label>
                    <textarea
                      className="form-textarea"
                      rows="3"
                      placeholder="Additional notes..."
                      value={eventForm.notes}
                      onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="calendar-modal-footer">
                <button
                  className="calendar-modal-btn cancel-btn"
                  onClick={() => setShowEventModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="calendar-modal-btn save-btn"
                  onClick={handleSaveEvent}
                >
                  {selectedEvent ? 'Update' : 'Add'} Event
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Event Details Modal */}
        {showDetailsModal && selectedEvent && (
          <div className="calendar-modal-overlay" onClick={() => setShowDetailsModal(false)}>
            <div className="calendar-modal details-modal" onClick={(e) => e.stopPropagation()}>
              <div className="calendar-modal-header">
                <h2 className="calendar-modal-title">
                  <FaClipboardList style={{ marginRight: '8px' }} />
                  Event Details
                </h2>
                <button 
                  className="calendar-modal-close"
                  onClick={() => setShowDetailsModal(false)}
                >
                  <FaTimes />
                </button>
              </div>

              <div className="calendar-modal-body">
                <div className="details-content">
                  <div className="detail-header">
                    <div className="detail-icon-large" style={{ background: getEventTypeConfig(selectedEvent.type).color }}>
                      {getEventTypeConfig(selectedEvent.type).icon}
                    </div>
                    <div className="detail-header-text">
                      <h3 className="detail-message">{selectedEvent.message}</h3>
                      <span 
                        className="detail-status-badge"
                        style={{ background: statusColors[selectedEvent.status] }}
                      >
                        {selectedEvent.status}
                      </span>
                    </div>
                  </div>

                  <div className="detail-divider" />

                  <div className="detail-row">
                    <span className="detail-label">Event Type:</span>
                    <span className="detail-value">
                      {getEventTypeConfig(selectedEvent.type).icon}
                      <span style={{ marginLeft: '8px' }}>
                        {getEventTypeConfig(selectedEvent.type).label}
                      </span>
                    </span>
                  </div>

                  {selectedEvent.plantName && (
                    <div className="detail-row">
                      <span className="detail-label">Plant:</span>
                      <span className="detail-value">
                        <FaSeedling style={{ marginRight: '6px' }} />
                        {selectedEvent.plantName}
                      </span>
                    </div>
                  )}

                  {selectedEvent.plantId && (
                    <div className="detail-row">
                      <span className="detail-label">Plant ID:</span>
                      <span className="detail-value">{selectedEvent.plantId}</span>
                    </div>
                  )}

                  <div className="detail-row">
                    <span className="detail-label">Event Date:</span>
                    <span className="detail-value">
                      <FaCalendarAlt style={{ marginRight: '6px' }} />
                      {new Date(selectedEvent.timestamp).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </span>
                  </div>

                  <div className="detail-row">
                    <span className="detail-label">Created At:</span>
                    <span className="detail-value">
                      <FaClock style={{ marginRight: '6px' }} />
                      {new Date(selectedEvent.createdAt).toLocaleString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>

                  {selectedEvent.notes && (
                    <div className="detail-row full-width">
                      <span className="detail-label">Notes:</span>
                      <p className="detail-notes">{selectedEvent.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="calendar-modal-footer">
                <button
                  className="calendar-modal-btn delete-btn"
                  onClick={() => handleDeleteEvent(selectedEvent.id)}
                >
                  <FaTrash style={{ marginRight: '6px' }} />
                  Delete
                </button>
                <button
                  className="calendar-modal-btn"
                  onClick={() => handleEditEvent(selectedEvent)}
                >
                  <FaEdit style={{ marginRight: '6px' }} />
                  Edit
                </button>
                <button
                  className="calendar-modal-btn cancel-btn"
                  onClick={() => setShowDetailsModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminCalendar