/* ===================================================================
   بوت أهداف · إنشاء قروبات واتساب تلقائياً
   يربط برقمك مرة وحدة (مسح QR)، ويستقبل طلبات من التطبيق لإنشاء قروب.
   ⚠️ يستخدم مكتبة غير رسمية — على مسؤوليتك (قد يُحظر الرقم).
=================================================================== */
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const QRImage = require('qrcode');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const PORT = process.env.PORT || 3000;
const VERSION = 'v10 — ملفات على السيرفر';
const wait = ms => new Promise(r => setTimeout(r, ms));

console.log('\n╔══════════════════════════════════════╗');
console.log('   بوت أهداف — ' + VERSION);
console.log('╚══════════════════════════════════════╝\n');

// جلسة واتساب مستقلة لكل عضو (مفتاحها البريد) — كل عضو يربط رقمه ويشوف قروباته
const sessions = new Map(); // email -> { client, ready, lastQr, qrV }
const sid = email => 'u_' + String(email).replace(/[^a-z0-9]/gi, '_').slice(0, 40);

function getSession(email) {
  let s = sessions.get(email);
  if (s) return s;
  s = { client: null, ready: false, lastQr: null, qrV: 0 };
  sessions.set(email, s);
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: sid(email), dataPath: path.join(__dirname, '.wwebjs_auth') }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
  });
  s.client = client;
  client.on('qr', qr => { s.lastQr = qr; s.ready = false; s.qrV++; console.log(`📱 باركود #${s.qrV} لـ ${email}`); });
  client.on('loading_screen', p => console.log(`⏳ ${email}: ${p}%`));
  client.on('authenticated', () => console.log(`✅ مصادقة: ${email}`));
  client.on('ready', () => { s.ready = true; s.lastQr = null; console.log(`🤖 جاهز: ${email}`); });
  client.on('auth_failure', m => console.error(`✗ فشل مصادقة ${email}:`, m));
  client.on('disconnected', r => { s.ready = false; console.log(`✗ انقطع ${email}:`, r); });
  client.initialize().catch(e => console.error(`init error ${email}:`, e.message));
  console.log(`+ جلسة جديدة لـ ${email}`);
  return s;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '45mb' }));

