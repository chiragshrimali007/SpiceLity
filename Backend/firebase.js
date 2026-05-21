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

if (!admin.apps.length) {
  let credential;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // ── Render production: key stored as an environment variable ──
    // In Render → Environment, add:
    //   Key:   FIREBASE_SERVICE_ACCOUNT
    //   Value: <paste the full contents of serviceAccountKey.json here>
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = admin.credential.cert(serviceAccount);
    } catch (err) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT env var is set but is not valid JSON.\n' + err.message
      );
    }
  } else {
    // ── Local dev: read the JSON file directly ──
    // Keep this file in Backend/ and add it to .gitignore!
    const keyPath = path.join(__dirname, 'serviceAccountKey.json');
    credential = admin.credential.cert(keyPath);
  }

  admin.initializeApp({ credential });
  console.log('[Firebase] Admin SDK initialised');
}

module.exports = admin;
