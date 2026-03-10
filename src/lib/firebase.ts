// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD1SCRVJioiZEMNNY5xCAazhtOu2YPXh-k",
  authDomain: "coffeeteaconnection.firebaseapp.com",
  projectId: "coffeeteaconnection",
  storageBucket: "coffeeteaconnection.firebasestorage.app",
  messagingSenderId: "444013177678",
  appId: "1:444013177678:web:da33349973f8a2b85b8c1f",
  measurementId: "G-XTC62L3EFD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);