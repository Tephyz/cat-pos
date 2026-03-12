"use client";

import { useState } from "react";

interface OrderItem {
  name: string;
  temperature: string;
  size: string;
  sugar: string;
  quantity: number;
  price: number;
  addOns?: string[]; // Optional array for add-ons
}

export default function POSLayout() {
  const [activeCategory, setActiveCategory] = useState("Coffee");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [activeFrappeType, setActiveFrappeType] = useState<string | null>(null);
  
  const [tempOption, setTempOption] = useState("Hot");
  const [sizeOption, setSizeOption] = useState("Medium");
  const [sugarOption, setSugarOption] = useState("100%");
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  
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
    Frappe: []
  };

  const frappeProducts = {
    "Coffee Based": ["Java Chip", "Coffee Jelly", "Dark Mocha", "Caramel"],
    "Cream Based": ["Vanilla", "Cookies & Cream", "Strawberries & Cream", "Blue Berries & Cream","Choco Chip", "Caramel", "Salted Caramel"],
    "Tea Based": ["Wintermelon", "Okinawa", "Capuccino"]
  };
  
  // Add ons list
  const addOns = ["Espresso Shot", "Coffee Jelly", "Oreo", "Caramel Syrup", "Pearl", "Nata", "Whip Cream", "Chocolate Syrup", "White Chocolate"];

  const handleAddToOrder = () => {
    if (!selectedProduct) return;

    // Calculate base price (3 for all drinks, can be adjusted per category)
    const basePrice = 3;
    
    // Size price adjustment
    const sizePrice = sizeOption === "Large" || sizeOption === "Pot" ? 1 : 0;
    
    // Add-ons price (example: $0.50 each)
    const addOnsPrice = selectedAddOns.length * 0.5;
    
    const price = basePrice + sizePrice + addOnsPrice;

    const newItem: OrderItem = {
      name: selectedProduct,
      temperature: tempOption,
      size: sizeOption,
      sugar: sugarOption,
      quantity: 1,
      price,
      addOns: selectedAddOns.length > 0 ? selectedAddOns : undefined,
    };

    setOrderItems([...orderItems, newItem]);
    setSelectedProduct(null); // Close modal
    setTempOption("Hot");
    setSizeOption("Medium");
    setSugarOption("100%");
    setSelectedAddOns([]); // Reset add-ons
  };

  const handleToggleAddOn = (addOn: string) => {
    setSelectedAddOns(prev =>
      prev.includes(addOn)
        ? prev.filter(item => item !== addOn)
        : [...prev, addOn]
    );
  };

  const handleClearAddOns = () => {
    setSelectedAddOns([]);
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

  // Categories that can have add-ons
  const categoriesWithAddOns = ["Coffee", "Non Coffee", "Milktea", "Yakult Mix", "Fruit Tea", "Frappe"];

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
                onClick={() => setSelectedProduct(item)}
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
                    {item.temperature && `${item.temperature} · `}
                    {item.size && `${item.size} · `}
                    {item.sugar && `Sugar ${item.sugar}`}
                    {item.addOns && item.addOns.length > 0 && (
                      <span className="block mt-1 text-green-600">
                        + {item.addOns.join(", ")}
                      </span>
                    )}
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

      {/* PRODUCT MODAL - WIDE VERSION */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-white/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-200 relative border-2 border-[#5a3e2b] max-h-[90vh] overflow-y-auto">
            <button
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 text-xl"
              onClick={() => {
                setSelectedProduct(null);
                setSelectedAddOns([]);
              }}
            >
              ✕
            </button>
            <h2 className="text-2xl font-semibold mb-6 pr-8">{selectedProduct}</h2>

            {/* Product Options - Two Column Layout */}
            <div className="space-y-6">
              {/* Top Row - Temperature and Size */}
              <div className="grid grid-cols-2 gap-6">
                {/* Hot / Ice */}
                {!hideTemperature && (
                  <div>
                    <p className="font-medium mb-3 text-lg">Temperature</p>
                    <div className="flex gap-4">
                      <button
                        className={`flex-1 px-4 py-2 border rounded-lg text-center ${
                          tempOption === "Hot" ? "bg-[#5a3e2b] text-white" : "hover:bg-gray-100"
                        }`}
                        onClick={() => setTempOption("Hot")}
                      >
                        Hot
                      </button>
                      <button
                        className={`flex-1 px-4 py-2 border rounded-lg text-center ${
                          tempOption === "Ice" ? "bg-[#5a3e2b] text-white" : "hover:bg-gray-100"
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
                  <p className="font-medium mb-3 text-lg">Size</p>
                  <div className="flex gap-4">
                    {activeCategory === "Hot Tea" ? (
                      <>
                        <button
                          className={`flex-1 px-4 py-2 border rounded-lg text-center ${sizeOption === "220 ml" ? "bg-[#5a3e2b] text-white" : "hover:bg-gray-100"}`}
                          onClick={() => setSizeOption("220 ml")}
                        >
                          220 ml
                        </button>
                        <button
                          className={`flex-1 px-4 py-2 border rounded-lg text-center ${sizeOption === "Pot" ? "bg-[#5a3e2b] text-white" : "hover:bg-gray-100"}`}
                          onClick={() => setSizeOption("Pot")}
                        >
                          Pot
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={`flex-1 px-4 py-2 border rounded-lg text-center ${sizeOption === "Medium" ? "bg-[#5a3e2b] text-white" : "hover:bg-gray-100"}`}
                          onClick={() => setSizeOption("Medium")}
                        >
                          Medium
                        </button>
                        <button
                          className={`flex-1 px-4 py-2 border rounded-lg text-center ${sizeOption === "Large" ? "bg-[#5a3e2b] text-white" : "hover:bg-gray-100"}`}
                          onClick={() => setSizeOption("Large")}
                        >
                          Large
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Sugar Level - Full Width */}
              <div>
                <p className="font-medium mb-3 text-lg">Sugar Level</p>
                <div className="flex gap-3">
                  {["0%", "20%", "50%", "80%", "100%"].map((sugar) => (
                    <button
                      key={sugar}
                      className={`flex-1 px-4 py-2 border rounded-lg text-center ${
                        sugarOption === sugar ? "bg-[#5a3e2b] text-white" : "hover:bg-gray-100"
                      }`}
                      onClick={() => setSugarOption(sugar)}
                    >
                      {sugar}
                    </button>
                  ))}
                </div>
              </div>

              {/* Add Ons Section - Only show for applicable categories */}
              {categoriesWithAddOns.includes(activeCategory) && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <p className="font-medium text-lg">Add Ons (+$0.50 each)</p>
                    <button
                      onClick={handleClearAddOns}
                      className="text-sm text-gray-500 hover:text-[#5a3e2b] underline"
                    >
                      Clear all
                    </button>
                  </div>
                  
                  {/* None option and Add-ons in a row */}
                  <div className="flex gap-3">
                    <button
                      className={`w-24 px-4 py-2 border rounded-lg text-center ${
                        selectedAddOns.length === 0
                          ? "bg-[#5a3e2b] text-white"
                          : "hover:bg-gray-100"
                      }`}
                      onClick={handleClearAddOns}
                    >
                      None
                    </button>
                    
                    <div className="flex-1 grid grid-cols-4 gap-2">
                      {addOns.map((addOn) => (
                        <button
                          key={addOn}
                          className={`px-3 py-2 border rounded-lg text-sm ${
                            selectedAddOns.includes(addOn)
                              ? "bg-[#5a3e2b] text-white"
                              : "hover:bg-gray-100"
                          }`}
                          onClick={() => handleToggleAddOn(addOn)}
                        >
                          {addOn}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Selected add-ons summary */}
                  {selectedAddOns.length > 0 && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm font-medium text-gray-700">
                        Selected: {selectedAddOns.join(", ")}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        +${(selectedAddOns.length * 0.5).toFixed(2)} add-ons fee
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Add to Order */}
              <button
                className="w-full mt-4 bg-[#5a3e2b] text-white py-3 rounded-lg font-semibold text-lg hover:bg-[#6f5238] transition-colors"
                onClick={handleAddToOrder}
              >
                Add to Order — ${(3 + (sizeOption === "Large" || sizeOption === "Pot" ? 1 : 0) + (selectedAddOns.length * 0.5)).toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}