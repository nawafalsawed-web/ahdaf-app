/* ===================================================================
   السوشال — نشر وجدولة وتراكر لحسابات أهداف عبر Ayrshare
   Ayrshare معتمد عند المنصات (ميتا/تيك توك/سناب/يوتيوب/لينكدإن)، فما نحتاج مراجعات.
   الأسرار في social.config.json (متجاهَل في git): { apiKey, xKey?, xSecret? }
   إكس من مارس 2026 يحتاج مفاتيح مطوّر إكس الخاصة فيك (xKey/xSecret).
=================================================================== */
const fs = require('fs');
const path = require('path');

const API = process.env.AYRSHARE_API || 'https://api.ayrshare.com/api';
const CFG = path.join(__dirname, 'social.config.json');
const STATS = path.join(__dirname, 'social-stats.json');
const PLATFORMS = ['instagram', 'tiktok', 'snapchat', 'twitter', 'linkedin', 'youtube', 'facebook', 'threads'];

const loadCfg = () => { try { return JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch { return {}; } };
const saveCfg = c => fs.writeFileSync(CFG, JSON.stringify(c, null, 2));
const isConnected = () => !!loadCfg().apiKey;

async function call(method, p, body) {
  const c = loadCfg();
  if (!c.apiKey) throw new Error('السوشال غير مربوط — المشرف يحط مفتاح Ayrshare من الإعدادات');
  const headers = { Authorization: 'Bearer ' + c.apiKey, 'Content-Type': 'application/json' };
  if (c.xKey && c.xSecret) { headers['X-Twitter-OAuth1-Api-Key'] = c.xKey; headers['X-Twitter-OAuth1-Api-Secret'] = c.xSecret; }
  const r = await fetch(API + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok && d.status !== 'scheduled') {
    const msg = (d.errors && d.errors.map(e => `${e.platform || ''}: ${e.message}`).join(' · ')) || d.message || ('Ayrshare ' + r.status);
    const err = new Error(msg); err.data = d; throw err;
  }
  return d;
}

const account = () => call('GET', '/user');
const history = () => call('GET', '/history?lastDays=0&limit=100').then(d => d.history || []);
const remove = id => call('DELETE', '/post', { id });

function publish({ text, platforms, mediaUrls, scheduleDate, youtubeTitle }) {
  platforms = (platforms || []).filter(p => PLATFORMS.includes(p));
  if (!platforms.length) throw new Error('اختر منصة وحدة على الأقل');
  const body = { post: text || '', platforms };
  if (mediaUrls && mediaUrls.length) body.mediaUrls = mediaUrls;
  if (scheduleDate) body.scheduleDate = new Date(scheduleDate).toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (platforms.includes('youtube')) body.youTubeOptions = { title: (youtubeTitle || text || 'أهداف').slice(0, 100) };
  return call('POST', '/post', body);
}

// إحصائيات الحسابات — كاش ساعة (Ayrshare نفسه يحدّث كل كم ساعة، فما له داعي نضغطه)
async function stats(force) {
  let cache; try { cache = JSON.parse(fs.readFileSync(STATS, 'utf8')); } catch { cache = null; }
  if (!force && cache && Date.now() - cache.ts < 3600e3) return cache;
  const acc = await account();
  const active = (acc.activeSocialAccounts || []).filter(p => PLATFORMS.includes(p));
  const data = active.length ? await call('POST', '/analytics/social', { platforms: active }) : {};
  const out = { ts: Date.now(), accounts: acc.displayNames || [], active, analytics: data };
  try { fs.writeFileSync(STATS, JSON.stringify(out)); } catch {}
  return out;
}

module.exports = { loadCfg, saveCfg, isConnected, account, history, remove, publish, stats, PLATFORMS };
