"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc, getDocs, query, collection, where } from 'firebase/firestore';
import { auth } from '@/lib/firebase';
import { db } from '@/lib/firebase';
import {
  startUserSession,
  heartbeatSession,
  endUserSession,
  logUserAction,
  SessionUser,
} from '@/lib/sessionLogger';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, fullname: string, username: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Refs for session tracking
  const sessionIdRef = useRef<string | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const sessionUserRef = useRef<SessionUser | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Session tracking: start session + heartbeat on login, end on logout/unmount
  useEffect(() => {
    if (!user?.uid) return;

    let cancelled = false;

    const begin = async () => {
      // Pull role + name from Firestore users collection
      let role = 'cashier';
      let name = user.displayName || user.email || 'Unknown User';
      try {
        // Primary: lookup by doc ID (uid)
        const byIdSnap = await getDoc(doc(db, 'users', user.uid));
        if (byIdSnap.exists()) {
          const data = byIdSnap.data();
          role = data.role || role;
          name = data.fullname || data.username || name;
          console.log('Session: resolved role =', role, 'for', name);
        } else {
          // Fallback: query by uid field (for older records stored with different doc IDs)
          const q = query(collection(db, 'users'), where('uid', '==', user.uid));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const data = snap.docs[0].data();
            role = data.role || role;
            name = data.fullname || data.username || name;
            console.log('Session: resolved role (fallback) =', role, 'for', name);
          } else {
            console.warn('Session: no matching user doc, defaulting role to cashier');
          }
        }
      } catch (err) {
        console.warn('Could not fetch user role for session:', err);
      }

      const sessionUser: SessionUser = {
        uid: user.uid,
        name,
        displayName: user.displayName,
        email: user.email,
        role,
      };
      sessionUserRef.current = sessionUser;

      const sessionId = await startUserSession(sessionUser);
      if (cancelled) return;
      sessionIdRef.current = sessionId;

      // Log LOGIN
      await logUserAction(sessionUser, 'LOGIN', { info: 'Logged into POS' });

      // Heartbeat every 45s
      if (sessionId) {
        heartbeatRef.current = setInterval(() => {
          heartbeatSession(sessionId).catch(console.error);
        }, 45000);
      }
    };

    begin();

    // Cleanup on unmount or user change
    return () => {
      cancelled = true;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      const sid = sessionIdRef.current;
      const su = sessionUserRef.current;
      if (sid) {
        endUserSession(sid).catch(console.error);
        sessionIdRef.current = null;
      }
      if (su) {
        logUserAction(su, 'LOGOUT', { info: 'Logged out of POS' }).catch(console.error);
        sessionUserRef.current = null;
      }
    };
  }, [user]);

  const signIn = async (identifier: string, password: string) => {
    // Check if identifier is an email or username
    const isEmail = identifier.includes('@');
    
    if (isEmail) {
      // Direct email login
      await signInWithEmailAndPassword(auth, identifier, password);
    } else {
      // Username login - find user by username in Firestore
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', identifier));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        throw new Error('User not found');
      }
      
      const userDoc = querySnapshot.docs[0];
      const email = userDoc.data().email;
      
      await signInWithEmailAndPassword(auth, email, password);
    }
  };

  const signUp = async (email: string, password: string, displayName: string, fullname: string, username: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(userCredential.user, { displayName });
      await userCredential.user.reload();
    }
    // Store additional user data in Firestore
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      fullname,
      username,
      email,
      createdAt: new Date(),
      role: 'cashier',
      status: 'active',
      uid: userCredential.user.uid,
    });
  };

  const logout = async () => {
    await signOut(auth);
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};