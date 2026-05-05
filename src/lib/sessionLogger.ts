import { doc, setDoc, updateDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

const SUBSYSTEM = "POS";
const CLIENT_ID_KEY = "posClientId";

export interface SessionUser {
  uid: string;
  name?: string;
  displayName?: string | null;
  email?: string | null;
  role?: string;
}

export function getClientId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function getSessionDocId(uid: string): string {
  if (!uid) throw new Error("uid is required");
  return `${uid}_${SUBSYSTEM}_${getClientId()}`;
}

// 1. Start Session — call after successful login
export async function startUserSession(user: SessionUser): Promise<string | null> {
  if (!user?.uid) return null;
  const sessionId = getSessionDocId(user.uid);
  const sessionRef = doc(db, "user_sessions", sessionId);
  try {
    await setDoc(
      sessionRef,
      {
        uid: user.uid,
        name: user.name || user.displayName || user.email || "Unknown User",
        email: user.email || "",
        role: user.role || "cashier",
        subsystem: SUBSYSTEM,
        status: "online",
        loginAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
        clientId: getClientId(),
      },
      { merge: true }
    );
    return sessionId;
  } catch (error) {
    console.error("Failed to start POS session:", error);
    return null;
  }
}

// 2. Heartbeat — call every 45s while app is open
export async function heartbeatSession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  try {
    await updateDoc(doc(db, "user_sessions", sessionId), {
      status: "online",
      lastSeenAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Heartbeat failed:", error);
  }
}

// 3. End Session — call on logout
export async function endUserSession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  try {
    await updateDoc(doc(db, "user_sessions", sessionId), {
      status: "offline",
      logoutAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Failed to end POS session:", error);
  }
}

// 4. Log a user action to activity_logs
export async function logUserAction(
  user: SessionUser,
  action: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  if (!user?.uid || !action) return;
  try {
    await addDoc(collection(db, "activity_logs"), {
      uid: user.uid,
      name: user.name || user.displayName || user.email || "Unknown User",
      email: user.email || "",
      role: user.role || "cashier",
      subsystem: SUBSYSTEM,
      action: action,
      meta: meta,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Failed to log POS action:", error);
  }
}
