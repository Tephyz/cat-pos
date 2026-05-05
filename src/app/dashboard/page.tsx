"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { collection, addDoc, serverTimestamp, runTransaction, doc, increment, query, where, getDoc, getDocs, onSnapshot, DocumentReference, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface OrderItem {
  name: string;
  category: string;
  temperature: string;
  size: string;
  sugar: string;
  quantity: number;
  price: number;
  addOns?: string[];
  variant?: string;
  discountType?: "None" | "PWD" | "Senior";
  discountCustomerName?: string;
  discountCustomerID?: string;
}

interface Tab {
  id: string;
  name: string;
  orderItems: OrderItem[];
  bulkDiscount: "None" | "5%" | "10%";
  createdAt: Date;
}

// Distinct colors for categories
const categoryColors: Record<string, { bg: string; hoverBg: string; activeBg: string; text: string }> = {
  Coffee: { bg: "#FFF0F5", hoverBg: "#FFE4EC", activeBg: "#C0392B", text: "#8B5E6E" },
  "Non Coffee": { bg: "#E8F4F8", hoverBg: "#D4EAF0", activeBg: "#2980B9", text: "#2C6E7A" },
  Milktea: { bg: "#FFF8E1", hoverBg: "#FFECB3", activeBg: "#F39C12", text: "#D68910" },
  "Yakult Mix": { bg: "#E8F5E9", hoverBg: "#C8E6C9", activeBg: "#43A047", text: "#2E7D32" },
  "Fruit Tea": { bg: "#FCE4EC", hoverBg: "#F8BBD0", activeBg: "#E91E63", text: "#AD1457" },
  "Hot Tea": { bg: "#EDE7F6", hoverBg: "#D1C4E9", activeBg: "#5E35B1", text: "#4527A0" },
  Frappe: { bg: "#FFFFFF", hoverBg: "#F0F0F0", activeBg: "#D0D0D0", text: "#000000" },
  "Food & Bites": { bg: "#EFEBE9", hoverBg: "#D7CCC8", activeBg: "#8D6E63", text: "#5D4037" },
};

// Per-subcategory colors for Frappe types
const frappeSubColors: Record<string, { bg: string; hoverBg: string; activeBg: string; text: string }> = {
  "Coffee Based": { bg: "#FFF9C4", hoverBg: "#FFF59D", activeBg: "#F57F17", text: "#E65100" },
  "Cream Based":  { bg: "#B2DFDB", hoverBg: "#80CBC4", activeBg: "#00796B", text: "#004D40" },
  "Tea Based":    { bg: "#D1C4E9", hoverBg: "#B39DDB", activeBg: "#4527A0", text: "#311B92" },
};

// ---------------------------------------------------------
// RECIPES & INVENTORY LOGIC
// ---------------------------------------------------------
type Recipes = Record<string, Record<string, Record<string, number>>>;

const RECIPES: Recipes = {
  // --- MILK TEAS --- 
  "Milktea - Okinawa": {
    "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Fructose": 25, "Okinawa Powder": 15 },
    "Large":  { "Assam Black Tea": 300, "Creamer": 30, "Fructose": 35, "Okinawa Powder": 25 } 
  },
  "Milktea - Dark Choco": {
    "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Fructose": 25, "Dark Choco Powder": 20 },
    "Large":  { "Assam Black Tea": 300, "Creamer": 30, "Fructose": 35, "Dark Choco Powder": 30 }
  },
  "Milktea - Strawberry": {
    "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Fructose": 25, "Strawberry Powder": 20 },
    "Large":  { "Assam Black Tea": 300, "Creamer": 30, "Fructose": 35, "Strawberry Powder": 30 }
  },
  "Milktea - Capuccino": { 
    "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Fructose": 25, "Cappuccino Powder": 20 },
    "Large":  { "Assam Black Tea": 300, "Creamer": 30, "Fructose": 35, "Cappuccino Powder": 30 }
  },
  "Milktea - Wintermelon": {
    "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Wintermelon": 30 },
    "Large":  { "Assam Black Tea": 300, "Creamer": 30, "Wintermelon": 40 }
  },

  // --- FRAPPES ---
  "Mocha": {
    "Medium": { "Coffee": 80, "Creamer": 20, "Vanilla Powder": 10, "Fructose": 20 },
    "Large":  { "Coffee": 120, "Creamer": 30, "Vanilla Powder": 15, "Fructose": 30 }
  },
  "Dark Mocha": {
    "Medium": { "Coffee": 80, "Creamer": 20, "Vanilla Powder": 10, "Fructose": 20, "Dark Chocolate Powder": 10 },
    "Large":  { "Coffee": 120, "Creamer": 30, "Vanilla Powder": 15, "Fructose": 30, "Dark Chocolate Powder": 15 }
  },
  "Caramel": {
    "Medium": { "Coffee": 80, "Creamer": 20, "Vanilla Powder": 10, "Fructose": 10, "Caramel Syrup": 30 },
    "Large":  { "Coffee": 120, "Creamer": 30, "Vanilla Powder": 15, "Fructose": 20, "Caramel Syrup": 40 }
  },
  "Vanilla": {
    "Medium": { "Creamer": 10, "Vanilla Powder": 20, "Fructose": 20, "Water": 50 },
    "Large":  { "Creamer": 15, "Vanilla Powder": 30, "Fructose": 30, "Water": 70 }
  },
  "Coffee Jelly": {
    "Medium": { "Coffee": 80, "Creamer": 20, "Vanilla Powder": 10, "Fructose": 15 },
    "Large":  { "Coffee": 120, "Creamer": 30, "Vanilla Powder": 15, "Fructose": 20 }
  },
  "Chocolate Chip": {
    "Medium": { "Creamer": 10, "Vanilla Powder": 20, "Fructose": 15, "Chocolate Syrup": 40, "Chocolate Chip": 10, "Water": 50 },
    "Large":  { "Creamer": 15, "Vanilla Powder": 30, "Fructose": 25, "Chocolate Syrup": 50, "Chocolate Chip": 15, "Water": 70 }
  },

  // --- YAKULT MIX ---
  "Yakult Mix - Strawberry": { "Medium": { "Cold Water": 80, "Syrup": 15, "Fructose": 20, "Yakult": 1 }, "Large": { "Cold Water": 175, "Syrup": 25, "Fructose": 30, "Yakult": 2 } },
  "Yakult Mix - Green Apple": { "Medium": { "Cold Water": 80, "Syrup": 15, "Fructose": 20, "Yakult": 1 }, "Large": { "Cold Water": 175, "Syrup": 25, "Fructose": 30, "Yakult": 2 } },
  "Yakult Mix - Blueberry": { "Medium": { "Cold Water": 80, "Syrup": 15, "Fructose": 20, "Yakult": 1 }, "Large": { "Cold Water": 175, "Syrup": 25, "Fructose": 30, "Yakult": 2 } },
  "Yakult Mix - Lychee": { "Medium": { "Cold Water": 80, "Syrup": 15, "Fructose": 20, "Yakult": 1 }, "Large": { "Cold Water": 175, "Syrup": 25, "Fructose": 30, "Yakult": 2 } },
  "Yakult Mix - Wintermelon": { "Medium": { "Cold Water": 80, "Syrup": 15, "Fructose": 20, "Yakult": 1 }, "Large": { "Cold Water": 175, "Syrup": 25, "Fructose": 30, "Yakult": 2 } },

  // --- FRUIT TEAS ---
  "Fruit Tea - Green Apple": { "Medium": { "Jasmine Green Tea": 200, "Syrup": 40, "Fructose": 15 }, "Large": { "Jasmine Green Tea": 300, "Syrup": 60, "Fructose": 25 } },
  "Fruit Tea - Blueberry": { "Medium": { "Jasmine Green Tea": 200, "Syrup": 40, "Fructose": 15 }, "Large": { "Jasmine Green Tea": 300, "Syrup": 60, "Fructose": 25 } },
  "Fruit Tea - Lychee": { "Medium": { "Jasmine Green Tea": 200, "Syrup": 40, "Fructose": 15 }, "Large": { "Jasmine Green Tea": 300, "Syrup": 60, "Fructose": 25 } },
  "Fruit Tea - Strawberry": { "Medium": { "Jasmine Green Tea": 200, "Syrup": 40, "Fructose": 15 }, "Large": { "Jasmine Green Tea": 300, "Syrup": 60, "Fructose": 25 } },
  "Fruit Tea - Wintermelon": { "Medium": { "Jasmine Green Tea": 200, "Syrup": 40, "Fructose": 15 }, "Large": { "Jasmine Green Tea": 300, "Syrup": 60, "Fructose": 25 } }
};

// Serving sizes ng Add-Ons
const ADD_ON_SERVING_SIZES: Record<string, number> = {
  Pearl: 50,
  Nata: 40,
  Espresso: 30,
  "Coffee Jelly": 40,
  Oreo: 1,
  Caramel: 20,
  "Whip Cream": 20
};

// Allowed Add-ons per Category
const CATEGORY_ADD_ONS: Record<string, string[]> = {
  "Coffee": ["Espresso", "Coffee Jelly", "Caramel", "Whip Cream"],
  "Non Coffee": ["Pearl", "Nata", "Coffee Jelly", "Oreo", "Caramel", "Whip Cream"],
  "Milktea": ["Pearl", "Nata", "Coffee Jelly", "Oreo", "Whip Cream"],
  "Yakult Mix": ["Pearl", "Nata", "Coffee Jelly"],
  "Fruit Tea": ["Pearl", "Nata", "Coffee Jelly"],
  "Frappe": ["Espresso", "Coffee Jelly", "Oreo", "Caramel", "Pearl", "Nata", "Whip Cream"],
  "Hot Tea": [],
  "Food & Bites": []
};

