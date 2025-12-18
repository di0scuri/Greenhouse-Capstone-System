import React, { useState, useEffect } from "react";
import Sidebar from "./sidebar";
import "./inventory.css";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import AddItemModal from "../modals/AddItemModal";
import EditItemModal from "../modals/EditItemModal";
import { 
  FaSearch, 
  FaBell, 
  FaSeedling, 
  FaExclamationTriangle, 
  FaCalendarAlt,
  FaEdit,
  FaPlus,
  FaCheckCircle
} from 'react-icons/fa';
import { MdWarning } from 'react-icons/md';

const Inventory = ({ userType = "admin" }) => {
  const [activeMenu, setActiveMenu] = useState("Inventory");
  const [activeTab, setActiveTab] = useState("Seed");
  const [searchTerm, setSearchTerm] = useState("");
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [stats, setStats] = useState({
    totalItems: 0,
    lowStockItems: 0,
    lastUpdate: "-",
  });

  // Helper function to get stock quantity based on category
  const getStockQuantity = (item) => {
    if (item.category?.toLowerCase() === "seed") {
      return item.packs !== undefined ? item.packs : (item.stock || 0);
    }
    return item.stock || 0;
  };

  // Helper function to check if item is low stock
  const isLowStock = (item) => {
    const stockQty = getStockQuantity(item);
    const threshold = item.lowStockThreshold || (item.category?.toLowerCase() === "seed" ? 5 : 10);
    return stockQty <= threshold;
  };

  // Fetch inventory data
  const fetchInventory = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "inventory"));
      const items = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setInventoryItems(items);

      const categoryItems = items.filter(
        (item) => item.category?.toLowerCase() === activeTab.toLowerCase()
      );

      const totalItems = categoryItems.length;
      const lowStockItems = categoryItems.filter(item => isLowStock(item)).length;

      const dates = items
        .map((item) => item.dateAdded?.seconds ? new Date(item.dateAdded.seconds * 1000) : null)
        .filter(Boolean);

      const lastUpdate = dates.length > 0
          ? new Date(Math.max(...dates.map((d) => d.getTime()))).toLocaleDateString()
          : "-";

      setStats({ totalItems, lowStockItems, lastUpdate });
    } catch (error) {
      console.error("Error fetching inventory:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [activeTab]);

  const filteredItems = inventoryItems.filter(
    (item) =>
      item.category?.toLowerCase() === activeTab.toLowerCase() &&
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEditItem = (itemId) => {
    const itemToEdit = inventoryItems.find(item => item.id === itemId);
    if (itemToEdit) {
      setEditingItem(itemToEdit);
      setShowEditModal(true);
    }
  };

  const handleAddItemClick = () => setShowModal(true);
  const handleCloseModal = () => setShowModal(false);
  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditingItem(null);
  };

  const handleItemAdded = () => {
    fetchInventory();
    setShowModal(false);
  };

  const handleItemUpdated = () => {
    fetchInventory();
    setShowEditModal(false);
    setEditingItem(null);
  };

  return (
    <div className="dashboard-container-prod">
      <Sidebar
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

      <div className="production-main-ad">
        {/* Header with Integrated Seed/Fertilizer Toggles */}
        <header className="production-header">
          <div className="production-header-left">
            <h1 className="production-title">Inventory Management</h1>
            <div className="inventory-category-tabs">
              <button 
                className={`cat-tab ${activeTab === "Seed" ? "active" : ""}`}
                onClick={() => setActiveTab("Seed")}
              >
                Seeds
              </button>
              <button 
                className={`cat-tab ${activeTab === "Fertilizers" ? "active" : ""}`}
                onClick={() => setActiveTab("Fertilizers")}
              >
                Fertilizers
              </button>
            </div>
          </div>

          <div className="production-search-box">
            <FaSearch className="production-search-icon" />
            <input
              type="text"
              placeholder={`Search ${activeTab.toLowerCase()}...`}
              className="production-search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </header>

        <div className="production-body">
          {/* Stats Overview */}
          <div className="summary-cards">
            <div className="summary-card">
              <div className="card-icon"><FaSeedling /></div>
              <div className="card-content">
                <p className="card-label">Total Items</p>
                <p className="card-value">{stats.totalItems}</p>
              </div>
            </div>
            <div className="summary-card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <div className="card-icon" style={{ background: '#f59e0b' }}><FaExclamationTriangle /></div>
              <div className="card-content">
                <p className="card-label">Low Stock</p>
                <p className="card-value">{stats.lowStockItems}</p>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="production-table-container-ad">
            <div className="inventory-grid-header">
              <div className="grid-cell">ITEM</div>
              <div className="grid-cell">STOCKS</div>
              <div className="grid-cell">PACKS</div>
              <div className="grid-cell">PRICE/PACK</div>
              <div className="grid-cell">DATE ADDED</div>
              <div className="grid-cell">EXPIRATION</div>
              <div className="grid-cell">STATUS</div>
              <div className="grid-cell">ACTION</div>
            </div>

            <div className="inventory-grid-body">
              {loading ? (
                <div className="loading-state">Loading inventory data...</div>
              ) : filteredItems.length === 0 ? (
                <div className="loading-state">No items found.</div>
              ) : (
                filteredItems.map((item) => {
                  const isLow = isLowStock(item);
                  return (
                    <div key={item.id} className="inventory-grid-row">
                      <div className="grid-cell item-name-bold">{item.name}</div>
                      <div className="grid-cell">{item.stock || 0} {item.unit || 'units'}</div>
                      <div className="grid-cell">{item.packs || 0}</div>
                      <div className="grid-cell">₱{(item.pricePerPack || item.price || 0).toLocaleString()}</div>
                      <div className="grid-cell">
                        {item.dateAdded?.seconds 
                          ? new Date(item.dateAdded.seconds * 1000).toLocaleDateString() 
                          : '-'}
                      </div>
                      <div className="grid-cell">
                        {item.expirationDate?.seconds 
                          ? new Date(item.expirationDate.seconds * 1000).toLocaleDateString() 
                          : '-'}
                      </div>
                      <div className="grid-cell">
                        <span className={`status-pill ${isLow ? "low" : "sufficient"}`}>
                          {isLow ? "Low Stock" : "Sufficient"}
                        </span>
                      </div>
                      <div className="grid-cell">
                        <button className="edit-btn-icon" onClick={() => handleEditItem(item.id)}>
                          <FaEdit />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <button className="add-button-float" onClick={handleAddItemClick}>
            <FaPlus />
          </button>
        </div>
      </div>

      {showModal && (
        <AddItemModal activeTab={activeTab} onClose={handleCloseModal} onItemAdded={handleItemAdded} />
      )}
      {showEditModal && editingItem && (
        <EditItemModal item={editingItem} onClose={handleCloseEditModal} onItemUpdated={handleItemUpdated} />
      )}
    </div>
  );
};

export default Inventory;