// ===================== المصادقة (تسجيل الدخول) =====================
const crypto = require('crypto');
const TEAM_FILE = path.join(__dirname, 'team.json');
const SECRET_FILE = path.join(__dirname, '.auth_secret');
let AUTH_SECRET;
try { AUTH_SECRET = fs.readFileSync(SECRET_FILE, 'utf8'); }
catch { AUTH_SECRET = crypto.randomBytes(32).toString('hex'); try { fs.writeFileSync(SECRET_FILE, AUTH_SECRET); } catch {} }
const normEmail = e => String(e || '').trim().toLowerCase();
const normPhone = p => String(p || '').replace(/\D/g, '').replace(/^0+/, '');
const loadTeam = () => { try { return JSON.parse(fs.readFileSync(TEAM_FILE, 'utf8')); } catch { return []; } };
const saveTeam = t => fs.writeFileSync(TEAM_FILE, JSON.stringify(t, null, 2));
function makeToken(email) {
  const p = Buffer.from(JSON.stringify({ e: email, exp: Date.now() + 30 * 86400000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', AUTH_SECRET).update(p).digest('base64url');
}
function tokenEmail(tok) {
  if (!tok || !tok.includes('.')) return null;
  const [p, sig] = tok.split('.');
  if (crypto.createHmac('sha256', AUTH_SECRET).update(p).digest('base64url') !== sig) return null;
  try { const d = JSON.parse(Buffer.from(p, 'base64url').toString()); return d.exp > Date.now() ? d.e : null; } catch { return null; }
}
function reqUser(req) {
  const m = (req.headers.cookie || '').match(/(?:^|; )ahdaf_session=([^;]+)/);
  const email = m ? tokenEmail(decodeURIComponent(m[1])) : null;
  if (!email) return null;
  return loadTeam().find(u => normEmail(u.email) === email) || null;
}
function requireAuth(req, res, next) { const u = reqUser(req); if (!u) return res.status(401).json({ ok: false, error: 'سجّل الدخول أول' }); req.user = u; next(); }

app.post('/auth/login', (req, res) => {
  const email = normEmail(req.body && req.body.email), phone = normPhone(req.body && req.body.phone);
  const u = loadTeam().find(x => normEmail(x.email) === email && normPhone(x.phone) === phone);
  if (!u) return res.status(401).json({ ok: false, error: 'البريد أو رقم الجوال غير صحيح' });
  res.setHeader('Set-Cookie', `ahdaf_session=${makeToken(email)}; Path=/; Max-Age=${30 * 86400}; HttpOnly; Secure; SameSite=Lax`);
  res.json({ ok: true, user: { email: u.email, name: u.name || '', admin: !!u.admin } });
});
app.get('/auth/me', (req, res) => { const u = reqUser(req); if (!u) return res.status(401).json({ ok: false }); res.json({ ok: true, user: { email: u.email, name: u.name || '', admin: !!u.admin } }); });
app.post('/auth/logout', (req, res) => { res.setHeader('Set-Cookie', 'ahdaf_session=; Path=/; Max-Age=0'); res.json({ ok: true }); });
app.get('/auth/team', requireAuth, (req, res) => { if (!req.user.admin) return res.status(403).json({ ok: false }); res.json({ ok: true, team: loadTeam().map(u => ({ email: u.email, phone: u.phone, name: u.name || '', admin: !!u.admin })) }); });
app.post('/auth/team/add', requireAuth, (req, res) => {
  if (!req.user.admin) return res.status(403).json({ ok: false, error: 'للمشرف فقط' });
  const email = normEmail(req.body && req.body.email), phone = normPhone(req.body && req.body.phone), name = (req.body && req.body.name) || '', admin = !!(req.body && req.body.admin);
  if (!email || !phone) return res.status(400).json({ ok: false, error: 'البريد والجوال مطلوبين' });
  const team = loadTeam();
  if (team.find(x => normEmail(x.email) === email)) { team.find(x => normEmail(x.email) === email).phone = phone; saveTeam(team); return res.json({ ok: true, updated: true }); }
  team.push({ email, phone, name, admin }); saveTeam(team); res.json({ ok: true });
});
app.post('/auth/team/remove', requireAuth, (req, res) => {
  if (!req.user.admin) return res.status(403).json({ ok: false });
  const email = normEmail(req.body && req.body.email);
  if (email === normEmail(req.user.email)) return res.status(400).json({ ok: false, error: 'ما تقدر تحذف نفسك' });
  saveTeam(loadTeam().filter(x => normEmail(x.email) !== email)); res.json({ ok: true });
});

// حالة جلسة العضو الحالي
app.get('/status', requireAuth, (req, res) => {
  const s = getSession(req.user.email);
  res.json({ ready: s.ready, hasQr: !!s.lastQr, qrV: s.qrV, version: VERSION });
});

// باركود العضو الحالي
app.get('/qr', requireAuth, async (req, res) => {
  const s = getSession(req.user.email);
  if (s.ready) return res.status(204).end();
  if (!s.lastQr) return res.status(404).json({ error: 'لا يوجد باركود بعد' });
  try {
    const png = await QRImage.toBuffer(s.lastQr, { width: 320, margin: 1, color: { dark: '#1d1d22', light: '#ffffff' } });
    res.set('Cache-Control', 'no-store').type('png').send(png);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// إنشاء قروب (من رقم العضو الحالي)
app.post('/create-group', requireAuth, async (req, res) => {
  try {
    const s = getSession(req.user.email);
    const client = s.client;
    if (!s.ready) return res.status(503).json({ ok: false, error: 'واتسابك مو مربوط — اربط رقمك من صفحة الربط' });

    const { name, participants, picture } = req.body || {};
    if (!name) return res.status(400).json({ ok: false, error: 'اسم القروب مطلوب' });

    // تحويل الأرقام لصيغة واتساب + التحقق أنها مسجّلة
    const ids = [];
    const skipped = [];
    for (const raw of (participants || [])) {
      const num = String(raw).replace(/\D/g, '').replace(/^0+/, '');
      if (!num) continue;
      try {
        const numberId = await client.getNumberId(num);
        if (numberId) ids.push(numberId._serialized);
        else skipped.push(num);
      } catch { skipped.push(num); }
    }

    console.log(`↳ إنشاء قروب «${name}» مع ${ids.length} عضو…`);
    const result = await client.createGroup(name, ids);

    // استخراج معرّف القروب (يختلف بين الإصدارات)
    let gid = null;
    if (result && result.gid) gid = result.gid._serialized || result.gid;
    else if (typeof result === 'string') gid = result;

    if (!gid) return res.json({ ok: true, gid: null, inviteLink: null, skipped, note: 'أُنشئ القروب لكن تعذّر جلب المعرّف' });

    // ننتظر حتى يجهز القروب في واتساب
    await wait(3000);
    let chat = await client.getChatById(gid);

    // ضبط صورة القروب (شعار العميل + أهداف) — setPicture يرجّع true/false
    let pictureSet = false, pictureError = null;
    if (picture) {
      const m = String(picture).match(/^data:(.+);base64,(.*)$/);
      if (!m) { pictureError = 'صيغة الصورة غير صالحة'; }
      else if (typeof chat.setPicture !== 'function') { pictureError = 'setPicture غير مدعومة في هذا الإصدار'; }
      else {
        const media = new MessageMedia(m[1], m[2]);
        // القروب الجديد يحتاج وقت حتى يجهّز "صورة البروفايل" — نعيد المحاولة
        for (let attempt = 1; attempt <= 6 && !pictureSet; attempt++) {
          try {
            chat = await client.getChatById(gid);            // إعادة جلب القروب كل محاولة
            const ok = await chat.setPicture(media);         // ← نتحقق من القيمة المُرجعة
            if (ok === true) { pictureSet = true; console.log(`✓ تم ضبط صورة القروب (محاولة ${attempt})`); }
            else { pictureError = 'القروب لسه ما جهّز للصورة (canSet=false)'; console.log(`محاولة ${attempt}: القروب ما جهز بعد، ننتظر…`); await wait(3000); }
          } catch (e) {
            pictureError = e.message;
            console.log(`محاولة ${attempt} فشلت:`, e.message);
            await wait(2500);
          }
        }
      }
    }

    // جلب رابط الدعوة
    let inviteLink = null;
    try {
      const code = await chat.getInviteCode();
      inviteLink = 'https://chat.whatsapp.com/' + code;
    } catch (e) { console.log('تعذّر جلب رابط الدعوة:', e.message); }

    console.log(`✓ تم: ${inviteLink || gid}${picture ? (pictureSet ? ' | الصورة: ✓' : ' | الصورة: ✗') : ''}`);
    res.json({ ok: true, gid, inviteLink, added: ids.length, skipped, pictureSet, pictureError });
  } catch (err) {
    console.error('خطأ:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// قروبات العضو الحالي فقط
app.get('/groups', requireAuth, async (req, res) => {
  const s = getSession(req.user.email);
  if (!s.ready) return res.status(503).json({ ok: false, error: 'واتسابك مو مربوط' });
  try {
    const chats = await s.client.getChats();
    const groups = chats.filter(c => c.isGroup).map(c => ({ id: c.id._serialized, name: c.name || '(بدون اسم)' }));
    res.json({ ok: true, groups });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// إرسال رسالة من رقم العضو الحالي
app.post('/send-message', requireAuth, async (req, res) => {
  try {
    const s = getSession(req.user.email);
    if (!s.ready) return res.status(503).json({ ok: false, error: 'واتسابك مو مربوط' });
    const { chatId, text, media } = req.body || {};
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId مطلوب' });
    if (media && media.data) {
      const m = new MessageMedia(media.mimetype || 'application/octet-stream', media.data, media.filename || 'ملف');
      await s.client.sendMessage(chatId, m, { caption: text || '' });
    } else {
      if (!text) return res.status(400).json({ ok: false, error: 'text مطلوب' });
      await s.client.sendMessage(chatId, text);
    }
    res.json({ ok: true });
  } catch (e) { console.error('فشل الإرسال:', e.message); res.status(500).json({ ok: false, error: e.message }); }
});

// فصل رقم العضو الحالي وإظهار باركود جديد (يربط رقم ثاني) — ما يأثر على بقية الأعضاء
app.post('/relink', requireAuth, async (req, res) => {
  const email = req.user.email;
  res.json({ ok: true });
  console.log(`↻ ${email}: فصل الرقم وإعادة الربط…`);
  const s = sessions.get(email);
  if (s && s.client) { try { await s.client.logout().catch(() => {}); } catch {} try { await s.client.destroy(); } catch {} }
  sessions.delete(email);
  try { fs.rmSync(path.join(__dirname, '.wwebjs_auth', 'session-' + sid(email)), { recursive: true, force: true }); } catch {}
  setTimeout(() => getSession(email), 1500);   // جلسة نظيفة → باركود جديد
});

// ===================== تخزين ملفات العروض (على السيرفر، مشتركة للفريق) =====================
const FILES_DIR = process.env.FILES_DIR || '/var/ahdaf-files';
try { fs.mkdirSync(FILES_DIR, { recursive: true }); } catch {}
const FILES_INDEX = path.join(FILES_DIR, '_index.json');
const loadFiles = () => { try { return JSON.parse(fs.readFileSync(FILES_INDEX, 'utf8')); } catch { return []; } };
const saveFiles = f => fs.writeFileSync(FILES_INDEX, JSON.stringify(f, null, 2));
const cleanId = s => String(s || '').replace(/[^a-z0-9]/gi, '');

app.get('/files', requireAuth, (req, res) => res.json({ ok: true, files: loadFiles() }));

app.post('/files', requireAuth, (req, res) => {
  try {
    const { name, type, data } = req.body || {};
    if (!name || !data) return res.status(400).json({ ok: false, error: 'الملف ناقص' });
    const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const buf = Buffer.from(data, 'base64');
    fs.writeFileSync(path.join(FILES_DIR, id), buf);
    const files = loadFiles();
    const meta = { id, name, type: type || 'application/octet-stream', size: buf.length, by: req.user.email, ts: Date.now() };
    files.unshift(meta); saveFiles(files);
    console.log(`📁 ملف مرفوع: ${name} (${buf.length} bytes) بواسطة ${req.user.email}`);
    res.json({ ok: true, file: meta });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/files/:id', requireAuth, (req, res) => {
  const id = cleanId(req.params.id);
  const meta = loadFiles().find(f => f.id === id);
  const p = path.join(FILES_DIR, id);
  if (!meta || !fs.existsSync(p)) return res.status(404).end();
  res.setHeader('Content-Type', meta.type || 'application/octet-stream');
  const disp = req.query.dl ? 'attachment' : 'inline';   // dl=1 → تنزيل، وإلا عرض
  res.setHeader('Content-Disposition', `${disp}; filename*=UTF-8''${encodeURIComponent(meta.name)}`);
  fs.createReadStream(p).pipe(res);
});

app.post('/files/remove', requireAuth, (req, res) => {
  const id = cleanId(req.body && req.body.id);
  try { fs.unlinkSync(path.join(FILES_DIR, id)); } catch {}
  saveFiles(loadFiles().filter(f => f.id !== id));
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`🌐 خادم البوت يعمل على http://localhost:${PORT}`));
