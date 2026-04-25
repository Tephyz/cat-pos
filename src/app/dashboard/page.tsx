"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
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

interface Tab {
  id: string;
  name: string;
  orderItems: OrderItem[];
  discount: "None" | "PWD" | "Senior";
  discountCustomerName: string;
  discountCustomerID: string;
  createdAt: Date;
}

// Distinct colors for categories - completely different color families, no relatives
const categoryColors: Record<string, { bg: string; hoverBg: string; activeBg: string; text: string }> = {
  Coffee: { bg: "#FFF0F5", hoverBg: "#FFE4EC", activeBg: "#C0392B", text: "#8B5E6E" },        // Rose/Red family
  "Non Coffee": { bg: "#E8F4F8", hoverBg: "#D4EAF0", activeBg: "#2980B9", text: "#2C6E7A" },   // Blue family
  Milktea: { bg: "#FFF8E1", hoverBg: "#FFECB3", activeBg: "#F39C12", text: "#D68910" },        // Yellow/Orange family
  "Yakult Mix": { bg: "#E8F5E9", hoverBg: "#C8E6C9", activeBg: "#43A047", text: "#2E7D32" },  // Green family
  "Fruit Tea": { bg: "#FCE4EC", hoverBg: "#F8BBD0", activeBg: "#E91E63", text: "#AD1457" },    // Pink/Magenta family
  "Hot Tea": { bg: "#EDE7F6", hoverBg: "#D1C4E9", activeBg: "#5E35B1", text: "#4527A0" },      // Purple family
  Frappe: { bg: "#FFFFFF", hoverBg: "#F0F0F0", activeBg: "#D0D0D0", text: "#000000" },         // Black and white family
  "Food & Bites": { bg: "#EFEBE9", hoverBg: "#D7CCC8", activeBg: "#8D6E63", text: "#5D4037" }, // Brown family
};

