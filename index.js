/*
╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
┃   YOUSAF-MD-PAIRING                       ┃
┃   Created by MR YOUSAF BALOCH            ┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
*/
import 'dotenv/config';
import express              from 'express';
import path                 from 'path';
import fs                   from 'fs';
import { fileURLToPath }    from 'url';
import pino                 from 'pino';
import {
  makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  fetchLatestBaileysVersion,
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
    `╚══════════════════════════════════╝\n\n` +
    `✅ *Session Generated Successfully!*\n\n` +
    `╭─『 👑 *BOT INFO* 』\n` +
    `│ 🤖 *Bot:*    YOUSAF-MD\n` +
    `│ 👑 *Owner:*  MR YOUSAF BALOCH\n` +
    `│ 📱 *Number:* +923710636110\n` +
    `╰──────────────────────────\n\n` +
    `╭─『 🔗 *SOCIAL MEDIA* 』\n` +
    `│ 📢 https://whatsapp.com/channel/0029Vb3Uzps6buMH2RvGef0j\n` +
    `│ 📺 https://youtube.com/@Yousaf_Baloch_Tech\n` +
    `│ 🎵 https://tiktok.com/@loser_boy.110\n` +
    `│ 💻 https://github.com/yousafpubg110-tech/YOUSAF-MD\n` +
    `╰──────────────────────────\n\n` +
    `_© 2026 YOUSAF-MD | By MR YOUSAF BALOCH_`
  );
}

function buildSessionText(sessionStr) {
  return (
    `╭━━━『 🔑 *YOUR SESSION ID* 』━━━╮\n\n` +
    `\`\`\`${sessionStr}\`\`\`\n\n` +
    `📌 *How to use:*\n` +
    `Paste SESSION_ID in your YOUSAF-MD *.env* file\n\n` +
    `⚠️ *Do not share with anyone!*\n\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━╯`
  );
}

// ── Background pairing ───────────────────────────────────────────
function runPairing(cleaned, sessionId) {
  const sessionDir = `./sessions/${sessionId}`;

  (async () => {
    try {
      if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions', { recursive: true });

      const { state, saveCreds }    = await useMultiFileAuthState(sessionDir);
      const { version, isLatest }   = await fetchLatestBaileysVersion();
      console.log(`[${sessionId}] WA version: ${version.join('.')} | latest: ${isLatest}`);

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys : makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal   : false,
        logger,
        browser             : Browsers.ubuntu('Chrome'),
        connectTimeoutMs    : 60000,
        keepAliveIntervalMs : 10000,
        markOnlineOnConnect : false,
      });

      const s = sessions.get(sessionId);
      if (s) s.sock = sock;

      sock.ev.on('creds.update', saveCreds);

      let codeRequested = false;

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const s = sessions.get(sessionId);
        if (!s) return;

        console.log(`[${sessionId}] connection: ${connection} | qr: ${!!qr}`);

        // QR آنے کا مطلب socket WA servers سے connect ہو گیا
        if (qr && !codeRequested) {
          codeRequested = true;
          console.log(`[${sessionId}] QR ready — requesting pairing code...`);
          try {
            const code      = await sock.requestPairingCode(cleaned);
            const formatted = code?.match(/.{1,4}/g)?.join('-') || code;
            s.code   = formatted;
            s.status = 'code_ready';
            console.log(`[${sessionId}] ✅ Code: ${formatted}`);
          } catch (err) {
            console.error(`[${sessionId}] Code error:`, err.message);
            s.status = 'failed';
            try { sock.end(); } catch (_) {}
          }
        }

        // User نے code enter کر دیا
        if (connection === 'open') {
          console.log(`[${sessionId}] ✅ WhatsApp Connected!`);
          await saveCreds();

          try {
            await new Promise(r => setTimeout(r, 1500));
            const creds   = fs.readFileSync(`${sessionDir}/creds.json`, 'utf8');
            const encoded = Buffer.from(creds).toString('base64');
            const fullId  = `YOUSAF-MD_${encoded}`;

            s.sessionStr = fullId;
            s.status     = 'connected';

            const jid = `${cleaned}@s.whatsapp.net`;

            // Message 1 — welcome
            try {
              const thumb = path.resolve('./assets/bot-thumb.png');
              if (fs.existsSync(thumb)) {
                await sock.sendMessage(jid, {
                  image  : fs.readFileSync(thumb),
                  caption: buildWelcomeText(),
                });
              } else {
                await sock.sendMessage(jid, { text: buildWelcomeText() });
              }
            } catch (e) {
              console.error(`[${sessionId}] Welcome error:`, e.message);
            }

            await new Promise(r => setTimeout(r, 2000));

            // Message 2 — SESSION_ID
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

        // Connection بند ہوئی
        if (connection === 'close') {
          const code = lastDisconnect?.error?.output?.statusCode;
          console.log(`[${sessionId}] Closed. code: ${code} | status: ${s.status}`);
          if (s.status === 'connected') return;
          if (s.status === 'code_ready') {
            console.log(`[${sessionId}] Waiting for user to enter code...`);
            return;
          }
          s.status = 'failed';
        }
      });

    } catch (e) {
      console.error(`[${sessionId}] Fatal:`, e.message);
      const s = sessions.get(sessionId);
      if (s) s.status = 'failed';
    }
  })();
}

// ── POST /pair ───────────────────────────────────────────────────
app.post('/pair', (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Phone number required' });

  const cleaned = number.replace(/[^0-9]/g, '');
  if (cleaned.length < 10) return res.status(400).json({ error: 'Invalid number' });

  const sessionId = makeId();

  sessions.set(sessionId, {
    sock      : null,
    status    : 'connecting',
    code      : null,
    sessionStr: null,
    number    : cleaned,
  });

  runPairing(cleaned, sessionId);

  return res.json({ sessionId, status: 'connecting' });
});

// ── GET /status/:sessionId ───────────────────────────────────────
app.get('/status/:sessionId', (req, res) => {
  const s = sessions.get(req.params.sessionId);
  if (!s) return res.status(404).json({ error: 'Session not found' });

  if (s.status === 'connected' && s.sessionStr) {
    setTimeout(() => {
      try { fs.rmSync(`./sessions/${req.params.sessionId}`, { recursive: true, force: true }); } catch (_) {}
      sessions.delete(req.params.sessionId);
    }, 60000);
    return res.json({ status: 'connected', sessionId: s.sessionStr });
  }

  return res.json({ status: s.status, code: s.code || null });
});

// ── Health ────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({
  status  : 'ok',
  bot     : 'YOUSAF-MD-PAIRING',
  sessions: sessions.size,
}));

// ── Frontend ──────────────────────────────────────────────────────
app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 YOUSAF-MD-PAIRING running on port ${PORT}`);
});