// Delete Confirmation Modal Component
function DeleteConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  itemName, 
  itemType 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: () => void; 
  itemName: string; 
  itemType: "category" | "item";
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-xl font-bold mb-3" style={{ color: "#3b2212" }}>
          Delete {itemType === "category" ? "Category" : "Item"}
        </h3>
        <p className="text-base mb-6" style={{ color: "#a07850" }}>
          Are you sure you want to delete "{itemName}"? 
          {itemType === "category" && " All items in this category will also be deleted."}
          This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-semibold text-base transition-all active:scale-95"
            style={{ background: "#f0e8e0", color: "#3b2212" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl font-semibold text-base transition-all active:scale-95"
            style={{ background: "#c0392b", color: "white" }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
// Manage Modal Component
function ManageModal({ 
  isOpen, 
  onClose, 
  onAddCategory, 
  onAddItem, 
  onDeleteCategory,
  onDeleteItem,
  categories,
  itemsByCategory,
  categoryColors: existingCategoryColors
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onAddCategory: (categoryName: string, color: string) => void; 
  onAddItem: (item: { name: string; price: number; category: string }) => void;
  onDeleteCategory: (categoryName: string) => void;
  onDeleteItem: (categoryName: string, itemName: string) => void;
  categories: string[];
  itemsByCategory: Record<string, string[]>;
  categoryColors: Record<string, { bg: string; hoverBg: string; activeBg: string; text: string }>;
}) {
  const [activeTab, setActiveTab] = useState<"category" | "item">("category");
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState("#3b2212");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(categories[0] || "Coffee");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    type: "category" | "item";
    name: string;
    category?: string;
  }>({ isOpen: false, type: "category", name: "" });

  if (!isOpen) return null;

  // Get color for a category
  const getCategoryColor = (categoryName: string) => {
    const colors = existingCategoryColors[categoryName];
    if (colors) return colors.activeBg;
    return "#3b2212"; // default color
  };

  // Get background color for category dropdown item
  const getCategoryBgColor = (categoryName: string) => {
    const colors = existingCategoryColors[categoryName];
    if (colors) return colors.bg;
    return "#faf7f4";
  };

  const handleAddCategory = () => {
    if (!categoryName.trim()) {
      setMessage({ text: "Please enter a category name", type: "error" });
      setTimeout(() => setMessage(null), 2000);
      return;
    }
    if (categories.includes(categoryName.trim())) {
      setMessage({ text: "Category already exists!", type: "error" });
      setTimeout(() => setMessage(null), 2000);
      return;
    }
    onAddCategory(categoryName.trim(), categoryColor);
    setMessage({ text: `Category "${categoryName}" added successfully!`, type: "success" });
    setCategoryName("");
    setCategoryColor("#3b2212");
    setTimeout(() => setMessage(null), 2000);
  };

  const handleAddItem = () => {
    if (!itemName.trim()) {
      setMessage({ text: "Please enter an item name", type: "error" });
      setTimeout(() => setMessage(null), 2000);
      return;
    }
    if (!itemPrice || parseFloat(itemPrice) <= 0) {
      setMessage({ text: "Please enter a valid price", type: "error" });
      setTimeout(() => setMessage(null), 2000);
      return;
    }
    if (!selectedCategory) {
      setMessage({ text: "Please select a category", type: "error" });
      setTimeout(() => setMessage(null), 2000);
      return;
    }
    if (itemsByCategory[selectedCategory]?.includes(itemName.trim())) {
      setMessage({ text: `Item "${itemName}" already exists in ${selectedCategory}!`, type: "error" });
      setTimeout(() => setMessage(null), 2000);
      return;
    }
    onAddItem({
      name: itemName.trim(),
      price: parseFloat(itemPrice),
      category: selectedCategory,
    });
    setMessage({ text: `Item "${itemName}" added to ${selectedCategory}!`, type: "success" });
    setItemName("");
    setItemPrice("");
    setTimeout(() => setMessage(null), 2000);
  };

  const handleDeleteClick = (type: "category" | "item", name: string, category?: string) => {
    setDeleteConfirm({ isOpen: true, type, name, category });
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm.type === "category") {
      onDeleteCategory(deleteConfirm.name);
    } else if (deleteConfirm.type === "item" && deleteConfirm.category) {
      onDeleteItem(deleteConfirm.category, deleteConfirm.name);
    }
    setDeleteConfirm({ isOpen: false, type: "category", name: "" });
    setMessage({ text: `${deleteConfirm.type === "category" ? "Category" : "Item"} deleted successfully!`, type: "success" });
    setTimeout(() => setMessage(null), 2000);
  };

  return (
    <>
      <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl" style={{ maxHeight: "90vh", overflow: "auto" }}>
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold" style={{ color: "#3b2212" }}>Manage Menu</h2>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                style={{ background: "#f7f3ef", color: "#3b2212", border: "1px solid #e8ddd4" }}
              >
                ✕
              </button>
            </div>

            <div className="flex gap-2 mb-6 border-b border-[#e8ddd4]">
              <button
                onClick={() => { setActiveTab("category"); setMessage(null); }}
                className={`px-6 py-3 font-semibold transition-all ${
                  activeTab === "category"
                    ? "border-b-2 border-[#3b2212] text-[#3b2212]"
                    : "text-[#a07850] hover:text-[#3b2212]"
                }`}
              >
                Add Category
              </button>
              <button
                onClick={() => { setActiveTab("item"); setMessage(null); }}
                className={`px-6 py-3 font-semibold transition-all ${
                  activeTab === "item"
                    ? "border-b-2 border-[#3b2212] text-[#3b2212]"
                    : "text-[#a07850] hover:text-[#3b2212]"
                }`}
              >
                Add Item
              </button>
            </div>

            {activeTab === "category" && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                    Category Name
                  </label>
                  <input
                    type="text"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    placeholder="e.g., Smoothies, Iced Tea, Pastries"
                    className="w-full rounded-xl px-4 py-3 text-base outline-none"
                    style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4", color: "#3b2212" }}
                    onKeyPress={(e) => e.key === "Enter" && handleAddCategory()}
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                    Category Color
                  </label>
                  <div className="flex gap-3 items-center">
                    <input
                      type="color"
                      value={categoryColor}
                      onChange={(e) => setCategoryColor(e.target.value)}
                      className="w-16 h-12 rounded-lg cursor-pointer"
                      style={{ border: "1.5px solid #e8ddd4" }}
                    />
                    <span className="text-sm" style={{ color: "#a07850" }}>
                      Choose a color for the category cards
                    </span>
                  </div>
                  <div className="mt-3 p-3 rounded-xl" style={{ background: `${categoryColor}20`, border: `1.5px solid ${categoryColor}` }}>
                    <p className="text-sm font-semibold" style={{ color: categoryColor }}>
                      Preview: {categoryName || "New Category"} items will use this color
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleAddCategory}
                  className="w-full py-3 rounded-xl font-semibold text-lg transition-all active:scale-95 touch-manipulation"
                  style={{ background: "#3b2212", color: "white" }}
                >
                  + Add Category
                </button>

                {/* Notification under Add Category button */}
                {message && (
                  <div
                    className={`p-3 rounded-xl text-center transition-all duration-300 ${
                      message.type === "success" 
                        ? "bg-green-50 text-green-700 border border-green-200" 
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                    style={{
                      animation: "fadeInUp 0.3s ease-out",
                    }}
                  >
                    <span className="text-sm font-medium">{message.text}</span>
                  </div>
                )}

                <div className="mt-6 pt-4 border-t" style={{ borderColor: "#e8ddd4" }}>
                  <h3 className="text-md font-semibold mb-3" style={{ color: "#3b2212" }}>
                    Existing Categories
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {categories.map((cat) => {
                      const catColor = getCategoryColor(cat);
                      return (
                        <div
                          key={cat}
                          className="flex justify-between items-center p-3 rounded-xl"
                          style={{ background: `${catColor}15`, border: `1.5px solid ${catColor}30` }}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full" style={{ background: catColor }}></div>
                            <span className="text-sm font-medium" style={{ color: catColor }}>{cat}</span>
                          </div>
                          <button
                            onClick={() => handleDeleteClick("category", cat)}
                            className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all active:scale-95"
                            style={{ background: "#fee2e2", color: "#c0392b" }}
                          >
                            Delete
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "item" && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                    Select Category
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-base outline-none"
                    style={{ 
                      background: getCategoryBgColor(selectedCategory), 
                      border: `1.5px solid ${getCategoryColor(selectedCategory)}30`,
                      color: getCategoryColor(selectedCategory),
                      fontWeight: "500"
                    }}
                  >
                    {categories.map((cat) => {
                      const catColor = getCategoryColor(cat);
                      return (
                        <option 
                          key={cat} 
                          value={cat}
                          style={{ 
                            background: `${catColor}20`, 
                            color: catColor,
                            padding: "8px"
                          }}
                        >
                          {cat}
                        </option>
                      );
                    })}
                  </select>
                  {selectedCategory && (
                    <p className="text-xs mt-1.5" style={{ color: getCategoryColor(selectedCategory) }}>
                      Items added to this category will use its color scheme
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g., Mango Smoothie"
                    className="w-full rounded-xl px-4 py-3 text-base outline-none"
                    style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4", color: "#3b2212" }}
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                    Price (₱) - Medium Size
                  </label>
                  <input
                    type="number"
                    value={itemPrice}
                    onChange={(e) => setItemPrice(e.target.value)}
                    placeholder="e.g., 150"
                    className="w-full rounded-xl px-4 py-3 text-base outline-none"
                    style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4", color: "#3b2212" }}
                  />
                  <p className="text-xs mt-1" style={{ color: "#a07850" }}>
                    Large size price will be automatically set to +₱20
                  </p>
                </div>

                <button
                  onClick={handleAddItem}
                  className="w-full py-3 rounded-xl font-semibold text-lg transition-all active:scale-95 touch-manipulation"
                  style={{ background: selectedCategory ? getCategoryColor(selectedCategory) : "#3b2212", color: "white" }}
                >
                  + Add Item to {selectedCategory || "Category"}
                </button>

                {/* Notification under Add Item button */}
                {message && (
                  <div
                    className={`p-3 rounded-xl text-center transition-all duration-300 ${
                      message.type === "success" 
                        ? "bg-green-50 text-green-700 border border-green-200" 
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                    style={{
                      animation: "fadeInUp 0.3s ease-out",
                    }}
                  >
                    <span className="text-sm font-medium">{message.text}</span>
                  </div>
                )}

                <div className="mt-6 pt-4 border-t" style={{ borderColor: "#e8ddd4" }}>
                  <h3 className="text-md font-semibold mb-3" style={{ color: "#3b2212" }}>
                    Items in "{selectedCategory}"
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {itemsByCategory[selectedCategory]?.length > 0 ? (
                      itemsByCategory[selectedCategory].map((item) => {
                        const catColor = getCategoryColor(selectedCategory);
                        return (
                          <div
                            key={item}
                            className="flex justify-between items-center p-3 rounded-xl"
                            style={{ background: `${catColor}10`, border: `1.5px solid ${catColor}30` }}
                          >
                            <span className="text-sm font-medium" style={{ color: catColor }}>{item}</span>
                            <button
                              onClick={() => handleDeleteClick("item", item, selectedCategory)}
                              className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all active:scale-95"
                              style={{ background: "#fee2e2", color: "#c0392b" }}
                            >
                              Delete
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-center py-4" style={{ color: "#c0b090" }}>
                        No items in this category yet
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add CSS animation */}
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <DeleteConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, type: "category", name: "" })}
        onConfirm={handleConfirmDelete}
        itemName={deleteConfirm.name}
        itemType={deleteConfirm.type}
      />
    </>
  );
}

// Individual Discount Modal Component - BALANCED SIZE (BIGGER BUT FITS)
function IndividualDiscountModal({ 
  isOpen, 
  onClose, 
  onApply, 
  itemName,
  currentDiscount
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onApply: (discountType: "None" | "PWD" | "Senior", name: string, id: string) => void;
  itemName: string;
  currentDiscount: { type: "None" | "PWD" | "Senior"; name: string; id: string };
}) {
  const [discountType, setDiscountType] = useState<"PWD" | "Senior">(
    currentDiscount.type !== "None" ? currentDiscount.type : "PWD"
  );
  const [activeInput, setActiveInput] = useState<"name" | "id" | null>(null);
  const [tempName, setTempName] = useState(currentDiscount.name);
  const [tempID, setTempID] = useState(currentDiscount.id);

  const handleKeyPress = (key: string) => {
    if (activeInput === "name") {
      if (key === "BACKSPACE") {
        setTempName(prev => prev.slice(0, -1));
      } else if (key === "SPACE") {
        setTempName(prev => prev + " ");
      } else if (key === "CLEAR") {
        setTempName("");
      } else {
        setTempName(prev => prev + key);
      }
    } else if (activeInput === "id") {
      if (key === "BACKSPACE") {
        setTempID(prev => prev.slice(0, -1));
      } else if (key === "CLEAR") {
        setTempID("");
      } else if (/^[0-9]$/.test(key)) {
        setTempID(prev => prev + key);
      }
    }
  };

  const handleApply = () => {
    if (tempName.trim() && tempID.trim()) {
      onApply(discountType, tempName, tempID);
    }
  };

  const handleClose = () => {
    // Reset temp values to current discount values when closing without applying
    setTempName(currentDiscount.name);
    setTempID(currentDiscount.id);
    onClose();
  };

  if (!isOpen) return null;

  // Remove Discount button should ONLY be enabled if a discount is ALREADY applied
  const isRemoveButtonEnabled = currentDiscount.type !== "None";
  
  // Apply button should be enabled if name and ID are filled
  const isApplyButtonEnabled = tempName.trim() && tempID.trim();

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-[70] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold" style={{ color: "#3b2212" }}>
              Apply Discount
            </h2>
            <button
              onClick={handleClose}
              className="w-9 h-9 rounded-full flex items-center justify-center text-xl"
              style={{ background: "#f7f3ef", color: "#3b2212", border: "1px solid #e8ddd4" }}
            >
              ✕
            </button>
          </div>
          
          <p className="text-sm mb-5" style={{ color: "#a07850" }}>
            {itemName.length > 45 ? itemName.substring(0, 42) + "..." : itemName} - 20% off
          </p>

          {/* Discount Type Buttons - PWD and Senior only */}
          <div className="flex gap-3 mb-5">
            {(["PWD", "Senior"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setDiscountType(type)}
                className={`flex-1 py-2.5 rounded-xl font-semibold text-base transition-all active:scale-95 ${
                  discountType === type
                    ? "bg-[#3b2212] text-white"
                    : "bg-[#faf7f4] text-[#3b2212] border border-[#e8ddd4]"
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Two Column Layout for Name and ID */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            {/* Left Column - Customer Name */}
            <div>
              <label className="text-sm font-semibold block mb-1.5" style={{ color: "#3b2212" }}>
                Customer Name <span style={{ color: "#c0392b" }}>*</span>
              </label>
              <div
                onClick={() => setActiveInput("name")}
                className={`w-full rounded-xl px-4 py-3 text-base transition-all cursor-pointer ${
                  activeInput === "name" ? "ring-2 ring-[#3b2212]" : ""
                }`}
                style={{
                  background: "#faf7f4",
                  border: "1.5px solid #e8ddd4",
                  color: "#3b2212",
                  minHeight: "48px",
                }}
              >
                {tempName || <span style={{ color: "#c0b090" }}>Tap to enter name...</span>}
              </div>
            </div>

            {/* Right Column - ID Number */}
            <div>
              <label className="text-sm font-semibold block mb-1.5" style={{ color: "#3b2212" }}>
                ID Number <span style={{ color: "#c0392b" }}>*</span>
              </label>
              <div
                onClick={() => setActiveInput("id")}
                className={`w-full rounded-xl px-4 py-3 text-base transition-all cursor-pointer font-mono ${
                  activeInput === "id" ? "ring-2 ring-[#3b2212]" : ""
                }`}
                style={{
                  background: "#faf7f4",
                  border: "1.5px solid #e8ddd4",
                  color: "#3b2212",
                  minHeight: "48px",
                }}
              >
                {tempID || <span style={{ color: "#c0b090" }}>Tap to enter ID number...</span>}
              </div>
            </div>
          </div>

          {/* Custom Keyboard */}
          {activeInput && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: "#e8ddd4" }}>
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm font-semibold" style={{ color: "#3b2212" }}>
                  Enter {activeInput === "name" ? "Customer Name" : "ID Number"}
                </p>
              </div>
              
              {activeInput === "name" ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-10 gap-1.5">
                    {["Q","W","E","R","T","Y","U","I","O","P"].map((key) => (
                      <button key={key} onClick={() => handleKeyPress(key)}
                        className="py-2 rounded-lg font-semibold text-base transition-all active:scale-95"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                        {key}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-9 gap-1.5">
                    {["A","S","D","F","G","H","J","K","L"].map((key) => (
                      <button key={key} onClick={() => handleKeyPress(key)}
                        className="py-2 rounded-lg font-semibold text-base transition-all active:scale-95"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                        {key}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-9 gap-1.5">
                    {["Z","X","C","V","B","N","M"].map((key) => (
                      <button key={key} onClick={() => handleKeyPress(key)}
                        className="py-2 rounded-lg font-semibold text-base transition-all active:scale-95"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                        {key}
                      </button>
                    ))}
                    <button onClick={() => handleKeyPress("SPACE")}
                      className="py-2 rounded-lg font-semibold text-sm transition-all active:scale-95 col-span-2"
                      style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                      SPACE
                    </button>
                    <button onClick={() => handleKeyPress("BACKSPACE")}
                      className="py-2 rounded-lg font-semibold text-base transition-all active:scale-95"
                      style={{ background: "#fee2e2", color: "#c0392b", border: "1px solid #f5c6c6" }}>
                      ⌫
                    </button>
                    <button onClick={() => handleKeyPress("CLEAR")}
                      className="py-2 rounded-lg font-semibold text-sm transition-all active:scale-95"
                      style={{ background: "#fff0f0", color: "#c0392b", border: "1px solid #f5c6c6" }}>
                      CLEAR
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {["1","2","3","4","5","6","7","8","9"].map((num) => (
                      <button key={num} onClick={() => handleKeyPress(num)}
                        className="py-3.5 rounded-xl font-bold text-2xl transition-all active:scale-95"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                        {num}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => handleKeyPress("CLEAR")}
                      className="py-3.5 rounded-xl font-bold text-base transition-all active:scale-95"
                      style={{ background: "#fff0f0", color: "#c0392b", border: "1.5px solid #f5c6c6" }}>
                      CLEAR
                    </button>
                    <button onClick={() => handleKeyPress("0")}
                      className="py-3.5 rounded-xl font-bold text-2xl transition-all active:scale-95"
                      style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                      0
                    </button>
                    <button onClick={() => handleKeyPress("BACKSPACE")}
                      className="py-3.5 rounded-xl font-bold text-2xl transition-all active:scale-95"
                      style={{ background: "#fee2e2", color: "#c0392b", border: "1.5px solid #f5c6c6" }}>
                      ⌫
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4 mt-6">
            <button
              disabled={!isRemoveButtonEnabled}
              onClick={() => {
                onApply("None", "", "");
                onClose();
              }}
              className="flex-1 py-3 rounded-xl font-semibold text-base transition-all active:scale-95"
              style={{
                background: !isRemoveButtonEnabled ? "#e8e0d8" : "#f0e8e0",
                color: !isRemoveButtonEnabled ? "#b09070" : "#3b2212",
                cursor: !isRemoveButtonEnabled ? "not-allowed" : "pointer"
              }}
            >
              Remove Discount
            </button>
            <button
              disabled={!isApplyButtonEnabled}
              onClick={handleApply}
              className="flex-1 py-3 rounded-xl font-semibold text-base transition-all active:scale-95"
              style={{
                background: !isApplyButtonEnabled ? "#e8e0d8" : "#2d7a38",
                color: !isApplyButtonEnabled ? "#b09070" : "white",
                cursor: !isApplyButtonEnabled ? "not-allowed" : "pointer",
              }}
            >
              Apply Discount
            </button>
          </div>
        </div>
      </div>
    </div>
  );



}export default function POSLayout() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  const [inventoryStock, setInventoryStock] = useState<Record<string, { quantity: number; unit: string; reorderLevel: number }>>({});

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "inventory"), (snapshot) => {
      const stock: Record<string, { quantity: number; unit: string; reorderLevel: number }> = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.name) {
          stock[data.name] = { 
            quantity: parseFloat(data.quantity) || 0, 
            unit: data.unit || "units",
            reorderLevel: parseFloat(data.reorderLevel) || 0
          };
        }
      });
      setInventoryStock(stock);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  // Load menu from Firestore (seed with hardcoded items if collections are empty)
  // Wait for authenticated user so Firestore rules pass
  useEffect(() => {
    if (!user?.uid) {
      console.log("Menu load: waiting for authenticated user...");
      return;
    }
    const seedAndLoad = async () => {
      try {
        const hardcodedProducts: Record<string, string[]> = {
          Coffee: ["Americano", "Cappuccino", "Hazelnut", "Caramel Macchiato", "Mocha", "Spanish Latte", "Salted Caramel Latte", "Dirty Matcha", "Vanilla Latte"],
          "Non Coffee": ["Choco", "Dark Choco", "Matcha latte", "Salted Caramel", "Caramel"],
          Milktea: ["Wintermelon", "Okinawa", "Dark Choco", "Capuccino"],
          "Yakult Mix": ["Wintermelon", "Blueberry", "Green Apple", "Lychee", "Strawberry"],
          "Fruit Tea": ["Wintermelon", "Blueberry", "Green Apple", "Lychee", "Strawberry"],
          "Hot Tea": ["English Breakfast", "Four Red Fruits", "Pure Camomile", "Green Tea & Lemon", "Lemon & Ginger"],
        };

        console.log("Menu load: fetching categories + menu_items as uid=", user.uid);

        // Fetch independently so one failure doesn't kill the other
        let categoriesSnap;
        let itemsSnap;
        try {
          categoriesSnap = await getDocs(collection(db, "categories"));
        } catch (e) {
          console.error("Failed to read categories:", e);
          return;
        }
        try {
          itemsSnap = await getDocs(collection(db, "menu_items"));
        } catch (e) {
          console.error("Failed to read menu_items:", e);
          return;
        }

        console.log(
          `Menu load: categories=${categoriesSnap.size}, menu_items=${itemsSnap.size}`
        );

        // Seed if both empty
        if (categoriesSnap.empty && itemsSnap.empty) {
          console.log("Seeding menu collections...");
          const seedCategories = [
            { name: "Coffee", color: "#C0392B" },
            { name: "Non Coffee", color: "#2980B9" },
            { name: "Milktea", color: "#F39C12" },
            { name: "Yakult Mix", color: "#43A047" },
            { name: "Fruit Tea", color: "#E91E63" },
            { name: "Hot Tea", color: "#5E35B1" },
            { name: "Frappe", color: "#7B4A2B" },
            { name: "Food & Bites", color: "#8D6E63" },
          ];
          for (const c of seedCategories) {
            await addDoc(collection(db, "categories"), {
              name: c.name,
              color: c.color,
              items: hardcodedProducts[c.name] || [],
              isDefault: true,
              createdAt: serverTimestamp(),
            });
          }
          console.log("Seeding done.");
          // Re-load after seeding
          const reCats = await getDocs(collection(db, "categories"));
          reCats.forEach((d) => {
            const data = d.data();
            if (data.name && data.color) {
              categoryColors[data.name] = {
                bg: `${data.color}20`,
                hoverBg: `${data.color}30`,
                activeBg: data.color,
                text: data.color,
              };
            }
          });
          return;
        }

        // First pass: collect all menu_items names per category (for orphan detection)
        const menuItemsByCategory: Record<string, Set<string>> = {};
        const loadedPrices: Record<string, { M: number; L: number }> = {};
        const loadedItemColors: Record<string, { bg: string; hoverBg?: string; activeBg: string; text: string }> = {};
        itemsSnap.forEach((d) => {
          const data = d.data();
          if (!data.name || data.price == null) return;
          loadedPrices[data.name] = { M: data.price, L: data.price + 20 };
          if (data.categoryColor) {
            loadedItemColors[data.name] = {
              bg: `${data.categoryColor}20`,
              activeBg: data.categoryColor,
              text: data.categoryColor,
            };
          }
          if (data.category) {
            if (!menuItemsByCategory[data.category]) menuItemsByCategory[data.category] = new Set();
            menuItemsByCategory[data.category].add(data.name);
          }
        });

        // Second pass: load categories, filter out orphan items, and self-heal DB
        const loadedDynamicProducts: Record<string, string[]> = {};
        const cleanupPromises: Promise<void>[] = [];
        categoriesSnap.forEach((d) => {
          const data = d.data();
          if (!data.name) return;

          // Override too-light/unreadable colors (e.g., the old Frappe #D0D0D0 seed)
          let displayColor = data.color;
          const colorOverrides: Record<string, string> = {
            Frappe: "#7B4A2B",
          };
          if (colorOverrides[data.name] && (!displayColor || displayColor.toUpperCase() === "#D0D0D0")) {
            displayColor = colorOverrides[data.name];
            // Persist the corrected color back to DB
            cleanupPromises.push(
              updateDoc(d.ref, { color: displayColor }).catch((err) =>
                console.warn(`Could not update color for "${data.name}":`, err.message)
              )
            );
          }

          if (displayColor) {
            categoryColors[data.name] = {
              bg: `${displayColor}20`,
              hoverBg: `${displayColor}30`,
              activeBg: displayColor,
              text: displayColor,
            };
          }

          const rawItems: string[] = data.items || [];
          const defaults = hardcodedProducts[data.name] || [];
          const customItems = menuItemsByCategory[data.name] || new Set<string>();

          // Defaults: must be in category.items array (so they can be removed if user wants)
          const visibleDefaults = rawItems.filter((name: string) => defaults.includes(name));

          // Custom items: read directly from menu_items collection (source of truth)
          // This way: deleting from menu_items removes it; adding to menu_items adds it.
          const visibleCustom = Array.from(customItems);

          const validItems = [...visibleDefaults, ...visibleCustom];
          loadedDynamicProducts[data.name] = validItems;

          // Self-heal: sync category.items array to match (best-effort)
          const expectedItems = [...visibleDefaults, ...visibleCustom];
          const arraysDiffer =
            expectedItems.length !== rawItems.length ||
            expectedItems.some((n) => !rawItems.includes(n));
          if (arraysDiffer) {
            console.log(`Syncing "${data.name}" items array in DB`);
            cleanupPromises.push(
              updateDoc(d.ref, { items: expectedItems }).catch((err) =>
                console.warn(`Could not auto-sync "${data.name}" (likely insufficient permissions):`, err.message)
              )
            );
          }
        });

        // Fire cleanups (don't block UI)
        if (cleanupPromises.length) {
          Promise.all(cleanupPromises).then(() =>
            console.log("Orphan cleanup completed")
          );
        }

        setDynamicProducts(loadedDynamicProducts);
        setDynamicPrices(loadedPrices);
        setDynamicItemColors(loadedItemColors);
        console.log(`Loaded ${categoriesSnap.size} categories and ${itemsSnap.size} items from DB`);
      } catch (err) {
        console.error("Error loading menu from DB (using hardcoded fallback):", err);
      }
    };
    seedAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: crypto.randomUUID(),
      name: "Customer 1",
      orderItems: [],
      bulkDiscount: "None",
      createdAt: new Date(),
    }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState("");
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  const [activeCategory, setActiveCategory] = useState<string>("Coffee");
  const [activeFoodSubCategory, setActiveFoodSubCategory] = useState<string>("All");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [activeFrappeType, setActiveFrappeType] = useState<string | null>(null);
  const [tempOption, setTempOption] = useState("Hot");
  const [sizeOption, setSizeOption] = useState("Medium");
  const [sugarOption, setSugarOption] = useState("100%");
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductIsFood, setSelectedProductIsFood] = useState(false);
  const [selectedProductCategory, setSelectedProductCategory] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; method: "Cash" | "GCash" | null }>({ open: false, method: null });
  const [cashModal, setCashModal] = useState(false);
  const [gcashRefModal, setGcashRefModal] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [discountModalItem, setDiscountModalItem] = useState<{ index: number; item: OrderItem } | null>(null);
  const [userRole, setUserRole] = useState<string>("");

  // Fetch the logged-in user's role from Firestore users collection
  useEffect(() => {
    const fetchRole = async () => {
      if (!user?.uid) {
        setUserRole("");
        return;
      }
      try {
        // Primary: lookup by doc ID
        const byIdSnap = await getDoc(doc(db, "users", user.uid));
        if (byIdSnap.exists()) {
          setUserRole(byIdSnap.data().role || "");
          return;
        }
        // Fallback: query by uid field
        const userQuery = query(collection(db, "users"), where("uid", "==", user.uid));
        const snap = await getDocs(userQuery);
        if (!snap.empty) {
          setUserRole(snap.docs[0].data().role || "");
        }
      } catch (err) {
        console.error("Error fetching user role:", err);
      }
    };
    fetchRole();
  }, [user]);

  const canManageMenu = ["admin", "Admin", "manager", "Manager"].includes(userRole);

  const [dynamicProducts, setDynamicProducts] = useState<Record<string, string[]>>({});
  const [dynamicPrices, setDynamicPrices] = useState<Record<string, { M: number; L: number }>>({});
  const [dynamicItemColors, setDynamicItemColors] = useState<Record<string, { bg: string; hoverBg?: string; activeBg: string; text: string }>>({});

  const [gcashName, setGcashName] = useState("");
  const [gcashNumber, setGcashNumber] = useState("");
  const [activeGcashInput, setActiveGcashInput] = useState<"name" | null>(null);

  const [amountTendered, setAmountTendered] = useState("");
  const [lastTransaction, setLastTransaction] = useState<{
    number: string;
    method: string;
    total: number;
    discountAmount: number;
    amountTendered: string;
    gcashSenderName?: string;
    gcashNumber?: string;
  } | null>(null);
  const [qtyInputs, setQtyInputs] = useState<Record<number, string>>({});

  const [isProcessing, setIsProcessing] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const activeTab = tabs.find(tab => tab.id === activeTabId);
  const orderItems = activeTab?.orderItems || [];
  const bulkDiscount = activeTab?.bulkDiscount || "None";

  const updateActiveTabOrderItems = (newOrderItems: OrderItem[]) => {
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId ? { ...tab, orderItems: newOrderItems } : tab
    ));
  };

  const updateActiveTabBulkDiscount = (newDiscount: "None" | "5%" | "10%") => {
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId ? { ...tab, bulkDiscount: newDiscount } : tab
    ));
  };

  const updateItemDiscount = (index: number, discountType: "None" | "PWD" | "Senior", name: string, id: string) => {
    const newOrderItems = orderItems.map((item, i) =>
      i === index ? { 
        ...item, 
        discountType, 
        discountCustomerName: discountType !== "None" ? name : "",
        discountCustomerID: discountType !== "None" ? id : ""
      } : item
    );
    updateActiveTabOrderItems(newOrderItems);
  };

  const createNewTab = () => {
    const newTabId = crypto.randomUUID();
    const newTabNumber = tabs.length + 1;
    const newTab: Tab = {
      id: newTabId,
      name: `Customer ${newTabNumber}`,
      orderItems: [],
      bulkDiscount: "None",
      createdAt: new Date(),
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTabId);
    
    setTimeout(() => {
      if (tabsContainerRef.current) {
        tabsContainerRef.current.scrollLeft = tabsContainerRef.current.scrollWidth;
      }
    }, 100);
  };

  const closeTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      if (confirm("Clear all items in this tab?")) {
        setTabs(prev => prev.map(tab => 
          tab.id === tabId 
            ? { ...tab, orderItems: [], bulkDiscount: "None" } 
            : tab
        ));
      }
      return;
    }
    
    setTabs(prev => {
      const newTabs = prev.filter(tab => tab.id !== tabId);
      if (activeTabId === tabId && newTabs.length > 0) {
        setActiveTabId(newTabs[0].id);
      }
      return newTabs;
    });
  };

  const startEditingTabName = (tabId: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTabId(tabId);
    setEditingTabName(currentName);
  };

  const saveTabName = () => {
    if (editingTabId && editingTabName.trim()) {
      setTabs(prev => prev.map(tab => 
        tab.id === editingTabId ? { ...tab, name: editingTabName.trim() } : tab
      ));
    }
    setEditingTabId(null);
    setEditingTabName("");
  };

  const handleTabNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveTabName();
    } else if (e.key === 'Escape') {
      setEditingTabId(null);
      setEditingTabName("");
    }
  };

  const handleRemoveItem = (index: number) => {
    const newOrderItems = orderItems.filter((_, i) => i !== index);
    updateActiveTabOrderItems(newOrderItems);
  };

  const handleIncreaseQty = (index: number) => {
    const newOrderItems = orderItems.map((item, i) =>
      i === index ? { ...item, quantity: item.quantity + 1 } : item
    );
    updateActiveTabOrderItems(newOrderItems);
  };

  const handleDecreaseQty = (index: number) => {
    const newOrderItems = orderItems.map((item, i) => {
      if (i !== index) return item;
      if (item.quantity <= 1) return item;
      return { ...item, quantity: item.quantity - 1 };
    });
    updateActiveTabOrderItems(newOrderItems);
  };

  const products: Record<string, string[]> = {
    Coffee: ["Americano", "Cappuccino", "Hazelnut", "Caramel Macchiato", "Mocha", "Spanish Latte", "Salted Caramel Latte", "Dirty Matcha", "Vanilla Latte"],
    "Non Coffee": ["Choco", "Dark Choco", "Matcha latte", "Salted Caramel", "Caramel"],
    Milktea: ["Wintermelon", "Okinawa", "Dark Choco", "Capuccino"],
    "Yakult Mix": ["Wintermelon", "Blueberry", "Green Apple", "Lychee", "Strawberry"],
    "Fruit Tea": ["Wintermelon", "Blueberry", "Green Apple", "Lychee", "Strawberry"],
    "Hot Tea": ["English Breakfast", "Four Red Fruits", "Pure Camomile", "Green Tea & Lemon", "Lemon & Ginger"],
    Frappe: [],
    "Food & Bites": [],
  };

  // Source of truth: DB-loaded dynamicProducts only (no hardcoded fallback)
  const allProducts: Record<string, string[]> = { ...dynamicProducts };
  
  const frappeProducts = {
    "Coffee Based": ["Java Chip", "Coffee Jelly", "Dark Mocha", "Caramel"],
    "Cream Based": ["Vanilla", "Cookies & Cream", "Strawberries & Cream", "Blue Berries & Cream", "Choco Chip", "Caramel", "Salted Caramel"],
    "Tea Based": ["Wintermelon", "Okinawa", "Capuccino"],
  };

  const foodProducts: Record<string, string[]> = {
    "Grilled / Fried": ["Liempo", "Leg Quarters"],
    "Sides & Snacks": ["French Fries", "Chicken Fingers", "Nachos", "Quesadillas"],
    "Sandwiches & Burgers": ["Burger", "Cheese Burger", "Ham & Cheese"],
    Breakfast: ["French Toast", "Waffle", "Pancake"],
    "Desserts & Pastries": ["Cheesecake", "Empanada", "Muffin", "Cookies", "Popcorn", "Pancake (Dessert)"],
    "Silog Meals": ["Tapa", "Bangus", "Spam", "Hotdog", "Ham", "Longganisa"],
    Pasta: ["Spaghetti", "Tuna Pesto"],
    Salads: ["Vegetable Salad"],
  };

  const coffeePrices: Record<string, { M: number; L: number }> = {
    "Americano":           { M: 100, L: 120 },
    "Cappuccino":          { M: 150, L: 170 },
    "Hazelnut":            { M: 150, L: 170 },
    "Caramel Macchiato":   { M: 150, L: 170 },
    "Mocha":               { M: 150, L: 170 },
    "Spanish Latte":       { M: 150, L: 170 },
    "Salted Caramel Latte":{ M: 150, L: 170 },
    "Dirty Matcha":        { M: 150, L: 170 },
    "Vanilla Latte":       { M: 150, L: 170 },
  };

  const nonCoffeePrices: Record<string, { M: number; L: number }> = {
    "Choco":          { M: 140, L: 160 },
    "Dark Choco":     { M: 140, L: 160 },
    "Matcha latte":   { M: 140, L: 160 },
    "Salted Caramel": { M: 140, L: 160 },
    "Caramel":        { M: 140, L: 160 },
  };

  const milkteaPrices: Record<string, { M: number; L: number }> = {
    "Wintermelon": { M: 120, L: 140 },
    "Okinawa":     { M: 120, L: 140 },
    "Dark Choco":  { M: 115, L: 135 },
    "Capuccino":   { M: 115, L: 135 },
  };

  const yakultMixPrices: Record<string, { M: number; L: number }> = {
    "Wintermelon": { M: 150, L: 170 },
    "Blueberry":   { M: 150, L: 170 },
    "Green Apple": { M: 150, L: 170 },
    "Lychee":      { M: 150, L: 170 },
    "Strawberry":  { M: 150, L: 170 },
  };

  const fruitTeaPrices: Record<string, { M: number; L: number }> = {
    "Wintermelon": { M: 110, L: 130 },
    "Blueberry":   { M: 110, L: 130 },
    "Green Apple": { M: 110, L: 130 },
    "Lychee":      { M: 110, L: 130 },
    "Strawberry":  { M: 110, L: 130 },
  };

  const hotTeaPrices: Record<string, number> = {
    "English Breakfast":  120,
    "Four Red Fruits":    120,
    "Pure Camomile":      120,
    "Green Tea & Lemon":  120,
    "Lemon & Ginger":     120,
  };

  const frappeCoffeeBasedPrices: Record<string, { M: number; L: number }> = {
    "Java Chip":    { M: 155, L: 175 },
    "Coffee Jelly": { M: 155, L: 175 },
    "Dark Mocha":   { M: 155, L: 175 },
    "Caramel":      { M: 155, L: 175 },
  };

  const frappeCreamBasedPrices: Record<string, { M: number; L: number }> = {
    "Vanilla":              { M: 150, L: 170 },
    "Cookies & Cream":      { M: 150, L: 170 },
    "Strawberries & Cream": { M: 150, L: 170 },
    "Blue Berries & Cream": { M: 150, L: 170 },
    "Choco Chip":           { M: 150, L: 170 },
    "Caramel":              { M: 150, L: 170 },
    "Salted Caramel":       { M: 150, L: 170 },
  };

  const frappeTeaBasedPrices: Record<string, { M: number; L: number }> = {
    "Wintermelon": { M: 140, L: 160 },
    "Okinawa":     { M: 140, L: 160 },
    "Capuccino":   { M: 140, L: 160 },
  };

  const foodPrices: Record<string, number> = {
    "Liempo":        220,
    "Leg Quarters":  220,
    "French Fries":     130,
    "Chicken Fingers":  200,
    "Nachos":           200,
    "Quesadillas":      0,
    "Quesadillas (Beef)":   200,
    "Quesadillas (Cheese)": 170,
    "Burger":       200,
    "Cheese Burger":200,
    "Ham & Cheese": 180,
    "French Toast": 150,
    "Waffle":       150,
    "Pancake":      150,
    "Cheesecake": 120,
    "Empanada":   120,
    "Muffin":     100,
    "Cookies":    120,
    "Popcorn":    100,
    "Pancake (Dessert)": 120,
    "Tapa":       220,
    "Bangus":     220,
    "Spam":       190,
    "Hotdog":     160,
    "Ham":        160,
    "Longganisa": 160,
    "Spaghetti":  220,
    "Tuna Pesto": 220,
    "Vegetable Salad": 180,
  };

  const ADD_ON_PRICE = 30;

  const handleAddCategory = async (categoryName: string, color: string) => {
    try {
      await addDoc(collection(db, "categories"), {
        name: categoryName,
        color: color,
        items: [],
        isDefault: false,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Error saving category to DB:", err);
    }

    setDynamicProducts(prev => ({
      ...prev,
      [categoryName]: []
    }));

    categoryColors[categoryName] = {
      bg: `${color}20`,
      hoverBg: `${color}30`,
      activeBg: color,
      text: color,
    };
  };

  const handleAddItem = async (item: { name: string; price: number; category: string }) => {
    const categoryColor = categoryColors[item.category]?.activeBg || "#3b2212";

    try {
      await addDoc(collection(db, "menu_items"), {
        name: item.name,
        price: item.price,
        category: item.category,
        categoryColor: categoryColor,
        isCustom: true,
        createdAt: serverTimestamp(),
      });

      // Update the category doc's items array if it exists
      const catQuery = query(collection(db, "categories"), where("name", "==", item.category));
      const catSnap = await getDocs(catQuery);
      if (!catSnap.empty) {
        const catDoc = catSnap.docs[0];
        const currentItems = catDoc.data().items || [];
        if (!currentItems.includes(item.name)) {
          await updateDoc(catDoc.ref, { items: [...currentItems, item.name] });
        }
      }
    } catch (err) {
      console.error("Error saving item to DB:", err);
    }

    setDynamicProducts(prev => ({
      ...prev,
      [item.category]: [...(prev[item.category] || []), item.name],
    }));

    setDynamicPrices(prev => ({
      ...prev,
      [item.name]: { M: item.price, L: item.price + 20 },
    }));

    setDynamicItemColors(prev => ({
      ...prev,
      [item.name]: {
        bg: `${categoryColor}20`,
        activeBg: categoryColor,
        text: categoryColor,
      },
    }));
  };

  const handleDeleteCategory = async (categoryName: string) => {
    const defaultCategories = ["Coffee", "Non Coffee", "Milktea", "Yakult Mix", "Fruit Tea", "Hot Tea", "Frappe", "Food & Bites"];
    if (defaultCategories.includes(categoryName)) {
      alert("Cannot delete default categories!");
      return;
    }

    const itemsToRemove = [...(dynamicProducts[categoryName] || [])];

    try {
      // Delete category doc
      const catQuery = query(collection(db, "categories"), where("name", "==", categoryName));
      const catSnap = await getDocs(catQuery);
      for (const d of catSnap.docs) {
        await deleteDoc(d.ref);
      }
      // Delete all items under this category
      const itemsQuery = query(collection(db, "menu_items"), where("category", "==", categoryName));
      const itemsSnap = await getDocs(itemsQuery);
      for (const d of itemsSnap.docs) {
        await deleteDoc(d.ref);
      }
    } catch (err) {
      console.error("Error deleting category from DB:", err);
    }
    
    setDynamicProducts(prev => {
      const newProducts = { ...prev };
      delete newProducts[categoryName];
      return newProducts;
    });
    
    setDynamicPrices(prev => {
      const newPrices = { ...prev };
      itemsToRemove.forEach(item => {
        delete newPrices[item];
      });
      return newPrices;
    });
    
    setDynamicItemColors(prev => {
      const newColors = { ...prev };
      itemsToRemove.forEach(item => {
        delete newColors[item];
      });
      return newColors;
    });
  };

  const handleDeleteItem = async (categoryName: string, itemName: string) => {
    const defaultItems = [
      "Americano", "Cappuccino", "Hazelnut", "Caramel Macchiato", "Mocha", "Spanish Latte", "Salted Caramel Latte", "Dirty Matcha", "Vanilla Latte",
      "Choco", "Dark Choco", "Matcha latte", "Salted Caramel", "Caramel",
      "Wintermelon", "Okinawa", "Dark Choco", "Capuccino",
      "Liempo", "Leg Quarters", "French Fries", "Chicken Fingers", "Nachos", "Quesadillas",
      "Burger", "Cheese Burger", "Ham & Cheese", "French Toast", "Waffle", "Pancake",
      "Cheesecake", "Empanada", "Muffin", "Cookies", "Popcorn", "Pancake (Dessert)",
      "Tapa", "Bangus", "Spam", "Hotdog", "Ham", "Longganisa", "Spaghetti", "Tuna Pesto", "Vegetable Salad"
    ];

    if (defaultItems.includes(itemName)) {
      alert("Cannot delete default items!");
      return;
    }

    try {
      // Delete the item doc
      const itemQuery = query(
        collection(db, "menu_items"),
        where("name", "==", itemName),
        where("category", "==", categoryName)
      );
      const itemSnap = await getDocs(itemQuery);
      for (const d of itemSnap.docs) {
        await deleteDoc(d.ref);
      }
      // Update the category's items array
      const catQuery = query(collection(db, "categories"), where("name", "==", categoryName));
      const catSnap = await getDocs(catQuery);
      if (!catSnap.empty) {
        const catDoc = catSnap.docs[0];
        const currentItems = catDoc.data().items || [];
        await updateDoc(catDoc.ref, {
          items: currentItems.filter((i: string) => i !== itemName),
        });
      }
    } catch (err) {
      console.error("Error deleting item from DB:", err);
    }

    setDynamicProducts(prev => ({
      ...prev,
      [categoryName]: prev[categoryName]?.filter(item => item !== itemName) || []
    }));
    
    setDynamicPrices(prev => {
      const newPrices = { ...prev };
      delete newPrices[itemName];
      return newPrices;
    });
    
    setDynamicItemColors(prev => {
      const newColors = { ...prev };
      delete newColors[itemName];
      return newColors;
    });
  };

  const getDrinkPrice = (productName: string, size: string, category: string, frappeType: string | null): number => {
    const s = size === "Large" || size === "Pot" ? "L" : "M";
    
    if (dynamicPrices[productName]) {
      return dynamicPrices[productName][s as "M"|"L"] ?? dynamicPrices[productName]["M"] ?? 150;
    }
    
    switch (category) {
      case "Coffee": return coffeePrices[productName]?.[s as "M"|"L"] ?? 150;
      case "Non Coffee": return nonCoffeePrices[productName]?.[s as "M"|"L"] ?? 140;
      case "Milktea": return milkteaPrices[productName]?.[s as "M"|"L"] ?? 120;
      case "Yakult Mix": return yakultMixPrices[productName]?.[s as "M"|"L"] ?? 150;
      case "Fruit Tea": return fruitTeaPrices[productName]?.[s as "M"|"L"] ?? 110;
      case "Hot Tea": return hotTeaPrices[productName] ?? 120;
      default: {
        const fType = frappeType ?? getFrappeType(productName);
        if (fType === "Coffee Based") return frappeCoffeeBasedPrices[productName]?.[s as "M"|"L"] ?? 155;
        if (fType === "Cream Based")  return frappeCreamBasedPrices[productName]?.[s as "M"|"L"] ?? 150;
        if (fType === "Tea Based")    return frappeTeaBasedPrices[productName]?.[s as "M"|"L"] ?? 140;
        return 150;
      }
    }
  };

  const getFrappeType = (name: string): string | null => {
    for (const [type, items] of Object.entries(frappeProducts)) {
      if (items.includes(name)) return type;
    }
    return null;
  };

  const allFoodItems = Object.values(foodProducts).flat();
  const quesadillasVariants = ["Beef", "Cheese"];

  const allProductEntries: { name: string; category: string }[] = [
    ...Object.entries(allProducts).flatMap(([cat, items]) =>
      (items as string[]).map(name => ({ name, category: cat }))
    ),
    ...Object.entries(frappeProducts).flatMap(([sub, items]) =>
      items.map(name => ({ name, category: `Frappe · ${sub}` }))
    ),
    ...Object.entries(foodProducts).flatMap(([sub, items]) =>
      items.map(name => ({ name, category: `Food & Bites · ${sub}` }))
    ),
  ];

  const searchResults = searchQuery.trim().length > 0
    ? allProductEntries.filter(entry =>
        entry.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const isSearching = searchQuery.trim().length > 0;

  const checkIsFood = (productName: string) => allFoodItems.includes(productName);
  const checkIsFrappe = (productName: string) => {
    return Object.values(frappeProducts).flat().includes(productName);
  };

  const isFood = isSearching ? selectedProductIsFood : activeCategory === "Food & Bites";

  const drinkCategoriesHideTemp = ["Milktea", "Yakult Mix", "Fruit Tea", "Frappe", "Hot Tea", "Food & Bites"];
  const hideTemperature = isFood || (isSearching
    ? checkIsFrappe(selectedProduct || "")
    : drinkCategoriesHideTemp.includes(activeCategory));

  const categoriesWithAddOns = ["Coffee", "Non Coffee", "Milktea", "Yakult Mix", "Fruit Tea", "Frappe"];
  const showAddOns = isSearching
    ? !checkIsFood(selectedProduct || "")
    : categoriesWithAddOns.includes(activeCategory);

  // ---------------------------------------------------------
  // RESERVED STOCK & STOCK CHECKER PARA SA UI TEXT
  // ---------------------------------------------------------
  const alreadyInCartReserved: Record<string, number> = {};
  tabs.forEach(tab => {
    tab.orderItems.forEach(cartItem => {
      const cSizeKey = cartItem.size === "Large" ? "Large" : "Medium";
      const catLabel = cartItem.category.split(" · ")[0];
      const cSpecificRecipeKey = `${catLabel} - ${cartItem.name}`;
      const cRecipe = RECIPES[cSpecificRecipeKey]?.[cSizeKey] || RECIPES[cartItem.name]?.[cSizeKey];
      
      if (cRecipe) {
        Object.entries(cRecipe).forEach(([ing, amt]) => {
          alreadyInCartReserved[ing] = (alreadyInCartReserved[ing] || 0) + ((amt as number) * cartItem.quantity);
        });
      }
      if (cartItem.addOns) {
        cartItem.addOns.forEach(addOn => {
          alreadyInCartReserved[addOn] = (alreadyInCartReserved[addOn] || 0) + ((ADD_ON_SERVING_SIZES[addOn] || 1) * cartItem.quantity);
        });
      }
    });
  });

  const getItemStockStatus = (item: string, categoryLabel?: string): "Available" | "Low Stock" | "Not Available" | "No Ingredients" => {
    const catLabel = categoryLabel ? categoryLabel.split(" · ")[0] : "";
    const specificRecipeKey = `${catLabel} - ${item}`;
    const recipe = RECIPES[specificRecipeKey]?.["Medium"] || RECIPES[item]?.["Medium"];
    
    if (!recipe) {
      if (catLabel === "Food & Bites") return "Available"; 
      return "No Ingredients"; 
    }

    let isLow = false;

    for (const [ingredient, neededAmount] of Object.entries(recipe)) {
      const stockData = inventoryStock[ingredient];
      const stockAvailable = stockData?.quantity || 0;
      
      const reorderLvl = stockData?.reorderLevel || ((neededAmount as number) * 3); 
      const reserved = alreadyInCartReserved[ingredient] || 0;
      const remaining = stockAvailable - reserved;

      if (remaining < (neededAmount as number)) {
        return "Not Available"; 
      } else if (remaining <= reorderLvl) {
        isLow = true; 
      }
    }
    return isLow ? "Low Stock" : "Available";
  };

  // ---------------------------------------------------------
  // REAL-TIME OOS CHECKER PARA SA LOOB NG MODAL
  // ---------------------------------------------------------
  const currentMissingIngredients: string[] = [];
  if (selectedProduct) {
    const requiredForThisItem: Record<string, number> = {};
    const sizeKey = sizeOption === "Large" ? "Large" : "Medium";
    const catLabel = selectedProductCategory.split(" · ")[0];
    const specificRecipeKey = `${catLabel} - ${selectedProduct}`;
    
    const recipe = RECIPES[specificRecipeKey]?.[sizeKey] || RECIPES[selectedProduct]?.[sizeKey]; 
    
    if (recipe) {
      Object.entries(recipe).forEach(([ingredientName, amount]) => {
        requiredForThisItem[ingredientName] = (requiredForThisItem[ingredientName] || 0) + (amount as number);
      });
    }

    if (selectedAddOns.length > 0) {
      selectedAddOns.forEach(addOn => {
        requiredForThisItem[addOn] = (requiredForThisItem[addOn] || 0) + (ADD_ON_SERVING_SIZES[addOn] || 1);
      });
    }

    Object.entries(requiredForThisItem).forEach(([ingredient, neededAmount]) => {
      const stockAvailable = inventoryStock[ingredient]?.quantity || 0;
      const reserved = alreadyInCartReserved[ingredient] || 0;
      const unit = inventoryStock[ingredient]?.unit || "units";
      
      if ((reserved + neededAmount) > stockAvailable) {
        currentMissingIngredients.push(`${ingredient} (Need: ${neededAmount}${unit}, Available: ${Math.max(0, stockAvailable - reserved)}${unit})`);
      }
    });
  }

  const getModalPrice = (): number => {
    if (!selectedProduct) return 0;
    if (isFood) {
      if (selectedProduct === "Quesadillas") {
        const variantKey = selectedVariant ? `Quesadillas (${selectedVariant})` : "Quesadillas";
        return (foodPrices[variantKey] ?? 0) + selectedAddOns.length * ADD_ON_PRICE;
      }
      return (foodPrices[selectedProduct] ?? 0) + selectedAddOns.length * ADD_ON_PRICE;
    }
    const cat = isSearching ? selectedProductCategory.split(" · ")[0] : activeCategory;
    const fType = isSearching ? getFrappeType(selectedProduct) : activeFrappeType;
    const base = getDrinkPrice(selectedProduct, sizeOption, cat, fType);
    return base + selectedAddOns.length * ADD_ON_PRICE;
  };

  const modalPrice = getModalPrice();

  const handleAddToOrder = () => {
    if (!selectedProduct) return;
    if (selectedProduct === "Quesadillas" && !selectedVariant) return;
    if (currentMissingIngredients.length > 0) return;

    let price: number;
    let displayName = selectedProduct;

    if (isFood) {
      if (selectedProduct === "Quesadillas" && selectedVariant) {
        displayName = `Quesadillas (${selectedVariant})`;
        price = (foodPrices[displayName] ?? 0) + selectedAddOns.length * ADD_ON_PRICE;
      } else {
        price = (foodPrices[selectedProduct] ?? 0) + selectedAddOns.length * ADD_ON_PRICE;
      }
    } else {
      const cat = isSearching ? selectedProductCategory.split(" · ")[0] : activeCategory;
      const fType = isSearching ? getFrappeType(selectedProduct) : activeFrappeType;
      const base = getDrinkPrice(selectedProduct, sizeOption, cat, fType);
      price = base + selectedAddOns.length * ADD_ON_PRICE;
    }

    const newItem: OrderItem = {
      name: displayName,
      category: selectedProductCategory,
      temperature: isFood ? "" : tempOption,
      size: isFood ? "" : sizeOption,
      sugar: isFood ? "" : sugarOption,
      quantity: 1,
      price,
      addOns: selectedAddOns.length > 0 ? selectedAddOns : undefined,
      discountType: "None",
      discountCustomerName: "",
      discountCustomerID: "",
    };

    updateActiveTabOrderItems([...orderItems, newItem]);
    setSelectedProduct(null);
    setTempOption("Hot");
    setSizeOption("Medium");
    setSugarOption("100%");
    setSelectedAddOns([]);
    setSelectedVariant(null);
    setSelectedProductIsFood(false);
    setSelectedProductCategory("");
    setModalError(null);
  };

  const handleToggleAddOn = (addOn: string) => {
    setSelectedAddOns(prev => prev.includes(addOn) ? prev.filter(i => i !== addOn) : [...prev, addOn]);
  };
  const handleClearAddOns = () => setSelectedAddOns([]);

  // Calculate subtotal with individual item discounts
  const calculateSubtotal = () => {
    let total = 0;
    orderItems.forEach(item => {
      let itemTotal = item.price * item.quantity;
      if (item.discountType === "PWD" || item.discountType === "Senior") {
        itemTotal = itemTotal * 0.8; // 20% discount
      }
      total += itemTotal;
    });
    return total;
  };

  const subtotal = calculateSubtotal();

  // Apply bulk discount (5% or 10% on total after individual discounts)
  let discountAmount = 0;
  let total = subtotal;

  if (bulkDiscount === "5%") {
    discountAmount = subtotal * 0.05;
    total = subtotal - discountAmount;
  } else if (bulkDiscount === "10%") {
    discountAmount = subtotal * 0.10;
    total = subtotal - discountAmount;
  }

  discountAmount = +discountAmount.toFixed(2);
  total = +total.toFixed(2);

  const generateTransactionNumber = () => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, "");
    const seq = String(Math.floor(Math.random() * 9000) + 1000);
    return `TXN-${date}-${seq}`;
  };

  // Updated processCheckout to include individual discounts
  const processCheckout = async (paymentMethod: "Cash" | "GCash", senderNumber?: string, senderName?: string) => {
    if (orderItems.length === 0) {
      setCheckoutMessage("No items in the cart to checkout.");
      return;
    }

    setIsProcessing(true);

    try {
      const transactionNumber = generateTransactionNumber();

      const sanitizedItems = orderItems.map(item => {
        const cleaned: Record<string, unknown> = {
          name: item.name,
          category: item.category ?? "",
          temperature: item.temperature ?? "",
          size: item.size ?? "",
          sugar: item.sugar ?? "",
          quantity: item.quantity,
          price: item.price,
          discountedPrice: item.discountType && item.discountType !== "None" ? item.price * 0.8 : item.price,
        };
        if (Array.isArray(item.addOns) && item.addOns.length > 0) cleaned.addOns = item.addOns;
        if (typeof item.variant !== "undefined") cleaned.variant = item.variant;
        if (item.discountType && item.discountType !== "None") {
          cleaned.discount = {
            type: item.discountType,
            rate: 0.20,
            amount: item.price - (item.price * 0.8),
            customerName: item.discountCustomerName,
            customerID: item.discountCustomerID
          };
        }
        return cleaned;
      });

      const orderPayload = {
        transactionNumber,
        items: sanitizedItems,
        subtotal: subtotal,
        discount: bulkDiscount !== "None" ? { type: bulkDiscount, rate: bulkDiscount === "5%" ? 0.05 : 0.10, amount: discountAmount } : null,
        totalAmount: total,
        paymentMethod,
        gcashSenderName: paymentMethod === "GCash" ? (senderName ?? null) : null,
        gcashNumber: paymentMethod === "GCash" ? (senderNumber ?? null) : null,
        cashierName: user?.displayName ?? "Unknown",
        createdAt: serverTimestamp(),
      };

      const requiredIngredients: Record<string, number> = {};
      orderItems.forEach(item => {
        const sizeKey = item.size === "Large" ? "Large" : "Medium";
        const catLabel = item.category.split(" · ")[0];
        const specificRecipeKey = `${catLabel} - ${item.name}`;
        const recipe = RECIPES[specificRecipeKey]?.[sizeKey] || RECIPES[item.name]?.[sizeKey]; 
        
        if (recipe) {
          Object.entries(recipe).forEach(([ingredientName, amount]) => {
            requiredIngredients[ingredientName] = (requiredIngredients[ingredientName] || 0) + ((amount as number) * item.quantity);
          });
        }
        if (Array.isArray(item.addOns) && item.addOns.length > 0) {
          item.addOns.forEach(addOn => {
            requiredIngredients[addOn] = (requiredIngredients[addOn] || 0) + ((ADD_ON_SERVING_SIZES[addOn] || 1) * item.quantity);
          });
        }
      });

      const ingredientNames = Object.keys(requiredIngredients);

      if (ingredientNames.length === 0) {
        await addDoc(collection(db, "orders"), orderPayload);
      } else {
        const q = query(collection(db, "inventory"), where("name", "in", ingredientNames));
        const querySnapshot = await getDocs(q);

        const foundNames = querySnapshot.docs.map(d => d.data().name);
        const missingInDb = ingredientNames.filter(name => !foundNames.includes(name));
        
        if (missingInDb.length > 0) {
            throw new Error(`DB_MISSING|${missingInDb.join(", ")}`);
        }

        const inventoryRefs: { ref: DocumentReference; name: string; needed: number }[] = [];
        querySnapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (requiredIngredients[data.name]) {
            inventoryRefs.push({ ref: docSnap.ref, name: data.name, needed: requiredIngredients[data.name] });
          }
        });

        await runTransaction(db, async (transaction) => {
          const outOfStockItems: string[] = [];
          const stockUpdates: { ref: DocumentReference, newQty: number, newBatches: any[] }[] = [];

          for (const item of inventoryRefs) {
            const docSnap = await transaction.get(item.ref);
            if (docSnap.exists()) {
              const data = docSnap.data();
              const currentStock = parseFloat(data.quantity) || 0;
              const unit = data.unit || "units";
              
              if (currentStock < item.needed) {
                outOfStockItems.push(`${item.name} (Need: ${item.needed}${unit}, Stock: ${currentStock}${unit})`);
              } else {
                let remainingNeeded = item.needed;
                const batches = Array.isArray(data.stockBatches) ? [...data.stockBatches] : [];

                batches.sort((a, b) => {
                  const dateA = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
                  const dateB = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
                  return dateA - dateB;
                });

                const updatedBatches = batches.map(batch => {
                  if (remainingNeeded <= 0) return batch;

                  let batchQty = parseFloat(batch.quantity) || 0;
                  if (batchQty > 0) {
                    if (batchQty >= remainingNeeded) {
                      batch.quantity = batchQty - remainingNeeded;
                      remainingNeeded = 0;
                    } else {
                      remainingNeeded -= batchQty;
                      batch.quantity = 0;
                    }
                  }
                  return batch;
                });

                stockUpdates.push({ 
                  ref: item.ref, 
                  newQty: currentStock - item.needed,
                  newBatches: updatedBatches
                });
              }
            }
          }

          if (outOfStockItems.length > 0) {
            throw new Error(`OUT_OF_STOCK|${outOfStockItems.join(" | ")}`);
          }

          const orderDocRef = doc(collection(db, "orders"));
          transaction.set(orderDocRef, orderPayload);
          
          for (const update of stockUpdates) {
            transaction.update(update.ref, { 
              quantity: update.newQty,
              stockBatches: update.newBatches
            });
          }
        });
      }

      setLastTransaction({
        number: transactionNumber,
        method: paymentMethod,
        total,
        discountAmount,
        amountTendered,
        gcashSenderName: paymentMethod === "GCash" ? senderName : undefined,
        gcashNumber: paymentMethod === "GCash" ? senderNumber : undefined,
      });
      
      updateActiveTabOrderItems([]);
      updateActiveTabBulkDiscount("None");
      setAmountTendered("");
      setCashModal(false);
      setGcashRefModal(false);
      setGcashName("");
      setGcashNumber("");
      setActiveGcashInput(null);
      setCheckoutMessage(null);
      setIsSuccessModalOpen(true);
    } catch (error: any) {
      console.error("Checkout failed:", error);
      if (error.message?.includes("OUT_OF_STOCK")) {
        const missingItems = error.message.split("|")[1].split(" | ").join("\n• ");
        setCheckoutMessage(`Checkout failed. Not enough stock:\n• ${missingItems}`);
      } else if (error.message?.includes("DB_MISSING")) {
        const missingItems = error.message.split("|")[1];
        setCheckoutMessage(`Database mismatch! Pakicheck spelling sa inventory, nawawala ang:\n• ${missingItems}`);
      } else {
        setCheckoutMessage("Checkout failed. Please check your connection or try again.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const activeOptStyle = { background: "#3b2212", color: "white" };
  const inactiveOptStyle = { background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" };

  const getCardColors = (category: string) => {
    const parts = category.split(" · ");
    const topLevel = parts[0];
    const sub = parts[1];
    
    if (dynamicItemColors[category]) {
      return {
        bg: dynamicItemColors[category].bg,
        hoverBg: dynamicItemColors[category].bg,
        activeBg: dynamicItemColors[category].activeBg,
        text: dynamicItemColors[category].text,
      };
    }
    
    if (topLevel === "Frappe" && sub && frappeSubColors[sub]) {
      return frappeSubColors[sub];
    }
    return categoryColors[topLevel] ?? { bg: "#f5f5f5", hoverBg: "#eeeeee", activeBg: "#3b2212", text: "#6b4c30" };
  };

  const allCategories = Object.keys(allProducts);

  const baseCategory = selectedProductCategory ? selectedProductCategory.split(" · ")[0] : "";
  const allowedAddOns = CATEGORY_ADD_ONS[baseCategory] || [];

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Redirecting to login...</div>;

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: "#ede8e3" }}>
      {/* Left Panel - Product Selection with Tabs */}
      <div className="flex-1 flex flex-col h-full min-w-0" style={{ background: "#ede8e3" }}>
        {/* Tab Bar - FIXED at top, never scrolls away */}
        <div className="flex-shrink-0 px-5 pt-5 pb-2">
          <div className="flex justify-between items-center mb-2">
            <div 
              ref={tabsContainerRef}
              className="flex items-center gap-1 pb-2 overflow-x-auto flex-1"
              style={{ 
                borderBottom: "2px solid #e8ddd4",
                scrollbarWidth: "thin",
              }}
            >
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`group flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-all shrink-0 ${
                    activeTabId === tab.id 
                      ? "bg-[#3b2212] text-white shadow-sm" 
                      : "bg-white text-[#6b4c30] border border-[#e8ddd4] hover:bg-[#f5efe8]"
                  }`}
                >
                  {editingTabId === tab.id ? (
                    <input
                      type="text"
                      value={editingTabName}
                      onChange={(e) => setEditingTabName(e.target.value)}
                      onBlur={saveTabName}
                      onKeyDown={handleTabNameKeyDown}
                      className="text-sm font-medium bg-transparent outline-none border-b-2 border-white px-1 min-w-[80px] text-white"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <span className="text-sm font-medium truncate" style={{ maxWidth: "100px" }}>
                        {tab.name}
                      </span>
                      {tab.orderItems.length > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
                          activeTabId === tab.id 
                            ? "bg-white text-[#3b2212]" 
                            : "bg-[#3b2212] text-white"
                        }`}>
                          {tab.orderItems.length}
                        </span>
                      )}
                      <button
                        onClick={(e) => startEditingTabName(tab.id, tab.name, e)}
                        className="opacity-0 group-hover:opacity-100 text-xs px-1 hover:bg-black/10 rounded transition-all shrink-0"
                      >
                        ✎
                      </button>
                      <button
                        onClick={(e) => closeTab(tab.id, e)}
                        className="opacity-0 group-hover:opacity-100 text-xs px-1 hover:bg-black/10 rounded transition-all shrink-0"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              ))}
              
              {/* New Tab Button */}
              <button
                onClick={createNewTab}
                className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:bg-[#e8e0d8] border border-[#e8ddd4] bg-white whitespace-nowrap"
                style={{ color: "#5a3d28" }}
                title="New customer tab"
              >
                + New Tab
              </button>
            </div>
            
            {/* Manage Menu Button — Admin/Manager only */}
            {canManageMenu && (
              <button
                onClick={() => setIsManageModalOpen(true)}
                className="shrink-0 ml-3 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:bg-[#e8e0d8] border border-[#e8ddd4] bg-white whitespace-nowrap flex items-center gap-2"
                style={{ color: "#5a3d28" }}
                title="Manage Categories & Items"
              >
                <img 
                  src="/settings.png" 
                  alt="Menu Icon" 
                  className="w-5 h-5"
                />
                Manage Menu
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {/* Search Bar */}
          <div className="relative mb-5">
            <span className="absolute left-4 top-1/2 -translate-y-1/2">🔎︎</span>
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl px-4 py-4 pl-11 text-base outline-none"
              style={{ background: "white", border: "1.5px solid #e8ddd4", color: "#3b2212" }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-base w-8 h-8 flex items-center justify-center rounded-full"
                style={{ color: "#a07850" }}>
                ✕
              </button>
            )}
          </div>

          {isSearching ? (
            <>
              <p className="text-sm mb-3" style={{ color: "#a07850" }}>
                {searchResults.length > 0
                  ? `${searchResults.length} result${searchResults.length > 1 ? "s" : ""} for "${searchQuery}"`
                  : `No results for "${searchQuery}"`}
              </p>
              <div className="grid grid-cols-4 gap-4">
                {searchResults.map((entry, i) => {
                  const colors = getCardColors(entry.category);
                  const stockStatus = getItemStockStatus(entry.name, entry.category);
                  return (
                    <div
                      key={i}
                      onClick={() => {
                        setSelectedProduct(entry.name);
                        setSelectedProductIsFood(checkIsFood(entry.name));
                        setSelectedProductCategory(entry.category);
                      }}
                      className="rounded-2xl p-5 cursor-pointer transition-all active:scale-95 touch-manipulation flex flex-col items-center justify-center gap-1"
                      style={{ background: colors.bg, border: `1.5px solid ${colors.hoverBg}`, minHeight: "100px" }}
                    >
                      <p className="font-normal text-center" style={{ color: colors.activeBg, fontSize: "18px" }}>{entry.name}</p>
                      {stockStatus === "Not Available" && <p className="text-[11px] font-bold mt-0.5" style={{ color: "#c0392b" }}>(Not Available)</p>}
                      {stockStatus === "Low Stock" && <p className="text-[11px] font-bold mt-0.5" style={{ color: "#d35400" }}>(Low Stock)</p>}
                      {stockStatus === "No Ingredients" && <p className="text-[10px] font-medium mt-0.5" style={{ color: "#9ca3af" }}>(no ingredients applied)</p>}
                      <p className="text-xs text-center font-medium mt-1" style={{ color: colors.text }}>{entry.category}</p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2 mb-4 flex-wrap">
                {Object.keys(allProducts).map((cat) => {
                  const colors = categoryColors[cat] || { bg: "#f5f5f5", hoverBg: "#eeeeee", activeBg: "#3b2212", text: "#6b4c30" };
                  return (
                    <button
                      key={cat}
                      onClick={() => { setActiveCategory(cat); setActiveFrappeType(null); setActiveFoodSubCategory("All"); }}
                      className="px-5 py-3 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation"
                      style={{
                        fontSize: "18px",
                        background: activeCategory === cat ? colors.activeBg : colors.bg,
                        color: activeCategory === cat ? "white" : colors.text,
                        border: activeCategory === cat ? "none" : "1.5px solid #e8ddd4",
                        boxShadow: activeCategory === cat ? "0 2px 8px rgba(0,0,0,0.1)" : "none",
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>

              {activeCategory === "Frappe" && (
                <div className="flex gap-2 mb-5 p-3 rounded-xl flex-wrap" style={{ background: "#ede4db" }}>
                  {Object.keys(frappeProducts).map((type) => {
                    const fc = frappeSubColors[type] ?? { bg: "#faf7f4", hoverBg: "#f0e8e0", activeBg: "#3b2212", text: "#3b2212" };
                    const isActive = activeFrappeType === type;
                    return (
                      <button key={type}
                        onClick={() => setActiveFrappeType(type)}
                        className="px-5 py-3 rounded-lg font-semibold transition-all active:scale-95 touch-manipulation"
                        style={{
                          fontSize: "16px",
                          background: isActive ? fc.activeBg : fc.bg,
                          color: isActive ? "white" : fc.text,
                          border: isActive ? "none" : `1.5px solid ${fc.hoverBg}`,
                          boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.12)" : "none",
                        }}>
                        {type}
                      </button>
                    );
                  })}
                </div>
              )}

              {activeCategory === "Food & Bites" && (
                <div className="flex gap-2 mb-5 p-3 rounded-xl flex-wrap" style={{ background: "#ede4db" }}>
                  <button
                    onClick={() => setActiveFoodSubCategory("All")}
                    className="px-5 py-3 rounded-lg font-semibold transition-all active:scale-95 touch-manipulation"
                    style={{ fontSize: "16px", ...(activeFoodSubCategory === "All" ? activeOptStyle : inactiveOptStyle) }}>
                    All
                  </button>
                  {Object.keys(foodProducts).map((sub) => (
                    <button key={sub}
                      onClick={() => setActiveFoodSubCategory(sub)}
                      className="px-5 py-3 rounded-lg font-semibold transition-all active:scale-95 touch-manipulation"
                      style={{ fontSize: "16px", ...(activeFoodSubCategory === sub ? activeOptStyle : inactiveOptStyle) }}>
                      {sub}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-4 gap-4">
                {activeCategory !== "Frappe" && activeCategory !== "Food & Bites" &&
                  allProducts[activeCategory]?.map((item, i) => {
                    const colors = categoryColors[activeCategory] ?? { bg: "#f5f5f5", hoverBg: "#eeeeee", activeBg: "#3b2212", text: "#6b4c30" };
                    const itemColors = dynamicItemColors[item];
                    const cardColors = itemColors || colors;
                    const stockStatus = getItemStockStatus(item, activeCategory);
                    
                    return (
                      <div key={i} onClick={() => {
                        setSelectedProduct(item);
                        setSelectedProductIsFood(false);
                        setSelectedProductCategory(activeCategory);
                      }}
                        className="rounded-2xl p-5 cursor-pointer transition-all active:scale-95 touch-manipulation flex flex-col items-center justify-center gap-1"
                        style={{ background: cardColors.bg, border: `1.5px solid ${cardColors.hoverBg || colors.hoverBg}`, minHeight: "100px" }}>
                        <p className="font-normal text-center" style={{ color: cardColors.activeBg, fontSize: "18px" }}>{item}</p>
                        {stockStatus === "Not Available" && <p className="text-[11px] font-bold mt-0.5" style={{ color: "#c0392b" }}>(Not Available)</p>}
                        {stockStatus === "Low Stock" && <p className="text-[11px] font-bold mt-0.5" style={{ color: "#d35400" }}>(Low Stock)</p>}
                        {stockStatus === "No Ingredients" && <p className="text-[10px] font-medium mt-0.5" style={{ color: "#9ca3af" }}>(no ingredients applied)</p>}
                      </div>
                    );
                  })}

                {activeCategory === "Frappe" && activeFrappeType &&
                  frappeProducts[activeFrappeType as keyof typeof frappeProducts]?.map((item, i) => {
                    const colors = frappeSubColors[activeFrappeType] ?? categoryColors["Frappe"];
                    const stockStatus = getItemStockStatus(item, `Frappe · ${activeFrappeType}`);
                    
                    return (
                      <div key={i} onClick={() => {
                        setSelectedProduct(item);
                        setSelectedProductIsFood(false);
                        setSelectedProductCategory(`Frappe · ${activeFrappeType}`);
                      }}
                        className="rounded-2xl p-5 cursor-pointer transition-all active:scale-95 touch-manipulation flex flex-col items-center justify-center gap-1"
                        style={{ background: colors.bg, border: `1.5px solid ${colors.hoverBg}`, minHeight: "100px" }}>
                        <p className="font-normal text-center" style={{ color: colors.activeBg, fontSize: "18px" }}>{item}</p>
                        {stockStatus === "Not Available" && <p className="text-[11px] font-bold mt-0.5" style={{ color: "#c0392b" }}>(Not Available)</p>}
                        {stockStatus === "Low Stock" && <p className="text-[11px] font-bold mt-0.5" style={{ color: "#d35400" }}>(Low Stock)</p>}
                        {stockStatus === "No Ingredients" && <p className="text-[10px] font-medium mt-0.5" style={{ color: "#9ca3af" }}>(no ingredients applied)</p>}
                      </div>
                    );
                  })}

                {activeCategory === "Food & Bites" && activeFoodSubCategory &&
                  (activeFoodSubCategory === "All"
                    ? Object.values(foodProducts).flat()
                    : foodProducts[activeFoodSubCategory]
                  )?.map((item, i) => {
                    const colors = categoryColors["Food & Bites"];
                    const stockStatus = getItemStockStatus(item, `Food & Bites · ${activeFoodSubCategory}`);
                    
                    return (
                      <div key={i} onClick={() => {
                        setSelectedProduct(item);
                        setSelectedProductIsFood(true);
                        const sub = activeFoodSubCategory === "All"
                          ? Object.entries(foodProducts).find(([, items]) => items.includes(item))?.[0] ?? "Food & Bites"
                          : activeFoodSubCategory;
                        setSelectedProductCategory(`Food & Bites · ${sub}`);
                      }}
                        className="rounded-2xl p-5 cursor-pointer transition-all active:scale-95 touch-manipulation flex flex-col items-center justify-center gap-1"
                        style={{ background: colors.bg, border: `1.5px solid ${colors.hoverBg}`, minHeight: "100px" }}>
                        <p className="font-normal text-center" style={{ color: colors.activeBg, fontSize: "18px" }}>{item}</p>
                        {stockStatus === "Not Available" && <p className="text-[11px] font-bold mt-0.5" style={{ color: "#c0392b" }}>(Not Available)</p>}
                        {stockStatus === "Low Stock" && <p className="text-[11px] font-bold mt-0.5" style={{ color: "#d35400" }}>(Low Stock)</p>}
                        {item === "Quesadillas" && <p className="text-xs" style={{ color: colors.text }}>Beef / Cheese</p>}
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right Panel - Order Panel */}
      <div className="w-96 flex flex-col h-full overflow-y-hidden"
        style={{ background: "white", borderLeft: "1.5px solid #e8ddd4" }}>
        
        <div className="flex-1 flex flex-col overflow-hidden p-5">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-2xl font-bold" style={{ color: "#3b2212" }}>Order</h2>
            {orderItems.length > 0 && (
              <span className="text-xs px-2 py-1 rounded-full font-normal"
                style={{ background: "#3b2212", color: "white" }}>{orderItems.length}</span>
            )}
          </div>

          {orderItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="text-6xl mb-3 opacity-20">🛒</div>
              <p className="text-sm" style={{ color: "#b09070" }}>No items added yet</p>
              <p className="text-xs mt-2" style={{ color: "#c0b090" }}>Current: {activeTab?.name}</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0" style={{ WebkitOverflowScrolling: "touch" }}>
              {orderItems.map((item, index) => {
                const itemTotal = item.price * item.quantity;
                const discountedTotal = (item.discountType === "PWD" || item.discountType === "Senior") 
                  ? itemTotal * 0.8 
                  : itemTotal;
                const discountApplied = item.discountType !== "None";
                
                return (
                  <div key={index} className="p-3 relative" style={{ borderBottom: "0.5px solid #e8ddd4" }}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-semibold text-base" style={{ color: "#3b2212" }}>{item.name}</p>
                        {item.category && !item.category.includes("Food & Bites") && (
                          <p className="text-xs mt-0.5 font-medium" style={{ color: "#3b2212", opacity: 0.5 }}>{item.category}</p>
                        )}
                        {(item.temperature || item.size || item.sugar) && (
                          <p className="text-xs mt-0.5" style={{ color: "#a07850" }}>
                            {[item.temperature, item.size, item.sugar && `Sugar ${item.sugar}`].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {item.addOns && item.addOns.length > 0 && (
                          <p className="text-xs mt-0.5" style={{ color: "#5a8a5a" }}>+ {item.addOns.join(", ")}</p>
                        )}
                        {discountApplied && (
                          <p className="text-xs mt-1 font-semibold" style={{ color: "#2d7a38" }}>
                            {item.discountType} Discount Applied
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 ml-2">
                        <div className="text-right">
                          {discountApplied ? (
                            <>
                              <p className="text-xs line-through" style={{ color: "#a07850" }}>₱{itemTotal.toFixed(0)}</p>
                              <p className="font-semibold text-base" style={{ color: "#2d7a38" }}>₱{discountedTotal.toFixed(0)}</p>
                            </>
                          ) : (
                            <p className="font-normal text-base" style={{ color: "#3b2212" }}>₱{itemTotal.toFixed(0)}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <button onClick={() => handleDecreaseQty(index)}
                            className="w-10 h-10 rounded-full flex items-center justify-center font-bold active:scale-95 touch-manipulation"
                            style={{ background: "#f0e8e0", color: "#3b2212", fontSize: "20px" }}>−</button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={qtyInputs[index] !== undefined ? qtyInputs[index] : String(item.quantity)}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, "");
                              setQtyInputs(prev => ({ ...prev, [index]: raw }));
                              const val = parseInt(raw);
                              if (!isNaN(val) && val >= 1) {
                                const newOrderItems = orderItems.map((o, i) => i === index ? { ...o, quantity: val } : o);
                                updateActiveTabOrderItems(newOrderItems);
                              }
                            }}
                            onBlur={() => {
                              const raw = qtyInputs[index];
                              const val = parseInt(raw);
                              if (!raw || isNaN(val) || val < 1) {
                                const newOrderItems = orderItems.map((o, i) => i === index ? { ...o, quantity: 1 } : o);
                                updateActiveTabOrderItems(newOrderItems);
                              }
                              setQtyInputs(prev => { const next = { ...prev }; delete next[index]; return next; });
                            }}
                            className="text-lg font-semibold text-center outline-none rounded-lg"
                            style={{ width: "55px", color: "#3b2212", background: "#faf7f4", border: "1.5px solid #e8ddd4", padding: "8px 4px" }}
                          />
                          <button onClick={() => handleIncreaseQty(index)}
                            className="w-10 h-10 rounded-full flex items-center justify-center font-bold active:scale-95 touch-manipulation"
                            style={{ background: "#3b2212", color: "white", fontSize: "20px" }}>+</button>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDiscountModalItem({ index, item })}
                            className={`text-sm rounded-lg px-3 py-1.5 font-semibold transition-all active:scale-95 touch-manipulation ${
                              discountApplied ? "bg-[#2d7a38] text-white" : "bg-[#f0e8e0] text-[#3b2212]"
                            }`}
                          >
                            {discountApplied ? "✎ Discount" : "Add Discount"}
                          </button>
                          <button onClick={() => handleRemoveItem(index)}
                            className="text-sm rounded-full w-8 h-8 flex items-center justify-center active:scale-95 touch-manipulation"
                            style={{ background: "#fee2e2", color: "#c0392b" }}>✕</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {orderItems.length > 0 && (
            <div className="py-4 space-y-2 mt-2" style={{ borderTop: "1.5px solid #e8ddd4" }}>
              <div className="mb-1">
                <p className="text-xs mb-1.5" style={{ color: "#a07850" }}>Bulk Order Discount (on total after item discounts)</p>
                <div className="flex gap-2">
                  {(["None", "5%", "10%"] as const).map((d) => (
                    <button key={d}
                      onClick={() => updateActiveTabBulkDiscount(d)}
                      className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95 touch-manipulation"
                      style={bulkDiscount === d
                        ? { background: "#3b2212", color: "white" }
                        : { background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                      {d === "None" ? "None" : `${d} OFF`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-between text-sm" style={{ color: "#a07850" }}>
                <span>Subtotal</span><span>₱{subtotal.toFixed(2)}</span>
              </div>
              {bulkDiscount !== "None" && (
                <div className="flex justify-between text-sm" style={{ color: "#2d7a38" }}>
                  <span>Bulk Discount ({bulkDiscount})</span>
                  <span>− ₱{discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-normal text-base" style={{ color: "#3b2212" }}>
                <span>Total</span><span>₱{total.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="space-y-2 mt-2">
            <button
              disabled={orderItems.length === 0 || isProcessing}
              onClick={() => { if (orderItems.length > 0 && !isProcessing) setConfirmModal({ open: true, method: "Cash" }); }}
              className="w-full py-4 rounded-xl font-normal transition-all active:scale-95 touch-manipulation"
              style={{ fontSize: "16px", ...(orderItems.length === 0 || isProcessing
                ? { background: "#e8e0d8", color: "#b09070", cursor: "not-allowed" }
                : { background: "#3b2212", color: "white" }) }}>
              Cash {orderItems.length > 0 && `— ₱${total.toFixed(2)}`}
            </button>

            <button
              disabled={orderItems.length === 0 || isProcessing}
              onClick={() => { if (orderItems.length > 0 && !isProcessing) setConfirmModal({ open: true, method: "GCash" }); }}
              className="w-full py-4 rounded-xl font-normal transition-all active:scale-95 touch-manipulation"
              style={{ fontSize: "16px", ...(orderItems.length === 0 || isProcessing
                ? { background: "#e8e0d8", color: "#b09070", cursor: "not-allowed" }
                : { background: "#0070ba", color: "white" }) }}>
              GCash {orderItems.length > 0 && `— ₱${total.toFixed(2)}`}
            </button>
          </div>

          {checkoutMessage && (
            <p className="text-center text-sm mt-2 p-3 rounded-lg" style={{ 
              background: checkoutMessage.includes("failed") || checkoutMessage.includes("mismatch") ? "#fff0f0" : "#f0faf0",
              color: checkoutMessage.includes("failed") || checkoutMessage.includes("mismatch") ? "#c0392b" : "#2d7a38",
              border: `1px solid ${checkoutMessage.includes("failed") || checkoutMessage.includes("mismatch") ? "#f5c6c6" : "#b6e2b6"}`
            }}>
              {checkoutMessage.split('\n').map((line, i) => (
                <span key={i} className="block text-left">{line}</span>
              ))}
            </p>
          )}
        </div>
      </div>

      {/* Individual Discount Modal */}
      {discountModalItem && (
        <IndividualDiscountModal
          isOpen={true}
          onClose={() => setDiscountModalItem(null)}
          onApply={(discountType, name, id) => {
            updateItemDiscount(discountModalItem.index, discountType, name, id);
            setDiscountModalItem(null);
          }}
          itemName={discountModalItem.item.name}
          currentDiscount={{
            type: discountModalItem.item.discountType || "None",
            name: discountModalItem.item.discountCustomerName || "",
            id: discountModalItem.item.discountCustomerID || ""
          }}
        />
      )}

      {canManageMenu && (
        <ManageModal
          isOpen={isManageModalOpen}
          onClose={() => setIsManageModalOpen(false)}
          onAddCategory={handleAddCategory}
          onAddItem={handleAddItem}
          onDeleteCategory={handleDeleteCategory}
          onDeleteItem={handleDeleteItem}
          categories={allCategories}
          itemsByCategory={allProducts}
          categoryColors={categoryColors}
        />
      )}
      {/* Confirmation Modal */}
      {confirmModal.open && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
          <div className="bg-white rounded-3xl p-14 shadow-2xl mx-6 w-full max-w-2xl">
            <h2 className="text-4xl font-bold mb-3" style={{ color: "#3b2212" }}>Confirm Order</h2>
            <p className="text-xl mb-8" style={{ color: "#a07850" }}>
              Payment via <strong style={{ color: "#3b2212" }}>{confirmModal.method}</strong>
            </p>
            <div className="rounded-2xl p-7 mb-8" style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4" }}>
              <div className="flex justify-between items-center">
                <span className="text-xl" style={{ color: "#a07850" }}>Total Amount</span>
                <span className="font-bold text-4xl" style={{ color: "#3b2212" }}>₱{total.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex gap-5">
              <button
                onClick={() => setConfirmModal({ open: false, method: null })}
                className="flex-1 py-5 rounded-2xl font-bold text-xl active:scale-95 touch-manipulation"
                style={{ background: "#f0e8e0", color: "#3b2212" }}>
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmModal({ open: false, method: null });
                  if (confirmModal.method === "Cash") {
                    setCashModal(true);
                  } else if (confirmModal.method === "GCash") {
                    setGcashRefModal(true);
                  }
                }}
                className="flex-1 py-5 rounded-2xl font-bold text-xl text-white active:scale-95 touch-manipulation"
                style={{ background: confirmModal.method === "Cash" ? "#3b2212" : "#0070ba" }}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash Tendered Modal */}
      {cashModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
          <div className="bg-white rounded-3xl p-9 shadow-2xl mx-6 w-full max-w-xl">
            <h2 className="text-2xl font-bold mb-3" style={{ color: "#3b2212" }}>Cash Payment</h2>
            <div className="rounded-2xl p-4 mb-4" style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4" }}>
              <div className="flex justify-between items-center">
                <span className="text-base" style={{ color: "#a07850" }}>Total Due</span>
                <span className="font-bold text-2xl" style={{ color: "#3b2212" }}>₱{total.toFixed(2)}</span>
              </div>
            </div>
            <div className="rounded-2xl px-5 py-3 mb-3 text-right" style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4", minHeight: "60px" }}>
              <p className="text-xs mb-1" style={{ color: "#a07850" }}>Amount Received</p>
              <p className="font-bold" style={{ color: amountTendered ? "#3b2212" : "#c0b090", fontSize: "2rem", lineHeight: 1 }}>
                {amountTendered ? `₱${amountTendered}` : "₱0"}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {["7","8","9","4","5","6","1","2","3"].map((num) => (
                <button key={num}
                  onClick={() => setAmountTendered(prev => prev === "0" ? num : prev + num)}
                  className="py-4 rounded-2xl font-bold text-xl transition-all active:scale-95 touch-manipulation"
                  style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                  {num}
                </button>
              ))}
              <button
                onClick={() => setAmountTendered(prev => prev.endsWith(".") ? prev : prev.includes(".") ? prev : prev + ".")}
                className="py-5 rounded-2xl font-bold text-2xl transition-all active:scale-95 touch-manipulation"
                style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>.</button>
              <button
                onClick={() => setAmountTendered(prev => prev === "0" ? "0" : prev + "0")}
                className="py-5 rounded-2xl font-bold text-2xl transition-all active:scale-95 touch-manipulation"
                style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>0</button>
              <button
                onClick={() => setAmountTendered(prev => prev.length <= 1 ? "" : prev.slice(0, -1))}
                className="py-5 rounded-2xl font-bold text-2xl transition-all active:scale-95 touch-manipulation"
                style={{ background: "#fee2e2", color: "#c0392b", border: "1.5px solid #f5c6c6" }}>⌫</button>
            </div>
            {amountTendered && parseFloat(amountTendered) >= total && (
              <div className="rounded-2xl p-4 mb-4" style={{ background: "#f0faf0", border: "1.5px solid #b6e2b6" }}>
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold" style={{ color: "#2d7a38" }}>Change</span>
                  <strong className="text-3xl" style={{ color: "#2d7a38" }}>₱{(parseFloat(amountTendered) - total).toFixed(2)}</strong>
                </div>
              </div>
            )}
            {amountTendered && parseFloat(amountTendered) < total && (
              <div className="rounded-2xl p-3 mb-4" style={{ background: "#fff0f0", border: "1.5px solid #f5c6c6" }}>
                <span className="text-lg font-semibold" style={{ color: "#c0392b" }}>Insufficient amount</span>
              </div>
            )}
            <div className="flex gap-5">
              <button
                onClick={() => { setCashModal(false); setAmountTendered(""); }}
                className="flex-1 py-4 rounded-2xl font-bold text-lg active:scale-95 touch-manipulation"
                style={{ background: "#f0e8e0", color: "#3b2212" }}>Cancel</button>
              <button
                disabled={!amountTendered || parseFloat(amountTendered) < total || isProcessing}
                onClick={() => processCheckout("Cash")}
                className="flex-1 py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 active:scale-95 touch-manipulation"
                style={{
                  background: !amountTendered || parseFloat(amountTendered) < total || isProcessing ? "#e8e0d8" : "#3b2212",
                  color: !amountTendered || parseFloat(amountTendered) < total || isProcessing ? "#b09070" : "white",
                  cursor: !amountTendered || parseFloat(amountTendered) < total || isProcessing ? "not-allowed" : "pointer",
                }}>
                {isProcessing ? (
                  <>
                    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3"/>
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                    Processing...
                  </>
                ) : "Confirm Cash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GCash Payment Modal - Name + Number with Custom Keyboard */}
      {gcashRefModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
          <div className="bg-white rounded-3xl p-9 shadow-2xl mx-6 w-full max-w-2xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg"
                style={{ background: "#e8f4ff", color: "#0070ba" }}>G</div>
              <h2 className="text-2xl font-bold" style={{ color: "#0070ba" }}>GCash Payment</h2>
            </div>
            <p className="text-sm mb-5" style={{ color: "#a07850" }}>
              Enter the customer's name and GCash number.
            </p>

            <div className="rounded-2xl p-4 mb-5" style={{ background: "#f0f7ff", border: "1.5px solid #b3d9f7" }}>
              <div className="flex justify-between items-center">
                <span className="text-base" style={{ color: "#0070ba" }}>Total Due</span>
                <span className="font-bold text-2xl" style={{ color: "#0070ba" }}>₱{total.toFixed(2)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-4">
              {/* Left Column - Customer Name */}
              <div>
                <label className="text-sm font-semibold block mb-1.5" style={{ color: "#3b2212" }}>
                  Customer Name <span style={{ color: "#c0392b" }}>*</span>
                </label>
                <div
                  onClick={() => setActiveGcashInput("name")}
                  className="w-full rounded-xl px-4 py-3 text-base transition-all cursor-pointer"
                  style={{
                    background: "#f0f7ff",
                    border: activeGcashInput === "name" ? "2px solid #0070ba" : "1.5px solid #b3d9f7",
                    color: "#0070ba",
                    minHeight: "52px",
                  }}
                >
                  {gcashName || <span style={{ color: "#c0b090" }}>Tap to enter name...</span>}
                </div>
              </div>

              {/* Right Column - GCash Number */}
              <div>
                <label className="text-sm font-semibold block mb-1.5" style={{ color: "#3b2212" }}>
                  GCash Number <span style={{ color: "#c0392b" }}>*</span>
                </label>
                <div className="rounded-xl px-4 py-3 text-center"
                  style={{
                    background: gcashNumber ? "#f0f7ff" : "#faf7f4",
                    border: gcashNumber.length === 11 ? "2px solid #0070ba" : "1.5px solid #e8ddd4",
                    minHeight: "52px",
                  }}>
                  <p className="font-mono font-bold tracking-widest"
                    style={{
                      color: gcashNumber ? "#0070ba" : "#c0b090",
                      fontSize: "1.2rem",
                      letterSpacing: "0.1em",
                    }}>
                    {gcashNumber || "09XXXXXXXXX"}
                  </p>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <p className="text-xs" style={{ color: gcashNumber.length === 11 ? "#2d7a38" : "#c0b090" }}>
                    {gcashNumber.length === 11 ? "✓ Valid" : "11 digits required"}
                  </p>
                  <p className="text-xs font-semibold" style={{ color: gcashNumber.length === 11 ? "#0070ba" : "#c0b090" }}>
                    {gcashNumber.length}/11
                  </p>
                </div>
              </div>
            </div>

            {/* Custom Keyboard Section - Shows based on active input */}
            {activeGcashInput === "name" ? (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: "#e8ddd4" }}>
                <div className="flex justify-between items-center mb-3">
                  <p className="text-sm font-semibold" style={{ color: "#3b2212" }}>
                    Enter Customer Name
                  </p>
                  <button
                    onClick={() => setActiveGcashInput(null)}
                    className="text-sm px-4 py-2 rounded-lg font-semibold"
                    style={{ background: "#0070ba", color: "white" }}
                  >
                    Done
                  </button>
                </div>
                
                <div className="space-y-2">
                  <div className="grid grid-cols-10 gap-1.5">
                    {["Q","W","E","R","T","Y","U","I","O","P"].map((key) => (
                      <button key={key} onClick={() => setGcashName(prev => prev + key)}
                        className="py-2 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                        {key}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-9 gap-1.5">
                    {["A","S","D","F","G","H","J","K","L"].map((key) => (
                      <button key={key} onClick={() => setGcashName(prev => prev + key)}
                        className="py-2 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                        {key}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-9 gap-1.5">
                    {["Z","X","C","V","B","N","M"].map((key) => (
                      <button key={key} onClick={() => setGcashName(prev => prev + key)}
                        className="py-2 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                        {key}
                      </button>
                    ))}
                    <button onClick={() => setGcashName(prev => prev + " ")}
                      className="py-2 rounded-lg font-semibold text-sm transition-all active:scale-95 touch-manipulation col-span-2"
                      style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                      SPACE
                    </button>
                    <button onClick={() => setGcashName(prev => prev.slice(0, -1))}
                      className="py-2 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation"
                      style={{ background: "#fee2e2", color: "#c0392b", border: "1px solid #f5c6c6" }}>
                      ⌫
                    </button>
                    <button onClick={() => setGcashName("")}
                      className="py-2 rounded-lg font-semibold text-sm transition-all active:scale-95 touch-manipulation"
                      style={{ background: "#fff0f0", color: "#c0392b", border: "1px solid #f5c6c6" }}>
                      CLEAR
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: "#e8ddd4" }}>
                <p className="text-sm font-semibold mb-3" style={{ color: "#3b2212" }}>
                  Enter GCash Number
                </p>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {["1","2","3","4","5","6","7","8","9"].map((num) => (
                    <button
                      key={num}
                      onClick={() => { if (gcashNumber.length < 11) setGcashNumber(prev => prev + num); }}
                      className="py-3 rounded-xl font-bold text-2xl transition-all active:scale-95 touch-manipulation"
                      style={{ background: "#f0f7ff", color: "#0070ba", border: "1.5px solid #b3d9f7" }}>
                      {num}
                    </button>
                  ))}
                  <button
                    onClick={() => setGcashNumber("")}
                    className="py-3 rounded-xl font-bold text-base transition-all active:scale-95 touch-manipulation"
                    style={{ background: "#fff0f0", color: "#c0392b", border: "1.5px solid #f5c6c6" }}>
                    CLEAR
                  </button>
                  <button
                    onClick={() => { if (gcashNumber.length < 11) setGcashNumber(prev => prev + "0"); }}
                    className="py-3 rounded-xl font-bold text-2xl transition-all active:scale-95 touch-manipulation"
                    style={{ background: "#f0f7ff", color: "#0070ba", border: "1.5px solid #b3d9f7" }}>
                    0
                  </button>
                  <button
                    onClick={() => setGcashNumber(prev => prev.slice(0, -1))}
                    className="py-3 rounded-xl font-bold text-2xl transition-all active:scale-95 touch-manipulation"
                    style={{ background: "#fee2e2", color: "#c0392b", border: "1.5px solid #f5c6c6" }}>
                    ⌫
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-4 mt-6">
              <button
                onClick={() => { setGcashRefModal(false); setGcashName(""); setGcashNumber(""); setActiveGcashInput(null); }}
                className="flex-1 py-3 rounded-xl font-bold text-lg active:scale-95 touch-manipulation"
                style={{ background: "#f0e8e0", color: "#3b2212" }}>
                Cancel
              </button>
              <button
                disabled={gcashNumber.length !== 11 || !gcashName.trim() || isProcessing}
                onClick={() => processCheckout("GCash", gcashNumber.trim(), gcashName.trim())}
                className="flex-1 py-3 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 active:scale-95 touch-manipulation"
                style={{
                  background: gcashNumber.length !== 11 || !gcashName.trim() || isProcessing ? "#e8e0d8" : "#0070ba",
                  color: gcashNumber.length !== 11 || !gcashName.trim() || isProcessing ? "#b09070" : "white",
                  cursor: gcashNumber.length !== 11 || !gcashName.trim() || isProcessing ? "not-allowed" : "pointer",
                }}>
                {isProcessing ? (
                  <>
                    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3"/>
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                    Processing...
                  </>
                ) : "Confirm GCash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {isSuccessModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
          <div className="bg-white rounded-3xl p-14 shadow-2xl text-center mx-6 w-full max-w-2xl">
            <h2 className="text-4xl font-bold mb-8" style={{ color: "#3b2212" }}>Order Completed!</h2>
            {lastTransaction && (
              <div className="rounded-2xl p-8 mb-8 text-left space-y-5" style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4" }}>
                <div className="flex justify-between items-center">
                  <span className="text-lg" style={{ color: "#a07850" }}>Transaction No.</span>
                  <span className="font-bold text-lg" style={{ color: "#3b2212" }}>{lastTransaction.number}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-lg" style={{ color: "#a07850" }}>Payment Method</span>
                  <span className="font-bold text-lg" style={{ color: "#3b2212" }}>{lastTransaction.method}</span>
                </div>
                {lastTransaction.method === "GCash" && (lastTransaction.gcashSenderName || lastTransaction.gcashNumber) && (
                  <div className="rounded-2xl p-4 space-y-3"
                    style={{ background: "#f0f7ff", border: "1.5px solid #b3d9f7" }}>
                    {lastTransaction.gcashSenderName && (
                      <div className="flex justify-between items-center">
                        <span className="text-lg" style={{ color: "#0070ba" }}>GCash Name</span>
                        <span className="font-bold text-lg" style={{ color: "#0070ba" }}>
                          {lastTransaction.gcashSenderName}
                        </span>
                      </div>
                    )}
                    {lastTransaction.gcashNumber && (
                      <div className="flex justify-between items-center">
                        <span className="text-lg" style={{ color: "#0070ba" }}>GCash Number</span>
                        <span className="font-bold text-lg tracking-widest" style={{ color: "#0070ba" }}>
                          {lastTransaction.gcashNumber}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-between items-center" style={{ borderTop: "1.5px solid #e8ddd4", paddingTop: "16px" }}>
                  <span className="text-lg" style={{ color: "#a07850" }}>Total Paid</span>
                  <span className="font-bold text-3xl" style={{ color: "#3b2212" }}>₱{lastTransaction.total.toFixed(2)}</span>
                </div>
                {lastTransaction.method === "Cash" && lastTransaction.amountTendered && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-lg" style={{ color: "#a07850" }}>Amount Received</span>
                      <span className="font-bold text-xl" style={{ color: "#3b2212" }}>₱{parseFloat(lastTransaction.amountTendered).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center rounded-2xl p-5" style={{ background: "#f0faf0" }}>
                      <span className="text-xl font-semibold" style={{ color: "#2d7a38" }}>Change</span>
                      <span className="font-bold text-3xl" style={{ color: "#2d7a38" }}>₱{(parseFloat(lastTransaction.amountTendered) - lastTransaction.total).toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              onClick={() => setIsSuccessModalOpen(false)}
              className="px-6 py-5 rounded-2xl text-white font-bold text-xl w-full active:scale-95 touch-manipulation"
              style={{ background: "#3b2212" }}>
              Make another order
            </button>
          </div>
        </div>
      )}

      {/* Product Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-3xl p-8 relative max-h-[90vh] overflow-y-auto"
            style={{ background: "white", border: "2px solid #e8ddd4", width: "fit-content", minWidth: "500px", maxWidth: "85vw" }}>
            <button
              className="absolute top-5 right-5 w-12 h-12 rounded-full flex items-center justify-center text-xl active:scale-95 touch-manipulation"
              style={{ background: "#f7f3ef", color: "#3b2212", border: "1px solid #e8ddd4" }}
              onClick={() => {
                setSelectedProduct(null);
                setSelectedAddOns([]);
                setSelectedVariant(null);
                setSelectedProductIsFood(false);
                setSelectedProductCategory("");
                setModalError(null);
              }}>✕</button>

            <h2 className="text-2xl font-bold mb-1 pr-10 text-center" style={{ color: "#3b2212" }}>{selectedProduct}</h2>
            {selectedProductCategory && (
              <p className="text-sm text-center mb-6" style={{ color: "#a07850" }}>{selectedProductCategory}</p>
            )}

            <div className="space-y-6">
              {selectedProduct === "Quesadillas" && (
                <div>
                  <p className="font-semibold mb-3 text-base" style={{ color: "#3b2212" }}>Choose Variant</p>
                  <div className="flex gap-4">
                    {quesadillasVariants.map((v) => (
                      <button key={v} onClick={() => setSelectedVariant(v)}
                        className="flex-1 px-4 py-4 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation flex flex-col items-center gap-1"
                        style={selectedVariant === v ? activeOptStyle : inactiveOptStyle}>
                        <span style={{ fontSize: "16px" }}>{v}</span>
                        <span style={{ fontSize: "14px", opacity: 0.75 }}>₱{v === "Beef" ? "200" : "170"}</span>
                      </button>
                    ))}
                  </div>
                  {!selectedVariant && <p className="text-sm mt-2" style={{ color: "#c0392b" }}>Please select a variant.</p>}
                </div>
              )}

              {!isFood && (
                <div className="grid grid-cols-2 gap-6">
                  {!hideTemperature && (
                    <div>
                      <p className="font-semibold mb-3 text-base" style={{ color: "#3b2212" }}>Temperature</p>
                      <div className="flex gap-3">
                        {["Hot", "Ice"].map((t) => (
                          <button key={t} onClick={() => setTempOption(t)}
                            className="flex-1 px-5 py-3 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation"
                            style={{ fontSize: "16px", ...(tempOption === t ? activeOptStyle : inactiveOptStyle) }}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="font-semibold mb-3 text-base" style={{ color: "#3b2212" }}>Size</p>
                    <div className="flex gap-3">
                      {(activeCategory === "Hot Tea" || selectedProductCategory === "Hot Tea" ? ["M - 220ml", "Pot"] : ["Medium", "Large"]).map((s) => (
                        <button key={s} onClick={() => setSizeOption(s)}
                          className="flex-1 px-5 py-3 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation"
                          style={{ fontSize: "16px", ...(sizeOption === s ? activeOptStyle : inactiveOptStyle) }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!isFood && (
                <div>
                  <p className="font-semibold mb-3 text-base" style={{ color: "#3b2212" }}>Sugar Level</p>
                  <div className="flex gap-3">
                    {["0%", "50%", "75%", "100%"].map((sugar) => (
                      <button key={sugar} onClick={() => setSugarOption(sugar)}
                        className="flex-1 px-4 py-3 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation"
                        style={{ fontSize: "16px", ...(sugarOption === sugar ? activeOptStyle : inactiveOptStyle) }}>
                        {sugar}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showAddOns && allowedAddOns.length > 0 && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <p className="font-semibold text-base" style={{ color: "#3b2212" }}>
                      Add Ons <span style={{ color: "#a07850" }}>(+₱30 each)</span>
                    </p>
                    <button onClick={handleClearAddOns} className="text-sm underline py-2 px-3 rounded-lg active:scale-95 touch-manipulation" style={{ color: "#a07850" }}>Clear all</button>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <button onClick={handleClearAddOns}
                      className="px-2 py-3 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation flex flex-col items-center justify-center gap-1"
                      style={{ fontSize: "14px", ...(selectedAddOns.length === 0 ? activeOptStyle : inactiveOptStyle) }}>
                      <span>None</span>
                    </button>
                    {allowedAddOns.map((addOn) => {
                      const needed = ADD_ON_SERVING_SIZES[addOn] || 1;
                      const stockAvailable = inventoryStock[addOn]?.quantity || 0;
                      const reserved = alreadyInCartReserved[addOn] || 0;
                      const isOOS = (stockAvailable - reserved) < needed;
                      const isSelected = selectedAddOns.includes(addOn);

                      return (
                        <button 
                          key={addOn} 
                          disabled={isOOS}
                          onClick={() => handleToggleAddOn(addOn)}
                          className="px-2 py-3 rounded-xl font-semibold transition-all touch-manipulation flex flex-col items-center justify-center gap-1"
                          style={{
                            ...(isOOS
                              ? { background: "#f5f5f5", color: "#c0b090", border: "1.5px solid #e8ddd4", cursor: "not-allowed", opacity: 0.7 }
                              : isSelected ? activeOptStyle : inactiveOptStyle)
                          }}>
                          <span style={{ fontSize: "14px" }}>{addOn}</span>
                          {isOOS && <span style={{ fontSize: "10px", color: "#c0392b" }}>(Not Available)</span>}
                        </button>
                      );
                    })}
                  </div>
                  {selectedAddOns.length > 0 && (
                    <div className="mt-4 p-4 rounded-xl text-sm" style={{ background: "#faf7f4", color: "#6b4c30" }}>
                      <span className="font-semibold">Selected:</span> {selectedAddOns.join(", ")}
                      <span className="ml-2 font-semibold" style={{ color: "#a07850" }}>+₱{(selectedAddOns.length * ADD_ON_PRICE).toFixed(0)}</span>
                    </div>
                  )}
                </div>
              )}

              {currentMissingIngredients.length > 0 && (
                 <div className="mt-2 mb-4 p-4 rounded-xl border" 
                 style={{ background: "#fff0f0", borderColor: "#f5c6c6", color: "#c0392b" }}>
                 <p className="text-sm font-bold mb-2">Item Unavailable. Missing Ingredients:</p>
                 <ul className="text-xs list-disc pl-5 space-y-1">
                   {currentMissingIngredients.map((err, idx) => (
                     <li key={idx}>{err}</li>
                   ))}
                 </ul>
               </div>
              )}

              <button
                disabled={(selectedProduct === "Quesadillas" && !selectedVariant) || currentMissingIngredients.length > 0}
                onClick={handleAddToOrder}
                className="w-full py-4 rounded-xl font-semibold text-lg transition-all active:scale-95 touch-manipulation mt-4"
                style={
                  currentMissingIngredients.length > 0 
                  ? { background: "#e8e0d8", color: "#c0392b", cursor: "not-allowed" } : 
                  (selectedProduct === "Quesadillas" && !selectedVariant)
                  ? { background: "#e8e0d8", color: "#b09070", cursor: "not-allowed" }
                  : { background: "#3b2212", color: "white" }}>
                {currentMissingIngredients.length > 0 ? "Not Available" : `Add to Order — ₱${modalPrice.toFixed(0)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}