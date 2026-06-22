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
const VERSION = 'v8 — إشعارات العروض';
let ready = false;
let lastQr = null;
let qrV = 0;
const wait = ms => new Promise(r => setTimeout(r, ms));

console.log('\n╔══════════════════════════════════════╗');
console.log('   بوت أهداف — ' + VERSION);
console.log('╚══════════════════════════════════════╝\n');

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', qr => {
  lastQr = qr; ready = false; qrV++;
  console.log(`\n📱 باركود #${qrV} — افتح واتساب → الأجهزة المرتبطة → ربط جهاز، وامسح:\n`);
  qrcode.generate(qr, { small: true });
});
client.on('loading_screen', (p, m) => console.log(`⏳ تحميل واتساب: ${p}% ${m || ''}`));
client.on('change_state', s => console.log('↻ تغيّر الحالة إلى:', s));
client.on('authenticated', () => console.log('\n✅✅ تم مسح الباركود والمصادقة — جاري التحميل…\n'));
client.on('ready', () => { ready = true; lastQr = null; console.log('\n🤖 البوت جاهز — يستقبل طلبات إنشاء القروبات\n'); });
client.on('auth_failure', m => console.error('✗ فشل المصادقة:', m));
client.on('disconnected', r => { ready = false; console.log('✗ انقطع الاتصال:', r); });
client.initialize();

const app = express();
app.use(cors());
app.use(express.json());

// حالة البوت
app.get('/status', (req, res) => res.json({ ready, hasQr: !!lastQr, qrV, version: VERSION }));

// الباركود كصورة PNG — يعرضه الموقع
app.get('/qr', async (req, res) => {
  if (ready) return res.status(204).end();              // مربوط — لا حاجة لباركود
  if (!lastQr) return res.status(404).json({ error: 'لا يوجد باركود بعد' });
  try {
    const png = await QRImage.toBuffer(lastQr, { width: 320, margin: 1, color: { dark: '#1d1d22', light: '#ffffff' } });
    res.set('Cache-Control', 'no-store').type('png').send(png);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// إنشاء قروب
app.post('/create-group', async (req, res) => {
  try {
    if (!ready) return res.status(503).json({ ok: false, error: 'البوت مو جاهز — امسح الـQR أول' });

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

// قائمة القروبات (لاختيار قروب الطلبات/التعديلات/المعتمد)
app.get('/groups', async (req, res) => {
  if (!ready) return res.status(503).json({ ok: false, error: 'البوت مو جاهز' });
  try {
    const chats = await client.getChats();
    const groups = chats.filter(c => c.isGroup).map(c => ({ id: c.id._serialized, name: c.name || '(بدون اسم)' }));
    res.json({ ok: true, groups });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// إرسال رسالة لقروب/جهة
app.post('/send-message', async (req, res) => {
  try {
    if (!ready) return res.status(503).json({ ok: false, error: 'البوت مو جاهز' });
    const { chatId, text, media } = req.body || {};
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId مطلوب' });
    if (media && media.data) {
      const m = new MessageMedia(media.mimetype || 'application/octet-stream', media.data, media.filename || 'ملف');
      await client.sendMessage(chatId, m, { caption: text || '' });
      console.log(`📎 أُرسل ملف إلى ${chatId}`);
    } else {
      if (!text) return res.status(400).json({ ok: false, error: 'text مطلوب' });
      await client.sendMessage(chatId, text);
      console.log(`✉️ أُرسلت رسالة إلى ${chatId}`);
    }
    res.json({ ok: true });
  } catch (e) { console.error('فشل الإرسال:', e.message); res.status(500).json({ ok: false, error: e.message }); }
});

// فصل الرقم الحالي وإظهار باركود جديد (لربط رقم ثاني)
app.post('/relink', (req, res) => {
  res.json({ ok: true });
  console.log('↻ طلب ربط رقم ثاني — مسح الجلسة وإعادة التشغيل…');
  setTimeout(async () => {
    try { await client.logout().catch(() => {}); } catch {}
    try { fs.rmSync(path.join(__dirname, '.wwebjs_auth'), { recursive: true, force: true }); } catch {}
    process.exit(0);   // systemd يعيد التشغيل → جلسة نظيفة → باركود جديد
  }, 600);
});

app.listen(PORT, () => console.log(`🌐 خادم البوت يعمل على http://localhost:${PORT}`));
