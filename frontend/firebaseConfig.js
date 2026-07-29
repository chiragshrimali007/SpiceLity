// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAB6chgA4MijZaEfatgYesUQhypf7BlB98",
  authDomain: "spicelity-ed41d.firebaseapp.com",
  projectId: "spicelity-ed41d",
  storageBucket: "spicelity-ed41d.firebasestorage.app",
  messagingSenderId: "249229498704",
  appId: "1:249229498704:web:72623a0199ec618a03f455",
  measurementId: "G-QMFYT9MPNN"
};

// Global feature toggle to switch between WebSocket and Firebase Chat systems
window.USE_FIREBASE_CHAT = true;

// Initialize Firebase if loaded via CDN script tag
if (typeof firebase !== 'undefined') {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log('[Firebase] Initialized client SDK via firebaseConfig.js');
  }
}

// Support CommonJS/Node imports if required in the future or in React Native wrappers
if (typeof module !== 'undefined' && module.exports) {
  module.exports = firebaseConfig;
}
