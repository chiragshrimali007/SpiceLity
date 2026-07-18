const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const dbPath = path.join(__dirname, 'db.json');

// --- Lightweight .env Loader ---
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const parts = trimmed.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = val;
      }
    });
    console.log('📝 [Config] Loaded custom database environment variables from .env');
  } catch (err) {
    console.warn('⚠️ [Config Warning] Failed to read .env file:', err.message);
  }
}

const initialSpices = [
  { id: 1, emoji: '🌶️', name: 'Red Chili', hindi_name: 'मिर्ची', price: 0, bg_color: '#FFF0E8' },
  { id: 2, emoji: '🫚', name: 'Coriander', hindi_name: 'धनिया', price: 0, bg_color: '#F0F5E0' },
  { id: 3, emoji: '🟡', name: 'Turmeric', hindi_name: 'हल्दी', price: 0, bg_color: '#FFF8E0' },
  { id: 4, emoji: '🥭', name: 'Amchur', hindi_name: 'अमचूर', price: 0, bg_color: '#F5E8D0' },
  { id: 5, emoji: '🌾', name: 'Cumin Seeds', hindi_name: 'जीरा', price: 0, bg_color: '#FFF5E0' },
  { id: 6, emoji: '✨', name: 'Cumin Seeds Special', hindi_name: 'जीरा स्पेशल', price: 0, bg_color: '#FFF5E0' },
  { id: 7, emoji: '🟤', name: 'Mustard Seeds', hindi_name: 'राई', price: 0, bg_color: '#FFF8E0' },
  { id: 8, emoji: '🌱', name: 'Fenugreek Seeds', hindi_name: 'मेथी', price: 0, bg_color: '#EDF5EA' },
  { id: 9, emoji: '🫛', name: 'Fennel Seeds', hindi_name: 'सौंफ', price: 0, bg_color: '#F0F5E8' },
  { id: 10, emoji: '🌟', name: 'Fennel seeds Special', hindi_name: 'सौंफ स्पेशल', price: 0, bg_color: '#F0F5E8' },
  { id: 11, emoji: '🌿', name: 'Kirayata', hindi_name: 'किरायता', price: 0, bg_color: '#E8F0E0' },
  { id: 12, emoji: '💎', name: 'Lucknowi Fennel', hindi_name: 'लखनवी सौंफ', price: 0, bg_color: '#F0F5E8' },
  { id: 13, emoji: '💛', name: 'Yellow Mustard', hindi_name: 'पीली सरसों', price: 0, bg_color: '#FFF8D0' },
  { id: 14, emoji: '🥣', name: 'Split Mustard Seeds', hindi_name: 'राई दाल', price: 0, bg_color: '#FFF8E0' },
  { id: 15, emoji: '🌰', name: 'Asaliya', hindi_name: 'असालिया', price: 0, bg_color: '#F0E8E0' },
  { id: 16, emoji: '🟫', name: 'Flax Seeds', hindi_name: 'अलसी', price: 0, bg_color: '#E0D8D0' },
  { id: 17, emoji: '🍂', name: 'Carom Seeds', hindi_name: 'अजवायन', price: 0, bg_color: '#F5F0E0' },
  { id: 18, emoji: '💨', name: 'Carom Powder', hindi_name: 'अजवायन पाउडर', price: 0, bg_color: '#F5F0E0' },
  { id: 19, emoji: '🍃', name: 'Green Methi - Bilara', hindi_name: 'हरी मेथी', price: 0, bg_color: '#D0E8D0' },
  { id: 20, emoji: '🧆', name: 'Whole Garam Masala', hindi_name: 'साबुत गरम मसाला', price: 0, bg_color: '#FFF0E8' },
  { id: 21, emoji: '🟠', name: 'Ground Garam Masala', hindi_name: 'पिसा गरम मसाला', price: 0, bg_color: '#FFF0E8' },
  { id: 22, emoji: '🔥', name: 'Special Red Chili', hindi_name: 'मिर्ची स्पेशल', price: 0, bg_color: '#FFE8E0' }
];

