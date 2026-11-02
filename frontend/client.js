/**
 * Spicelity Retailer Chat Client Module
 * Handles real-time WebSockets communication with the Admin.
 */

let chatSocket = null;
let reconnectTimer = null;
const RECONNECT_DELAY = 5000;

// Internal helper to log to console
function dbg(msg) {
  console.log(`[WebSocket Client] ${msg}`);
}

/**
 * Establish WebSocket connection using mock token authentication.
 * @param {number} userId - The unique ID of the retailer.
 * @param {string} userName - The name of the retailer.
 * @param {function} onMessageReceived - Callback triggered when a message or ack arrives.
 * @param {function} onConnectionStatus - Callback to update UI connection status.
 */
function connectRetailerChat(userId, userName, onMessageReceived, onConnectionStatus) {
  if (chatSocket) {
    dbg('Closing existing socket connection...');
    chatSocket.close();
  }

  // Generate an auth token payload: "id-role-name"
  const token = `${userId}-retailer-${encodeURIComponent(userName)}`;
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || 'localhost:3000';
  const wsUrl = `${protocol}//${host}?token=${token}`;

  dbg(`Connecting WebSocket to ${wsUrl}...`);
  chatSocket = new WebSocket(wsUrl);

  chatSocket.onopen = () => {
    dbg('WebSocket connection established successfully!', 'success');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (onConnectionStatus) onConnectionStatus(true);
  };

  chatSocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      dbg(`Received message frame type: ${data.type}`);
      
      if (data.type === 'message' || data.type === 'ack') {
        if (onMessageReceived) onMessageReceived(data);
      }
    } catch (err) {
      dbg(`Failed to parse WebSocket message frame: ${err.message}`, 'error');
    }
  };

  chatSocket.onclose = (event) => {
    dbg(`WebSocket disconnected (Code: ${event.code}, Reason: ${event.reason || 'None'}). Retrying in ${RECONNECT_DELAY}ms...`, 'error');
    if (onConnectionStatus) onConnectionStatus(false);
    
    // Clear and schedule reconnection
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      connectRetailerChat(userId, userName, onMessageReceived, onConnectionStatus);
    }, RECONNECT_DELAY);
  };

  chatSocket.onerror = (error) => {
    dbg(`WebSocket connection error. Check server logs.`, 'error');
    console.error('[WebSocket Client] Socket error details:', error);
  };
}

/**
 * Sends a message stringified payload to the Admin (recipient 0).
 * @param {string} text 
 * @returns {boolean} Success status
 */
function sendChatMessage(text) {
  if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
    dbg('Cannot send message: WebSocket state is NOT OPEN', 'error');
    return false;
  }

  const payload = {
    receiverId: 0, // Admin's ID is always 0
    text: text
  };

  chatSocket.send(JSON.stringify(payload));
  dbg(`Sent message: "${text}"`, 'success');
  return true;
}
