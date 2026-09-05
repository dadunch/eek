const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const { increment, getTodayStats, getTotalStats } = require('./lib/db');

const AUTH_DIR = './auth_info';

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false, // kita handle manual biar rapi
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nScan QR ini dengan WhatsApp (Perangkat Tertaut > Tautkan Perangkat):\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('Koneksi terputus. Reconnect:', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('✅ Bot tersambung ke WhatsApp!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    const isGroup = jid.endsWith('@g.us');
    if (!isGroup) return; // bot ini fokus untuk dipakai di dalam grup

    const senderId = msg.key.participant || msg.key.remoteJid;
    const senderName = msg.pushName || senderId.split('@')[0];

    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      '';

    if (!body) return;

    const text = body.trim();
    const lower = text.toLowerCase();

    try {
      if (lower === '!minum') {
        const { total, todayCount } = increment(jid, senderId, senderName, 'minum');
        await sock.sendMessage(jid, {
          text: `💧 Dicatat! ${senderName} sudah minum air *${todayCount}x* hari ini (total sepanjang waktu: ${total}x).`,
        }, { quoted: msg });
      } else if (lower === '!eek') {
        const { total, todayCount } = increment(jid, senderId, senderName, 'eek');
        await sock.sendMessage(jid, {
          text: `🚽 Dicatat! ${senderName} sudah buang air *${todayCount}x* hari ini (total sepanjang waktu: ${total}x).`,
        }, { quoted: msg });
      } else if (lower === '!rekap' || lower === '!rekap hari ini') {
        const stats = getTodayStats(jid);
        await sock.sendMessage(jid, { text: formatRekap(stats, 'Rekap Hari Ini') }, { quoted: msg });
      } else if (lower === '!rekap total' || lower === '!rekap all') {
        const stats = getTotalStats(jid);
        await sock.sendMessage(jid, { text: formatRekap(stats, 'Rekap Total (Sepanjang Waktu)') }, { quoted: msg });
      } else if (lower === '!help' || lower === '!menu') {
        await sock.sendMessage(jid, { text: helpText() }, { quoted: msg });
      }
    } catch (err) {
      console.error('Error saat memproses pesan:', err);
    }
  });
}

function formatRekap(stats, title) {
  if (!stats.length) {
    return `📊 *${title}*\n\nBelum ada catatan.`;
  }
  const lines = stats.map((u, i) => {
    return `${i + 1}. ${u.name} — 💧 ${u.minum}x minum | 🚽 ${u.eek}x eek`;
  });
  return `📊 *${title}*\n\n${lines.join('\n')}`;
}

function helpText() {
  return (
    `🤖 *Bot Tracker Minum & Eek*\n\n` +
    `!minum — catat 1x minum air\n` +
    `!eek — catat 1x buang air\n` +
    `!rekap — lihat rekap hari ini semua member\n` +
    `!rekap total — lihat rekap total sepanjang waktu\n` +
    `!help — tampilkan pesan ini`
  );
}

startBot().catch((err) => {
  console.error('Gagal menjalankan bot:', err);
});
