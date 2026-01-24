import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDKjpU10scII0rf_ef1CtkRPnDLP7uEMlc",
  authDomain: "indusense-9ecf4.firebaseapp.com",
  databaseURL: "https://indusense-9ecf4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "indusense-9ecf4",
  storageBucket: "indusense-9ecf4.firebasestorage.app",
  messagingSenderId: "1098360066100",
  appId: "1:1098360066100:web:8e2a0f92c24fec10287a61",
  measurementId: "G-F4109S597S"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
