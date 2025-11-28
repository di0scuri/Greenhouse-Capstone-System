import React, { useState, useEffect } from "react";
import { doc, updateDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import "./EditItemModal.css"; // You can reuse the same CSS as AddItemModal

const EditItemModal = ({ item, onClose, onItemUpdated }) => {
  const [formData, setFormData] = useState({
    name: "",
    stock: "",
    pricePerUnit: "",
    unit: "",
    expirationDate: "",
    lowStockThreshold: "",
    // Fertilizer specific fields
    n_percentage: "",
    p_percentage: "",
    k_percentage: ""
  });
  const [originalData, setOriginalData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Initialize form with existing item data
  useEffect(() => {
    if (item) {
      const initData = {
        name: item.name || "",
        stock: item.stock || "",
        pricePerUnit: item.pricePerUnit || "",
        unit: item.unit || "",
        lowStockThreshold: item.lowStockThreshold || "",
        // Handle expiration date for seeds
        expirationDate: item.expirationDate 
          ? (item.expirationDate.toDate ? item.expirationDate.toDate().toISOString().split('T')[0] 
             : new Date(item.expirationDate.seconds * 1000).toISOString().split('T')[0])
          : "",
        // Fertilizer specific fields
        n_percentage: item.n_percentage || "",
        p_percentage: item.p_percentage || "",
        k_percentage: item.k_percentage || ""
      };
      
      setFormData(initData);
      setOriginalData(initData);
    }
  }, [item]);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "number" ? (value === "" ? "" : parseFloat(value)) : value
    }));
  };

  const getChanges = () => {
    const changes = [];
    const fieldsToCheck = ['name', 'stock', 'pricePerUnit', 'unit', 'lowStockThreshold', 'expirationDate', 'n_percentage', 'p_percentage', 'k_percentage'];
    
    fieldsToCheck.forEach(field => {
      if (formData[field] !== originalData[field] && (formData[field] !== "" || originalData[field] !== "")) {
        changes.push({
          field,
          oldValue: originalData[field],
          newValue: formData[field]
        });
      }
    });
    
    return changes;
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

      // Category-specific validation
      if (item.category === "seed" && !formData.expirationDate) {
        throw new Error("Expiration date is required for seeds");
      }

      if (item.category === "fertilizers") {
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

      const changes = getChanges();
      
      if (changes.length === 0) {
        throw new Error("No changes detected");
      }

      // Prepare update data
      const updateData = {
        name: formData.name.trim(),
        stock: Number(formData.stock),
        pricePerUnit: Number(formData.pricePerUnit),
        unit: formData.unit,
        lowStockThreshold: Number(formData.lowStockThreshold),
        lastUpdated: serverTimestamp()
      };

      // Add category-specific fields
      if (item.category === "seed") {
        updateData.expirationDate = new Date(formData.expirationDate);
      } else if (item.category === "fertilizers") {
        updateData.n_percentage = Number(formData.n_percentage);
        updateData.p_percentage = Number(formData.p_percentage);
        updateData.k_percentage = Number(formData.k_percentage);
      }

      // Update the inventory item
      const itemRef = doc(db, "inventory", item.id);
      await updateDoc(itemRef, updateData);
      console.log("Item updated in inventory with ID:", item.id);

      // Create log entries for changes
      const logPromises = changes.map(change => {
        let logData = {
          itemId: item.id,
          itemName: formData.name.trim(),
          timestamp: serverTimestamp(),
          userId: "system" // Replace with actual user ID if available
        };

        // Handle different types of changes
        if (change.field === 'stock') {
          const stockDifference = Number(change.newValue) - Number(change.oldValue);
          logData = {
            ...logData,
            type: stockDifference > 0 ? "Stock Increase" : "Stock Decrease",
            quantityChange: Math.abs(stockDifference),
            unit: formData.unit,
            costOrValuePerUnit: Number(formData.pricePerUnit)
          };
        } else if (change.field === 'pricePerUnit') {
          logData = {
            ...logData,
            type: "Price Update",
            quantityChange: 0,
            unit: formData.unit,
            costOrValuePerUnit: Number(change.newValue),
            notes: `Price changed from ₱${change.oldValue} to ₱${change.newValue}`
          };
        } else {
          logData = {
            ...logData,
            type: "Item Update",
            quantityChange: 0,
            unit: formData.unit,
            costOrValuePerUnit: Number(formData.pricePerUnit),
            notes: `${change.field} changed from "${change.oldValue}" to "${change.newValue}"`
          };
        }

        return addDoc(collection(db, "inventory_log"), logData);
      });

      await Promise.all(logPromises);
      console.log("Log entries added for item updates");

      // Call success callback
      onItemUpdated();
      
    } catch (err) {
      console.error("Error updating item:", err);
      setError(err.message || "Failed to update item. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!item) return null;

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-container">
        <div className="modal-header">
          <h2>Edit {item.category === "seed" ? "Seed" : "Fertilizer"} Item</h2>
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
              placeholder={`Enter ${item.category} name`}
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
                {item.category === "seed" ? (
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
          {item.category === "seed" && (
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
          {item.category === "fertilizers" && (
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
              {loading ? "Updating..." : "Update Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditItemModal;