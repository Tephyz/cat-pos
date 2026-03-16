"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

interface OrderItem {
  name: string;
  category: string; // ← added
  temperature: string;
  size: string;
  sugar: string;
  quantity: number;
  price: number;
  addOns?: string[];
  variant?: string;
}

export default function POSLayout() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  const handleLogout = () => { logout(); router.push("/"); };

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const [activeCategory, setActiveCategory] = useState("Coffee");
  const [activeFoodSubCategory, setActiveFoodSubCategory] = useState<string>("All");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [activeFrappeType, setActiveFrappeType] = useState<string | null>(null);
  const [tempOption, setTempOption] = useState("Hot");
  const [sizeOption, setSizeOption] = useState("Medium");
  const [sugarOption, setSugarOption] = useState("100%");
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductIsFood, setSelectedProductIsFood] = useState(false);
  const [selectedProductCategory, setSelectedProductCategory] = useState(""); // ← added

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Redirecting to login...</div>;

  const handleRemoveItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const products = {
    Coffee: ["Americano", "Cappuccino", "Hazelnut", "Caramel Macchiato", "Mocha", "Spanish Latte", "Salted Caramel Latte", "Dirty Matcha", "Vanilla Latte"],
    "Non Coffee": ["Choco", "Dark Choco", "Matcha latte", "Salted Caramel", "Caramel"],
    Milktea: ["Wintermelon", "Okinawa", "Dark Choco", "Capuccino"],
    "Yakult Mix": ["Wintermelon", "Blueberry", "Green Apple", "Lychee", "Strawberry"],
    "Fruit Tea": ["Wintermelon", "Blueberry", "Green Apple", "Lychee", "Strawberry"],
    "Hot Tea": ["English Breakfast", "Four Red Fruits", "Pure Camomile", "Green Tea & Lemon", "Lemon & Ginger"],
    Frappe: [],
    "Food & Bites": [],
  };

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
    "Desserts & Pastries": ["Cheesecake", "Empanada", "Muffin", "Cookies", "Popcorn", "Pancake"],
    "Silog Meals": ["Tapa", "Bangus", "Spam", "Hotdog", "Ham", "Longganisa"],
    Pasta: ["Spaghetti", "Tuna Pesto"],
    Salads: ["Vegetable Salad"],
  };

  const allFoodItems = Object.values(foodProducts).flat();
  const allFrappeItems = Object.values(frappeProducts).flat();

  const quesadillasVariants = ["Beef", "Cheese"];
  const addOns = ["Espresso", "Coffee Jelly", "Oreo", "Caramel", "Pearl", "Nata", "Whip Cream"];

  // ── Helper: get category label for any product ──
  const getCategoryLabel = (item: string): string => {
    // If not searching, use the active category directly — most accurate
    if (!isSearching) {
      if (activeCategory === "Frappe" && activeFrappeType) {
        return `Frappe · ${activeFrappeType}`;
      }
      if (activeCategory === "Food & Bites") {
        for (const [sub, items] of Object.entries(foodProducts)) {
          if (items.includes(item)) return `Food & Bites · ${sub}`;
        }
        return "Food & Bites";
      }
      return activeCategory;
    }
    // When searching — guess from product lists (frappe first to avoid false matches)
    for (const [sub, items] of Object.entries(frappeProducts)) {
      if (items.includes(item)) return `Frappe · ${sub}`;
    }
    for (const [sub, items] of Object.entries(foodProducts)) {
      if (items.includes(item)) return `Food & Bites · ${sub}`;
    }
    for (const [cat, items] of Object.entries(products)) {
      if ((items as string[]).includes(item)) return cat;
    }
    return "";
  };

  // ── ALL PRODUCTS FLAT LIST for search ──
  const allProducts: string[] = [
    ...Object.values(products).flat(),
    ...allFrappeItems,
    ...allFoodItems,
  ];
  const uniqueAllProducts = [...new Set(allProducts)];

  const searchResults = searchQuery.trim().length > 0
    ? uniqueAllProducts.filter(item =>
        item.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const isSearching = searchQuery.trim().length > 0;

  const checkIsFood = (productName: string) => allFoodItems.includes(productName);
  const checkIsFrappe = (productName: string) => allFrappeItems.includes(productName);

  const isFood = isSearching ? selectedProductIsFood : activeCategory === "Food & Bites";

  const drinkCategoriesHideTemp = ["Milktea", "Yakult Mix", "Fruit Tea", "Frappe", "Hot Tea", "Food & Bites"];
  const hideTemperature = isFood || (isSearching
    ? checkIsFrappe(selectedProduct || "")
    : drinkCategoriesHideTemp.includes(activeCategory));

  const categoriesWithAddOns = ["Coffee", "Non Coffee", "Milktea", "Yakult Mix", "Fruit Tea", "Frappe"];
  const showAddOns = isSearching
    ? !checkIsFood(selectedProduct || "")
    : categoriesWithAddOns.includes(activeCategory);

  const modalPrice = isFood
    ? 5 + selectedAddOns.length * 0.5
    : 3 + (sizeOption === "Large" || sizeOption === "Pot" ? 1 : 0) + selectedAddOns.length * 0.5;

  const handleAddToOrder = () => {
    if (!selectedProduct) return;
    if (selectedProduct === "Quesadillas" && !selectedVariant) return;
    const basePrice = isFood ? 5 : 3;
    const sizePrice = sizeOption === "Large" || sizeOption === "Pot" ? 1 : 0;
    const addOnsPrice = selectedAddOns.length * 0.5;
    const price = basePrice + (isFood ? 0 : sizePrice) + addOnsPrice;
    const newItem: OrderItem = {
      name: selectedProduct === "Quesadillas" && selectedVariant ? `Quesadillas (${selectedVariant})` : selectedProduct,
      category: selectedProductCategory, // ← save category
      temperature: isFood ? "" : tempOption,
      size: isFood ? "" : sizeOption,
      sugar: isFood ? "" : sugarOption,
      quantity: 1, price,
      addOns: selectedAddOns.length > 0 ? selectedAddOns : undefined,
    };
    setOrderItems([...orderItems, newItem]);
    setSelectedProduct(null); setTempOption("Hot"); setSizeOption("Medium");
    setSugarOption("100%"); setSelectedAddOns([]); setSelectedVariant(null);
    setSelectedProductIsFood(false); setSelectedProductCategory("");
  };

  const handleToggleAddOn = (addOn: string) => {
    setSelectedAddOns(prev => prev.includes(addOn) ? prev.filter(i => i !== addOn) : [...prev, addOn]);
  };
  const handleClearAddOns = () => setSelectedAddOns([]);

  const subtotal = orderItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const tax = +(subtotal * 0.08).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);

  const activeTabStyle = { background: "#3b2212", color: "white", boxShadow: "0 4px 12px rgba(59,34,18,0.25)" };
  const inactiveTabStyle = { background: "white", color: "#6b4c30", border: "1.5px solid #e8ddd4" };
  const activeOptStyle = { background: "#3b2212", color: "white" };
  const inactiveOptStyle = { background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" };

  // Helper to open product
  const openProduct = (item: string) => {
    setSelectedProduct(item);
    setSelectedProductIsFood(checkIsFood(item));
    setSelectedProductCategory(getCategoryLabel(item)); // ← detect category
  };

  return (
    <div className="min-h-screen flex" style={{ background: "#ede8e3" }}>

      <div className="flex-1 p-5 flex flex-col" style={{ minHeight: "100vh" }}>

        {/* TOP BAR */}
        <div className="flex justify-between items-center px-6 py-4 rounded-2xl mb-5"
          style={{ background: "linear-gradient(135deg, #3b2212 0%, #6b3f22 100%)" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-normal text-sm"
              style={{ background: "#f7f3ef", color: "#3b2212" }}>
              {(user?.displayName || "U")[0].toUpperCase()}
            </div>
            <p className="text-white font-normal text-sm">{user?.displayName || "User"}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs" style={{ color: "#d4a97a" }}>Current Time</p>
              <p className="text-white text-sm font-normal">{currentTime.toLocaleString()}</p>
            </div>
            <button onClick={handleLogout}
              className="px-4 py-2 rounded-xl text-sm font-normal"
              style={{ background: "#c0392b", color: "white" }}>
              Logout
            </button>
          </div>
        </div>

        {/* SEARCH */}
        <div className="relative mb-5">
          <span className="absolute left-4 top-1/2 -translate-y-1/2">🔍</span>
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl px-4 py-3 pl-11 text-sm outline-none"
            style={{ background: "white", border: "1.5px solid #e8ddd4", color: "#3b2212" }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-sm"
              style={{ color: "#a07850" }}>
              x
            </button>
          )}
        </div>

        {/* SEARCH RESULTS */}
        {isSearching ? (
          <>
            <p className="text-sm mb-3" style={{ color: "#a07850" }}>
              {searchResults.length > 0
                ? `${searchResults.length} result${searchResults.length > 1 ? "s" : ""} for "${searchQuery}"`
                : `No results for "${searchQuery}"`}
            </p>
            <div className="grid grid-cols-4 gap-4">
              {searchResults.map((item, i) => (
                <div key={i} onClick={() => openProduct(item)}
                  className="rounded-2xl p-5 cursor-pointer transition-all flex flex-col items-center justify-center gap-1"
                  style={{ background: "white", border: "0.2px solid #e8ddd4", minHeight: "90px" }}>
                  <p className="font-normal text-center" style={{ color: "#3b2212", fontSize: "18px" }}>{item}</p>
                  {item === "Quesadillas" && <p className="text-xs" style={{ color: "#a07850" }}>Beef / Cheese</p>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* CATEGORY TABS */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {Object.keys(products).map((cat) => (
                <button key={cat}
                  onClick={() => { setActiveCategory(cat); setActiveFrappeType(null); setActiveFoodSubCategory("All"); }}
                  className="px-5 py-3 rounded-xl font-semibold transition-all"
                  style={{ fontSize: "18px", ...(activeCategory === cat ? activeTabStyle : inactiveTabStyle) }}>
                  {cat}
                </button>
              ))}
            </div>

            {/* FRAPPE SUB-TABS */}
            {activeCategory === "Frappe" && (
              <div className="flex gap-2 mb-5 p-3 rounded-xl flex-wrap" style={{ background: "#ede4db" }}>
                {Object.keys(frappeProducts).map((type) => (
                  <button key={type}
                    onClick={() => setActiveFrappeType(type)}
                    className="px-5 py-3 rounded-lg font-semibold transition-all"
                    style={{ fontSize: "16px", ...(activeFrappeType === type ? activeOptStyle : inactiveOptStyle) }}>
                    {type}
                  </button>
                ))}
              </div>
            )}

            {/* FOOD & BITES SUB-TABS */}
            {activeCategory === "Food & Bites" && (
              <div className="flex gap-2 mb-5 p-3 rounded-xl flex-wrap" style={{ background: "#ede4db" }}>
                <button
                  onClick={() => setActiveFoodSubCategory("All")}
                  className="px-5 py-3 rounded-lg font-semibold transition-all"
                  style={{ fontSize: "16px", ...(activeFoodSubCategory === "All" ? activeOptStyle : inactiveOptStyle) }}>
                  All
                </button>
                {Object.keys(foodProducts).map((sub) => (
                  <button key={sub}
                    onClick={() => setActiveFoodSubCategory(sub)}
                    className="px-5 py-3 rounded-lg font-semibold transition-all"
                    style={{ fontSize: "16px", ...(activeFoodSubCategory === sub ? activeOptStyle : inactiveOptStyle) }}>
                    {sub}
                  </button>
                ))}
              </div>
            )}

            {/* PRODUCT GRID */}
            <div className="grid grid-cols-4 gap-4">
              {activeCategory !== "Frappe" && activeCategory !== "Food & Bites" &&
                products[activeCategory as keyof typeof products]?.map((item, i) => (
                  <div key={i} onClick={() => openProduct(item)}
                    className="rounded-2xl p-5 cursor-pointer transition-all flex flex-col items-center justify-center gap-1"
                    style={{ background: "white", border: "0.2px solid #e8ddd4", minHeight: "90px" }}>
                    <p className="font-normal text-center" style={{ color: "#3b2212", fontSize: "18px" }}>{item}</p>
                  </div>
                ))}

              {activeCategory === "Frappe" && activeFrappeType &&
                frappeProducts[activeFrappeType as keyof typeof frappeProducts]?.map((item, i) => (
                  <div key={i} onClick={() => openProduct(item)}
                    className="rounded-2xl p-5 cursor-pointer transition-all flex flex-col items-center justify-center gap-1"
                    style={{ background: "white", border: "0.2px solid #e8ddd4", minHeight: "90px" }}>
                    <p className="font-normal text-center" style={{ color: "#3b2212", fontSize: "18px" }}>{item}</p>
                  </div>
                ))}

              {activeCategory === "Food & Bites" && activeFoodSubCategory &&
                (activeFoodSubCategory === "All"
                  ? Object.values(foodProducts).flat()
                  : foodProducts[activeFoodSubCategory]
                )?.map((item, i) => (
                  <div key={i} onClick={() => openProduct(item)}
                    className="rounded-2xl p-5 cursor-pointer transition-all flex flex-col items-center justify-center gap-1"
                    style={{ background: "white", border: "0.2px solid #e8ddd4", minHeight: "90px" }}>
                    <p className="font-normal text-center" style={{ color: "#3b2212", fontSize: "18px" }}>{item}</p>
                    {item === "Quesadillas" && <p className="text-xs" style={{ color: "#a07850" }}>Beef / Cheese</p>}
                  </div>
                ))}
            </div>
          </>
        )}
      </div>

      {/* ORDER PANEL */}
      <div className="w-96 flex flex-col h-screen sticky top-0 p-5"
        style={{ background: "white", borderLeft: "1.5px solid #e8ddd4" }}>

        <div className="flex justify-between items-center mb-5">
          <h2 className="text-2xl font-bold" style={{ color: "#3b2212" }}>Order</h2>
          {orderItems.length > 0 && (
            <span className="text-xs px-2 py-1 rounded-full font-normal"
              style={{ background: "#3b2212", color: "white" }}>{orderItems.length}</span>
          )}
        </div>

        {orderItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center -mt-10">
            <div className="text-6xl mb-3 opacity-20">🛒</div>
            <p className="text-sm" style={{ color: "#b09070" }}>No items added yet</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {orderItems.map((item, index) => (
              <div key={index} className="p-3"
                style={{ borderBottom: "0.5px solid #e8ddd4" }}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-semibold text-sm" style={{ color: "#3b2212" }}>
                      {item.name} <span style={{ color: "#a07850" }}>x{item.quantity}</span>
                    </p>
                    {/* ← Category label — drinks only */}
                    {item.category && !item.category.includes("Food & Bites") && (
                      <p className="text-xs mt-0.5 font-medium" style={{ color: "#3b2212", opacity: 0.5 }}>
                        {item.category}
                      </p>
                    )}
                    {(item.temperature || item.size || item.sugar) && (
                      <p className="text-xs mt-0.5" style={{ color: "#a07850" }}>
                        {[item.temperature, item.size, item.sugar && `Sugar ${item.sugar}`].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {item.addOns && item.addOns.length > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: "#5a8a5a" }}>+ {item.addOns.join(", ")}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-2">
                    <p className="font-normal text-sm" style={{ color: "#3b2212" }}>${item.price.toFixed(2)}</p>
                    <button onClick={() => handleRemoveItem(index)}
                      className="text-xs rounded-full w-5 h-5 flex items-center justify-center"
                      style={{ background: "#f0e8e0", color: "#a07850" }}>x</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {orderItems.length > 0 && (
          <div className="py-4 space-y-2 mt-2" style={{ borderTop: "1.5px solid #e8ddd4" }}>
            <div className="flex justify-between text-sm" style={{ color: "#a07850" }}>
              <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm" style={{ color: "#a07850" }}>
              <span>Tax (8%)</span><span>${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-normal text-base" style={{ color: "#3b2212" }}>
              <span>Total</span><span>${total.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="space-y-2 mt-2">
          <button disabled={orderItems.length === 0}
            className="w-full py-4 rounded-xl font-normal transition-all"
            style={{ fontSize: "15px", ...(orderItems.length === 0
              ? { background: "#e8e0d8", color: "#b09070", cursor: "not-allowed" }
              : { background: "#3b2212", color: "white" }) }}>
            Cash {orderItems.length > 0 && `— $${total.toFixed(2)}`}
          </button>
          <button disabled={orderItems.length === 0}
            className="w-full py-4 rounded-xl font-normal transition-all"
            style={{ fontSize: "15px", ...(orderItems.length === 0
              ? { background: "#e8e0d8", color: "#b09070", cursor: "not-allowed" }
              : { background: "#0070ba", color: "white" }) }}>
            GCash {orderItems.length > 0 && `— $${total.toFixed(2)}`}
          </button>
        </div>
      </div>

      {/* PRODUCT MODAL */}
      {selectedProduct && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl p-6 relative max-h-[90vh] overflow-y-auto"
            style={{ background: "white", border: "2px solid #e8ddd4", width: "fit-content", minWidth: "320px", maxWidth: "90vw" }}>

            <button
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-sm"
              style={{ background: "#f7f3ef", color: "#3b2212", border: "1px solid #e8ddd4" }}
              onClick={() => { setSelectedProduct(null); setSelectedAddOns([]); setSelectedVariant(null); setSelectedProductIsFood(false); setSelectedProductCategory(""); }}>
              x
            </button>

            <h2 className="text-xl font-normal mb-6 pr-8 text-center" style={{ color: "#3b2212" }}>
              {selectedProduct}
            </h2>

            <div className="space-y-5">
              {selectedProduct === "Quesadillas" && (
                <div>
                  <p className="font-normal mb-2 text-sm" style={{ color: "#3b2212" }}>Choose Variant</p>
                  <div className="flex gap-3">
                    {quesadillasVariants.map((v) => (
                      <button key={v} onClick={() => setSelectedVariant(v)}
                        className="flex-1 px-4 py-2 rounded-xl text-sm font-normal transition-all"
                        style={selectedVariant === v ? activeOptStyle : inactiveOptStyle}>
                        {v}
                      </button>
                    ))}
                  </div>
                  {!selectedVariant && <p className="text-xs mt-2" style={{ color: "#c0392b" }}>Please select a variant.</p>}
                </div>
              )}

              {!isFood && (
                <div className="grid grid-cols-2 gap-5">
                  {!hideTemperature && (
                    <div>
                      <p className="font-normal mb-2 text-sm" style={{ color: "#3b2212" }}>Temperature</p>
                      <div className="flex gap-2">
                        {["Hot", "Ice"].map((t) => (
                          <button key={t} onClick={() => setTempOption(t)}
                            className="flex-1 px-4 py-3 rounded-xl font-normal transition-all"
                            style={{ fontSize: "15px", ...(tempOption === t ? activeOptStyle : inactiveOptStyle) }}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="font-normal mb-2 text-sm" style={{ color: "#3b2212" }}>Size</p>
                    <div className="flex gap-2">
                      {(activeCategory === "Hot Tea" ? ["220 ml", "Pot"] : ["Medium", "Large"]).map((s) => (
                        <button key={s} onClick={() => setSizeOption(s)}
                          className="flex-1 px-4 py-3 rounded-xl font-normal transition-all"
                          style={{ fontSize: "15px", ...(sizeOption === s ? activeOptStyle : inactiveOptStyle) }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!isFood && (
                <div>
                  <p className="font-normal mb-2 text-sm" style={{ color: "#3b2212" }}>Sugar Level</p>
                  <div className="flex gap-2">
                    {["0%", "50%", "75%", "100%"].map((sugar) => (
                      <button key={sugar} onClick={() => setSugarOption(sugar)}
                        className="flex-1 px-3 py-3 rounded-xl font-normal transition-all"
                        style={{ fontSize: "15px", ...(sugarOption === sugar ? activeOptStyle : inactiveOptStyle) }}>
                        {sugar}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showAddOns && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-semibold text-sm" style={{ color: "#3b2212" }}>
                      Add Ons <span style={{ color: "#a07850" }}>(+$0.50 each)</span>
                    </p>
                    <button onClick={handleClearAddOns} className="text-xs underline" style={{ color: "#a07850" }}>Clear all</button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <button onClick={handleClearAddOns}
                      className="px-3 py-2 rounded-xl font-normal transition-all"
                      style={{ fontSize: "13px", ...(selectedAddOns.length === 0 ? activeOptStyle : inactiveOptStyle) }}>
                      None
                    </button>
                    {addOns.map((addOn) => (
                      <button key={addOn} onClick={() => handleToggleAddOn(addOn)}
                        className="px-3 py-2 rounded-xl font-normal transition-all"
                        style={{ fontSize: "13px", ...(selectedAddOns.includes(addOn) ? activeOptStyle : inactiveOptStyle) }}>
                        {addOn}
                      </button>
                    ))}
                  </div>
                  {selectedAddOns.length > 0 && (
                    <div className="mt-3 p-3 rounded-xl text-xs" style={{ background: "#faf7f4", color: "#6b4c30" }}>
                      <span className="font-normal">Selected:</span> {selectedAddOns.join(", ")}
                      <span className="ml-2" style={{ color: "#a07850" }}>+${(selectedAddOns.length * 0.5).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              <button
                disabled={selectedProduct === "Quesadillas" && !selectedVariant}
                onClick={handleAddToOrder}
                className="w-full py-3 rounded-xl font-normal text-base transition-all"
                style={selectedProduct === "Quesadillas" && !selectedVariant
                  ? { background: "#e8e0d8", color: "#b09070", cursor: "not-allowed" }
                  : { background: "#3b2212", color: "white" }}>
                Add to Order — ${modalPrice.toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}