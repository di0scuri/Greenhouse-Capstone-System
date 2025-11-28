import React, { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import "./AddItemModal.css"; // You'll need to create this CSS file

const AddItemModal = ({ activeTab, onClose, onItemAdded }) => {
  const [formData, setFormData] = useState({
    name: "",
    stock: "",
    pricePerUnit: "",
    unit: activeTab === "Seed" ? "Packs" : "kg",
    expirationDate: "", // Only for seeds
    lowStockThreshold: "",
    // Fertilizer specific fields
    n_percentage: "",
    p_percentage: "",
    k_percentage: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "number" ? (value === "" ? "" : parseFloat(value)) : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Validate required fields
      if (!formData.name.trim()) {
        throw new Error("Item name is required");
      }
      if (!formData.stock || formData.stock <= 0) {
        throw new Error("Stock must be greater than 0");
      }
      if (!formData.pricePerUnit || formData.pricePerUnit <= 0) {
        throw new Error("Price per unit must be greater than 0");
      }
      if (!formData.lowStockThreshold || formData.lowStockThreshold < 0) {
        throw new Error("Low stock threshold is required");
      }

      // Seed specific validation
      if (activeTab === "Seed" && !formData.expirationDate) {
        throw new Error("Expiration date is required for seeds");
      }

      // Fertilizer specific validation
      if (activeTab === "Fertilizers") {
        if (formData.n_percentage === "" || formData.n_percentage < 0) {
          throw new Error("N percentage is required for fertilizers");
        }
        if (formData.p_percentage === "" || formData.p_percentage < 0) {
          throw new Error("P percentage is required for fertilizers");
        }
        if (formData.k_percentage === "" || formData.k_percentage < 0) {
          throw new Error("K percentage is required for fertilizers");
        }
      }

      const currentTimestamp = serverTimestamp();
      
      // Base item data
      const baseItemData = {
        name: formData.name.trim(),
        category: activeTab.toLowerCase(),
        stock: Number(formData.stock),
        pricePerUnit: Number(formData.pricePerUnit),
        unit: formData.unit,
        lowStockThreshold: Number(formData.lowStockThreshold),
        dateAdded: currentTimestamp,
        lastUpdated: currentTimestamp
      };

      // Add category-specific fields
      let itemData;
      if (activeTab === "Seed") {
        itemData = {
          ...baseItemData,
          expirationDate: new Date(formData.expirationDate)
        };
      } else { // Fertilizers
        itemData = {
          ...baseItemData,
          n_percentage: Number(formData.n_percentage),
          p_percentage: Number(formData.p_percentage),
          k_percentage: Number(formData.k_percentage)
        };
      }

      // Add to inventory collection
      const docRef = await addDoc(collection(db, "inventory"), itemData);
      console.log("Item added to inventory with ID:", docRef.id);
      
      // Add to inventory_log collection
      const logData = {
        itemId: docRef.id,
        itemName: formData.name.trim(),
        type: "Initial Stock",
        quantityChange: Number(formData.stock),
        costOrValuePerUnit: Number(formData.pricePerUnit),
        unit: formData.unit,
        timestamp: currentTimestamp,
        userId: "system" // You can replace this with actual user ID if available
      };

      await addDoc(collection(db, "inventory_log"), logData);
      console.log("Log entry added for new item");
      
      // Call success callback
      onItemAdded();
      
    } catch (err) {
      console.error("Error adding item:", err);
      setError(err.message || "Failed to add item. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-container">
        <div className="modal-header">
          <h2>Add New {activeTab} Item</h2>
          <button className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="error-message">{error}</div>}
          
          <div className="form-group">
            <label htmlFor="name">Item Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder={`Enter ${activeTab.toLowerCase()} name`}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="stock">Stock Quantity *</label>
              <input
                type="number"
                id="stock"
                name="stock"
                value={formData.stock}
                onChange={handleInputChange}
                placeholder="0"
                min="0"
                step="1"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="unit">Unit *</label>
              <select
                id="unit"
                name="unit"
                value={formData.unit}
                onChange={handleInputChange}
                required
              >
                {activeTab === "Seed" ? (
                  <>
                    <option value="Packs">Packs</option>
                    <option value="Seedlings">Seedlings</option>
                    <option value="kg">kg</option>
                    <option value="Pieces">Pieces</option>
                  </>
                ) : (
                  <>
                    <option value="kg">kg</option>
                    <option value="lbs">lbs</option>
                    <option value="bags">Bags</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pricePerUnit">Price per Unit *</label>
              <input
                type="number"
                id="pricePerUnit"
                name="pricePerUnit"
                value={formData.pricePerUnit}
                onChange={handleInputChange}
                placeholder="0.00"
                min="0"
                step="0.01"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="lowStockThreshold">Low Stock Threshold *</label>
              <input
                type="number"
                id="lowStockThreshold"
                name="lowStockThreshold"
                value={formData.lowStockThreshold}
                onChange={handleInputChange}
                placeholder="10"
                min="0"
                step="1"
                required
              />
            </div>
          </div>

          {/* Seed-specific fields */}
          {activeTab === "Seed" && (
            <div className="form-group">
              <label htmlFor="expirationDate">Expiration Date *</label>
              <input
                type="date"
                id="expirationDate"
                name="expirationDate"
                value={formData.expirationDate}
                onChange={handleInputChange}
                required
              />
            </div>
          )}

          {/* Fertilizer-specific fields */}
          {activeTab === "Fertilizers" && (
            <>
              <div className="form-section-title">Nutrient Content (%)</div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="n_percentage">Nitrogen (N) % *</label>
                  <input
                    type="number"
                    id="n_percentage"
                    name="n_percentage"
                    value={formData.n_percentage}
                    onChange={handleInputChange}
                    placeholder="0.0"
                    min="0"
                    max="100"
                    step="0.1"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="p_percentage">Phosphorus (P) % *</label>
                  <input
                    type="number"
                    id="p_percentage"
                    name="p_percentage"
                    value={formData.p_percentage}
                    onChange={handleInputChange}
                    placeholder="0.0"
                    min="0"
                    max="100"
                    step="0.1"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="k_percentage">Potassium (K) % *</label>
                  <input
                    type="number"
                    id="k_percentage"
                    name="k_percentage"
                    value={formData.k_percentage}
                    onChange={handleInputChange}
                    placeholder="0.0"
                    min="0"
                    max="100"
                    step="0.1"
                    required
                  />
                </div>
              </div>
            </>
          )}

          <div className="form-actions">
            <button 
              type="button" 
              className="cancel-button" 
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="submit-button" 
              disabled={loading}
            >
              {loading ? "Adding..." : `Add ${activeTab} Item`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddItemModal;