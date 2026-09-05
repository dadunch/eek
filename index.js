const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const QRCode = require('qrcode');
const express = require('express');
const { increment, getTodayStats, getTotalStats } = require('./lib/db');

const AUTH_DIR = './auth_info';
const PORT = process.env.PORT || 3000;

// Simpan QR code terakhir sebagai data URL PNG, ditampilkan lewat halaman web
let latestQrDataUrl = null;
let connectionStatus = 'Menyambungkan...';

function startWebServer() {
  const app = express();

  app.get('/', (req, res) => {
    if (connectionStatus === 'connected') {
      res.send(`
        <html><body style="font-family:sans-serif;text-align:center;margin-top:60px;">
          <h2>✅ Bot sudah tersambung ke WhatsApp</h2>
          <p>Silakan undang nomor bot ini ke grup WhatsApp kamu.</p>
        </body></html>
      `);
      return;
    }
    if (!latestQrDataUrl) {
      res.send(`
        <html><body style="font-family:sans-serif;text-align:center;margin-top:60px;">
          <h2>⏳ Menyiapkan QR code...</h2>
          <p>Refresh halaman ini dalam beberapa detik.</p>
        </body></html>
      `);
      return;
    }
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;margin-top:40px;">
        <h2>Scan QR ini dengan WhatsApp</h2>
        <p>Setelan &gt; Perangkat Tertaut &gt; Tautkan Perangkat</p>
        <img src="${latestQrDataUrl}" style="width:300px;height:300px;" />
        <p style="color:#888;">Halaman ini auto-refresh tiap 5 detik. QR berganti otomatis jika kedaluwarsa.</p>
        <script>setTimeout(() => location.reload(), 5000);</script>
      </body></html>
    `);
  });

  app.listen(PORT, () => {
    console.log(`Halaman QR tersedia di port ${PORT}`);
  });
}

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

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionStatus = 'qr';
      latestQrDataUrl = await QRCode.toDataURL(qr, { width: 300 });
      console.log('QR code baru tersedia. Buka halaman web service ini untuk scan.');
    }

    if (connection === 'close') {
      connectionStatus = 'Menyambungkan...';
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('Koneksi terputus. Reconnect:', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      connectionStatus = 'connected';
      latestQrDataUrl = null;
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
      } else if (lower === '!kangen') {
        const { total, todayCount } = increment(jid, senderId, senderName, 'kangen');
        const quote = randomKangenQuote(senderName, todayCount);
        await sock.sendMessage(jid, {
          text: `💘 Dicatat! ${senderName} kangen *${todayCount}x* hari ini (total sepanjang waktu: ${total}x).\n\n_${quote}_`,
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
    return `${i + 1}. ${u.name} — 💧 ${u.minum}x minum | 🚽 ${u.eek}x eek | 💔 ${u.kangen}x kangen`;
  });
  return `📊 *${title}*\n\n${lines.join('\n')}`;
}

function helpText() {
  return (
    `🤖 *Bot Tracker Minum, Eek & Kangen*\n\n` +
    `!minum — catat 1x minum air\n` +
    `!eek — catat 1x buang air\n` +
    `!kangen — catat 1x perasaan kangen (+ kata-kata random 🥺)\n` +
    `!rekap — lihat rekap hari ini semua member\n` +
    `!rekap total — lihat rekap total sepanjang waktu\n` +
    `!help — tampilkan pesan ini`
  );
}

function randomKangenQuote(name, count) {

  const quotes = [

    `${name} kangen banget, tapi gengsi masih lebih kuat 😭`,

    `udah ${count}x kangen, masa harus bikin pengumuman RT dulu 😖`,

    `${name} bilang kangen, tapi chat "hai" aja masih diketik hapus 😭`,

    `kangen level ${count}: buka chat, liat nama, tutup lagi. hebat 👍`,

    `${name} kangen. orangnya online. hidup memang penuh cobaan 😔`,

    `hari ini ${name} kangen ${count}x. kerjaan masih ada, tapi hati resign duluan 😖`,

    `${name} kangen, tapi yang dikangenin malah upload story. sakitnya gratis 😭`,

    `kangen ke-${count}, saldo tetap segitu-gitu aja. hidup emang ga adil 💸`,

    `${name} kangen sampe ${count}x. ini kangen apa absen kuliah? 😭`,

    `katanya cuma kangen dikit. kok udah ${count}x? bohong banget 😭`,

    `${name} lagi kangen. mohon jangan diajak ngobrol, takut makin parah 🫠`,

    `${count}x kangen hari ini. dokter bilang: "yaudah chat orangnya" 😖`,

    `${name}: kangen. juga ${name}: gengsi. plot twist tiap hari 😭`,

    `${name} kangen ${count}x hari ini. orangnya masih selamat dari spam chat 🙏`,

    `kangen ke-${count}? wah, ini sudah bukan kangen. ini gejala gabut 😭`,

    `${name} kangen, tapi masih berharap orangnya peka. optimis sekali hidupnya 😖`,

    `${name} udah kangen ${count}x. yang dikangenin masih santai kayak ga punya dosa 😭`,

    `kangen ${count}x sehari tapi chat cuma "wkwk". strategi yang sangat brilian 🤡`,

    `${name} kangen. solusi: chat. masalah: gengsi. selesai sudah 😖`,

    `${name} kangen banget. bahkan lagu galau sekarang terasa seperti dokumenter 😭`

  ];

  return quotes[Math.floor(Math.random() * quotes.length)];

}

startWebServer();
startBot().catch((err) => {
  console.error('Gagal menjalankan bot:', err);
});
