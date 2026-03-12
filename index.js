/*
╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
┃   YOUSAF-MD-PAIRING                       ┃
┃   WhatsApp Session Generator              ┃
┃   Created by MR YOUSAF BALOCH            ┃
┃   GitHub: yousafpubg110-tech             ┃
┃   License: GNU GPL v3                    ┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
*/
import 'dotenv/config';
import express           from 'express';
import path              from 'path';
import fs                from 'fs';
import { fileURLToPath } from 'url';
import pino              from 'pino';
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app       = express();
const PORT      = process.env.PORT || 3000;
const logger    = pino({ level: 'silent' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Sessions store ───────────────────────────────────────────────
const sessions = new Map();

function makeId() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

// ── Welcome message builder ──────────────────────────────────────
function buildWelcomeText(sessionStr) {
  return (
    `╔══════════════════════════════════╗\n` +
    `║  🚀 *YOUSAF-MD* — Ultra Pro Max  ║\n` +
    `║  ✨ Best WhatsApp Bot Ever ✨     ║\n` +
    `╚══════════════════════════════════╝\n\n` +
    `✅ *Session Generated Successfully!*\n\n` +
    `🎉 *Welcome to YOUSAF-MD Bot!*\n\n` +
    `╭─『 👑 *BOT INFO* 』\n` +
    `│ 🤖 *Bot:*    YOUSAF-MD\n` +
    `│ 👑 *Owner:*  MR YOUSAF BALOCH\n` +
    `│ 📱 *Number:* +923710636110\n` +
    `╰──────────────────────────\n\n` +
    `╭─『 🔗 *SOCIAL MEDIA* 』\n` +
    `│ 📢 *Channel:*  https://whatsapp.com/channel/0029Vb3Uzps6buMH2RvGef0j\n` +
    `│ 📺 *YouTube:*  https://youtube.com/@Yousaf_Baloch_Tech\n` +
    `│ 🎵 *TikTok:*   https://tiktok.com/@loser_boy.110\n` +
    `│ 💻 *GitHub:*   https://github.com/yousafpubg110-tech/YOUSAF-MD\n` +
    `╰──────────────────────────\n\n` +
    `_© 2026 YOUSAF-MD | By MR YOUSAF BALOCH_`
  );
}

function buildSessionText(sessionStr) {
  return (
    `╭━━━『 🔑 *YOUR SESSION ID* 』━━━╮\n\n` +
    `\`\`\`${sessionStr}\`\`\`\n\n` +
    `📌 *How to use:*\n` +
    `Copy the above SESSION_ID and paste it in your YOUSAF-MD *.env* file:\n\n` +
    `SESSION_ID=_YOUSAF-MD_xxxxxxxx..._\n\n` +
    `⚠️ *Keep this safe — do not share with anyone!*\n\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━╯`
  );
}

// ── POST /pair ───────────────────────────────────────────────────
app.post('/pair', async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Phone number is required' });

  const cleaned = number.replace(/[^0-9]/g, '');
  if (cleaned.length < 10) return res.status(400).json({ error: 'Invalid phone number' });

  const sessionId = makeId();

  try {
    const sessionDir = `./sessions/${sessionId}`;
    if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions');

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys : makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
      browser: ['YOUSAF-MD', 'Chrome', '1.0.0'],
    });

    sessions.set(sessionId, {
      sock,
      saveCreds,
      status    : 'pending',
      code      : null,
      sessionStr: null,
    });

    // Wait for socket to be ready then request pairing code
    await new Promise(r => setTimeout(r, 2000));

    const code      = await sock.requestPairingCode(cleaned);
    const formatted = code?.match(/.{1,4}/g)?.join('-') || code;

    const s   = sessions.get(sessionId);
    s.code    = formatted;
    s.status  = 'code_ready';

    // Connection handler
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      const s = sessions.get(sessionId);
      if (!s) return;

      if (connection === 'open') {
        await saveCreds();
        const credsPath = `${sessionDir}/creds.json`;

        try {
          const creds    = fs.readFileSync(credsPath, 'utf8');
          const encoded  = Buffer.from(creds).toString('base64');
          const fullId   = `YOUSAF-MD_${encoded}`;

          s.sessionStr = fullId;
          s.status     = 'connected';

          // ── Send messages to linked WhatsApp ────────────────
          const jid = cleaned + '@s.whatsapp.net';

          // Message 1: Bot image + welcome + social links
          try {
            const thumbPath = path.resolve('./assets/bot-thumb.png');
            if (fs.existsSync(thumbPath)) {
              await sock.sendMessage(jid, {
                image  : fs.readFileSync(thumbPath),
                caption: buildWelcomeText(fullId),
              });
            } else {
              await sock.sendMessage(jid, { text: buildWelcomeText(fullId) });
            }
          } catch (msgErr) {
            console.error('[PAIRING] Welcome msg failed:', msgErr.message);
          }

          // Small delay between messages
          await new Promise(r => setTimeout(r, 1500));

          // Message 2: SESSION_ID only — separate message
          try {
            await sock.sendMessage(jid, { text: buildSessionText(fullId) });
          } catch (msgErr) {
            console.error('[PAIRING] Session msg failed:', msgErr.message);
          }

          console.log(`[PAIRING] Session ${sessionId} connected & messages sent!`);

        } catch (e) {
          s.status = 'error';
          console.error('[PAIRING] creds read error:', e.message);
        }

        // Close socket after done
        setTimeout(() => { try { sock.end(); } catch (_) {} }, 3000);
      }

      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode;
        if (reason !== DisconnectReason.loggedOut && s?.status !== 'connected') {
          s.status = 'failed';
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    return res.json({ sessionId, code: formatted });

  } catch (e) {
    console.error('[PAIRING] Error:', e.message);
    sessions.delete(sessionId);
    return res.status(500).json({ error: 'Failed to generate pairing code. Try again.' });
  }
});

// ── GET /status/:sessionId ───────────────────────────────────────
app.get('/status/:sessionId', (req, res) => {
  const s = sessions.get(req.params.sessionId);
  if (!s) return res.status(404).json({ error: 'Session not found' });

  if (s.status === 'connected' && s.sessionStr) {
    // Cleanup after 30s
    setTimeout(() => {
      try { fs.rmSync(`./sessions/${req.params.sessionId}`, { recursive: true, force: true }); } catch (_) {}
      sessions.delete(req.params.sessionId);
    }, 30000);

    return res.json({ status: 'connected', sessionId: s.sessionStr });
  }

  return res.json({ status: s.status, code: s.code });
});

// ── Health check ─────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({
  status : 'ok',
  bot    : 'YOUSAF-MD-PAIRING',
  author : 'MR YOUSAF BALOCH',
  github : 'https://github.com/yousafpubg110-tech/YOUSAF-MD-PAIRING',
}));

// ── Frontend fallback ────────────────────────────────────────────
app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   🚀 YOUSAF-MD-PAIRING is running!       ║
║   🌐 Port: ${PORT}                           ║
║   👑 By: MR YOUSAF BALOCH               ║
║   💻 github.com/yousafpubg110-tech      ║
╚══════════════════════════════════════════╝
  `);
});
