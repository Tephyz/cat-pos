"use client";

import { useState } from "react";

interface OrderItem {
  name: string;
  temperature: string;
  size: string;
  sugar: string;
  quantity: number;
  price: number;
}

export default function POSLayout() {
  const [activeCategory, setActiveCategory] = useState("Coffee");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [activeFrappeType, setActiveFrappeType] = useState<string | null>(null);
  

  const [tempOption, setTempOption] = useState("Hot");
  const [sizeOption, setSizeOption] = useState("Medium");
  const [sugarOption, setSugarOption] = useState("100%");
  
  const handleRemoveItem = (index: number) => {
    const updatedItems = orderItems.filter((_, i) => i !== index);
    setOrderItems(updatedItems);
  };
  
  const handleQuickAdd = (product: string) => {
    const newItem: OrderItem = {
      name: product,
      temperature: "",
      size: "",
      sugar: "",
      quantity: 1,
      price: 1, // you can change addon price
    };
    setOrderItems([...orderItems, newItem]);
  };

  const products = {
    Coffee: ["Americano", "Cappuccino", "Hazelnut", "Caramel Macchiato", "Mocha", "Spanish Latte", "Salted Caramel Latte", "Dirty Matcha", "Popcorn Latte", "Vanilla Latte"],
    "Non Coffee": ["Choco", "Dark Choco", "Matcha latte", "Salted Caramel", "Caramel"],
    Milktea: ["Wintermelon", "Okinawa", "Dark Choco", "Capuccino"],
    "Yakult Mix": ["Wintermelon", "Blueberry", "Green Apple", "Lychee", "Strawberrys"],
    "Fruit Tea": ["Wintermelon", "Blueberry", "Green Apple", "Lychee", "Strawberrys"],
    "Hot Tea": ["English Breakfast", "Four Red Fruits", "Pure Camomile", "Green Tea & Lemon", "Lemon & Ginger"],
    Frappe: [],
    "Add ons": ["Espresso", "Coffee Jelly", "Oreo", "Caramel", "Pearl", "Nata", "Whip Cream"],
  };

  const frappeProducts = {
    "Coffee Based": ["Java Chip", "Coffee Jelly", "Dark Mocha", "Caramel"],
    "Cream Based": ["Vanilla", "Cookies & Cream", "Strawberries & Cream", "Blue Berries & Cream","Choco Chip", "Caramel", "Salted Caramel"],
    "Tea Based": ["Wintermelon", "Okinawa", "Capuccino"]
  };
  

  const handleAddToOrder = () => {
    if (!selectedProduct) return;

    // Calculate price (example: base 3 for Coffee, 2 for Pastries)
    const basePrice = activeCategory === "Pastries" ? 2 : 3;
    const price = basePrice + (sizeOption === "Large" ? 1 : 0);

    const newItem: OrderItem = {
      name: selectedProduct,
      temperature: tempOption,
      size: sizeOption,
      sugar: sugarOption,
      quantity: 1,
      price,
    };

    setOrderItems([...orderItems, newItem]);
    setSelectedProduct(null); // Close modal
    setTempOption("Hot");
    setSizeOption("Medium");
    setSugarOption("100%");
  };

  // Calculate totals
  const subtotal = orderItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const tax = +(subtotal * 0.08).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);

  // Hide temperature for some categories
  const hideTemperature =
    activeCategory === "Milktea" ||
    activeCategory === "Yakult Mix" ||
    activeCategory === "Fruit Tea" ||
    activeCategory === "Frappe"  ||
    activeCategory === "Hot Tea";

  // Check if an item is from Add ons category
  const isAddOnsItem = (itemName: string) => {
    return products["Add ons"].includes(itemName);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex">

      {/* MAIN CONTENT */}
      <div className="flex-1 p-6">

        {/* TOP BAR */}
        <div className="flex justify-between items-center bg-[#5a3e2b] text-white px-6 py-4 rounded-lg mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-full" />
            <span className="font-semibold">Sarah Chen</span>
          </div>
          <span className="text-sm">2/11/2026 8:21 AM</span>
        </div>

        {/* SEARCH */}
        <input
          type="text"
          placeholder="Search products..."
          className="w-full border rounded-lg px-4 py-3 mb-4"
        />

        {/* CATEGORY TABS */}
        <div className="flex gap-6 mb-6">
          {Object.keys(products).map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-5 py-2 rounded-lg ${
                activeCategory === category ? "bg-[#5a3e2b] text-white" : "text-gray-600"
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* FRAPPE DROPDOWN */}
        {activeCategory === "Frappe" && (
          <div className="flex gap-4 mb-6">
            {Object.keys(frappeProducts).map((type) => (
              <button
                key={type}
                onClick={() => setActiveFrappeType(type)}
                className={`px-4 py-2 rounded-lg border ${
                  activeFrappeType === type ? "bg-[#5a3e2b] text-white" : ""
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-4 gap-6">
          {/* Normal Categories */}
          {activeCategory !== "Frappe" &&
            products[activeCategory as keyof typeof products]?.map((item, index) => (
              <div
                key={index}
                className="bg-white rounded-xl shadow p-4 text-center cursor-pointer hover:bg-gray-100"
                onClick={() => {
                  if (activeCategory === "Add ons") {
                    handleQuickAdd(item);
                  } else {
                    setSelectedProduct(item);
                  }
                }}
              >
                <p className="font-medium">{item}</p>
              </div>
            ))}

          {/* Frappe Products */}
          {activeCategory === "Frappe" && activeFrappeType &&
            frappeProducts[activeFrappeType as keyof typeof frappeProducts]?.map((item, index) => (
              <div
                key={index}
                className="bg-white rounded-xl shadow p-4 text-center cursor-pointer hover:bg-gray-100"
                onClick={() => setSelectedProduct(item)}
              >
                <p className="font-medium">{item}</p>
              </div>
            ))}
        </div>
      </div>

      {/* ORDER PANEL - FIXED VERSION */}
      <div className="w-90 bg-white p-6 shadow-lg flex flex-col h-screen sticky top-0">
        <h2 className="text-xl font-semibold mb-6 flex justify-between">
          Order
          {orderItems.length > 0 && (
            <span className="bg-black text-white text-xs px-2 py-1 rounded-full">
              {orderItems.length}
            </span>
          )}
        </h2>

        {/* EMPTY ORDER - CENTERED FIX */}
        {orderItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center -mt-20">
            <div className="text-7xl mb-4 text-gray-300">🛒</div>
            <p className="text-gray-400 text-lg">No items added yet</p>
          </div>
        ) : (
          /* ORDER ITEMS - SCROLLABLE AREA */
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {orderItems.map((item, index) => (
              <div key={index} className="flex justify-between border-b pb-2">
                <div>
                  <p className="font-medium">
                    {item.name} x {item.quantity}
                  </p>
                  <p className="text-xs text-gray-500">
                    {item.temperature} · {item.size} 
                    {!isAddOnsItem(item.name) && item.sugar && ` · Sugar ${item.sugar}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-blue-600 font-semibold">
                    ${item.price.toFixed(2)}
                  </p>
                  <button
                    onClick={() => handleRemoveItem(index)}
                    className="text-gray-400 hover:text-red-500 text-sm mt-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PAYMENT AREA - ALWAYS AT BOTTOM */}
        {orderItems.length > 0 && (
          <div className="border-t pt-4 text-sm space-y-2 mb-4">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax (8%)</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* PAYMENT BUTTONS */}
        <div className="space-y-3 mt-auto">
          <button
            disabled={orderItems.length === 0}
            className={`w-full py-3 rounded-lg font-semibold ${
              orderItems.length === 0
                ? "bg-gray-300 text-white cursor-not-allowed"
                : "bg-[#2b1a0f] text-white hover:bg-[#3f2e1f]"
            }`}
          >
            Cash {orderItems.length > 0 && `— $${total.toFixed(2)}`}
          </button>
          <button
            disabled={orderItems.length === 0}
            className={`w-full py-3 rounded-lg font-semibold ${
              orderItems.length === 0
                ? "bg-gray-300 text-white cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            GCash {orderItems.length > 0 && `— $${total.toFixed(2)}`}
          </button>
        </div>
      </div>

      {/* PRODUCT MODAL */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-white/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-800"
              onClick={() => setSelectedProduct(null)}
            >
              ✕
            </button>
            <h2 className="text-xl font-semibold mb-4">{selectedProduct}</h2>

            {/* Product Options */}
            <div className="space-y-4">
              {/* Hot / Ice */}
              {!hideTemperature && (
                <div>
                  <p className="font-medium mb-2">Temperature</p>
                  <div className="flex gap-4">
                    <button
                      className={`px-3 py-1 border rounded-lg ${
                        tempOption === "Hot" ? "bg-[#5a3e2b] text-white" : ""
                      }`}
                      onClick={() => setTempOption("Hot")}
                    >
                      Hot
                    </button>
                    <button
                      className={`px-3 py-1 border rounded-lg ${
                        tempOption === "Ice" ? "bg-[#5a3e2b] text-white" : ""
                      }`}
                      onClick={() => setTempOption("Ice")}
                    >
                      Ice
                    </button>
                  </div>
                </div>
              )}

              {/* Size */}
              <div>
                <p className="font-medium mb-2">Size</p>
                <div className="flex gap-4">
                  {activeCategory === "Hot Tea" ? (
                    <>
                      <button
                        className={`px-3 py-1 border rounded-lg ${sizeOption === "220 ml" ? "bg-[#5a3e2b] text-white" : ""}`}
                        onClick={() => setSizeOption("220 ml")}
                      >
                        220 ml
                      </button>
                      <button
                        className={`px-3 py-1 border rounded-lg ${sizeOption === "Pot" ? "bg-[#5a3e2b] text-white" : ""}`}
                        onClick={() => setSizeOption("Pot")}
                      >
                        Pot
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className={`px-3 py-1 border rounded-lg ${sizeOption === "Medium" ? "bg-[#5a3e2b] text-white" : ""}`}
                        onClick={() => setSizeOption("Medium")}
                      >
                        Medium
                      </button>
                      <button
                        className={`px-3 py-1 border rounded-lg ${sizeOption === "Large" ? "bg-[#5a3e2b] text-white" : ""}`}
                        onClick={() => setSizeOption("Large")}
                      >
                        Large
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Sugar Level */}
              <div>
                <p className="font-medium mb-2">Sugar Level</p>
                <div className="flex gap-4">
                  {["0%", "20%", "50%", "80%", "100%"].map((sugar) => (
                    <button
                      key={sugar}
                      className={`px-3 py-1 border rounded-lg ${sugarOption === sugar ? "bg-[#5a3e2b] text-white" : ""}`}
                      onClick={() => setSugarOption(sugar)}
                    >
                      {sugar}
                    </button>
                  ))}
                </div>
              </div>

              {/* Add to Order */}
              <button
                className="w-full mt-4 bg-[#5a3e2b] text-white py-2 rounded-lg font-semibold"
                onClick={handleAddToOrder}
              >
                Add to Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}