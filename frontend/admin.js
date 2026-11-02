/**
 * Spicelity Admin Chat Client Module
 * Handles real-time WebSockets communication and API calls for the Admin.
 */

let adminSocket = null;
let reconnectTimer = null;
const RECONNECT_DELAY = 5000;

// Internal helper to log to console
function dbg(msg) {
  console.log(`[Admin WS] ${msg}`);
}

/**
 * Establish WebSocket connection as Admin using token auth.
 * @param {function} onMessageReceived - Callback triggered when an message or ack arrives.
 * @param {function} onConnectionStatus - Callback to update UI connection status.
 */
function connectAdminChat(onMessageReceived, onConnectionStatus) {
  if (adminSocket) {
    dbg('Closing existing admin connection...');
    adminSocket.close();
  }

  // Admin ID is 0, role is admin
  const token = `0-admin-Admin`;
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || 'localhost:3000';
  const wsUrl = `${protocol}//${host}?token=${token}`;

  dbg(`Connecting Admin WebSocket to ${wsUrl}...`);
  adminSocket = new WebSocket(wsUrl);

  adminSocket.onopen = () => {
    dbg('Admin WebSocket connection established successfully!', 'success');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (onConnectionStatus) onConnectionStatus(true);
  };

  adminSocket.onmessage = (event) => {
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

  adminSocket.onclose = (event) => {
    dbg(`Admin WebSocket disconnected (Code: ${event.code}). Retrying in ${RECONNECT_DELAY}ms...`, 'error');
    if (onConnectionStatus) onConnectionStatus(false);
    
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      connectAdminChat(onMessageReceived, onConnectionStatus);
    }, RECONNECT_DELAY);
  };

  adminSocket.onerror = (error) => {
    dbg(`WebSocket connection error. Check server logs.`, 'error');
  };
}

/**
 * Sends a message payload to a specific retailer.
 * @param {number} retailerId 
 * @param {string} text 
 * @returns {boolean} Success status
 */
function sendAdminWebSocketMessage(retailerId, text) {
  if (!adminSocket || adminSocket.readyState !== WebSocket.OPEN) {
    dbg('Cannot send message: WebSocket state is NOT OPEN', 'error');
    return false;
  }

  const payload = {
    receiverId: parseInt(retailerId),
    text: text
  };

  adminSocket.send(JSON.stringify(payload));
  dbg(`Sent message to retailer ${retailerId}: "${text}"`, 'success');
  return true;
}

/**
 * Fetches chat history between a retailer and admin from MySQL.
 * @param {number} retailerId 
 * @returns {Promise<Array>} List of messages
 */
async function fetchChatHistory(retailerId) {
  try {
    dbg(`Fetching history for retailer ${retailerId} from API...`);
    const res = await fetch(`/api/chat/history/${retailerId}`);
    if (!res.ok) throw new Error('Failed to fetch history');
    const data = await res.json();
    dbg(`Loaded ${data.length} historical messages`, 'success');
    return data;
  } catch (err) {
    dbg(`Failed to load history: ${err.message}`, 'error');
    return [];
  }
}

/**
 * Fetches distinct conversations for the admin sidebar.
 * @returns {Promise<Array>} List of conversation threads
 */
async function fetchSidebarConversations() {
  try {
    dbg('Fetching conversation threads for sidebar...');
    const res = await fetch(`/api/chat/sidebar`);
    if (!res.ok) throw new Error('Failed to fetch sidebar');
    const data = await res.json();
    dbg(`Loaded ${data.length} active threads`, 'success');
    return data;
  } catch (err) {
    dbg(`Failed to load sidebar: ${err.message}`, 'error');
    return [];
  }
}

/**
 * Marks messages from a retailer to the admin as read in MySQL.
 * @param {number} retailerId 
 * @returns {Promise<boolean>} Success status
 */
async function markChatAsRead(retailerId) {
  try {
    const res = await fetch(`/api/chat/read/${retailerId}`, { method: 'PUT' });
    return res.ok;
  } catch (err) {
    console.error('[Admin API] Error marking chat as read:', err);
    return false;
  }
}
