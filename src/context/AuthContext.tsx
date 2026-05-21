"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { doc, setDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { auth } from '@/lib/firebase';
import { db } from '@/lib/firebase';
import { logUserAction, startUserSession, endUserSession } from '@/utils/userActivityLogger';

interface UserData {
  fullname?: string;
  username?: string;
  email?: string;
  role?: string;
  status?: string;
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  userRole: string;
  loading: boolean;
  sessionId: string | null;
  signIn: (emailOrUsername: string, password: string) => Promise<void>;
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
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribeFirestore: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);

      // Clean up previous Firestore listener
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = null;
      }

      if (firebaseUser) {
        // Real-time listener on the user's Firestore document
        unsubscribeFirestore = onSnapshot(
          doc(db, "users", firebaseUser.uid),
          (snap) => {
            if (snap.exists()) {
              setUserData(snap.data() as UserData);
            } else {
              setUserData(null);
            }
            setLoading(false);
          },
          () => {
            // On error, still stop loading
            setUserData(null);
            setLoading(false);
          }
        );
      } else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeFirestore) unsubscribeFirestore();
    };
  }, []);

  const signIn = async (emailOrUsername: string, password: string) => {
    try {
      let emailToUse = emailOrUsername;
      let customName = emailOrUsername;
      
      // Kung username ang tinype (walang @), hahanapin muna natin ang email sa DB
      if (!emailOrUsername.includes("@")) {
        const q = query(collection(db, 'users'), where('username', '==', emailOrUsername));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          throw new Error("Invalid username or password");
        }
        
        const fetchedUserData = querySnapshot.docs[0].data();
        emailToUse = fetchedUserData.email;
        // Kunin natin ang fullname para maganda ang display sa SRD Panel
        customName = fetchedUserData.fullname || fetchedUserData.username || emailToUse;
      }

      // Login gamit ang nahanap na email
      const userCredential = await signInWithEmailAndPassword(auth, emailToUse, password);
      
      // Start user session and log login action
      if (userCredential.user) {
        // Ipasa ang TAMANG object format para hindi mag-error
        const userInfo = {
          uid: userCredential.user.uid,
          email: userCredential.user.email || emailToUse,
          name: customName
        };

        const newSessionId = await startUserSession(userInfo);
        setSessionId(newSessionId);

        // Log the login action sa activity_logs
        await logUserAction(
          userInfo,
          'LOGIN',
          { method: 'username/password', usernameInput: emailOrUsername }
        );
      }
    } catch (error: any) {
      console.error("[signIn] Error during sign in:", error);
      throw error;
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

    // Log the signup action
    await logUserAction(
      {
        uid: userCredential.user.uid,
        email: userCredential.user.email || email,
        name: displayName || fullname || email,
      },
      'SIGNUP',
      { username, fullname }
    );
  };

  const logout = async () => {
    if (user && sessionId) {
      // End user session and log logout action
      await endUserSession(sessionId, {
        uid: user.uid,
        email: user.email || '',
        name: user.displayName || '',
      });
      setSessionId(null);
    }
    await signOut(auth);
  };

  const userRole = (userData?.role ?? "").toLowerCase();

  const value = {
    user,
    userData,
    userRole,
    loading,
    sessionId,
    signIn,
    signUp,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};