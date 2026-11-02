/**
 * firebase.js
 * -----------
 * Initialises the Firebase Admin SDK exactly once for the whole process.
 * Import this module wherever you need `admin` (messaging, firestore, etc.).
 *
 * Service account key:
 *   - Local dev  → place serviceAccountKey.json in the Backend/ folder.
 *   - Render     → set the GOOGLE_APPLICATION_CREDENTIALS environment variable
 *                  to the absolute path of the key file on the server, OR
 *                  paste the entire JSON into a FIREBASE_SERVICE_ACCOUNT env var
 *                  (see the env-var branch below).
 */

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

let isInitialized = false;

if (!admin.apps.length) {
  try {
    let credential;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = admin.credential.cert(serviceAccount);
      admin.initializeApp({ credential });
      isInitialized = true;
      console.log('[Firebase] Admin SDK initialised from env');
    } else {
      const keyPath = path.join(__dirname, 'serviceAccountKey.json');
      if (fs.existsSync(keyPath)) {
        const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        if (keyData.project_id === 'YOUR_PROJECT_ID') {
          console.warn('[Firebase] Warning: serviceAccountKey.json is a placeholder. Skipping Firebase initialization.');
        } else {
          credential = admin.credential.cert(keyPath);
          admin.initializeApp({ credential });
          isInitialized = true;
          console.log('[Firebase] Admin SDK initialised from serviceAccountKey.json');
        }
      } else {
        console.warn('[Firebase] Warning: serviceAccountKey.json not found. Skipping Firebase initialization.');
      }
    }
  } catch (err) {
    console.error('[Firebase] Failed to initialize Firebase Admin SDK:', err.message);
  }
} else {
  isInitialized = true;
}

admin.isInitialized = isInitialized;
module.exports = admin;