// Per-subcategory colors for Frappe types - COMPLETELY UNIQUE, highly distinguishable
const frappeSubColors: Record<string, { bg: string; hoverBg: string; activeBg: string; text: string }> = {
  "Coffee Based": { bg: "#FFF9C4", hoverBg: "#FFF59D", activeBg: "#F57F17", text: "#E65100" },     // Vibrant Amber/Gold
  "Cream Based":  { bg: "#B2DFDB", hoverBg: "#80CBC4", activeBg: "#00796B", text: "#004D40" },     // Teal/Seafoam Green
  "Tea Based":    { bg: "#D1C4E9", hoverBg: "#B39DDB", activeBg: "#4527A0", text: "#311B92" },     // Deep Indigo/Purple
};

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

  // Tab management state
  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: crypto.randomUUID(),
      name: "Customer 1",
      orderItems: [],
      discount: "None",
      discountCustomerName: "",
      discountCustomerID: "",
      createdAt: new Date(),
    }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState("");
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  const [activeCategory, setActiveCategory] = useState("Coffee");
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

  // Updated: name + number instead of ref number
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

  // Discount modal state
  const [discountModal, setDiscountModal] = useState(false);
  const [pendingDiscount, setPendingDiscount] = useState<"PWD" | "Senior" | null>(null);
  const [discountCustomerName, setDiscountCustomerName] = useState("");
  const [discountCustomerID, setDiscountCustomerID] = useState("");
  
  // Keyboard states for discount modal
  const [activeInput, setActiveInput] = useState<"name" | "id" | null>(null);
  const [tempName, setTempName] = useState("");
  const [tempID, setTempID] = useState("");

  // Get current active tab data
  const activeTab = tabs.find(tab => tab.id === activeTabId);
  const orderItems = activeTab?.orderItems || [];
  const discount = activeTab?.discount || "None";
  const discountCustomerNameTab = activeTab?.discountCustomerName || "";
  const discountCustomerIDTab = activeTab?.discountCustomerID || "";

  // Update active tab's order items
  const updateActiveTabOrderItems = (newOrderItems: OrderItem[]) => {
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId ? { ...tab, orderItems: newOrderItems } : tab
    ));
  };

  // Update active tab's discount
  const updateActiveTabDiscount = (newDiscount: "None" | "PWD" | "Senior", name: string, id: string) => {
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId ? { ...tab, discount: newDiscount, discountCustomerName: name, discountCustomerID: id } : tab
    ));
  };

  // Create new tab
  const createNewTab = () => {
    const newTabId = crypto.randomUUID();
    const newTabNumber = tabs.length + 1;
    const newTab: Tab = {
      id: newTabId,
      name: `Customer ${newTabNumber}`,
      orderItems: [],
      discount: "None",
      discountCustomerName: "",
      discountCustomerID: "",
      createdAt: new Date(),
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTabId);
    
    // Scroll to show new tab
    setTimeout(() => {
      if (tabsContainerRef.current) {
        tabsContainerRef.current.scrollLeft = tabsContainerRef.current.scrollWidth;
      }
    }, 100);
  };

  // Close tab
  const closeTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      // Don't close the last tab, just clear it
      if (confirm("Clear all items in this tab?")) {
        setTabs(prev => prev.map(tab => 
          tab.id === tabId 
            ? { ...tab, orderItems: [], discount: "None", discountCustomerName: "", discountCustomerID: "" } 
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

  // Start editing tab name
  const startEditingTabName = (tabId: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTabId(tabId);
    setEditingTabName(currentName);
  };

  // Save edited tab name
  const saveTabName = () => {
    if (editingTabId && editingTabName.trim()) {
      setTabs(prev => prev.map(tab => 
        tab.id === editingTabId ? { ...tab, name: editingTabName.trim() } : tab
      ));
    }
    setEditingTabId(null);
    setEditingTabName("");
  };

  // Handle keyboard for tab name editing
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
    const s = size === "Large" || size === "Pot" || size === "Pot" ? "L" : "M";
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

  const quesadillasVariants = ["Beef", "Cheese"];
  const addOns = ["Espresso", "Coffee Jelly", "Oreo", "Caramel", "Pearl", "Nata", "Whip Cream"];

  // ── SEARCH FIX ──────────────────────────────────────────────────────────────
  // Build a flat list of { name, category } pairs WITHOUT deduplication,
  // so identical product names in different categories all appear in results.
  const allProductEntries: { name: string; category: string }[] = [
    ...Object.entries(products).flatMap(([cat, items]) =>
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
  // ────────────────────────────────────────────────────────────────────────────

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
        };
        if (Array.isArray(item.addOns) && item.addOns.length > 0) {
          cleaned.addOns = item.addOns;
        }
        if (typeof item.variant !== "undefined") {
          cleaned.variant = item.variant;
        }
        return cleaned;
      });

      const orderPayload = {
        transactionNumber,
        items: sanitizedItems,
        totalAmount: total,
        discount: discount !== "None"
          ? {
              type: discount,
              rate: 0.20,
              amount: discountAmount,
              customerName: discountCustomerNameTab,
              customerID: discountCustomerIDTab,
            }
          : null,
        paymentMethod,
        gcashSenderName: paymentMethod === "GCash" ? (senderName ?? null) : null,
        gcashNumber: paymentMethod === "GCash" ? (senderNumber ?? null) : null,
        cashierName: user?.displayName ?? "Unknown",
        createdAt: serverTimestamp(),
      };

      const servingSizes: Record<string, number> = {
        Pearl: 50,
        "Nata de Coco": 40,
        Espresso: 30,
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

      if (addOnNames.length === 0) {
        await addDoc(collection(db, "orders"), orderPayload);
      } else {
        const q = query(collection(db, "inventory"), where("name", "in", addOnNames));
        const querySnapshot = await getDocs(q);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inventoryRefsToUpdate: { ref: any; deduction: number }[] = [];
        querySnapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (addOnDeductions[data.name]) {
            inventoryRefsToUpdate.push({
              ref: docSnap.ref,
              deduction: addOnDeductions[data.name],
            });
          }
        });

        await runTransaction(db, async (transaction) => {
          const orderDocRef = doc(collection(db, "orders"));
          transaction.set(orderDocRef, orderPayload);
          inventoryRefsToUpdate.forEach(({ ref, deduction }) => {
            transaction.update(ref, { quantity: increment(-deduction) });
          });
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
      
      // Clear current tab's order after successful checkout
      updateActiveTabOrderItems([]);
      updateActiveTabDiscount("None", "", "");
      setAmountTendered("");
      setCashModal(false);
      setGcashRefModal(false);
      setGcashName("");
      setGcashNumber("");
      setActiveGcashInput(null);
      setCheckoutMessage(null);
      setIsSuccessModalOpen(true);
    } catch (error) {
      console.error("Checkout failed:", error);
      setCheckoutMessage("Checkout failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const activeOptStyle = { background: "#3b2212", color: "white" };
  const inactiveOptStyle = { background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" };

  // Returns card colors based on a category string like "Milktea" or "Frappe · Coffee Based"
  const getCardColors = (category: string) => {
    const parts = category.split(" · ");
    const topLevel = parts[0];
    const sub = parts[1];
    // Frappe subcategories get their own distinct color
    if (topLevel === "Frappe" && sub && frappeSubColors[sub]) {
      return frappeSubColors[sub];
    }
    return categoryColors[topLevel] ?? { bg: "#f5f5f5", hoverBg: "#eeeeee", activeBg: "#3b2212", text: "#6b4c30" };
  };

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

  const openDiscountModal = (discountType: "PWD" | "Senior") => {
    setPendingDiscount(discountType);
    setDiscountModal(true);
    setTempName(discountCustomerNameTab);
    setTempID(discountCustomerIDTab);
    setActiveInput(null);
  };

  const applyDiscount = () => {
    if (tempName.trim() && tempID.trim()) {
      if (pendingDiscount) {
        updateActiveTabDiscount(pendingDiscount, tempName, tempID);
      }
      setDiscountModal(false);
      setPendingDiscount(null);
      setActiveInput(null);
    }
  };

  const cancelDiscount = () => {
    setDiscountModal(false);
    setPendingDiscount(null);
    setActiveInput(null);
  };

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Redirecting to login...</div>;

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: "#ede8e3" }}>
      {/* Left Panel - Product Selection with Tabs */}
      <div className="flex-1 flex flex-col h-full min-w-0" style={{ background: "#ede8e3" }}>
        {/* Tab Bar - FIXED at top, never scrolls away */}
        <div className="flex-shrink-0 px-5 pt-5 pb-2">
          <div 
            ref={tabsContainerRef}
            className="flex items-center gap-1 pb-2 overflow-x-auto"
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
                      <p className="text-xs text-center font-medium" style={{ color: colors.text }}>{entry.category}</p>
                      {entry.name === "Quesadillas" && <p className="text-xs" style={{ color: colors.text }}>Beef / Cheese</p>}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2 mb-4 flex-wrap">
                {Object.keys(products).map((cat) => {
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
                      onMouseEnter={(e) => {
                        if (activeCategory !== cat) {
                          e.currentTarget.style.background = colors.hoverBg;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (activeCategory !== cat) {
                          e.currentTarget.style.background = colors.bg;
                        }
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
                  products[activeCategory as keyof typeof products]?.map((item, i) => {
                    const colors = categoryColors[activeCategory] ?? { bg: "#f5f5f5", hoverBg: "#eeeeee", activeBg: "#3b2212", text: "#6b4c30" };
                    return (
                      <div key={i} onClick={() => {
                        setSelectedProduct(item);
                        setSelectedProductIsFood(false);
                        setSelectedProductCategory(activeCategory);
                      }}
                        className="rounded-2xl p-5 cursor-pointer transition-all active:scale-95 touch-manipulation flex flex-col items-center justify-center gap-1"
                        style={{ background: colors.bg, border: `1.5px solid ${colors.hoverBg}`, minHeight: "100px" }}>
                        <p className="font-normal text-center" style={{ color: colors.activeBg, fontSize: "18px" }}>{item}</p>
                      </div>
                    );
                  })}

                {activeCategory === "Frappe" && activeFrappeType &&
                  frappeProducts[activeFrappeType as keyof typeof frappeProducts]?.map((item, i) => {
                    const colors = frappeSubColors[activeFrappeType] ?? categoryColors["Frappe"];
                    return (
                      <div key={i} onClick={() => {
                        setSelectedProduct(item);
                        setSelectedProductIsFood(false);
                        setSelectedProductCategory(`Frappe · ${activeFrappeType}`);
                      }}
                        className="rounded-2xl p-5 cursor-pointer transition-all active:scale-95 touch-manipulation flex flex-col items-center justify-center gap-1"
                        style={{ background: colors.bg, border: `1.5px solid ${colors.hoverBg}`, minHeight: "100px" }}>
                        <p className="font-normal text-center" style={{ color: colors.activeBg, fontSize: "18px" }}>{item}</p>
                      </div>
                    );
                  })}

                {activeCategory === "Food & Bites" && activeFoodSubCategory &&
                  (activeFoodSubCategory === "All"
                    ? Object.values(foodProducts).flat()
                    : foodProducts[activeFoodSubCategory]
                  )?.map((item, i) => {
                    const colors = categoryColors["Food & Bites"];
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
              {orderItems.map((item, index) => (
                <div key={index} className="p-3"
                  style={{ borderBottom: "0.5px solid #e8ddd4" }}>
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
                    </div>
                    <div className="flex flex-col items-end gap-2 ml-2">
                      <p className="font-normal text-base" style={{ color: "#3b2212" }}>₱{(item.price * item.quantity).toFixed(0)}</p>
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
                      <button onClick={() => handleRemoveItem(index)}
                        className="text-sm rounded-full w-8 h-8 flex items-center justify-center mt-1 active:scale-95 touch-manipulation"
                        style={{ background: "#fee2e2", color: "#c0392b" }}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {orderItems.length > 0 && (
            <div className="py-4 space-y-2 mt-2" style={{ borderTop: "1.5px solid #e8ddd4" }}>
              <div className="mb-1">
                <p className="text-xs mb-1.5" style={{ color: "#a07850" }}>Discount</p>
                <div className="flex gap-2">
                  {(["None", "PWD", "Senior"] as const).map((d) => (
                    <button key={d}
                      onClick={() => {
                        if (d === "None") {
                          updateActiveTabDiscount("None", "", "");
                        } else {
                          openDiscountModal(d);
                        }
                      }}
                      className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95 touch-manipulation"
                      style={discount === d
                        ? { background: "#3b2212", color: "white" }
                        : { background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                      {d === "None" ? "None" : `${d} (20%)`}
                    </button>
                  ))}
                </div>
                {discount !== "None" && discountCustomerNameTab && (
                  <div className="mt-2 px-3 py-2 rounded-xl text-xs flex items-center justify-between"
                    style={{ background: "#f0faf0", border: "1.5px solid #b6e2b6" }}>
                    <div>
                      <p className="font-semibold" style={{ color: "#2d7a38" }}>{discountCustomerNameTab}</p>
                      <p style={{ color: "#5a8a5a" }}>ID: {discountCustomerIDTab}</p>
                    </div>
                    <button
                      onClick={() => {
                        setPendingDiscount(discount as "PWD" | "Senior");
                        setDiscountModal(true);
                        setTempName(discountCustomerNameTab);
                        setTempID(discountCustomerIDTab);
                        setActiveInput(null);
                      }}
                      className="text-xs underline ml-2 py-2 px-2 rounded-lg active:scale-95 touch-manipulation"
                      style={{ color: "#2d7a38" }}>
                      Edit
                    </button>
                  </div>
                )}
              </div>
              <div className="flex justify-between text-sm" style={{ color: "#a07850" }}>
                <span>Subtotal</span><span>₱{subtotal.toFixed(0)}</span>
              </div>
              {discount !== "None" && (
                <div className="flex justify-between text-sm" style={{ color: "#2d7a38" }}>
                  <span>{discount} Discount (20%)</span>
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
            <p className="text-center text-sm mt-2" style={{ color: checkoutMessage.includes("failed") ? "#c0392b" : "#2d7a38" }}>
              {checkoutMessage}
            </p>
          )}
        </div>
      </div>

      {/* Discount Modal */}
      {discountModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl" style={{ overflow: "visible" }}>
            <div className="p-6" style={{ overflow: "visible" }}>
              <div className="mb-4">
                <h2 className="text-2xl font-bold" style={{ color: "#3b2212" }}>
                  {pendingDiscount} Discount
                </h2>
                <p className="text-sm" style={{ color: "#a07850" }}>20% off the total bill</p>
              </div>

              <p className="text-sm mb-4" style={{ color: "#a07850" }}>
                Tap on an input field to use the keyboard
              </p>

              <div className="space-y-4 mb-4">
                <div>
                  <label className="text-sm font-semibold block mb-1.5" style={{ color: "#3b2212" }}>
                    Customer Name <span style={{ color: "#c0392b" }}>*</span>
                  </label>
                  <div
                    onClick={() => setActiveInput("name")}
                    className="w-full rounded-xl px-4 py-3 text-base transition-all cursor-pointer"
                    style={{
                      background: "#faf7f4",
                      border: activeInput === "name" ? "2px solid #3b2212" : "1.5px solid #e8ddd4",
                      color: "#3b2212",
                      minHeight: "52px",
                    }}
                  >
                    {tempName || <span style={{ color: "#c0b090" }}>Tap to enter name...</span>}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-semibold block mb-1.5" style={{ color: "#3b2212" }}>
                    ID Number <span style={{ color: "#c0392b" }}>*</span>
                  </label>
                  <div
                    onClick={() => setActiveInput("id")}
                    className="w-full rounded-xl px-4 py-3 text-base transition-all cursor-pointer font-mono"
                    style={{
                      background: "#faf7f4",
                      border: activeInput === "id" ? "2px solid #3b2212" : "1.5px solid #e8ddd4",
                      color: "#3b2212",
                      minHeight: "52px",
                    }}
                  >
                    {tempID || <span style={{ color: "#c0b090" }}>Tap to enter ID number...</span>}
                  </div>
                </div>
              </div>

              {activeInput && (
                <div className="mt-4 pt-4 border-t" style={{ borderColor: "#e8ddd4" }}>
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-sm font-semibold" style={{ color: "#3b2212" }}>
                      Enter {activeInput === "name" ? "Name" : "ID Number"}
                    </p>
                  </div>
                  
                  {activeInput === "name" ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-10 gap-1.5">
                        {["Q","W","E","R","T","Y","U","I","O","P"].map((key) => (
                          <button key={key} onClick={() => handleKeyPress(key)}
                            className="py-2.5 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation"
                            style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                            {key}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-9 gap-1.5">
                        {["A","S","D","F","G","H","J","K","L"].map((key) => (
                          <button key={key} onClick={() => handleKeyPress(key)}
                            className="py-2.5 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation"
                            style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                            {key}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-9 gap-1.5">
                        {["Z","X","C","V","B","N","M"].map((key) => (
                          <button key={key} onClick={() => handleKeyPress(key)}
                            className="py-2.5 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation"
                            style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                            {key}
                          </button>
                        ))}
                        <button onClick={() => handleKeyPress("SPACE")}
                          className="py-2.5 rounded-lg font-semibold text-sm transition-all active:scale-95 touch-manipulation col-span-2"
                          style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                          SPACE
                        </button>
                        <button onClick={() => handleKeyPress("BACKSPACE")}
                          className="py-2.5 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation"
                          style={{ background: "#fee2e2", color: "#c0392b", border: "1px solid #f5c6c6" }}>
                          ⌫
                        </button>
                        <button onClick={() => handleKeyPress("CLEAR")}
                          className="py-2.5 rounded-lg font-semibold text-sm transition-all active:scale-95 touch-manipulation"
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
                            className="py-4 rounded-xl font-bold text-2xl transition-all active:scale-95 touch-manipulation"
                            style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                            {num}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button onClick={() => handleKeyPress("CLEAR")}
                          className="py-4 rounded-xl font-bold text-base transition-all active:scale-95 touch-manipulation"
                          style={{ background: "#fff0f0", color: "#c0392b", border: "1.5px solid #f5c6c6" }}>
                          CLEAR
                        </button>
                        <button onClick={() => handleKeyPress("0")}
                          className="py-4 rounded-xl font-bold text-2xl transition-all active:scale-95 touch-manipulation"
                          style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                          0
                        </button>
                        <button onClick={() => handleKeyPress("BACKSPACE")}
                          className="py-4 rounded-xl font-bold text-2xl transition-all active:scale-95 touch-manipulation"
                          style={{ background: "#fee2e2", color: "#c0392b", border: "1.5px solid #f5c6c6" }}>
                          ⌫
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-4 mt-6">
                <button onClick={cancelDiscount}
                  className="flex-1 py-4 rounded-2xl font-bold text-lg active:scale-95 touch-manipulation"
                  style={{ background: "#f0e8e0", color: "#3b2212" }}>
                  Cancel
                </button>
                <button
                  disabled={!tempName.trim() || !tempID.trim()}
                  onClick={applyDiscount}
                  className="flex-1 py-4 rounded-2xl font-bold text-lg transition-all active:scale-95 touch-manipulation"
                  style={{
                    background: !tempName.trim() || !tempID.trim() ? "#e8e0d8" : "#2d7a38",
                    color: !tempName.trim() || !tempID.trim() ? "#b09070" : "white",
                    cursor: !tempName.trim() || !tempID.trim() ? "not-allowed" : "pointer",
                  }}>
                  Apply Discount
                </button>
              </div>
            </div>
          </div>
        </div>
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
              }}>✕</button>

            <h2 className="text-2xl font-bold mb-1 pr-10 text-center" style={{ color: "#3b2212" }}>{selectedProduct}</h2>
            {/* Show category in modal so cashier knows which variant they opened */}
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

              {showAddOns && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <p className="font-semibold text-base" style={{ color: "#3b2212" }}>
                      Add Ons <span style={{ color: "#a07850" }}>(+₱30 each)</span>
                    </p>
                    <button onClick={handleClearAddOns} className="text-sm underline py-2 px-3 rounded-lg active:scale-95 touch-manipulation" style={{ color: "#a07850" }}>Clear all</button>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <button onClick={handleClearAddOns}
                      className="px-4 py-3 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation"
                      style={{ fontSize: "14px", ...(selectedAddOns.length === 0 ? activeOptStyle : inactiveOptStyle) }}>
                      None
                    </button>
                    {addOns.map((addOn) => (
                      <button key={addOn} onClick={() => handleToggleAddOn(addOn)}
                        className="px-4 py-3 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation"
                        style={{ fontSize: "14px", ...(selectedAddOns.includes(addOn) ? activeOptStyle : inactiveOptStyle) }}>
                        {addOn}
                      </button>
                    ))}
                  </div>
                  {selectedAddOns.length > 0 && (
                    <div className="mt-4 p-4 rounded-xl text-sm" style={{ background: "#faf7f4", color: "#6b4c30" }}>
                      <span className="font-semibold">Selected:</span> {selectedAddOns.join(", ")}
                      <span className="ml-2 font-semibold" style={{ color: "#a07850" }}>+₱{(selectedAddOns.length * ADD_ON_PRICE).toFixed(0)}</span>
                    </div>
                  )}
                </div>
              )}

              <button
                disabled={selectedProduct === "Quesadillas" && !selectedVariant}
                onClick={handleAddToOrder}
                className="w-full py-4 rounded-xl font-semibold text-lg transition-all active:scale-95 touch-manipulation mt-4"
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