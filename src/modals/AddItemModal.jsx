import React, { useState, useEffect } from "react";
import { collection, addDoc, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import "./AddItemModal.css";
import inventoryLogger from "../functions/inventoryLogger";

const AddItemModal = ({ activeTab, onClose, onItemAdded, userId = "default-user" }) => {
  const [formData, setFormData] = useState({
    name: "",
    stock: "",
    pricePerUnit: "",
    unit: activeTab === "Seed" ? "packs" : "kg",
    expirationDate: "",
    lowStockThreshold: "",
    // Seed-specific custom fields
    seedsPerPack: "",
    // Fertilizer specific fields
    n_percentage: "",
    p_percentage: "",
    k_percentage: "",
    weightPerBag: "50",
    npkRatio: "",
    npkKey: "",
    // Expense tracking fields
    vendor: "",
    receiptNumber: "",
    paymentMethod: "Cash",
    notes: ""
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Auto-calculate NPK ratio whenever N, P, or K percentages change
  useEffect(() => {
    if (activeTab === "Fertilizers" && 
        formData.n_percentage !== "" && 
        formData.p_percentage !== "" && 
        formData.k_percentage !== "") {
      
      // Convert percentages to whole numbers for NPK ratio
      const n = Math.round(Number(formData.n_percentage));
      const p = Math.round(Number(formData.p_percentage));
      const k = Math.round(Number(formData.k_percentage));
      
      const ratio = `${n}-${p}-${k}`;
      const key = ratio.toLowerCase().replace(/\s/g, '');
      
      setFormData(prev => ({
        ...prev,
        npkRatio: ratio,
        npkKey: key
      }));
    }
  }, [formData.n_percentage, formData.p_percentage, formData.k_percentage, activeTab]);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "number" ? (value === "" ? "" : parseFloat(value)) : value
    }));
  };

  // Function to record inventory purchase expense to plantExpenses collection
  const recordInventoryPurchaseExpense = async (itemData, itemId) => {
    try {
      const quantity = Number(itemData.stock);
      const pricePerUnit = Number(itemData.pricePerUnit);
      const totalCost = quantity * pricePerUnit;

      const isSeed = activeTab === "Seed";
      const category = isSeed ? "Seeds" : "Fertilizer";

      const expenseData = {
        // REQUIRED FIELDS for plantExpenses collection
        plantId: 'INVENTORY_PURCHASE',
        plantName: 'Inventory Stock',
        category: category,
        description: `Purchased ${quantity} ${itemData.unit} of ${itemData.name}`,
        amount: totalCost,
        date: serverTimestamp(),
        paymentMethod: formData.paymentMethod || 'Cash',
        receiptNumber: formData.receiptNumber || '',
        vendor: formData.vendor || 'N/A',
        notes: formData.notes || `Initial inventory purchase: ${itemData.name}. Price: ₱${pricePerUnit.toFixed(2)} per ${itemData.unit}`,
        addedBy: userId,
        createdAt: serverTimestamp(),
        lastModifiedAt: serverTimestamp(),
        
        // Link to inventory item
        inventoryItemId: itemId,
        inventoryItemName: itemData.name,
        
        // Store purchase details
        purchaseDetails: {
          quantity: quantity,
          unit: itemData.unit,
          pricePerUnit: pricePerUnit,
          ...(isSeed && {
            seedsPerPack: Number(itemData.seedsPerPack),
            totalSeeds: Number(itemData.stock) * Number(itemData.seedsPerPack),
            expirationDate: itemData.expirationDate
          }),
          ...(!isSeed && {
            npk: formData.npkRatio,
            npkRatio: formData.npkRatio,
            nitrogen: Number(formData.n_percentage),
            phosphorus: Number(formData.p_percentage),
            potassium: Number(formData.k_percentage)
          })
        }
      };

      // Add to plantExpenses collection
      const expenseRef = await addDoc(collection(db, 'plantExpenses'), expenseData);
      console.log(`Purchase expense recorded: ₱${totalCost.toFixed(2)} for ${itemData.name}`);
      
      return expenseRef.id;
    } catch (error) {
      console.error('Error recording inventory purchase expense:', error);
      throw error;
    }
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
      if (!formData.vendor.trim()) {
        throw new Error("Vendor/Supplier is required for expense tracking");
      }

      // Seed specific validation
      if (activeTab === "Seed") {
        if (!formData.expirationDate) {
          throw new Error("Expiration date is required for seeds");
        }
        if (!formData.seedsPerPack || formData.seedsPerPack <= 0) {
          throw new Error("Seeds per unit is required");
        }
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
        
        // Generate NPK ratio
        const n = Math.round(Number(formData.n_percentage));
        const p = Math.round(Number(formData.p_percentage));
        const k = Math.round(Number(formData.k_percentage));
        const npkRatio = `${n}-${p}-${k}`;
        const npkKey = npkRatio.toLowerCase().replace(/\s/g, '');
        
        // Update formData with calculated ratio
        formData.npkRatio = npkRatio;
        formData.npkKey = npkKey;
      }

      const currentTimestamp = serverTimestamp();
      const isSeed = activeTab === "Seed";
      
      // Base item data for inventory
      const baseItemData = {
        name: formData.name.trim(),
        category: activeTab.toLowerCase(),
        stock: Number(formData.stock),
        pricePerUnit: Number(formData.pricePerUnit),
        unit: formData.unit,
        lowStockThreshold: Number(formData.lowStockThreshold),
        dateAdded: currentTimestamp,
        lastUpdated: currentTimestamp,
        // Store purchase info for reference
        purchaseInfo: {
          vendor: formData.vendor,
          paymentMethod: formData.paymentMethod,
          receiptNumber: formData.receiptNumber || '',
          purchaseDate: currentTimestamp,
          pricePerUnit: Number(formData.pricePerUnit),
          totalPurchaseCost: Number(formData.stock) * Number(formData.pricePerUnit)
        }
      };

      // Add category-specific fields
      let itemData;
      if (isSeed) {
        itemData = {
          ...baseItemData,
          packs: Number(formData.stock),
          pricePerPack: Number(formData.pricePerUnit),
          expirationDate: new Date(formData.expirationDate),
          seedsPerPack: Number(formData.seedsPerPack),
          totalSeeds: Number(formData.stock) * Number(formData.seedsPerPack)
        };
      } else {
        itemData = {
          ...baseItemData,
          n_percentage: Number(formData.n_percentage),
          p_percentage: Number(formData.p_percentage),
          k_percentage: Number(formData.k_percentage),
          npkRatio: formData.npkRatio,
          npkKey: formData.npkKey,
          weightPerBagKg: Number(formData.weightPerBag) || 50,
          packageSizeKg: Number(formData.weightPerBag) || 50,
          name: `${formData.name.trim()} (NPK ${formData.npkRatio})`
        };
      }

      // 1. Add to inventory collection
      const docRef = await addDoc(collection(db, "inventory"), itemData);
      console.log("✅ Item added to inventory with ID:", docRef.id);
      
      // 2. Record the purchase expense to plantExpenses
      let expenseRecorded = false;
      let expenseId = null;
      try {
        expenseId = await recordInventoryPurchaseExpense(formData, docRef.id);
        expenseRecorded = true;
        console.log("Purchase expense recorded successfully with ID:", expenseId);
        
        // 3. Update inventory item with expense reference
        await updateDoc(doc(db, "inventory", docRef.id), {
          purchaseExpenseId: expenseId,
          hasExpenseRecord: true
        });
      } catch (expenseError) {
        console.error("Failed to record expense:", expenseError);
        // Continue even if expense recording fails
      }
      
      // 4. Add to inventory_log collection
      try {
        await inventoryLogger.logInventoryAdd(
          docRef.id,
          {
            isNew: true,
            previousStock: 0,
            newStock: Number(formData.stock),
            quantityAdded: Number(formData.stock),
            itemName: formData.name.trim(),
            category: activeTab,
            supplier: formData.vendor || "Not specified",
            cost: Number(formData.pricePerUnit),
            totalCost: Number(formData.stock) * Number(formData.pricePerUnit),
            unit: formData.unit,
            notes: isSeed 
              ? `New seed item added. ${formData.seedsPerPack} seeds/pack. Total: ${Number(formData.stock) * Number(formData.seedsPerPack)} seeds. Expires: ${formData.expirationDate}`
              : `New fertilizer added. NPK: ${formData.n_percentage}-${formData.p_percentage}-${formData.k_percentage}`,
            ...(expenseRecorded && { expenseRecordId: expenseId })
          },
          userId,
          "System User"
        );
      } catch (logError) {
        console.error("⚠️ Failed to log inventory:", logError);
      }
      
      // Call success callback
      onItemAdded();
      
      // Show success message with expense info
      const totalCost = Number(formData.stock) * Number(formData.pricePerUnit);
      const successMessage = expenseRecorded 
        ? ` ${activeTab} item added successfully!\n Purchase expense of ₱${totalCost.toFixed(2)} recorded in Production Expenses.`
        : ` ${activeTab} item added successfully!\n Note: Expense recording failed, but item was added.`;
      
      alert(successMessage);
      
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
            <label htmlFor="name">Item Name</label>
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
              <label htmlFor="stock">Stock Quantity</label>
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
              <label htmlFor="unit">Unit</label>
              <select
                id="unit"
                name="unit"
                value={formData.unit}
                onChange={handleInputChange}
                required
              >
                {activeTab === "Seed" ? (
                  <>
                    <option value="packs">Packs</option>
                    <option value="bags">Bags</option>
                    <option value="packets">Packets</option>
                    <option value="kg">kg</option>
                  </>
                ) : (
                  <>
                    <option value="kg">kg</option>
                    <option value="lbs">lbs</option>
                    <option value="bags">Bags</option>
                    <option value="sacks">Sacks</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Seed-specific: Seeds per pack */}
          {activeTab === "Seed" && (
            <div className="form-group">
              <label htmlFor="seedsPerPack">Seeds per Unit</label>
              <input
                type="number"
                id="seedsPerPack"
                name="seedsPerPack"
                value={formData.seedsPerPack}
                onChange={handleInputChange}
                placeholder="0"
                min="0"
                step="1"
                required
              />
              <small className="form-hint">
                {formData.stock && formData.seedsPerPack 
                  ? `Total seeds: ${Number(formData.stock) * Number(formData.seedsPerPack)}`
                  : "Enter stock and seeds per unit to see total"}
              </small>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pricePerUnit">
                Price per {activeTab === "Seed" ? "Pack" : "Unit"} *
              </label>
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
              {formData.stock && formData.pricePerUnit && (
                <small className="form-hint" style={{ color: '#10b981', fontWeight: 'bold' }}>
                   Total cost: ₱{(Number(formData.stock) * Number(formData.pricePerUnit)).toFixed(2)}
                </small>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="lowStockThreshold">Low Stock Threshold</label>
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
              <label htmlFor="expirationDate">Expiration Date</label>
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
                  <label htmlFor="n_percentage">Nitrogen (N) %</label>
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
                  <label htmlFor="p_percentage">Phosphorus (P) %</label>
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
                  <label htmlFor="k_percentage">Potassium (K) %</label>
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
              
              {/* NPK Ratio Preview */}
              {formData.npkRatio && (
                <div className="form-group">
                  <div style={{
                    padding: '12px',
                    background: '#f0f9ff',
                    border: '2px solid #0ea5e9',
                    borderRadius: '8px',
                    marginTop: '10px'
                  }}>
                    <strong style={{ color: '#0369a1' }}>NPK Ratio:</strong>
                    <span style={{ 
                      fontSize: '1.2em', 
                      fontWeight: 'bold', 
                      marginLeft: '10px',
                      color: '#0c4a6e'
                    }}>
                      {formData.npkRatio}
                    </span>
                    <div style={{ fontSize: '0.85em', color: '#64748b', marginTop: '4px' }}>
                      This ratio will be used for job order matching
                    </div>
                  </div>
                </div>
              )}
              
              {/* Weight per bag configuration */}
              <div className="form-group">
                <label htmlFor="weightPerBag">Weight per Bag (kg)</label>
                <input
                  type="number"
                  id="weightPerBag"
                  name="weightPerBag"
                  value={formData.weightPerBag}
                  onChange={handleInputChange}
                  placeholder="50"
                  min="1"
                  step="0.1"
                />
                <small className="form-hint">
                  Standard fertilizer bag weight (default: 50kg)
                </small>
              </div>
            </>
          )}

          {/* Expense Tracking Fields */}
          <div className="form-section">
            <div className="form-section-title">Purchase Details (For Expense Tracking)</div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="vendor">Vendor/Supplier</label>
                <input
                  type="text"
                  id="vendor"
                  name="vendor"
                  value={formData.vendor}
                  onChange={handleInputChange}
                  placeholder="e.g., Seed Co., Fertilizer Supplier Inc."
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="paymentMethod">Payment Method</label>
                <select
                  id="paymentMethod"
                  name="paymentMethod"
                  value={formData.paymentMethod}
                  onChange={handleInputChange}
                  required
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Credit Card">Credit Card</option>
                  <option value="Check">Check</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="receiptNumber">Receipt/Invoice Number (Optional)</label>
                <input
                  type="text"
                  id="receiptNumber"
                  name="receiptNumber"
                  value={formData.receiptNumber}
                  onChange={handleInputChange}
                  placeholder="e.g., INV-2024-001"
                />
              </div>

              <div className="form-group">
                <label htmlFor="notes">Purchase Notes (Optional)</label>
                <input
                  type="text"
                  id="notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  placeholder="Additional details about this purchase"
                />
              </div>
            </div>
          </div>

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
              {loading ? "Adding..." : `Add ${activeTab} Item & Record Expense`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddItemModal;