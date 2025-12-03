import React, { useState, useEffect } from "react";
import Sidebar from "./sidebar";
import "./inventory.css";
import { collection, getDocs } from "firebase/firestore";
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
  FaCheckCircle,
  FaTimesCircle
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
      // For seeds: prioritize 'packs' field, fallback to 'stock'
      return item.packs !== undefined ? item.packs : (item.stock || 0);
    } else {
      // For other items: use 'stock'
      return item.stock || 0;
    }
  };

  // Helper function to check if item is low stock
  const isLowStock = (item) => {
    const stockQty = getStockQuantity(item);
    const threshold = item.lowStockThreshold || (item.category?.toLowerCase() === "seed" ? 5 : 10);
    return stockQty <= threshold;
  };

  const recordInventoryPurchaseExpense = async (itemData, userId) => {
  try {
    // Calculate total cost
    const quantity = itemData.category?.toLowerCase() === 'seed' 
      ? (itemData.packs || 0) 
      : (itemData.stock || 0);
    
    const pricePerUnit = itemData.category?.toLowerCase() === 'seed'
      ? (itemData.pricePerPack || 0)
      : (itemData.pricePerUnit || 0);
    
    const totalCost = quantity * pricePerUnit;

    // Create expense record
    const expenseData = {
      // Required fields from your schema
      plantId: 'INVENTORY_PURCHASE', // Special ID for inventory purchases
      expenseType: itemData.category || 'Inventory', // 'Seed' or 'Fertilizers'
      description: `Purchased ${quantity} ${itemData.category?.toLowerCase() === 'seed' ? 'packs' : itemData.unit || 'units'} of ${itemData.name}`,
      date: serverTimestamp(),
      cost: totalCost,
      unit: 'PHP',
      quantity: quantity,
      unitType: itemData.category?.toLowerCase() === 'seed' ? 'packs' : (itemData.unit || 'units'),
      userId: userId,
      createdAt: serverTimestamp(),
      
      // Additional details for tracking
      notes: `Initial inventory purchase: ${itemData.name}`,
      inventoryItemId: itemData.id || 'PENDING', // Will be updated after item is created
      inventoryDetails: {
        itemName: itemData.name,
        category: itemData.category,
        pricePerUnit: pricePerUnit,
        supplier: itemData.supplier || 'N/A',
        batchNumber: itemData.batchNumber || 'N/A',
        expirationDate: itemData.expirationDate || null,
        ...(itemData.category?.toLowerCase() === 'seed' && {
          seedsPerPack: itemData.seedsPerPack || 0,
          variety: itemData.variety || 'N/A'
        })
      }
    };

    // Add expense to plantsExpenses collection
    const expenseRef = await addDoc(collection(db, 'plantsExpenses'), expenseData);
    
    console.log(`💰 Created expense record for inventory purchase: ₱${totalCost.toFixed(2)}`);
    
    return expenseRef.id;
  } catch (error) {
    console.error('Error recording inventory purchase expense:', error);
    throw error;
  }
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

      // Compute stats
      const categoryItems = items.filter(
        (item) => item.category?.toLowerCase() === activeTab.toLowerCase()
      );

      const totalItems = categoryItems.length;

      const lowStockItems = categoryItems.filter(item => isLowStock(item)).length;

      const dates = items
        .map((item) =>
          item.dateAdded?.seconds
            ? new Date(item.dateAdded.seconds * 1000)
            : null
        )
        .filter(Boolean);

      const lastUpdate =
        dates.length > 0
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

  // Filter items by category + search
  const filteredItems = inventoryItems.filter(
    (item) =>
      item.category?.toLowerCase() === activeTab.toLowerCase() &&
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle editing an item
  const handleEditItem = (itemId) => {
    console.log("Edit item:", itemId);
    const itemToEdit = inventoryItems.find(item => item.id === itemId);
    if (itemToEdit) {
      setEditingItem(itemToEdit);
      setShowEditModal(true);
    }
  };

  // Handle opening the add modal
  const handleAddItemClick = () => {
    console.log("Add button clicked, showing modal");
    setShowModal(true);
  };

  // Handle closing the add modal
  const handleCloseModal = () => {
    console.log("Closing add modal");
    setShowModal(false);
  };

  // Handle closing the edit modal
  const handleCloseEditModal = () => {
    console.log("Closing edit modal");
    setShowEditModal(false);
    setEditingItem(null);
  };

  // Handle item added successfully
  const handleItemAdded = () => {
    console.log("Item added, refreshing inventory");
    fetchInventory();
    setShowModal(false);
  };

  // Handle item updated successfully
  const handleItemUpdated = () => {
    console.log("Item updated, refreshing inventory");
    fetchInventory();
    setShowEditModal(false);
    setEditingItem(null);
  };

  return (
    <div className="dashboard-container">
      <Sidebar
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

      <div className="inventory-main">
        {/* Header */}
        <div className="inventory-header">
          <div className="header-left">
            <h1>Inventory</h1>
          </div>

          <div className="header-right">
            <div className="inventory-search-container">
              <div className="inventory-search-icon">
                <FaSearch />
              </div>
              <input
                type="text"
                placeholder="Search..."
                className="search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="notification-btn">
              <span className="notification-icon">
                <FaBell />
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="inventory-content">
          {/* Tabs */}
          <div className="tabs-container">
            <button
              className={`tab-button ${activeTab === "Seed" ? "active" : ""}`}
              onClick={() => setActiveTab("Seed")}
            >
              Seed
            </button>
            <button
              className={`tab-button ${
                activeTab === "Fertilizers" ? "active" : ""
              }`}
              onClick={() => setActiveTab("Fertilizers")}
            >
              Fertilizers
            </button>
          </div>

          {/* Stats Cards */}
          <div className="inventory-stats">
            <div className="stat-card">
              <div className="stat-icon green">
                <FaSeedling />
              </div>
              <div className="stat-content">
                <h3 className="stat-title">Total {activeTab} Items</h3>
                <p className="stat-number">{stats.totalItems} Items</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon yellow">
                <FaExclamationTriangle />
              </div>
              <div className="stat-content">
                <h3 className="stat-title">Low Stock Items</h3>
                <p className="stat-number">{stats.lowStockItems} Items</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon blue">
                <FaCalendarAlt />
              </div>
              <div className="stat-content-inv">
                <h3 className="stat-title">Last Inventory Update</h3>
                <p className="stat-number-inv">{stats.lastUpdate}</p>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="inventory-table-container">
            <div className="table-header">
              <div className="table-cell">ITEM</div>
              <div className="table-cell">
                {activeTab.toLowerCase() === "seed" ? "STOCK (PACKS)" : "STOCK"}
              </div>
              <div className="table-cell">
                {activeTab.toLowerCase() === "seed" ? "PRICE / PACK" : "PRICE / UNIT"}
              </div>
              <div className="table-cell">DATE ADDED</div>
              <div className="table-cell">EXPIRATION DATE</div>
              <div className="table-cell">STATUS</div>
              <div className="table-cell">ACTION</div>
            </div>

            <div className="table-body">
              {loading ? (
                <div className="table-row">
                  <div className="table-cell" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
                    Loading...
                  </div>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="table-row">
                  <div className="table-cell" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
                    No items found.
                  </div>
                </div>
              ) : (
                filteredItems.map((item) => {
                  const stockQty = getStockQuantity(item);
                  const lowStock = isLowStock(item);
                  const isSeed = item.category?.toLowerCase() === "seed";

                  return (
                    <div key={item.id} className="table-row">
                      <div className="table-cell item-name">{item.name}</div>
                      <div className="table-cell stock-info">
                        {isSeed 
                          ? `${stockQty} packs`
                          : `${stockQty} ${item.unit || 'units'}`
                        }
                        {isSeed && item.seedsPerPack && (
                          <span className="stock-detail">
                            {" "}({item.seedsPerPack} seeds/pack)
                          </span>
                        )}
                      </div>
                      <div className="table-cell price-info">
                        {isSeed
                          ? `₱${item.pricePerPack || item.price || 0} / pack`
                          : `₱${item.pricePerUnit || item.price || 0} / ${item.unit || 'unit'}`
                        }
                      </div>
                      <div className="table-cell">
                        {item.dateAdded
                          ? new Date(
                              item.dateAdded.seconds * 1000
                            ).toLocaleDateString()
                          : "-"}
                      </div>
                      <div className="table-cell">
                        {item.expirationDate
                          ? new Date(
                              item.expirationDate.seconds * 1000
                            ).toLocaleDateString()
                          : "-"}
                      </div>
                      <div className="table-cell">
                        <span
                          className={`status-badge ${lowStock ? "low" : "sufficient"}`}
                        >
                          {lowStock ? (
                            <>
                              <MdWarning style={{ marginRight: '4px' }} />
                              Low Stock
                            </>
                          ) : (
                            <>
                              <FaCheckCircle style={{ marginRight: '4px' }} />
                              Sufficient
                            </>
                          )}
                        </span>
                      </div>
                      <div className="table-cell">
                        <button
                          className="edit-button"
                          onClick={() => handleEditItem(item.id)}
                          title="Edit item"
                        >
                          <FaEdit />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Floating Green Add Button */}
          <button
            className="add-button"
            onClick={handleAddItemClick}
            type="button"
            title="Add new item"
          >
            <span className="add-icon">
              <FaPlus />
            </span>
          </button>
        </div>
      </div>
      
      {/* Add Item Modal */}
      {showModal && (
        <AddItemModal
          activeTab={activeTab}
          onClose={handleCloseModal}
          onItemAdded={handleItemAdded}
        />
      )}

      {/* Edit Item Modal */}
      {showEditModal && editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={handleCloseEditModal}
          onItemUpdated={handleItemUpdated}
        />
      )}
    </div>
  );
};

export default Inventory;