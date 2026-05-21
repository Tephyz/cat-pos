import {
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// Configuration
const SUBSYSTEM = "POS";

// Type definitions
interface User {
  email?: string;
  name?: string;
  uid?: string;
  [key: string]: unknown;
}

interface ActionDetails {
  [key: string]: unknown;
}

interface SessionData {
  uid?: string;
  email?: string;
  name?: string;
  subsystem: string;
  role?: string;
  loginAt: ReturnType<typeof serverTimestamp>;
  lastSeenAt: ReturnType<typeof serverTimestamp>;
  status?: string;
  [key: string]: unknown;
}

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  category?: string;
  addOns?: string[];
  [key: string]: unknown;
}

// ============================================================================
// LOG USER ACTION
// ============================================================================
/**
 * Logs a user action to the activity_logs collection
 * @param user - User object containing email/name and uid
 * @param actionType - Type of action (e.g., 'LOGIN', 'LOGOUT', 'REFUND', 'SALE')
 * @param details - Additional details about the action
 * @returns Promise that resolves with the logged action ID or null on error
 */
export async function logUserAction(
  user: User,
  actionType: string,
  details?: ActionDetails
): Promise<string | null> {
  try {
    if (!user) {
      console.error("[logUserAction] User object is required");
      return null;
    }

    const activityLogsRef = collection(db, "activity_logs");

    const actionData = {
      uid: user.uid || "unknown",
      email: user.email || "unknown",
      name: user.name || "unknown",
      action: actionType,
      subsystem: SUBSYSTEM,
      createdAt: serverTimestamp(),
      meta: details || {},
      role: "cashier",
    };

    const docRef = await addDoc(activityLogsRef, actionData);
    console.log(`[logUserAction] Successfully logged action: ${actionType}`, {
      docId: docRef.id,
      userId: user.uid,
    });
    return docRef.id;
  } catch (error) {
    console.error("[logUserAction] Error logging user action:", error);
    return null;
  }
}

// ============================================================================
// LOG SALE/ORDER
// ============================================================================
/**
 * Logs a sale/order transaction to activity_logs
 * @param user - User object
 * @param transactionNumber - Unique transaction number
 * @param items - Array of order items
 * @param totalAmount - Total transaction amount
 * @param paymentMethod - Payment method (Cash, GCash, Non Cash, etc.)
 * @param discount - Discount details if applied
 * @returns Promise that resolves with the logged action ID or null on error
 */
export async function logSaleTransaction(
  user: User,
  transactionNumber: string,
  items: OrderItem[],
  totalAmount: number,
  paymentMethod: string,
  discount?: { type: string; amount: number; percentage?: number }
): Promise<string | null> {
  try {
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const itemNames = items.map(item => item.name).join(", ");

    return await logUserAction(user, "SALE", {
      transactionNumber,
      itemCount,
      itemNames,
      items: items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      })),
      totalAmount,
      paymentMethod,
      discount: discount || null,
    });
  } catch (error) {
    console.error("[logSaleTransaction] Error logging sale:", error);
    return null;
  }
}

// ============================================================================
// LOG REFUND
// ============================================================================
/**
 * Logs a refund transaction to activity_logs
 * @param user - User object
 * @param transactionNumber - Original transaction number being refunded
 * @param items - Array of items being refunded
 * @param refundAmount - Refund amount
 * @param paymentMethod - Original payment method
 * @returns Promise that resolves with the logged action ID or null on error
 */
export async function logRefundTransaction(
  user: User,
  transactionNumber: string,
  items: OrderItem[],
  refundAmount: number,
  paymentMethod: string
): Promise<string | null> {
  try {
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const itemNames = items.map(item => item.name).join(", ");

    return await logUserAction(user, "REFUND", {
      originalTransactionNumber: transactionNumber,
      itemCount,
      itemNames,
      items: items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      })),
      refundAmount,
      originalPaymentMethod: paymentMethod,
      refundMethod: paymentMethod === "Cash" ? "Cash" : "Non-Cash",
    });
  } catch (error) {
    console.error("[logRefundTransaction] Error logging refund:", error);
    return null;
  }
}

