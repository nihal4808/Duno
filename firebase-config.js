// ============================================
// DUNO - Firebase Configuration
// ============================================
// Loads credentials from .env file at runtime.
//
// Setup:
// 1. Copy .env.example to .env
// 2. Fill in your Firebase project credentials
// 3. .env is gitignored so keys stay private
// ============================================

let db;

/** Parse .env file content into a key-value object */
function parseEnv(text) {
  const env = {};
  text.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) return;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    env[key] = value;
  });
  return env;
}

/** Load .env and initialize Firebase */
async function initFirebase() {
  try {
    const response = await fetch('.env');
    if (!response.ok) throw new Error('.env file not found');
    const text = await response.text();
    const env = parseEnv(text);

    const firebaseConfig = {
      apiKey: env.FIREBASE_API_KEY,
      authDomain: env.FIREBASE_AUTH_DOMAIN,
      databaseURL: env.FIREBASE_DATABASE_URL,
      projectId: env.FIREBASE_PROJECT_ID,
      storageBucket: env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
      appId: env.FIREBASE_APP_ID
    };

    // Validate config
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
      throw new Error('Firebase not configured. Edit your .env file with real credentials.');
    }

    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    console.log('✅ Firebase initialized successfully');
  } catch (error) {
    console.error('❌ Firebase init failed:', error.message);
    alert('Firebase not configured!\n\n1. Copy .env.example to .env\n2. Fill in your Firebase credentials\n\nSee README.md for details.');
  }
}
