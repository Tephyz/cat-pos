"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
// UPDATE: Idinagdag na natin dito ang query, where, at getDocs
import { collection, addDoc, serverTimestamp, runTransaction, doc, increment, query, where, getDocs } from "firebase/firestore";
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
}

export default function POSLayout() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  const handleLogout = async () => { 
    await logout(); 
    router.push("/"); 
  };

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
  const [selectedProductCategory, setSelectedProductCategory] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [discount, setDiscount] = useState<"None" | "PWD" | "Senior">("None");
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; method: "Cash" | "GCash" | null }>({ open: false, method: null });
  const [cashModal, setCashModal] = useState(false);
  const [amountTendered, setAmountTendered] = useState("");
  const [lastTransaction, setLastTransaction] = useState<{ number: string; method: string; total: number; discountAmount: number; amountTendered: string } | null>(null);
  const [qtyInputs, setQtyInputs] = useState<Record<number, string>>({});

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Redirecting to login...</div>;

  const handleRemoveItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const handleIncreaseQty = (index: number) => {
    setOrderItems(orderItems.map((item, i) =>
      i === index ? { ...item, quantity: item.quantity + 1 } : item
    ));
  };

  const handleDecreaseQty = (index: number) => {
    setOrderItems(orderItems.map((item, i) => {
      if (i !== index) return item;
      if (item.quantity <= 1) return item;
      return { ...item, quantity: item.quantity - 1 };
    }));
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

  const getDrinkPrice = (productName: string, size: string, category: string, frappeType: string | null): number => {
    const s = size === "Large" || size === "Pot" || size === "M - Pot" ? "L" : "M";
    switch (category) {
      case "Coffee":
        return coffeePrices[productName]?.[s as "M"|"L"] ?? 150;
      case "Non Coffee":
        return nonCoffeePrices[productName]?.[s as "M"|"L"] ?? 140;
      case "Milktea":
        return milkteaPrices[productName]?.[s as "M"|"L"] ?? 120;
      case "Yakult Mix":
        return yakultMixPrices[productName]?.[s as "M"|"L"] ?? 150;
      case "Fruit Tea":
        return fruitTeaPrices[productName]?.[s as "M"|"L"] ?? 110;
      case "Hot Tea":
        return hotTeaPrices[productName] ?? 120;
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
  const allFrappeItems = Object.values(frappeProducts).flat();

  const quesadillasVariants = ["Beef", "Cheese"];
  const addOns = ["Espresso", "Coffee Jelly", "Oreo", "Caramel", "Pearl", "Nata", "Whip Cream"];

  const getCategoryLabel = (item: string): string => {
    if (!isSearching) {
      if (activeCategory === "Frappe" && activeFrappeType) return `Frappe · ${activeFrappeType}`;
      if (activeCategory === "Food & Bites") {
        for (const [sub, items] of Object.entries(foodProducts)) {
          if (items.includes(item)) return `Food & Bites · ${sub}`;
        }
        return "Food & Bites";
      }
      return activeCategory;
    }
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

  const getModalPrice = (): number => {
    if (!selectedProduct) return 0;
    if (isFood) {
      if (selectedProduct === "Quesadillas") {
        const variantKey = selectedVariant ? `Quesadillas (${selectedVariant})` : "Quesadillas";
        return (foodPrices[variantKey] ?? 0) + selectedAddOns.length * ADD_ON_PRICE;
      }
      return (foodPrices[selectedProduct] ?? 0) + selectedAddOns.length * ADD_ON_PRICE;
    }
    const cat = isSearching ? getCategoryLabel(selectedProduct).split(" · ")[0] : activeCategory;
    const fType = isSearching ? getFrappeType(selectedProduct) : activeFrappeType;
    const base = getDrinkPrice(selectedProduct, sizeOption, cat, fType);
    return base + selectedAddOns.length * ADD_ON_PRICE;
  };

  const modalPrice = getModalPrice();

  const handleAddToOrder = () => {
    if (!selectedProduct) return;
    if (selectedProduct === "Quesadillas" && !selectedVariant) return;

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
      const cat = isSearching ? getCategoryLabel(selectedProduct).split(" · ")[0] : activeCategory;
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
    };

    setOrderItems([...orderItems, newItem]);
    setSelectedProduct(null);
    setTempOption("Hot");
    setSizeOption("Medium");
    setSugarOption("100%");
    setSelectedAddOns([]);
    setSelectedVariant(null);
    setSelectedProductIsFood(false);
    setSelectedProductCategory("");
  };

  const handleToggleAddOn = (addOn: string) => {
    setSelectedAddOns(prev => prev.includes(addOn) ? prev.filter(i => i !== addOn) : [...prev, addOn]);
  };
  const handleClearAddOns = () => setSelectedAddOns([]);
        
  const subtotal = orderItems.reduce(
  (acc, item) => acc + item.price * item.quantity,
  0
);

let discountAmount = 0;
let total = subtotal;

if (discount === "PWD" || discount === "Senior") {
  discountAmount = subtotal * 0.20;
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

  const processCheckout = async (paymentMethod: "Cash" | "GCash") => {
    if (orderItems.length === 0) {
      setCheckoutMessage("No items in the cart to checkout.");
      return;
    }

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
        };

        if (Array.isArray(item.addOns) && item.addOns.length > 0) {
          cleaned.addOns = item.addOns;
        }

        if (typeof item.variant !== "undefined") {
          cleaned.variant = item.variant;
        }

        return cleaned;
      });

      const servingSizes: Record<string, number> = {
        'Pearl': 50,
        'Nata de Coco': 40,
        'Espresso': 30,
      };

      const addOnDeductions: Record<string, number> = {};
      orderItems.forEach(item => {
        if (Array.isArray(item.addOns) && item.addOns.length > 0) {
          item.addOns.forEach(addOn => {
            const deduction = (servingSizes[addOn] || 1) * item.quantity;
            addOnDeductions[addOn] = (addOnDeductions[addOn] || 0) + deduction;
          });
        }
      });

      const addOnNames = Object.keys(addOnDeductions);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inventoryRefsToUpdate: { ref: any, deduction: number }[] = [];

      if (addOnNames.length > 0) {
        const q = query(collection(db, "inventory"), where("name", "in", addOnNames));
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (addOnDeductions[data.name]) {
            inventoryRefsToUpdate.push({
              ref: docSnap.ref,
              deduction: addOnDeductions[data.name]
            });
          }
        });
      }

      await runTransaction(db, async (transaction) => {
        const orderDocRef = doc(collection(db, "orders"));
        transaction.set(orderDocRef, {
          transactionNumber,
          items: sanitizedItems,
          totalAmount: total,
          discount: discount !== "None" ? { type: discount, rate: 0.20, amount: discountAmount } : null,
          paymentMethod,
          cashierName: user?.displayName ?? "Unknown",
          createdAt: serverTimestamp(),
        });

        inventoryRefsToUpdate.forEach(({ ref, deduction }) => {
          transaction.update(ref, {
            quantity: increment(-deduction)
          });
        });
      });

      setLastTransaction({ number: transactionNumber, method: paymentMethod, total, discountAmount, amountTendered });
      setOrderItems([]);
      setDiscount("None");
      setAmountTendered("");
      setCashModal(false);
      setCheckoutMessage(null);
      setIsSuccessModalOpen(true);
    } catch (error) {
      console.error("Checkout failed:", error);
      setCheckoutMessage("Checkout failed. Please try again.");
    }
  };

  const activeTabStyle = { background: "#3b2212", color: "white", boxShadow: "0 4px 12px rgba(59,34,18,0.25)" };
  const inactiveTabStyle = { background: "white", color: "#6b4c30", border: "1.5px solid #e8ddd4" };
  const activeOptStyle = { background: "#3b2212", color: "white" };
  const inactiveOptStyle = { background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" };

  const openProduct = (item: string) => {
    setSelectedProduct(item);
    setSelectedProductIsFood(checkIsFood(item));
    setSelectedProductCategory(getCategoryLabel(item));
  };

  return (
    <div className="min-h-screen flex" style={{ background: "#ede8e3" }}>
      <div className="flex-1 p-5 flex flex-col" style={{ minHeight: "100vh" }}>
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

        <div className="relative mb-5">
          <span className="absolute left-4 top-1/2 -translate-y-1/2">🔎︎</span>
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
                      {item.name}
                    </p>
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
                    <p className="font-normal text-sm" style={{ color: "#3b2212" }}>
                      ₱{(item.price * item.quantity).toFixed(0)}
                    </p>
                    {/* Quantity Controls */}
                    <div className="flex items-center gap-1 mt-1">
                      <button
                        onClick={() => handleDecreaseQty(index)}
                        className="w-6 h-6 rounded-full flex items-center justify-center font-bold"
                        style={{ background: "#f0e8e0", color: "#3b2212", fontSize: "16px", lineHeight: 1 }}>
                        −
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={qtyInputs[index] !== undefined ? qtyInputs[index] : String(item.quantity)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, "");
                          setQtyInputs(prev => ({ ...prev, [index]: raw }));
                          const val = parseInt(raw);
                          if (!isNaN(val) && val >= 1) {
                            setOrderItems(orderItems.map((o, i) =>
                              i === index ? { ...o, quantity: val } : o
                            ));
                          }
                        }}
                        onBlur={() => {
                          const raw = qtyInputs[index];
                          const val = parseInt(raw);
                          if (!raw || isNaN(val) || val < 1) {
                            setOrderItems(orderItems.map((o, i) =>
                              i === index ? { ...o, quantity: 1 } : o
                            ));
                          }
                          setQtyInputs(prev => {
                            const next = { ...prev };
                            delete next[index];
                            return next;
                          });
                        }}
                        className="text-sm font-semibold text-center outline-none rounded-lg"
                        style={{
                          width: "40px",
                          color: "#3b2212",
                          background: "#faf7f4",
                          border: "1.5px solid #e8ddd4",
                          padding: "2px 4px",
                        }}
                      />
                      <button
                        onClick={() => handleIncreaseQty(index)}
                        className="w-6 h-6 rounded-full flex items-center justify-center font-bold"
                        style={{ background: "#3b2212", color: "white", fontSize: "16px", lineHeight: 1 }}>
                        +
                      </button>
                    </div>
                    <button onClick={() => handleRemoveItem(index)}
                      className="text-xs rounded-full w-5 h-5 flex items-center justify-center mt-1"
                      style={{ background: "#fee2e2", color: "#c0392b" }}>
                      x
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {orderItems.length > 0 && (
          <div className="py-4 space-y-2 mt-2" style={{ borderTop: "1.5px solid #e8ddd4" }}>
            {/* Discount Selector */}
            <div className="mb-1">
              <p className="text-xs mb-1.5" style={{ color: "#a07850" }}>Discount</p>
              <div className="flex gap-2">
                {(["None", "PWD", "Senior"] as const).map((d) => (
                  <button key={d} onClick={() => setDiscount(d)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={discount === d
                      ? { background: "#3b2212", color: "white" }
                      : { background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                    {d === "None" ? "None" : `${d} (20%)`} 
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-between text-sm" style={{ color: "#a07850" }}>
              <span>Subtotal</span><span>₱{subtotal.toFixed(0)}</span>
            </div>
            {discount !== "None" && (
  <>
    <div className="flex justify-between text-sm" style={{ color: "#2d7a38" }}>
      <span>{discount} Discount (20%)</span>
      <span>− ₱{discountAmount.toFixed(2)}</span>
    </div>
  </>
)}
            <div className="flex justify-between font-normal text-base" style={{ color: "#3b2212" }}>
              <span>Total</span><span>₱{total.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="space-y-2 mt-2">
          <button disabled={orderItems.length === 0}
            onClick={() => { if (orderItems.length > 0) setConfirmModal({ open: true, method: "Cash" }); }}
            className="w-full py-4 rounded-xl font-normal transition-all"
            style={{ fontSize: "15px", ...(orderItems.length === 0
              ? { background: "#e8e0d8", color: "#b09070", cursor: "not-allowed" }
              : { background: "#3b2212", color: "white" }) }}>
            Cash {orderItems.length > 0 && `— ₱${total.toFixed(2)}`}
          </button>
          <button disabled={orderItems.length === 0}
            onClick={() => { if (orderItems.length > 0) setConfirmModal({ open: true, method: "GCash" }); }}
            className="w-full py-4 rounded-xl font-normal transition-all"
            style={{ fontSize: "15px", ...(orderItems.length === 0
              ? { background: "#e8e0d8", color: "#b09070", cursor: "not-allowed" }
              : { background: "#0070ba", color: "white" }) }}>
            GCash {orderItems.length > 0 && `— ₱${total.toFixed(2)}`}
          </button>
        </div>
        {checkoutMessage && (
          <p className="text-center text-sm mt-2" style={{ color: checkoutMessage.includes("failed") ? "#c0392b" : "#2d7a38" }}>
            {checkoutMessage}
          </p>
        )}
      </div>

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
                className="flex-1 py-5 rounded-2xl font-bold text-xl"
                style={{ background: "#f0e8e0", color: "#3b2212" }}>
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmModal({ open: false, method: null });
                  if (confirmModal.method === "Cash") {
                    setCashModal(true);
                  } else if (confirmModal.method === "GCash") {
                    processCheckout("GCash");
                  }
                }}
                className="flex-1 py-5 rounded-2xl font-bold text-xl text-white"
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
            {/* Amount Display */}
            <div className="rounded-2xl px-5 py-3 mb-3 text-right" style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4", minHeight: "60px" }}>
              <p className="text-xs mb-1" style={{ color: "#a07850" }}>Amount Received</p>
              <p className="font-bold" style={{ color: amountTendered ? "#3b2212" : "#c0b090", fontSize: "2rem", lineHeight: 1 }}>
                {amountTendered ? `₱${amountTendered}` : "₱0"}
              </p>
            </div>
            {/* Calculator Numpad */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {["7","8","9","4","5","6","1","2","3"].map((num) => (
                <button
                  key={num}
                  onClick={() => setAmountTendered(prev => prev === "0" ? num : prev + num)}
                  className="py-4 rounded-2xl font-bold text-xl transition-all active:scale-95"
                  style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                  {num}
                </button>
              ))}
              <button
                onClick={() => setAmountTendered(prev => prev.endsWith(".") ? prev : prev.includes(".") ? prev : prev + ".")}
                className="py-5 rounded-2xl font-bold text-2xl transition-all active:scale-95"
                style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                .
              </button>
              <button
                onClick={() => setAmountTendered(prev => prev === "0" ? "0" : prev + "0")}
                className="py-5 rounded-2xl font-bold text-2xl transition-all active:scale-95"
                style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                0
              </button>
              <button
                onClick={() => setAmountTendered(prev => prev.length <= 1 ? "" : prev.slice(0, -1))}
                className="py-5 rounded-2xl font-bold text-2xl transition-all active:scale-95"
                style={{ background: "#fee2e2", color: "#c0392b", border: "1.5px solid #f5c6c6" }}>
                ⌫
              </button>
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
                className="flex-1 py-4 rounded-2xl font-bold text-lg"
                style={{ background: "#f0e8e0", color: "#3b2212" }}>
                Cancel
              </button>
              <button
                disabled={!amountTendered || parseFloat(amountTendered) < total}
                onClick={() => processCheckout("Cash")}
                className="flex-1 py-4 rounded-2xl font-bold text-lg"
                style={{
                  background: !amountTendered || parseFloat(amountTendered) < total ? "#e8e0d8" : "#3b2212",
                  color: !amountTendered || parseFloat(amountTendered) < total ? "#b09070" : "white",
                  cursor: !amountTendered || parseFloat(amountTendered) < total ? "not-allowed" : "pointer",
                }}>
                Confirm Cash
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
              className="px-6 py-5 rounded-2xl text-white font-bold text-xl w-full"
              style={{ background: "#3b2212" }}>
              Make another order
            </button>
          </div>
        </div>
      )}

      {selectedProduct && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl p-6 relative max-h-[90vh] overflow-y-auto"
            style={{ background: "white", border: "2px solid #e8ddd4", width: "fit-content", minWidth: "320px", maxWidth: "90vw" }}>

            <button
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-sm"
              style={{ background: "#f7f3ef", color: "#3b2212", border: "1px solid #e8ddd4" }}
              onClick={() => {
                setSelectedProduct(null);
                setSelectedAddOns([]);
                setSelectedVariant(null);
                setSelectedProductIsFood(false);
                setSelectedProductCategory("");
              }}>
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
                        className="flex-1 px-3 py-3 rounded-xl font-normal transition-all flex flex-col items-center gap-0.5"
                        style={selectedVariant === v ? activeOptStyle : inactiveOptStyle}>
                        <span style={{ fontSize: "14px" }}>{v}</span>
                        <span style={{ fontSize: "12px", opacity: 0.75 }}>₱{v === "Beef" ? "200" : "170"}</span>
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
                      {(activeCategory === "Hot Tea" ? ["M - 220ml", "M - Pot"] : ["Medium", "Large"]).map((s) => (
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
                      Add Ons <span style={{ color: "#a07850" }}>(+₱30 each)</span>
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
                      <span className="ml-2" style={{ color: "#a07850" }}>+₱{(selectedAddOns.length * ADD_ON_PRICE).toFixed(0)}</span>
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
                Add to Order — ₱{modalPrice.toFixed(0)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}