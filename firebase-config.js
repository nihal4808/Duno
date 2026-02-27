// ============================================
// DUNO - Firebase Configuration
// ============================================
// Replace the placeholder values below with your
// actual Firebase project credentials.
// 
// To get these values:
// 1. Go to https://console.firebase.google.com
// 2. Create a new project (or use existing)
// 3. Enable Realtime Database
// 4. Go to Project Settings → General → Your apps
// 5. Click "Add app" → Web (</>)
// 6. Copy the config object values here
// ============================================

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export database reference
const db = firebase.database();
