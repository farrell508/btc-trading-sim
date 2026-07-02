import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// 여기를 아까 Firebase 콘솔에서 복사해둔 값으로 바꿔주세요
const firebaseConfig = {
  apiKey: "AIzaSyBMYLGW87b6WGuW5NfRl1_IHAGVqTXsGo8",
  authDomain: "btc-trading-sim.firebaseapp.com",
  projectId: "btc-trading-sim",
  storageBucket: "btc-trading-sim.firebasestorage.app",
  messagingSenderId: "868778470421",
  appId: "1:868778470421:web:7605d501bdb46465f5721c",
  measurementId: "G-NW0J47V6X7"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);