// --- Existing JSON DB Logic ---
function readDB() {
  if (!fs.existsSync(dbPath)) {
    const defaultData = { spices: initialSpices, retailers: [], orders: [], notifications: [], messages: [] };
    fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  if (!data.notifications) data.notifications = [];
  if (!data.messages) data.messages = [];
  return data;
}

function writeDB(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// --- Module 1: The MySQL Database Layer ---

let pool = null;
let useMySQL = false;

// Create the connection pool
try {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'spicelity',
    port: parseInt(process.env.DB_PORT || '3306'),
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  });

  // Test the connection asynchronously
  pool.query('SELECT 1')
    .then(() => {
      console.log('✅ [Database] MySQL connection pool established successfully.');
      useMySQL = true;
    })
    .catch(err => {
      console.warn('⚠️ [Database Warning] MySQL connection failed. Access denied or server offline.');
      console.warn(`   Details: ${err.sqlMessage || err.message}`);
      console.warn('   --> Falling back to JSON database (db.json) for chat persistence.');
      useMySQL = false;
    });
} catch (e) {
  console.warn('⚠️ [Database Warning] Failed to initialize MySQL pool. Falling back to JSON.');
  useMySQL = false;
}

/**
 * Inserts a new chat message into the database.
 * @param {number} senderId 
 * @param {number} receiverId 
 * @param {string} text 
 * @returns {Promise<number>} The ID of the inserted message.
 */
async function saveMessage(senderId, receiverId, text) {
  if (useMySQL) {
    try {
      const sql = `
        INSERT INTO chat_messages (sender_id, receiver_id, message_text) 
        VALUES (?, ?, ?)
      `;
      const [result] = await pool.query(sql, [senderId, receiverId, text]);
      return result.insertId;
    } catch (error) {
      console.error('[MySQL Error] failed to save message, falling back to JSON:', error.message);
    }
  }

  // JSON database fallback
  const db = readDB();
  if (!db.messages) db.messages = [];
  const now = new Date();
  const newMsg = {
    id: db.messages.length > 0 ? Math.max(...db.messages.map(m => m.id)) + 1 : 1,
    sender_id: parseInt(senderId),
    receiver_id: parseInt(receiverId),
    message_text: text,
    created_at: now.toISOString(),
    is_read: false
  };
  db.messages.push(newMsg);
  writeDB(db);
  return newMsg.id;
}

/**
 * Fetches past conversations between a specific user and the admin, ordered chronologically.
 * @param {number} userId 
 * @param {number} adminId 
 * @returns {Promise<Array>} Chronological list of message objects.
 */
async function getChatHistory(userId, adminId) {
  if (useMySQL) {
    try {
      const sql = `
        SELECT id, sender_id, receiver_id, message_text, created_at, is_read
        FROM chat_messages
        WHERE (sender_id = ? AND receiver_id = ?)
           OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at ASC
      `;
      const [rows] = await pool.query(sql, [userId, adminId, adminId, userId]);
      return rows;
    } catch (error) {
      console.error('[MySQL Error] failed to get chat history, falling back to JSON:', error.message);
    }
  }

  // JSON database fallback
  const db = readDB();
  if (!db.messages) db.messages = [];
  const uId = parseInt(userId);
  const aId = parseInt(adminId);
  return db.messages
    .filter(m => 
      (m.sender_id === uId && m.receiver_id === aId) || 
      (m.sender_id === aId && m.receiver_id === uId)
    )
    .map(m => ({
      id: m.id,
      sender_id: m.sender_id,
      receiver_id: m.receiver_id,
      message_text: m.message_text,
      created_at: m.created_at,
      is_read: m.is_read
    }))
    .sort((a, b) => a.id - b.id);
}

/**
 * Fetches a grouped list of distinct users who have messaged the admin, 
 * displaying their last message text, a timestamp, and an unread count badge, 
 * ordered by the most recent activity.
 * @param {number} adminId 
 * @returns {Promise<Array>} List of conversation metadata objects.
 */
