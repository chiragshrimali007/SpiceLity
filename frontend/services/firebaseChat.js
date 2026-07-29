/**
 * services/firebaseChat.js
 * ------------------------
 * Handles all Firebase Firestore real-time queries, message sending, and unread count syncing.
 */

const firebaseChat = {
  /**
   * Sends a message to the Firestore collection chats/{retailerId}/messages
   * and updates the parent conversation document.
   * @param {string|number} retailerId 
   * @param {string} text 
   * @param {string} senderRole - 'retailer' or 'admin'
   */
  async sendMessage(retailerId, text, senderRole) {
    if (typeof firebase === 'undefined') {
      console.error('[Firebase Chat] Firebase SDK is not loaded!');
      return;
    }

    const db = firebase.firestore();
    const chatRef = db.collection('chats').doc(String(retailerId));
    const messagesRef = chatRef.collection('messages');

    // 1. Resolve sender ID: use Firebase Auth UID if retailer, otherwise 0 for admin.
    let senderId = 0;
    if (senderRole === 'retailer') {
      const currentUser = firebase.auth().currentUser;
      senderId = currentUser ? currentUser.uid : String(retailerId);
    }

    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
    const currentISO = new Date().toISOString();

    const messagePayload = {
      senderId: senderId,
      senderRole: senderRole,
      text: text,
      timestamp: serverTimestamp,
      isRead: false
    };

    // 2. Add message to the messages subcollection
    const docRef = await messagesRef.add(messagePayload);
    console.log(`[Firebase Chat] Message sent, docId: ${docRef.id}`);

    // 3. Update the parent document with atomic increment for unread count
    const updateData = {
      lastMessage: text,
      lastActivity: serverTimestamp,
      lastActivityString: currentISO
    };

    if (senderRole === 'retailer') {
      // Increments unread count for Admin to read
      updateData.unreadCountAdmin = firebase.firestore.FieldValue.increment(1);
    } else {
      // Increments unread count for Retailer to read
      updateData.unreadCountRetailer = firebase.firestore.FieldValue.increment(1);
    }

    await chatRef.set(updateData, { merge: true });
    console.log('[Firebase Chat] Parent chat document updated successfully');
  },

  /**
   * Listens to real-time chat messages inside chats/{retailerId}/messages.
   * @param {string|number} retailerId 
   * @param {function} callback 
   * @returns {function} Unsubscribe function
   */
  listenToChat(retailerId, callback) {
    if (typeof firebase === 'undefined') {
      console.error('[Firebase Chat] Firebase SDK is not loaded!');
      return () => {};
    }

    const db = firebase.firestore();
    const messagesRef = db.collection('chats').doc(String(retailerId)).collection('messages');

    return messagesRef
      .orderBy('timestamp', 'asc')
      .onSnapshot((snapshot) => {
        const messages = snapshot.docs.map((doc) => {
          const data = doc.data();
          
          // Map to UI-compatible format:
          // - senderId should be 0 for admin and retailerId (number) for retailer, so UI behaves correctly.
          const mappedSenderId = data.senderRole === 'retailer' ? Number(retailerId) : 0;

          // Resolve timestamp to ISO string
          const dateObj = data.timestamp ? data.timestamp.toDate() : new Date();
          const timeISO = dateObj.toISOString();

          return {
            id: doc.id,
            senderId: mappedSenderId,
            sender_id: mappedSenderId,
            senderUid: data.senderId, // preserve original UID
            senderRole: data.senderRole,
            text: data.text,
            message_text: data.text,
            createdAt: timeISO,
            created_at: timeISO,
            isRead: data.isRead || false,
            is_read: data.isRead ? 1 : 0
          };
        });

        callback(messages);
      }, (err) => {
        console.error('[Firebase Chat] Error listening to chat messages:', err);
      });
  },

  /**
   * Listens to the parent chats collection in real-time (for Admin Sidebar).
   * @param {function} callback 
   * @returns {function} Unsubscribe function
   */
  listenToSidebar(callback) {
    if (typeof firebase === 'undefined') {
      console.error('[Firebase Chat] Firebase SDK is not loaded!');
      return () => {};
    }

    const db = firebase.firestore();

    return db.collection('chats')
      .onSnapshot((snapshot) => {
        const threads = snapshot.docs.map((doc) => {
          const data = doc.data();
          const dateObj = data.lastActivity ? data.lastActivity.toDate() : new Date();
          const lastActivityISO = dateObj.toISOString();

          return {
            user_id: Number(doc.id),
            last_message: data.lastMessage || '',
            last_activity: lastActivityISO,
            unread_count: data.unreadCountAdmin || 0
          };
        });

        callback(threads);
      }, (err) => {
        console.error('[Firebase Chat] Error listening to chats sidebar:', err);
      });
  },

  /**
   * Marks unread messages as read in both the messages subcollection and resets parent counters.
   * @param {string|number} retailerId 
   * @param {string} userRole - 'retailer' or 'admin'
   */
  async markAsRead(retailerId, userRole) {
    if (typeof firebase === 'undefined') return;

    const db = firebase.firestore();
    const chatRef = db.collection('chats').doc(String(retailerId));
    const messagesRef = chatRef.collection('messages');

    // Messages sent by opposite role are the ones we mark as read
    const oppositeRole = userRole === 'retailer' ? 'admin' : 'retailer';

    try {
      // 1. Fetch unread messages
      const snapshot = await messagesRef
        .where('senderRole', '==', oppositeRole)
        .where('isRead', '==', false)
        .get();

      if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
          batch.update(doc.ref, { isRead: true });
        });
        await batch.commit();
        console.log(`[Firebase Chat] Marked ${snapshot.size} messages as read for role ${userRole}`);
      }

      // 2. Reset the active user role's unread counter on the parent doc
      const updateData = {};
      if (userRole === 'admin') {
        updateData.unreadCountAdmin = 0;
      } else {
        updateData.unreadCountRetailer = 0;
      }

      await chatRef.set(updateData, { merge: true });
      console.log(`[Firebase Chat] Reset unread count for ${userRole}`);
    } catch (err) {
      console.error('[Firebase Chat] Error marking messages as read:', err);
    }
  }
};

// Expose on window object for standard script load in HTML
if (typeof window !== 'undefined') {
  window.firebaseChat = firebaseChat;
}

// Support CommonJS/Node imports if required in the future or in React Native wrappers
if (typeof module !== 'undefined' && module.exports) {
  module.exports = firebaseChat;
}
