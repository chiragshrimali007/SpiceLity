const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'db.json');

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

function readDB() {
  if (!fs.existsSync(dbPath)) {
    const defaultData = { spices: initialSpices, retailers: [], orders: [], notifications: [] };
    fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

module.exports = { readDB, writeDB };
