/**
 * Verification Test Suite for Spicelity Chat Module
 * Tests modules, mock token parsing, and query function interfaces.
 */

const assert = require('assert');

// 1. Syntax & Load Verification
console.log('--- Phase 1: Verification of module loading ---');
try {
  const db = require('./db');
  console.log('✅ db.js loaded successfully.');
  assert.ok(db.saveMessage, 'db.js should export saveMessage');
  assert.ok(db.getChatHistory, 'db.js should export getChatHistory');
  assert.ok(db.getAdminSidebarList, 'db.js should export getAdminSidebarList');
} catch (err) {
  console.error('❌ db.js failed to load:', err);
  process.exit(1);
}

// 2. Token Parsing Verification (Standalone Logic Check)
console.log('\n--- Phase 2: Verification of token parsing logic ---');

function verifyToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      return {
        id: parseInt(payload.id),
        role: payload.role,
        name: payload.name
      };
    }
    const [idStr, role, name] = token.split('-');
    if (idStr && role) {
      return {
        id: parseInt(idStr),
        role,
        name: name || 'User'
      };
    }
  } catch (error) {
    return null;
  }
  return null;
}

// Test case A: Simple token
const simpleToken = '12-retailer-Ramesh Kirana';
const parsedSimple = verifyToken(simpleToken);
console.log('Parsed Simple Token:', parsedSimple);
assert.deepStrictEqual(parsedSimple, { id: 12, role: 'retailer', name: 'Ramesh Kirana' }, 'Simple token should parse user info correctly');
console.log('✅ Simple token verification passed.');

// Test case B: Base64 Mock JWT Token
const jwtHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
const jwtPayload = Buffer.from(JSON.stringify({ id: 0, role: 'admin', name: 'SuperAdmin' })).toString('base64');
const jwtSignature = 'mock_signature';
const mockJwt = `${jwtHeader}.${jwtPayload}.${jwtSignature}`;

const parsedJwt = verifyToken(mockJwt);
console.log('Parsed JWT Token:', parsedJwt);
assert.deepStrictEqual(parsedJwt, { id: 0, role: 'admin', name: 'SuperAdmin' }, 'JWT token payload should parse correctly');
console.log('✅ JWT token verification passed.');

// Test case C: Invalid token
const invalidToken = 'badtoken';
const parsedInvalid = verifyToken(invalidToken);
assert.strictEqual(parsedInvalid, null, 'Invalid token should return null');
console.log('✅ Invalid token handler returned null as expected.');

// 3. MySQL DDL & SQL Query Verification (Static String checks)
console.log('\n--- Phase 3: SQL Query Interface checks ---');
const dbModule = require('./db');

// Inject mock query function into pool to prevent actual connection failures during unit checks
dbModule.pool.query = async (sql, params) => {
  console.log(`[SQL Mock Query] Executing: ${sql.replace(/\s+/g, ' ').trim()}`);
  console.log(`[SQL Mock Params] Values:`, params);
  
  if (sql.includes('INSERT INTO chat_messages')) {
    return [{ insertId: 101 }];
  }
  if (sql.includes('SELECT id, sender_id')) {
    return [[
      { id: 1, sender_id: 12, receiver_id: 0, message_text: 'Hello admin', created_at: new Date() },
      { id: 2, sender_id: 0, receiver_id: 12, message_text: 'Hello retailer', created_at: new Date() }
    ]];
  }
  if (sql.includes('other_user.user_id')) {
    return [[
      { user_id: 12, last_message: 'Hello retailer', last_activity: new Date(), unread_count: 0 }
    ]];
  }
  return [[]];
};

(async () => {
  try {
    const insertId = await dbModule.saveMessage(12, 0, 'Hello admin');
    assert.strictEqual(insertId, 101, 'saveMessage should return insertId 101');
    console.log('✅ saveMessage query test passed.');

    const history = await dbModule.getChatHistory(12, 0);
    assert.strictEqual(history.length, 2, 'getChatHistory should return 2 messages');
    console.log('✅ getChatHistory query test passed.');

    const sidebar = await dbModule.getAdminSidebarList(0);
    assert.strictEqual(sidebar.length, 1, 'getAdminSidebarList should return 1 conversation thread');
    console.log('✅ getAdminSidebarList query test passed.');

    console.log('\n🎉 ALL REAL-TIME CHAT UNIT TESTS PASSED SUCCESSFULLY! 🎉');
  } catch (err) {
    console.error('❌ Verification test failed:', err);
    process.exit(1);
  }
})();