async function getAdminSidebarList(adminId) {
  if (useMySQL) {
    try {
      const sql = `
        SELECT 
          other_user.user_id,
          m.message_text AS last_message,
          m.created_at AS last_activity,
          (
            SELECT COUNT(*) 
            FROM chat_messages 
            WHERE sender_id = other_user.user_id AND receiver_id = ? AND is_read = FALSE
          ) AS unread_count
        FROM (
          SELECT DISTINCT IF(sender_id = ?, receiver_id, sender_id) AS user_id
          FROM chat_messages
          WHERE sender_id = ? OR receiver_id = ?
        ) AS other_user
        JOIN chat_messages m ON m.id = (
          SELECT id 
          FROM chat_messages 
          WHERE (sender_id = ? AND receiver_id = other_user.user_id) 
             OR (sender_id = other_user.user_id AND receiver_id = ?)
          ORDER BY created_at DESC, id DESC 
          LIMIT 1
        )
        ORDER BY m.created_at DESC
      `;
      const [rows] = await pool.query(sql, [
        adminId, 
        adminId, adminId, adminId, 
        adminId, adminId
      ]);
      return rows;
    } catch (error) {
      console.error('[MySQL Error] failed to get admin sidebar list, falling back to JSON:', error.message);
    }
  }

  // JSON database fallback
  const db = readDB();
  if (!db.messages) db.messages = [];
  const aId = parseInt(adminId);
  const userMap = new Map();
  
  db.messages.forEach(m => {
    const sId = parseInt(m.sender_id);
    const rId = parseInt(m.receiver_id);
    if (sId === aId || rId === aId) {
      const otherId = sId === aId ? rId : sId;
      const unreadInc = (rId === aId && !m.is_read) ? 1 : 0;
      
      if (!userMap.has(otherId)) {
        userMap.set(otherId, {
          user_id: otherId,
          last_message: m.message_text,
          last_activity: m.created_at,
          last_id: m.id,
          unread_count: unreadInc
        });
      } else {
        const existing = userMap.get(otherId);
        existing.unread_count += unreadInc;
        if (m.id > existing.last_id) {
          existing.last_message = m.message_text;
          existing.last_activity = m.created_at;
          existing.last_id = m.id;
        }
      }
    }
  });

  return Array.from(userMap.values())
    .map(conv => ({
      user_id: conv.user_id,
      last_message: conv.last_message,
      last_activity: conv.last_activity,
      unread_count: conv.unread_count
    }))
    .sort((a, b) => new Date(b.last_activity) - new Date(a.last_activity));
}

/**
 * Marks all unread messages from a specific sender to a receiver as read.
 * @param {number} senderId 
 * @param {number} receiverId 
 * @returns {Promise<number>} Number of affected rows.
 */
async function markMessagesAsRead(senderId, receiverId) {
  if (useMySQL) {
    try {
      const sql = `
        UPDATE chat_messages 
        SET is_read = TRUE 
        WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE
      `;
      const [result] = await pool.query(sql, [senderId, receiverId]);
      return result.affectedRows;
    } catch (error) {
      console.error('[MySQL Error] failed to mark messages as read, falling back to JSON:', error.message);
    }
  }

  // JSON database fallback
  const db = readDB();
  if (!db.messages) db.messages = [];
  const sId = parseInt(senderId);
  const rId = parseInt(receiverId);
  let affected = 0;
  db.messages.forEach(m => {
    if (parseInt(m.sender_id) === sId && parseInt(m.receiver_id) === rId && !m.is_read) {
      m.is_read = true;
      affected++;
    }
  });
  if (affected > 0) {
    writeDB(db);
  }
  return affected;
}

module.exports = { 
  readDB, 
  writeDB,
  pool,
  saveMessage,
  getChatHistory,
  getAdminSidebarList,
  markMessagesAsRead
};
