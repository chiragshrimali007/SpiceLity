/**
 * fcm.js
 * ------
 * Firebase Cloud Messaging helper for SpiceLity.
 *
 * Exports sendPriceUpdateNotification(spice, oldPrice) which:
 *   1. Builds a high-priority FCM message targeting the 'retailers' topic.
 *   2. Sends it via admin.messaging().send().
 *   3. Logs success / silently handles failure (never breaks the HTTP response).
 */

const admin = require('./firebase'); // initialises the SDK on first import

/**
 * Send a price-change push notification to all subscribers of the 'retailers' topic.
 *
 * @param {Object} spice     - The spice object AFTER the price update
 *                             (must have: spice.id, spice.name, spice.price, spice.emoji)
 * @param {number} oldPrice  - The price before the update
 * @returns {Promise<void>}
 */
async function sendPriceUpdateNotification(spice, oldPrice) {
  const newPrice  = spice.price;
  const delta     = newPrice - oldPrice;
  const direction = delta > 0 ? 'increased' : 'decreased';
  const sign      = delta > 0 ? '+' : '';
  const emoji     = spice.emoji || '🌶️';
  const name      = (spice.name || `Spice #${spice.id}`).split('(')[0].trim();

  if (!admin.isInitialized) {
    console.warn(`[FCM] Firebase not initialized. Skipping price alert notification for "${name}".`);
    return;
  }

  const message = {
    topic: 'retailers',          // all retailer app instances subscribed to this topic

    // ── Visible notification (shown even when app is in background) ──
    notification: {
      title: `${emoji} Price ${direction.charAt(0).toUpperCase() + direction.slice(1)}: ${name}`,
      body : `${name} is now ₹${newPrice}/kg (${sign}₹${Math.abs(delta)}/kg). Tap to review your selling price.`,
    },

    // ── Android-specific options ──
    android: {
      priority: 'high',          // wake device even in Doze mode
      notification: {
        channelId   : 'price_alerts',   // must be created in the Android app
        icon        : 'ic_notification',
        color       : '#B88020',        // SpiceLity amber
        clickAction : 'FLUTTER_NOTIFICATION_CLICK',   // handled in MainActivity / FCM service
        sound       : 'default',
      },
    },

    // ── APNs (iOS) options ──
    apns: {
      headers: { 'apns-priority': '10' },  // 10 = immediate delivery
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },

    // ── Custom data payload (accessible in foreground handler) ──
    data: {
      type      : 'price_update',
      spice_id  : String(spice.id),
      spice_name: name,
      old_price : String(oldPrice),
      new_price : String(newPrice),
      delta     : String(delta),
    },
  };

  try {
    const messageId = await admin.messaging().send(message);
    console.log(`[FCM] Price alert sent for "${name}" → ${messageId}`);
  } catch (err) {
    // Log but do NOT re-throw — a failed push must never break the price-update API response
    console.error(`[FCM] Failed to send price alert for "${name}":`, err.message);
  }
}

module.exports = { sendPriceUpdateNotification };
