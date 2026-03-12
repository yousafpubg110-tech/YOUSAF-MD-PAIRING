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

const sessions = new Map();

function makeId() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function buildWelcomeText() {
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
    `Copy the SESSION_ID above and paste it in your YOUSAF-MD *.env* file\n\n` +
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

  const sessionId  = makeId();
  const sessionDir = `./sessions/${sessionId}`;

  try {
    if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions', { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys : makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal   : false,
      logger,
      browser             : ['YOUSAF-MD', 'Chrome', '1.0.0'],
      connectTimeoutMs    : 60000,
      keepAliveIntervalMs : 10000,
      markOnlineOnConnect : false,
    });

    sessions.set(sessionId, {
      sock,
      saveCreds,
      status    : 'pending',
      code      : null,
      sessionStr: null,
      number    : cleaned,
    });

    // ── Request pairing code immediately after socket is created ─
    // This is the correct Baileys flow — call BEFORE connection opens
    try {
      const code      = await sock.requestPairingCode(cleaned);
      const formatted = code?.match(/.{1,4}/g)?.join('-') || code;
      const s         = sessions.get(sessionId);
      if (s) {
        s.code   = formatted;
        s.status = 'code_ready';
      }
      console.log(`[${sessionId}] Pairing code: ${formatted}`);
    } catch (e) {
      console.error(`[${sessionId}] requestPairingCode error:`, e.message);
      sessions.delete(sessionId);
      try { sock.end(); } catch (_) {}
      return res.status(500).json({ error: 'Could not generate pairing code. Try again.' });
    }

    // ── Connection event handler ─────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      const s = sessions.get(sessionId);
      if (!s) return;

      console.log(`[${sessionId}] connection:`, connection);

      if (connection === 'open') {
        console.log(`[${sessionId}] ✅ WhatsApp connected!`);
        await saveCreds();

        const credsPath = `${sessionDir}/creds.json`;
        try {
          await new Promise(r => setTimeout(r, 1000));
          const creds   = fs.readFileSync(credsPath, 'utf8');
          const encoded = Buffer.from(creds).toString('base64');
          const fullId  = `YOUSAF-MD_${encoded}`;

          s.sessionStr = fullId;
          s.status     = 'connected';

          const jid = cleaned + '@s.whatsapp.net';

          // Message 1 — welcome + social links
          try {
            const thumbPath = path.resolve('./assets/bot-thumb.png');
            if (fs.existsSync(thumbPath)) {
              await sock.sendMessage(jid, {
                image  : fs.readFileSync(thumbPath),
                caption: buildWelcomeText(),
              });
            } else {
              await sock.sendMessage(jid, { text: buildWelcomeText() });
            }
          } catch (e) {
            console.error(`[${sessionId}] Welcome msg error:`, e.message);
          }

          await new Promise(r => setTimeout(r, 2000));

          // Message 2 — SESSION_ID separate
          try {
            await sock.sendMessage(jid, { text: buildSessionText(fullId) });
          } catch (e) {
            console.error(`[${sessionId}] Session msg error:`, e.message);
          }

          console.log(`[${sessionId}] ✅ Messages sent!`);

        } catch (e) {
          s.status = 'error';
          console.error(`[${sessionId}] creds error:`, e.message);
        }

        setTimeout(() => { try { sock.end(); } catch (_) {} }, 5000);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const s = sessions.get(sessionId);
        if (!s) return;

        console.log(`[${sessionId}] Connection closed. Code: ${statusCode}`);

        // If already connected — ignore close
        if (s.status === 'connected') return;

        // If code shown — user is still entering code, do NOT mark failed
        if (s.status === 'code_ready') {
          console.log(`[${sessionId}] Code ready, waiting for user to enter...`);
          return;
        }

        s.status = 'failed';
      }
    });

    sock.ev.on('creds.update', saveCreds);

    const s = sessions.get(sessionId);
    return res.json({ sessionId, code: s.code });

  } catch (e) {
    console.error('[PAIRING] Fatal error:', e.message);
    sessions.delete(sessionId);
    return res.status(500).json({ error: 'Server error. Try again.' });
  }
});

// ── GET /status/:sessionId ───────────────────────────────────────
app.get('/status/:sessionId', (req, res) => {
  const s = sessions.get(req.params.sessionId);
  if (!s) return res.status(404).json({ error: 'Session not found or expired' });

  if (s.status === 'connected' && s.sessionStr) {
    setTimeout(() => {
      try { fs.rmSync(`./sessions/${req.params.sessionId}`, { recursive: true, force: true }); } catch (_) {}
      sessions.delete(req.params.sessionId);
    }, 60000);
    return res.json({ status: 'connected', sessionId: s.sessionStr });
  }

  return res.json({ status: s.status, code: s.code });
});

// ── Health check ─────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({
  status  : 'ok',
  bot     : 'YOUSAF-MD-PAIRING',
  author  : 'MR YOUSAF BALOCH',
  sessions: sessions.size,
}));

// ── Frontend ──────────────────────────────────────────────────────
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
╚══════════════════════════════════════════╝
  `);
});
