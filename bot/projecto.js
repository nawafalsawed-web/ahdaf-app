/* ===================================================================
   مزامنة Projecto — تسحب المشاريع واللوحات والمهام عبر API الداخلي
   المصادقة عبر هيدرز (autkey / privatekey / userid / teamid) — بدون كوكي.
   الأسرار في projecto.config.json (متجاهَل في git). النتيجة في projecto-data.json.
=================================================================== */
const fs = require('fs');
const path = require('path');
const https = require('https');

const API = 'projecto.app-api-controller.com';
const CFG = path.join(__dirname, 'projecto.config.json');
const DATA = path.join(__dirname, 'projecto-data.json');

const loadCfg = () => { try { return JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch { return {}; } };
const saveCfg = c => fs.writeFileSync(CFG, JSON.stringify(c, null, 2));
const loadData = () => { try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch { return { projects: [], lastSync: 0, error: null, stats: { projects: 0, tasks: 0 } }; } };
const isConnected = () => { const c = loadCfg(); return !!(c.autkey && c.privatekey && c.userid && c.teamid); };

// استخراج المفاتيح من أمر cURL منسوخ من المتصفح (Copy as cURL)
function parseCurl(text) {
  text = String(text || '');
  const g = re => { const m = text.match(re); return m ? m[1].trim() : ''; };
  return {
    autkey: g(/autkey:\s*([0-9a-z]+)/i),
    privatekey: g(/privatekey:\s*([0-9a-z]+)/i),
    userid: g(/userid:\s*(\d+)/i),
    teamid: g(/[^a-z]teamid:\s*(\d+)/i) || g(/^teamid:\s*(\d+)/im),
  };
}

function apiGet(pathname, cfg, containerId) {
  return new Promise((resolve, reject) => {
    const headers = {
      autkey: cfg.autkey, privatekey: cfg.privatekey,
      userid: String(cfg.userid), teamid: String(cfg.teamid),
      containerteamid: String(cfg.teamid), generalpermession: '2',
      containertaskmanager: 'true',
      origin: 'https://app.projecto.app', referer: 'https://app.projecto.app/',
      urlheader: 'https://app.projecto.app',
      accept: 'text/html, */*; q=0.01',
    };
    if (containerId != null) headers.containerid = String(containerId);
    const req = https.request({ host: API, path: pathname, method: 'GET', headers }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        if (res.statusCode === 200) { try { resolve(JSON.parse(buf)); } catch { reject(new Error('رد غير صالح من بروجيكتو')); } }
        else if (res.statusCode === 401 || res.statusCode === 403) reject(new Error('AUTH'));
        else reject(new Error('HTTP ' + res.statusCode));
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('انتهت مهلة الاتصال')));
    req.end();
  });
}

const stripHtml = s => String(s || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\n{3,}/g, '\n\n').trim();

let syncing = false;

async function syncProjecto() {
  if (syncing) return loadData().stats;
  const cfg = loadCfg();
  if (!cfg.autkey || !cfg.privatekey) throw new Error('بروجيكتو غير مربوط');
  syncing = true;
  const t0 = Date.now();
  try {
    const tree = await apiGet('/api/Hierarchy/GetUserTree?currentTicks=0', cfg);
    const conts = (tree.ContainerHierarchy || []).filter(c => c.Dv === 'board' || c.Dv === 'list');
    const projects = [];
    for (const c of conts) {
      const proj = {
        id: c.Id, name: c.Nm, color: c.Cl || '#7a7a85',
        total: c.Tt || 0, done: c.Dt || 0, deadline: c.Ed || null,
        type: c.Dv, boards: [],
      };
      if (c.Tt > 0) {
        try {
          const bd = await apiGet(`/api/Board/LoadContainerBoards?containerId=${c.Id}&lang=en&showHidden=false`, cfg, c.Id);
          const boards = bd.BoardTBList || [];
          // مهام كل لوحة بالتوازي (أسرع، وعدد اللوحات صغير)
          const loaded = await Promise.all(boards.map(async b => {
            try {
              const td = await apiGet(`/api/Board/LoadTasksByBoardCustomized?container=${c.Id}&ruleid=2&userid=${cfg.userid}&boardId=${b.Id}`, cfg, c.Id);
              const tasks = (td.TasksList || []).map(t => ({
                id: t.Id, title: t.Title || '(بدون عنوان)', desc: stripHtml(t.Description),
                start: t.StartDate || null, end: t.EndDate || null,
                status: t.StatusFk, done: t.StatusFk === 5,
                priority: t.Priority, comments: t.CommentsCount || 0, files: t.FilesCount || 0,
              }));
              return { id: b.Id, name: b.BoardName || '', tasks };
            } catch { return { id: b.Id, name: b.BoardName || '', tasks: [] }; }
          }));
          proj.boards = loaded;
        } catch (e) { proj.boardError = e.message; }
      }
      projects.push(proj);
    }
    const stats = {
      projects: projects.filter(p => p.total > 0).length,
      tasks: projects.reduce((s, p) => s + p.boards.reduce((a, b) => a + b.tasks.length, 0), 0),
    };
    const data = { projects, lastSync: Date.now(), error: null, stats, took: Date.now() - t0 };
    fs.writeFileSync(DATA, JSON.stringify(data));
    console.log(`🔄 مزامنة بروجيكتو: ${stats.projects} مشروع، ${stats.tasks} مهمة (${((Date.now() - t0) / 1000).toFixed(0)}ث)`);
    return stats;
  } catch (e) {
    const prev = loadData();
    const msg = e.message === 'AUTH' ? 'انتهت صلاحية الربط' : e.message;
    fs.writeFileSync(DATA, JSON.stringify({ ...prev, error: msg, errorAt: Date.now() }));
    console.error('✗ فشل مزامنة بروجيكتو:', msg);
    throw new Error(msg);
  } finally { syncing = false; }
}

module.exports = { syncProjecto, loadData, loadCfg, saveCfg, parseCurl, isConnected, CFG };