// ============================================================================
// START USER SESSION
// ============================================================================
/**
 * Creates a new user session in the user_sessions collection
 * @param user - User object containing email/name and uid
 * @returns Promise that resolves with the session ID or null on error
 */
export async function startUserSession(user: User): Promise<string | null> {
  try {
    if (!user || !user.uid) {
      console.error("[startUserSession] User object with uid is required");
      return null;
    }

    // Create consistent client ID (same pattern as SRD)
    const CLIENT_ID_KEY = 'posClientId';
    let clientId = localStorage.getItem(CLIENT_ID_KEY);
    if (!clientId) {
      clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(CLIENT_ID_KEY, clientId);
    }

    const sessionId = `${user.uid}_POS_${clientId}`;

    const sessionRef = doc(db, "user_sessions", sessionId);

    const sessionData = {
      uid: user.uid,
      email: user.email || "unknown",
      name: user.name || "unknown",
      subsystem: SUBSYSTEM,
      role: "cashier",
      status: "online",
      loginAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      clientId: clientId,
    };

    await setDoc(sessionRef, sessionData, { merge: true });

    console.log(`[startUserSession] Session started: ${sessionId}`);

    // Log LOGIN
    await logUserAction(user, "LOGIN", { 
      subsystem: SUBSYSTEM,
      message: "User logged into POS system"
    });

    return sessionId;

  } catch (error) {
    console.error("[startUserSession] Error:", error);
    return null;
  }
}

// ============================================================================
// HEARTBEAT SESSION
// ============================================================================
/**
 * Updates the lastSeenAt timestamp for a session to keep the user marked as online
 * @param sessionId - The session ID to update
 * @returns Promise that resolves to true if successful, false on error
 */
export async function heartbeatSession(sessionId: string): Promise<boolean> {
  try {
    if (!sessionId) {
      console.error("[heartbeatSession] Session ID is required");
      return false;
    }

    const sessionDocRef = doc(db, "user_sessions", sessionId);

    await updateDoc(sessionDocRef, {
      lastSeenAt: serverTimestamp(),
    });

    console.log(`[heartbeatSession] Heartbeat updated for session: ${sessionId}`);
    return true;
  } catch (error) {
    console.error("[heartbeatSession] Error updating session heartbeat:", error);
    return false;
  }
}

// ============================================================================
// END USER SESSION
// ============================================================================
/**
 * Ends a user session and logs the logout action
 * @param sessionId - The session ID to end
 * @param user - User object containing email/name and uid
 * @returns Promise that resolves to true if successful, false on error
 */
export async function endUserSession(sessionId: string, user: User): Promise<boolean> {
  try {
    if (!sessionId) {
      console.error("[endUserSession] Session ID is required");
      return false;
    }

    const sessionDocRef = doc(db, "user_sessions", sessionId);

    await updateDoc(sessionDocRef, {
      status: "offline",
      logoutAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    });

    console.log(`[endUserSession] Session ended: ${sessionId}`);

    if (user) {
      await logUserAction(user, "LOGOUT", { 
        subsystem: SUBSYSTEM,
        message: "User logged out of POS system"
      });
    }

    return true;
  } catch (error) {
    console.error("[endUserSession] Error:", error);
    return false;
  }
}

// ============================================================================
// HELPER: LOOKUP EMAIL BY USERNAME
// ============================================================================
/**
 * Looks up a user's email by their username from the users collection
 * Useful for POS logins which use username instead of email
 * @param username - The username to look up
 * @returns Promise that resolves with the email or null if not found
 */
export async function getEmailByUsername(username: string): Promise<string | null> {
  try {
    if (!username) {
      console.error("[getEmailByUsername] Username is required");
      return null;
    }

    const usersRef = collection(db, "users");
    const q = query(usersRef, where("username", "==", username));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.warn(`[getEmailByUsername] No user found with username: ${username}`);
      return null;
    }

    const userDoc = querySnapshot.docs[0];
    const email = userDoc.data().email;

    console.log(`[getEmailByUsername] Found email for username ${username}: ${email}`);
    return email;
  } catch (error) {
    console.error("[getEmailByUsername] Error looking up email by username:", error);
    return null;
  }
}