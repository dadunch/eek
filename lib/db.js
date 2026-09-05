const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function todayKey() {
  const d = new Date();
  // format YYYY-MM-DD, mengikuti waktu lokal server
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    return { groups: {} };
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Gagal membaca db.json, membuat DB baru:', e.message);
    return { groups: {} };
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function ensureUser(db, groupId, userId, name) {
  if (!db.groups[groupId]) db.groups[groupId] = { users: {} };
  if (!db.groups[groupId].users[userId]) {
    db.groups[groupId].users[userId] = {
      name: name || userId,
      total: { minum: 0, eek: 0, kangen: 0 },
      daily: {},
    };
  }
  // update nama terbaru kalau berubah
  if (name) db.groups[groupId].users[userId].name = name;

  const tKey = todayKey();
  if (!db.groups[groupId].users[userId].daily[tKey]) {
    db.groups[groupId].users[userId].daily[tKey] = { minum: 0, eek: 0, kangen: 0 };
  }
  return db;
}

/**
 * Tambah hitungan untuk user tertentu di grup tertentu.
 * type: 'minum' | 'eek' | 'kangen'
 * Mengembalikan { total, todayCount } untuk jenis yang di-increment.
 */
function increment(groupId, userId, name, type) {
  const db = loadDB();
  ensureUser(db, groupId, userId, name);

  const tKey = todayKey();
  const user = db.groups[groupId].users[userId];

  user.total[type] = (user.total[type] || 0) + 1;
  user.daily[tKey][type] = (user.daily[tKey][type] || 0) + 1;

  saveDB(db);

  return {
    total: user.total[type],
    todayCount: user.daily[tKey][type],
  };
}

/**
 * Ambil rekap untuk semua user di grup pada hari ini.
 */
function getTodayStats(groupId) {
  const db = loadDB();
  const tKey = todayKey();
  const group = db.groups[groupId];
  if (!group) return [];

  return Object.entries(group.users)
    .map(([userId, u]) => ({
      userId,
      name: u.name,
      minum: (u.daily[tKey] && u.daily[tKey].minum) || 0,
      eek: (u.daily[tKey] && u.daily[tKey].eek) || 0,
      kangen: (u.daily[tKey] && u.daily[tKey].kangen) || 0,
    }))
    .filter((u) => u.minum > 0 || u.eek > 0 || u.kangen > 0)
    .sort((a, b) => (b.minum + b.eek + b.kangen) - (a.minum + a.eek + a.kangen));
}

/**
 * Ambil rekap total (sepanjang waktu) untuk semua user di grup.
 */
function getTotalStats(groupId) {
  const db = loadDB();
  const group = db.groups[groupId];
  if (!group) return [];

  return Object.entries(group.users)
    .map(([userId, u]) => ({
      userId,
      name: u.name,
      minum: u.total.minum || 0,
      eek: u.total.eek || 0,
      kangen: u.total.kangen || 0,
    }))
    .filter((u) => u.minum > 0 || u.eek > 0 || u.kangen > 0)
    .sort((a, b) => (b.minum + b.eek + b.kangen) - (a.minum + a.eek + a.kangen));
}

module.exports = {
  increment,
  getTodayStats,
  getTotalStats,
  todayKey,
};
