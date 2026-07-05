/* ===================================================================
   أهداف · تطبيق إدارة العمل  —  المرحلة 1: قروبات العملاء
   البيانات محفوظة محلياً في المتصفح (localStorage).
=================================================================== */

const DB_KEY = 'ahdaf_app_v1';
const AVATAR_COLORS = ['#4C0192','#353F40','#b8893b','#1f9d55','#c0392b','#2c6fbb','#8e44ad','#d35400'];
const SECTORS = ['تجارة','مطاعم','عقار','صحة','تعليم','تقنية','أزياء','سياحة','خدمات','جهة حكومية','أخرى'];
const DIAL_CODES = ['+966','+971','+973','+974','+965','+968','+20','+962','+90'];

/* ---------- طبقة التخزين ---------- */
const store = {
  read(){
    try{ const d = JSON.parse(localStorage.getItem(DB_KEY)) || {}; return {clients:d.clients||[], settings:d.settings||{}, tasks:d.tasks||[], proposals:d.proposals||[], files:d.files||[]}; }
    catch{ return {clients:[],settings:{},tasks:[],proposals:[],files:[]}; }
  },
  write(data){ localStorage.setItem(DB_KEY, JSON.stringify(data)); },
  get clients(){ return this.read().clients; },
  addClient(c){ const d=this.read(); d.clients.unshift(c); this.write(d); },
  updateClient(id, patch){ const d=this.read(); const i=d.clients.findIndex(x=>x.id===id); if(i>-1){d.clients[i]={...d.clients[i],...patch}; this.write(d);} },
  removeClient(id){ const d=this.read(); d.clients=d.clients.filter(x=>x.id!==id); this.write(d); },
  get settings(){ return this.read().settings || {}; },
  setSettings(s){ const d=this.read(); d.settings={...(d.settings||{}), ...s}; this.write(d); },
  get tasks(){ return this.read().tasks; },
  addTask(t){ const d=this.read(); d.tasks.unshift(t); this.write(d); },
  updateTask(id, patch){ const d=this.read(); const i=d.tasks.findIndex(x=>x.id===id); if(i>-1){d.tasks[i]={...d.tasks[i],...patch}; this.write(d);} },
  removeTask(id){ const d=this.read(); d.tasks=d.tasks.filter(x=>x.id!==id); this.write(d); },
  get proposals(){ return this.read().proposals; },
  addProposal(p){ const d=this.read(); d.proposals.unshift(p); this.write(d); },
  updateProposal(id, patch){ const d=this.read(); const i=d.proposals.findIndex(x=>x.id===id); if(i>-1){d.proposals[i]={...d.proposals[i],...patch}; this.write(d);} },
  removeProposal(id){ const d=this.read(); d.proposals=d.proposals.filter(x=>x.id!==id); this.write(d); },
  get files(){ return this.read().files; },
  addFile(f){ const d=this.read(); d.files.unshift(f); this.write(d); },
  removeFile(id){ const d=this.read(); d.files=d.files.filter(x=>x.id!==id); this.write(d); },
};

/* ---------- البوت (الأتمتة) ---------- */
const bot = {
  url(){
    const local = /^(localhost|127\.|192\.168\.|10\.|0\.0\.0\.0)/.test(location.hostname);
    const saved = store.settings.botUrl ? store.settings.botUrl.replace(/\/$/,'') : '';
    // نتجاهل رابطاً محفوظاً يشير لـ localhost/منفذ 3000 لما نكون على موقع منشور (بقايا تطوير)
    const savedIsLocal = /localhost|127\.0|:3000/i.test(saved);
    if(saved && !(!local && savedIsLocal)) return saved;
    // محلياً: بوت الجهاز · على الموقع المنشور: بوت السيرفر على نفس الدومين
    return local ? 'http://localhost:3000' : location.origin + '/bot';
  },
  async status(){
    const r = await fetch(this.url()+'/status', {cache:'no-store'});
    return r.json();
  },
  async createGroup(name, participants, picture){
    const r = await fetch(this.url()+'/create-group', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({name, participants, picture})
    });
    const data = await r.json().catch(()=>({ok:false,error:'رد غير صالح من البوت'}));
    if(!r.ok || !data.ok) throw new Error(data.error || 'فشل إنشاء القروب');
    return data;
  },
  async groups(){
    const r = await fetch(this.url()+'/groups', {cache:'no-store'});
    const d = await r.json().catch(()=>({ok:false}));
    if(!r.ok || !d.ok) throw new Error(d.error || 'تعذّر جلب القروبات');
    return d.groups || [];
  },
  async sendMessage(chatId, text, media){
    const r = await fetch(this.url()+'/send-message', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({chatId, text, media})
    });
    const d = await r.json().catch(()=>({ok:false}));
    if(!r.ok || !d.ok) throw new Error(d.error || 'فشل الإرسال');
    return d;
  }
};
function botErrMsg(e){
  return /Failed to fetch|NetworkError|load failed|ERR_/i.test(e.message||'')
    ? 'ما قدرت أوصل للبوت. تأكد إنه شغّال (npm start) ومربوط، والرابط صح في الإعدادات ⚙️'
    : (e.message || 'خطأ غير متوقع');
}

/* ---------- تخزين الملفات (IndexedDB) ---------- */
const filedb = {
  _p:null,
  open(){
    if(this._p) return this._p;
    this._p = new Promise((res,rej)=>{
      const r = indexedDB.open('ahdaf_files', 1);
      r.onupgradeneeded = e => { const db=e.target.result; if(!db.objectStoreNames.contains('files')) db.createObjectStore('files'); };
      r.onsuccess = e => res(e.target.result);
      r.onerror = () => rej(r.error);
    });
    return this._p;
  },
  async put(id, blob){ const db=await this.open(); return new Promise((res,rej)=>{ const tx=db.transaction('files','readwrite'); tx.objectStore('files').put(blob,id); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); },
  async get(id){ const db=await this.open(); return new Promise((res,rej)=>{ const tx=db.transaction('files','readonly'); const rq=tx.objectStore('files').get(id); rq.onsuccess=()=>res(rq.result); rq.onerror=()=>rej(rq.error); }); },
  async del(id){ const db=await this.open(); return new Promise((res)=>{ const tx=db.transaction('files','readwrite'); tx.objectStore('files').delete(id); tx.oncomplete=()=>res(); tx.onerror=()=>res(); }); },
};
const newFileId = () => 'f'+Date.now().toString(36)+Math.floor(Math.random()*1e5).toString(36);
function fmtBytes(n){ if(!n) return ''; if(n<1024) return n+' B'; if(n<1048576) return (n/1024).toFixed(0)+' KB'; return (n/1048576).toFixed(1)+' MB'; }
function fileIcon(type){ type=type||''; if(/pdf/i.test(type)) return '📄'; if(/image/i.test(type)) return '🖼️'; if(/word|document/i.test(type)) return '📝'; if(/sheet|excel|xls/i.test(type)) return '📊'; if(/zip|rar/i.test(type)) return '🗜️'; return '📎'; }
function blobToBase64(blob){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(',')[1]); r.onerror=rej; r.readAsDataURL(blob); }); }
async function openStoredFile(id){
  try{ const blob=await filedb.get(id); if(!blob){ toast('الملف غير موجود'); return; } const url=URL.createObjectURL(blob); window.open(url,'_blank'); setTimeout(()=>URL.revokeObjectURL(url),60000); }
  catch{ toast('تعذّر فتح الملف'); }
}
// يفتح منتقي ملفات ويرجّع File
function pickFile(accept){
  return new Promise(res=>{ const inp=document.createElement('input'); inp.type='file'; if(accept) inp.accept=accept; inp.onchange=()=>res(inp.files[0]||null); inp.click(); });
}

/* ---------- أدوات مساعدة ---------- */
const uid = () => 'c' + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36);
const $ = (s,r=document)=>r.querySelector(s);
const esc = s => (s||'').replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
function initials(name){
  const p = (name||'').trim().split(/\s+/);
  return ((p[0]?.[0]||'') + (p[1]?.[0]||'')).toUpperCase() || '؟';
}
function colorFor(c){ return c.color || AVATAR_COLORS[(c.name||'').length % AVATAR_COLORS.length]; }
function waLink(client){
  const num = (client.dial||'+966').replace('+','') + (client.phone||'').replace(/\D/g,'').replace(/^0+/,'');
  const msg = encodeURIComponent(`مرحباً ${client.name} 👋، معك فريق أهداف`);
  return `https://wa.me/${num}?text=${msg}`;
}

/* ---------- أدوات الصور ---------- */
function loadImg(src){
  return new Promise((res,rej)=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=rej; i.src=src; });
}
// تصغير الصورة المرفوعة قبل التخزين (توفير مساحة)
function resizeImage(file, max=256){
  return new Promise((res,rej)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        const r=Math.min(1, max/Math.max(img.width,img.height));
        const w=Math.round(img.width*r), h=Math.round(img.height*r);
        const c=document.createElement('canvas'); c.width=w; c.height=h;
        c.getContext('2d').drawImage(img,0,0,w,h);
        res(c.toDataURL('image/png'));
      };
      img.onerror=rej; img.src=e.target.result;
    };
    reader.onerror=rej; reader.readAsDataURL(file);
  });
}
function drawContain(ctx,img,x,y,w,h,scale=0.74){
  if(!img) return;
  const r=Math.min(w*scale/img.width, h*scale/img.height);
  const dw=img.width*r, dh=img.height*r;
  ctx.drawImage(img, x+(w-dw)/2, y+(h-dh)/2, dw, dh);
}
// تركيب صورة القروب: شعار العميل + شعار أهداف
async function buildGroupPicture(clientLogo){
  try{
    const size=640, canvas=document.createElement('canvas');
    canvas.width=size; canvas.height=size;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,size,size);
    let ahdaf=null, client=null;
    try{ ahdaf=await loadImg('assets/logo-purple.png'); }catch{}
    if(clientLogo){ try{ client=await loadImg(clientLogo); }catch{} }
    if(client && ahdaf){
      drawContain(ctx, client, 0, 0, size, size/2, 0.66);          // العميل فوق
      ctx.strokeStyle='#e3d4f3'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(size*0.2, size/2); ctx.lineTo(size*0.8, size/2); ctx.stroke();
      drawContain(ctx, ahdaf, 0, size/2, size, size/2, 0.62);       // أهداف تحت
    } else if(client){ drawContain(ctx, client, 0,0,size,size,0.82); }
    else if(ahdaf){ drawContain(ctx, ahdaf, 0,0,size,size,0.6); }
    else return null;
    // JPEG مربعة — صيغة صور بروفايل واتساب
    return canvas.toDataURL('image/jpeg', 0.92);
  }catch{ return null; }
}

/* ---------- توست ---------- */
let toastT;
function toast(msg){
  $('.toast')?.remove();
  const t=document.createElement('div'); t.className='toast'; t.textContent=msg;
  document.body.appendChild(t); clearTimeout(toastT);
  toastT=setTimeout(()=>t.remove(),2200);
}

/* ---------- النافذة المنبثقة ---------- */
let linkPoll = null;
const sheet = {
  open(html){
    $('#sheetBody').innerHTML = html;
    $('#sheet').hidden=false; $('#sheetBackdrop').hidden=false;
    document.body.style.overflow='hidden';
  },
  close(){
    $('#sheet').hidden=true; $('#sheetBackdrop').hidden=true;
    document.body.style.overflow='';
    if(linkPoll){ clearInterval(linkPoll); linkPoll=null; }
  }
};
$('#sheetBackdrop').addEventListener('click', ()=>sheet.close());

/* ===================================================================
   قسم: قروبات العملاء
=================================================================== */
let currentSearch = '';

function renderClients(){
  const view = $('#view');
  let clients = store.clients;

  if(currentSearch){
    const q = currentSearch.trim();
    clients = clients.filter(c => (c.name||'').includes(q) || (c.company||'').includes(q));
  }

  if(store.clients.length === 0){
    view.innerHTML = `
      <div class="empty">
        <span class="emoji">👥</span>
        <h3>لا يوجد عملاء بعد</h3>
        <p>أضف أول عميل باسم الشركة أو الجهة.</p>
        <button class="cta" onclick="openClientForm()">+ إضافة أول عميل</button>
      </div>`;
    return;
  }

  let html = `
    <div class="section-head">
      <h1>العملاء</h1>
      <span class="count">${store.clients.length} عميل</span>
    </div>`;

  if(clients.length===0){
    html += `<div class="empty"><span class="emoji">🔍</span><h3>ما فيه نتائج</h3><p>جرّب كلمة ثانية.</p></div>`;
  }else{
    clients.forEach(c=>{ html += clientCard(c); });
  }

  view.innerHTML = html;
}

const WA_LOGO = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M.06 24l1.69-6.16A11.9 11.9 0 01.16 11.9C.16 5.33 5.5 0 12.07 0a11.8 11.8 0 018.4 3.49 11.8 11.8 0 013.48 8.42c0 6.57-5.34 11.9-11.91 11.9a11.9 11.9 0 01-5.7-1.45L.06 24zm6.6-3.8c1.7.99 3.3 1.58 5.4 1.58 5.46 0 9.9-4.43 9.9-9.88a9.86 9.86 0 00-16.84-7A9.86 9.86 0 002.2 11.9c0 2.2.65 3.85 1.74 5.58l-.9 3.28 3.62-.95zm10.94-5.6c-.07-.12-.27-.2-.57-.35-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07a8.1 8.1 0 01-2.38-1.47 9 9 0 01-1.65-2.05c-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.2 1.87.12.57-.08 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41z"/></svg>';
const GROUP_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 18.5a5.5 5.5 0 0111 0"/><path d="M16 5.4a3 3 0 010 5.6M20.5 18.5a5.5 5.5 0 00-3.6-5.15"/></svg>';

// زر المحادثة: يفتح قروب الواتساب إن وُجد رابط، وإلا محادثة مباشرة بالرقم
function chatButton(c){
  if(c.groupLink) return `<a class="wa-btn" href="${esc(c.groupLink)}" target="_blank" rel="noopener" aria-label="قروب الواتساب">${GROUP_ICON}</a>`;
  if(c.phone)     return `<a class="wa-btn" href="${waLink(c)}" target="_blank" rel="noopener" aria-label="محادثة واتساب">${WA_LOGO}</a>`;
  return '';
}

function avatarHTML(c){
  if(c.logo) return `<div class="avatar avatar-img"><img src="${c.logo}" alt=""></div>`;
  return `<div class="avatar" style="background:${colorFor(c)}">${esc(initials(c.name))}</div>`;
}
function clientCard(c){
  const sub = [c.company, c.phone ? (c.dial||'+966')+' '+c.phone : ''].filter(Boolean).join(' · ') || '';
  return `
    <div class="client-card">
      ${avatarHTML(c)}
      <div class="client-info">
        <div class="client-name">${esc(c.name)}</div>
        <div class="client-meta">${sub?esc(sub):'<span style="opacity:.6">بدون تفاصيل</span>'}${c.groupLink?' <span class="tag">قروب ✓</span>':''}</div>
      </div>
      <div class="client-actions">
        ${chatButton(c)}
        <button class="more-btn" onclick="clientMenu('${c.id}')" aria-label="خيارات">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 8a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4z"/></svg>
        </button>
      </div>
    </div>`;
}

/* ---------- نموذج إضافة / تعديل عميل ---------- */
function openClientForm(editId){
  const editing = editId ? store.clients.find(c=>c.id===editId) : null;
  const c = editing || {dial:'+966', sector:'تجارة', color:AVATAR_COLORS[0]};

  sheet.open(`
    <h2>${editing?'تعديل العميل':'عميل جديد'}</h2>
    <p class="sub">${editing?'حدّث بيانات العميل.':'ضيف العميل، وحط له رابط قروب الواتساب.'}</p>

    <div class="field">
      <label>اسم الشركة / الجهة *</label>
      <input id="f_name" value="${esc(c.name||c.company||'')}" placeholder="مثال: بهارات خنينة" autocomplete="off">
    </div>

    <div class="field">
      <label>شعار / صورة العميل</label>
      <div class="logo-upload">
        <div class="logo-preview" id="f_logoprev">${c.logo?`<img src="${c.logo}" alt="">`:'<span>لا صورة</span>'}</div>
        <div class="logo-btns">
          <input type="file" id="f_logo" accept="image/*" hidden>
          <button type="button" class="btn-soft" id="f_logopick">اختر صورة</button>
          <button type="button" class="btn-soft danger" id="f_logoclear" ${c.logo?'':'hidden'}>إزالة</button>
        </div>
      </div>
      <div class="hint">تظهر كصورة العميل، وتتدمج مع شعار أهداف كصورة للقروب.</div>
    </div>

    <div class="field">
      <label>رقم الجوال (اختياري — للمحادثة المباشرة)</label>
      <div class="phone-row">
        <select id="f_dial">${DIAL_CODES.map(d=>`<option ${d===(c.dial||'+966')?'selected':''}>${d}</option>`).join('')}</select>
        <input id="f_phone" type="tel" inputmode="numeric" value="${esc(c.phone||'')}" placeholder="5XXXXXXXX">
      </div>
      <div class="hint">مو مطلوب لإنشاء القروب — تضيف الأعضاء بنفسك بعدها.</div>
    </div>

    <div class="field">
      <label>قروب الواتساب</label>
      <button type="button" id="f_autogroup" class="btn-bot">
        <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2a2 2 0 012 2v1h3a2 2 0 012 2v3h1a2 2 0 010 4h-1v3a2 2 0 01-2 2h-3v-1a2 2 0 00-4 0v1H7a2 2 0 01-2-2v-3H4a2 2 0 010-4h1V7a2 2 0 012-2h3V4a2 2 0 012-2zM9 12a1.2 1.2 0 100 2.4A1.2 1.2 0 009 12zm6 0a1.2 1.2 0 100 2.4A1.2 1.2 0 0015 12z"/></svg>
        أنشئ القروب تلقائياً
      </button>
      <input id="f_group" value="${esc(c.groupLink||'')}" placeholder="أو الصق رابط chat.whatsapp.com/..." dir="ltr" inputmode="url" autocomplete="off" style="text-align:left">
      <div class="hint">الزر ينشئ القروب من رقمك عبر البوت ويجيب الرابط تلقائياً. أو الصقه يدوياً.
        <button type="button" id="f_grouphelp" style="color:var(--purple);font-weight:500;background:none;padding:0;margin-top:4px">طريقة الإنشاء اليدوي</button>
      </div>
    </div>

    <div class="field">
      <label>لون البطاقة</label>
      <div class="color-row" id="f_colors">
        ${AVATAR_COLORS.map(col=>`<button type="button" class="swatch ${col===(c.color||AVATAR_COLORS[0])?'on':''}" style="background:${col}" data-c="${col}"></button>`).join('')}
      </div>
    </div>

    <button class="btn-primary" id="f_save" disabled>${editing?'حفظ التعديلات':'إضافة العميل'}</button>
    <button class="btn-ghost" onclick="sheet.close()">إلغاء</button>
  `);

  // اختيار اللون
  let pickedColor = c.color||AVATAR_COLORS[0];
  $('#f_colors').addEventListener('click', e=>{
    const b=e.target.closest('.swatch'); if(!b)return;
    $('#f_colors').querySelectorAll('.swatch').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); pickedColor=b.dataset.c;
  });

  // شعار / صورة العميل
  let pickedLogo = c.logo || '';
  const logoPrev=$('#f_logoprev'), logoClear=$('#f_logoclear');
  $('#f_logopick').addEventListener('click', ()=>$('#f_logo').click());
  $('#f_logo').addEventListener('change', async e=>{
    const file=e.target.files[0]; if(!file) return;
    try{
      pickedLogo = await resizeImage(file, 256);
      logoPrev.innerHTML=`<img src="${pickedLogo}" alt="">`;
      logoClear.hidden=false;
    }catch{ toast('تعذّر قراءة الصورة'); }
  });
  logoClear.addEventListener('click', ()=>{
    pickedLogo=''; logoPrev.innerHTML='<span>لا صورة</span>'; logoClear.hidden=true; $('#f_logo').value='';
  });

  // مساعدة: كيف أسوي قروب الواتساب يدوياً
  $('#f_grouphelp').addEventListener('click', showGroupHelp);

  // الأتمتة: إنشاء القروب عبر البوت
  $('#f_autogroup').addEventListener('click', async ()=>{
    const cName = $('#f_name').value.trim();
    if(cName.length<2){ toast('اكتب اسم العميل أول'); return; }

    const team = store.settings.teamNumbers || [];   // الأعضاء = فريق أهداف فقط
    const groupName = cName;                          // اسم القروب = اسم العميل

    const btn = $('#f_autogroup'); const original = btn.innerHTML;
    btn.disabled = true; btn.textContent = 'جاري إنشاء القروب…';
    try{
      const picture = await buildGroupPicture(pickedLogo);   // شعار العميل + أهداف
      const data = await bot.createGroup(groupName, team, picture);
      if(data.inviteLink){
        $('#f_group').value = data.inviteLink;
        toast(`تم إنشاء قروب «${groupName}» — أضف الأعضاء ✓`);
      }else{
        toast('أُنشئ القروب لكن تعذّر جلب الرابط — افتحه يدوياً وانسخه');
      }
      if(picture && data.pictureSet===false){
        console.warn('فشل ضبط صورة القروب:', data.pictureError);
        toast('القروب انعمل لكن الصورة ما انضبطت — جرّب من جوالك');
      }
      if(data.skipped && data.skipped.length) toast(`${data.skipped.length} رقم بالفريق مو على واتساب`);
    }catch(e){
      toast(botErrMsg(e));
    }finally{
      btn.disabled=false; btn.innerHTML=original;
    }
  });

  const nameInput=$('#f_name'), saveBtn=$('#f_save');
  const validate=()=>{ saveBtn.disabled = nameInput.value.trim().length<2; };
  nameInput.addEventListener('input', validate); validate();
  nameInput.focus();

  saveBtn.addEventListener('click', ()=>{
    let groupLink = $('#f_group').value.trim();
    if(groupLink && !/^https?:\/\//i.test(groupLink)) groupLink = 'https://' + groupLink;
    if(groupLink && !/chat\.whatsapp\.com/i.test(groupLink)){
      toast('رابط القروب لازم يكون من chat.whatsapp.com');
      return;
    }
    const payload={
      name:$('#f_name').value.trim(),
      logo:pickedLogo,
      dial:$('#f_dial').value,
      phone:$('#f_phone').value.trim().replace(/\D/g,''),
      groupLink,
      color:pickedColor,
    };
    if(editing){
      store.updateClient(editId, payload);
      toast('تم حفظ التعديلات');
    }else{
      store.addClient({id:uid(), createdAt:Date.now(), ...payload});
      toast(`أُضيف ${payload.name} ✓`);
    }
    sheet.close(); renderClients();
  });
}

/* ---------- المستخدم والدخول ---------- */
let APP_USER = null;
async function loadMe(){
  try{ const r = await fetch(bot.url()+'/auth/me', {credentials:'same-origin'}); if(r.ok){ APP_USER = (await r.json()).user; } }catch{}
}
async function logout(){
  try{ await fetch(bot.url()+'/auth/logout', {method:'POST', credentials:'same-origin'}); }catch{}
  location.replace('login.html');
}
async function openTeam(){
  sheet.open(`
    <h2>إدارة الفريق</h2>
    <p class="sub">مين يقدر يدخل التطبيق (بالبريد + رقم الجوال).</p>
    <div id="teamList"><div class="link-wait" style="padding:16px;text-align:center;color:var(--muted)">جاري التحميل…</div></div>
    <div style="border-top:1px solid var(--line);margin-top:18px;padding-top:16px">
      <div class="field"><label>الاسم</label><input id="tm_name" placeholder="اسم العضو" autocomplete="off"></div>
      <div class="field"><label>البريد الإلكتروني</label><input id="tm_email" placeholder="you@ahdaf.co" dir="ltr" style="text-align:left" autocomplete="off"></div>
      <div class="field"><label>رقم الجوال (بصيغة دولية)</label><input id="tm_phone" placeholder="9665XXXXXXXX" dir="ltr" style="text-align:left" inputmode="numeric"></div>
      <label style="display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:14px"><input type="checkbox" id="tm_admin" style="width:auto"> مشرف (يقدر يدير الفريق)</label>
      <button class="btn-primary" id="tm_add">إضافة عضو</button>
    </div>
    <button class="btn-ghost" onclick="openSettings()">رجوع</button>
  `);
  async function refresh(){
    try{
      const r = await fetch(bot.url()+'/auth/team', {credentials:'same-origin'});
      const d = await r.json();
      const list = (d.team||[]);
      $('#teamList').innerHTML = list.map(u=>`
        <div class="file-row" style="cursor:default">
          <span class="file-ic">${u.admin?'⭐':'👤'}</span>
          <div class="file-info"><div class="file-name">${esc(u.name||u.email)}</div>
            <div class="file-meta">${esc(u.email)} · ${esc(u.phone)}</div></div>
          ${APP_USER && esc(u.email)!==esc(APP_USER.email) ? `<button class="file-del" onclick="rmMember('${esc(u.email)}')">حذف</button>` : ''}
        </div>`).join('') || '<div class="arch-empty">لا أعضاء</div>';
    }catch{ $('#teamList').innerHTML = '<div class="link-off" style="color:#c0392b;padding:12px">تعذّر تحميل الفريق</div>'; }
  }
  window.rmMember = async (email)=>{
    if(!confirm('حذف هذا العضو؟')) return;
    await fetch(bot.url()+'/auth/team/remove',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({email})});
    toast('تم الحذف'); refresh();
  };
  $('#tm_add').addEventListener('click', async ()=>{
    const name=$('#tm_name').value.trim(), email=$('#tm_email').value.trim(), phone=$('#tm_phone').value.replace(/\D/g,''), admin=$('#tm_admin').checked;
    if(!email||!phone){ toast('عبّي البريد ورقم الجوال'); return; }
    const r = await fetch(bot.url()+'/auth/team/add',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({name,email,phone,admin})});
    const d = await r.json();
    if(d.ok){ toast(d.updated?'تم تحديث الرقم':'أُضيف العضو ✓'); $('#tm_name').value='';$('#tm_email').value='';$('#tm_phone').value='';$('#tm_admin').checked=false; refresh(); }
    else{ toast(d.error||'تعذّرت الإضافة'); }
  });
  refresh();
}

/* ---------- إعدادات البوت ---------- */
function openSettings(){
  const s = store.settings;
  sheet.open(`
    <h2>إعدادات بوت الواتساب</h2>
    <p class="sub">لربط الواتساب والأتمتة الكاملة لإنشاء القروبات.</p>

    <div class="field">
      <label>رابط البوت</label>
      <input id="s_url" value="${esc(bot.url())}" dir="ltr" style="text-align:left">
      <div class="hint">يُضبط تلقائياً: بوت السيرفر على الموقع، أو localhost على جهازك.</div>
    </div>

    <div class="link-box" id="linkArea">
      <div class="link-wait">⏳ جاري الفحص…</div>
    </div>

    <div class="field" style="margin-top:18px">
      <label>أرقام فريق أهداف (تنضاف لكل قروب)</label>
      <textarea id="s_team" rows="4" placeholder="9665XXXXXXXX&#10;9665YYYYYYYY">${esc((s.teamNumbers||[]).join('\n'))}</textarea>
      <div class="hint">رقم بكل سطر، بصيغة دولية بدون + ولا صفر. مثال: 9665XXXXXXXX</div>
    </div>

    <button class="btn-primary" id="s_save">حفظ الإعدادات</button>

    <div style="border-top:1px solid var(--line);margin-top:20px;padding-top:16px">
      ${APP_USER?`<p class="sub" style="margin-bottom:12px">مسجّل: <b>${esc(APP_USER.email)}</b>${APP_USER.admin?' · مشرف':''}</p>`:''}
      ${APP_USER&&APP_USER.admin?`<button class="btn-soft" style="width:100%;margin-bottom:8px;padding:12px" onclick="openTeam()">👥 إدارة الفريق والدخول</button>`:''}
      <button class="btn-danger" onclick="logout()">تسجيل الخروج</button>
    </div>
    <button class="btn-ghost" onclick="sheet.close()">إغلاق</button>
  `);

  // عند تغيير الرابط، احفظه فوراً عشان الباركود يجي من المكان الصح
  $('#s_url').addEventListener('change', ()=>{ store.setSettings({ botUrl: $('#s_url').value.trim() }); });

  $('#s_save').addEventListener('click', ()=>{
    const team = $('#s_team').value.split(/[\n,]+/).map(x=>x.replace(/\D/g,'')).filter(Boolean);
    store.setSettings({ botUrl: $('#s_url').value.trim(), teamNumbers: team });
    toast('تم حفظ الإعدادات ✓'); sheet.close();
  });

  startLinkPolling();
}

// يفحص حالة البوت كل 3 ثوانٍ. الباركود يُعاد تحميله فقط لما يتغيّر فعلاً (يمنع الوميض)
let lastLinkKey = '';
function startLinkPolling(){
  if(linkPoll){ clearInterval(linkPoll); linkPoll=null; }
  lastLinkKey = '';
  const tick = async ()=>{
    const area = $('#linkArea');
    if(!area){ if(linkPoll){clearInterval(linkPoll); linkPoll=null;} return; }
    let key, html;
    try{
      const st = await bot.status();
      if(st.ready){
        key = 'ready';
        html = `<div class="link-ok">✓ الواتساب مربوط — البوت جاهز${st.version?` <span class="ver">(${esc(st.version)})</span>`:''}</div>`;
      }else if(st.hasQr){
        key = 'qr:'+st.qrV;                          // يتغيّر فقط مع باركود جديد
        html = `
          <p class="link-title">📱 اربط الواتساب</p>
          <p class="link-hint">واتساب → الإعدادات → الأجهزة المرتبطة → ربط جهاز، وامسح الباركود (ثابت ~20 ثانية):</p>
          <img class="qr-img" src="${bot.url()}/qr?v=${st.qrV}" alt="باركود الربط"
               onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'link-wait',textContent:'⏳ جاري توليد الباركود…'}))">
          <p class="link-hint small">لا تسكّر النافذة — بمجرد المسح يتحوّل لـ «مربوط ✓»</p>`;
      }else{
        key = 'wait';
        html = `<div class="link-wait">⏳ البوت يشتغل… انتظر لحظات (تشغيل الواتساب)</div>`;
      }
    }catch(e){
      key = 'off';
      html = `<div class="link-off">⚠️ ما وصلت للبوت.<br>تأكد إنه شغّال (نقرة مزدوجة على «شغّل-البوت.command») والرابط فوق صحيح.</div>`;
    }
    if(key !== lastLinkKey){ area.innerHTML = html; lastLinkKey = key; }  // أعد الرسم فقط عند التغيّر
  };
  tick();
  linkPoll = setInterval(tick, 3000);
}

/* ---------- شرح: كيف تنشئ قروب واتساب يدوياً ---------- */
function showGroupHelp(){
  sheet.open(`
    <h2>كيف تسوي قروب الواتساب؟</h2>
    <p class="sub">مرة وحدة لكل عميل — التطبيق ما ينشئه (قيد من واتساب)، بس يخزّن رابطه ويفتحه.</p>
    <div class="action-list">
      <div class="action-item"><b style="color:var(--purple)">1</b> افتح واتساب → «مجموعة جديدة».</div>
      <div class="action-item"><b style="color:var(--purple)">2</b> اختر أعضاء فريق أهداف + العميل، وسمِّ القروب باسم العميل.</div>
      <div class="action-item"><b style="color:var(--purple)">3</b> ادخل القروب → اضغط اسمه فوق → «الدعوة عبر رابط».</div>
      <div class="action-item"><b style="color:var(--purple)">4</b> «نسخ الرابط» → ارجع هنا والصقه في الخانة.</div>
    </div>
    <button class="btn-primary" onclick="openClientForm()" style="margin-top:18px">تمام، رجوع للنموذج</button>
  `);
}

/* ---------- قائمة خيارات العميل ---------- */
function clientMenu(id){
  const c = store.clients.find(x=>x.id===id); if(!c) return;
  sheet.open(`
    <h2>${esc(c.name)}</h2>
    ${c.phone?`<p class="sub">${esc((c.dial||'+966')+' '+c.phone)}</p>`:''}
    <div class="action-list">
      ${c.groupLink?`<a class="action-item" href="${esc(c.groupLink)}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 18.5a5.5 5.5 0 0111 0"/><path d="M16 5.4a3 3 0 010 5.6M20.5 18.5a5.5 5.5 0 00-3.6-5.15"/></svg>
        فتح قروب الواتساب</a>`:''}
      ${c.phone?`<a class="action-item" href="${waLink(c)}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 0C5.4 0 0 5.4 0 12c0 2.1.5 4 1.5 5.8L0 24l6.3-1.6A12 12 0 1012 0zm6.9 16.9c-.3.8-1.5 1.5-2.1 1.5-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.8-.6-3-1.3-5-4.4-5.1-4.6-.2-.2-1.3-1.7-1.3-3.2s.8-2.3 1.1-2.6c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .7.5.2.6.8 2 .9 2.1.1.2.1.3 0 .5-.4.8-.8 1-1 1.2-.1.2-.3.4-.1.7.2.3.9 1.5 2 2.4 1.3 1.2 2.4 1.5 2.7 1.7.3.1.5.1.6-.1.2-.2.7-.8.9-1.1.2-.3.4-.2.6-.1.3.1 1.7.8 2 .9.3.2.5.2.6.3.1.2.1.9-.2 1.6z"/></svg>
        محادثة مباشرة (رقم العميل)</a>`:''}
      <button class="action-item" onclick="sheet.close();openClientForm('${id}')">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.58z"/></svg>
        تعديل البيانات</button>
      <button class="action-item danger" onclick="confirmDelete('${id}')">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M6 7h12v13a1 1 0 01-1 1H7a1 1 0 01-1-1V7zm3-3h6l1 2h4v2H4V6h4l1-2z"/></svg>
        حذف العميل</button>
    </div>
  `);
}

function confirmDelete(id){
  const c = store.clients.find(x=>x.id===id); if(!c) return;
  sheet.open(`
    <h2>حذف العميل؟</h2>
    <p class="sub">راح يُحذف «${esc(c.name)}» نهائياً. ما يمكن التراجع.</p>
    <button class="btn-danger" onclick="(function(){store.removeClient('${id}');toast('تم الحذف');sheet.close();renderClients();})()">نعم، احذف</button>
    <button class="btn-ghost" onclick="sheet.close()">رجوع</button>
  `);
}

/* ===================================================================
   أقسام قادمة (placeholder)
=================================================================== */
/* ===================================================================
   قسم: العروض (تطوير الأعمال) — طلب العرض ← التعديلات ← المعتمد
=================================================================== */
const PROPOSAL_STAGES = [
  { key:'طلب العرض', color:'#7a7a85' },
  { key:'التعديلات', color:'#b5852a' },
  { key:'المعتمد',   color:'#1f9d55' },
];
const stageIndex = k => { const i=PROPOSAL_STAGES.findIndex(s=>s.key===k); return i<0?0:i; };
function fmtSAR(v){ const n=Number(v); if(!n) return ''; return n.toLocaleString('en-US')+' ر.س'; }

let propStage = 'طلب العرض';
let propsView = 'home';

// شاشة العروض الرئيسية: خياران (طلب عروض / أرشيف العروض)
function renderProposals(){
  if(propsView === 'archive') return renderProposalArchive();
  const all = store.proposals;
  const pgCount = Object.keys(store.settings.propGroups||{}).length;
  $('#view').innerHTML = `
    <div class="section-head"><h1>العروض</h1></div>
    <div class="hub">
      <button class="hub-card" onclick="openProposalForm()">
        <span class="hub-ic req">＋</span>
        <span class="hub-title">طلب عروض</span>
        <span class="hub-sub">أنشئ طلب عرض جديد</span>
      </button>
      <button class="hub-card" onclick="showArchive()">
        <span class="hub-ic arch">🗂️</span>
        <span class="hub-title">أرشيف العروض</span>
        <span class="hub-sub">${all.length} عرض · كل المراحل</span>
      </button>
    </div>
    <button class="projecto-bar" onclick="openPropNotify()" style="margin-top:4px">
      <span class="pj-left"><span class="pj-dot" style="background:var(--wa)"></span> إشعارات الواتساب</span>
      <span class="pj-right">${pgCount?`${pgCount} مربوط`:'اربط'} ›</span>
    </button>`;
}
function showArchive(){ propsView='archive'; renderProposals(); }
function propsHome(){ propsView='home'; renderProposals(); }

// أرشيف العروض: ملفات العروض + العروض المسجّلة تحتها
function renderProposalArchive(){
  const view = $('#view');
  const all = store.proposals.slice().sort((a,b)=>(b.updatedAt||b.createdAt)-(a.updatedAt||a.createdAt));
  const backBar = `<button class="back-bar" onclick="propsHome()"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M14 7l-1.4 1.4L16.2 12l-3.6 3.6L14 17l5-5z"/></svg> رجوع</button>`;

  let html = backBar;
  // قسم الملفات (على السيرفر — مشتركة للفريق)
  html += `<div class="arch-head">
      <span class="arch-title">ملفات العروض</span>
      <button class="btn-soft" onclick="pickArchiveFile()">＋ إضافة ملف</button>
    </div>`;
  html += `<div id="filesList"><div class="arch-empty">جاري التحميل…</div></div>`;

  // العروض المسجّلة
  html += `<div class="group-label" style="margin-top:26px">
      <span class="gname">العروض المسجّلة</span><span class="gcount">${all.length}</span><span class="gline"></span>
    </div>`;
  html += all.length
    ? all.map(proposalCard).join('')
    : `<div class="arch-empty">لا توجد عروض مسجّلة بعد.</div>`;

  view.innerHTML = html;
  loadArchiveFiles();
}

async function loadArchiveFiles(){
  const el = $('#filesList'); if(!el) return;
  try{
    const r = await fetch(bot.url()+'/files', {credentials:'same-origin'});
    if(r.status===401){ el.innerHTML = '<div class="arch-empty">سجّل الدخول لرؤية الملفات</div>'; return; }
    const d = await r.json();
    const files = d.files||[];
    el.innerHTML = files.length
      ? files.map(fileRow).join('')
      : '<div class="arch-empty">ما فيه ملفات بعد — أضف عروضك المحفوظة (PDF، صور، Word…).</div>';
  }catch{ el.innerHTML = '<div class="arch-empty">تعذّر تحميل الملفات — تأكد من اتصال السيرفر</div>'; }
}

function fileRow(f){
  const url = bot.url()+'/files/'+esc(f.id);
  return `<div class="file-row" onclick="window.open('${url}','_blank')">
      <span class="file-ic">${fileIcon(f.type)}</span>
      <div class="file-info">
        <div class="file-name">${esc(f.name)}</div>
        <div class="file-meta">${esc(fmtBytes(f.size))}</div>
      </div>
      <a class="file-act" href="${url}?dl=1" download onclick="event.stopPropagation()" aria-label="تنزيل" title="تنزيل">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11m0 0l-4-4m4 4l4-4M5 21h14"/></svg>
      </a>
      <button class="file-del" onclick="event.stopPropagation();deleteArchiveFile('${esc(f.id)}')" aria-label="حذف">
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 7h12v13a1 1 0 01-1 1H7a1 1 0 01-1-1V7zm3-3h6l1 2h4v2H4V6h4l1-2z"/></svg>
      </button>
    </div>`;
}

async function pickArchiveFile(){
  const file = await pickFile();
  if(!file) return;
  if(file.size > 25*1048576){ toast('الملف كبير (أكثر من 25MB)'); return; }
  toast('جاري الرفع…');
  try{
    const data = await blobToBase64(file);
    const r = await fetch(bot.url()+'/files', {method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin',
      body: JSON.stringify({ name:file.name, type:file.type, data })});
    const d = await r.json();
    if(d.ok){ toast('أُضيف الملف ✓'); loadArchiveFiles(); }
    else{ toast(d.error||'تعذّر الرفع'); }
  }catch{ toast('تعذّر رفع الملف — تأكد من اتصال السيرفر'); }
}
async function deleteArchiveFile(id){
  try{ await fetch(bot.url()+'/files/remove', {method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body:JSON.stringify({id})}); }catch{}
  toast('تم حذف الملف'); loadArchiveFiles();
}

function proposalCard(p){
  const client = p.clientId ? store.clients.find(c=>c.id===p.clientId) : null;
  const idx = stageIndex(p.stage);
  const steps = PROPOSAL_STAGES.map((s,i)=>`<span class="step ${i<=idx?'on':''}" style="--sc:${s.color}"></span>`).join('<span class="step-bar"></span>');
  const next = PROPOSAL_STAGES[idx+1];
  const meta = [];
  if(client) meta.push(`<span class="tag">${esc(client.name)}</span>`);
  if(p.value) meta.push(`<span class="val">${esc(fmtSAR(p.value))}</span>`);
  if(p.file) meta.push(`<span class="tag" style="background:#e9eef0;color:var(--charcoal)">📎 ملف</span>`);
  return `
    <div class="prop-card" style="--accent:${PROPOSAL_STAGES[idx].color}">
      <div class="prop-head">
        <div class="prop-body" onclick="proposalMenu('${p.id}')">
          <div class="prop-title">${esc(p.title)}</div>
          ${meta.length?`<div class="prop-meta">${meta.join('')}</div>`:''}
        </div>
        <button class="more-btn" onclick="proposalMenu('${p.id}')" aria-label="خيارات">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 8a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4z"/></svg>
        </button>
      </div>
      <div class="stepper">${steps}</div>
      ${next
        ? `<button class="advance-btn" onclick="moveProposal('${p.id}',1)">نقل إلى «${esc(next.key)}» ←</button>`
        : `<div class="approved-badge">✓ معتمد</div>`}
    </div>`;
}

function moveProposal(id, dir){
  const p = store.proposals.find(x=>x.id===id); if(!p) return;
  const idx = stageIndex(p.stage);
  const ni = Math.max(0, Math.min(PROPOSAL_STAGES.length-1, idx+dir));
  if(ni===idx) return;
  const newStage = PROPOSAL_STAGES[ni].key;
  store.updateProposal(id, { stage: newStage, updatedAt: Date.now() });
  toast(`نُقل إلى «${newStage}» ✓`);
  notifyStage({...p, stage:newStage}, newStage);
  renderProposals();
}

// إشعار قروب الواتساب المناسب لمرحلة العرض
async function notifyStage(proposal, stageKey){
  const groups = store.settings.propGroups || {};
  const chatId = groups[stageKey];
  if(!chatId) return;   // ما فيه قروب معيّن لهذي المرحلة — تجاهل بهدوء
  const client = proposal.clientId ? store.clients.find(c=>c.id===proposal.clientId) : null;
  const heads = {
    'طلب العرض': '📋 *طلب عرض جديد*',
    'التعديلات': '✏️ *عرض انتقل للتعديلات*',
    'المعتمد':   '✅ *تم اعتماد العرض* 🎉',
  };
  let msg = (heads[stageKey] || 'تحديث عرض') + `\n\n📌 ${proposal.title}`;
  if(client) msg += `\n👤 ${client.name}`;
  if(proposal.value) msg += `\n💰 ${fmtSAR(proposal.value)}`;
  if(proposal.notes) msg += `\n📝 ${proposal.notes}`;
  // أرفق ملف العرض إن وُجد (للمراجعة)
  let media = null;
  if(proposal.file && proposal.file.id){
    try{ const blob=await filedb.get(proposal.file.id); if(blob){ media={ data:await blobToBase64(blob), mimetype:proposal.file.type||'application/octet-stream', filename:proposal.file.name }; } }catch{}
  }
  try{ await bot.sendMessage(chatId, msg, media); toast(media?'📨 انرسل الإشعار + الملف':'📨 انرسل إشعار للقروب'); }
  catch(e){ toast('تعذّر إرسال الإشعار — تأكد إن البوت شغّال'); }
}

// إعداد ربط مراحل العروض بقروبات الواتساب
async function openPropNotify(){
  sheet.open(`
    <h2>إشعارات العروض على واتساب</h2>
    <p class="sub">اختر قروب لكل مرحلة — يجيه إشعار تلقائي.</p>
    <div class="link-box" id="pnArea"><div class="link-wait">⏳ جاري جلب القروبات…</div></div>
    <div id="pnForm" hidden>
      ${PROPOSAL_STAGES.map((s,i)=>`
        <div class="field">
          <label>قروب «${esc(s.key)}»</label>
          <select id="pn_${i}" class="pn-select"></select>
        </div>`).join('')}
      <button class="btn-primary" id="pn_save">حفظ</button>
    </div>
    <button class="btn-ghost" onclick="sheet.close()">إغلاق</button>
  `);

  try{
    const groups = await bot.groups();
    const saved = store.settings.propGroups || {};
    const opts = `<option value="">— لا شيء —</option>` +
      groups.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
    PROPOSAL_STAGES.forEach((s,i)=>{
      const el = document.getElementById('pn_'+i);
      if(el){ el.innerHTML = opts; if(saved[s.key]) el.value = saved[s.key]; }
    });
    $('#pnArea').innerHTML = groups.length
      ? `<div class="link-ok" style="font-size:13.5px">✓ ${groups.length} قروب متاح</div>`
      : `<div class="link-wait">ما فيه قروبات بحسابك بعد — أنشئ القروبات أول.</div>`;
    $('#pnForm').hidden = false;
    $('#pn_save').addEventListener('click', ()=>{
      const pg = {};
      PROPOSAL_STAGES.forEach((s,i)=>{ const el=document.getElementById('pn_'+i); if(el && el.value) pg[s.key]=el.value; });
      store.setSettings({ propGroups: pg });
      toast('تم حفظ الإشعارات ✓'); sheet.close();
    });
  }catch(e){
    $('#pnArea').innerHTML = `<div class="link-off">⚠️ ما قدرت أجلب القروبات.<br>تأكد إن البوت شغّال ومربوط (⚙️ الإعدادات).</div>`;
  }
}

function openProposalForm(editId){
  const editing = editId ? store.proposals.find(p=>p.id===editId) : null;
  const p = editing || { stage: propStage };
  const clients = store.clients;

  sheet.open(`
    <h2>${editing?'تعديل العرض':'عرض جديد'}</h2>
    <p class="sub">${editing?'حدّث تفاصيل العرض.':'ابدأ بطلب العرض، وحرّكه للمراحل التالية.'}</p>

    <div class="field">
      <label>عنوان العرض *</label>
      <input id="p_title" value="${esc(p.title||'')}" placeholder="مثال: حملة رمضان — بهارات خنينة" autocomplete="off">
    </div>

    <div class="field">
      <label>العميل</label>
      <select id="p_client">
        <option value="">— بدون عميل —</option>
        ${clients.map(c=>`<option value="${c.id}" ${c.id===p.clientId?'selected':''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>

    <div class="field">
      <label>قيمة العرض (ر.س)</label>
      <input id="p_value" type="number" inputmode="numeric" value="${esc(p.value||'')}" placeholder="مثال: 80000">
    </div>

    <div class="field">
      <label>المرحلة</label>
      <div class="prio-row" id="p_stage">
        ${PROPOSAL_STAGES.map(s=>`<button type="button" class="prio-chip ${s.key===(p.stage||'طلب العرض')?'on':''}" data-s="${esc(s.key)}" style="--pc:${s.color}">${esc(s.key)}</button>`).join('')}
      </div>
    </div>

    <div class="field">
      <label>ملاحظات (اختياري)</label>
      <textarea id="p_notes" rows="3" style="direction:rtl;text-align:right" placeholder="تفاصيل، تعديلات مطلوبة، ملاحظات العميل…">${esc(p.notes||'')}</textarea>
    </div>

    <div class="field">
      <label>ملف العرض (اختياري)</label>
      <div class="logo-upload">
        <div class="file-attach" id="p_fileprev">${p.file?`${fileIcon(p.file.type)} ${esc(p.file.name)}`:'لا ملف مرفق'}</div>
        <div class="logo-btns">
          <button type="button" class="btn-soft" id="p_filepick">اختر ملف</button>
          <button type="button" class="btn-soft danger" id="p_fileclear" ${p.file?'':'hidden'}>إزالة</button>
        </div>
      </div>
      <div class="hint">يُرفق بالعرض، ويُرسل لقروب الواتساب للمراجعة عند الطلب.</div>
    </div>

    <button class="btn-primary" id="p_save" disabled>${editing?'حفظ التعديلات':'إضافة العرض'}</button>
    <button class="btn-ghost" onclick="sheet.close()">إلغاء</button>
  `);

  let pickedStage = p.stage || 'طلب العرض';
  let fileMeta = p.file || null;   // الموجود
  let newBlob = null;              // ملف جديد مرفوع
  $('#p_filepick').addEventListener('click', async ()=>{
    const f = await pickFile(); if(!f) return;
    if(f.size > 25*1048576){ toast('الملف كبير (أكثر من 25MB)'); return; }
    newBlob = f; fileMeta = { name:f.name, size:f.size, type:f.type };
    $('#p_fileprev').innerHTML = `${fileIcon(f.type)} ${esc(f.name)}`;
    $('#p_fileclear').hidden = false;
  });
  $('#p_fileclear').addEventListener('click', ()=>{
    fileMeta=null; newBlob=null; $('#p_fileprev').textContent='لا ملف مرفق'; $('#p_fileclear').hidden=true;
  });
  $('#p_stage').addEventListener('click', e=>{
    const b=e.target.closest('.prio-chip'); if(!b) return;
    $('#p_stage').querySelectorAll('.prio-chip').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); pickedStage=b.dataset.s;
  });

  const titleInput=$('#p_title'), saveBtn=$('#p_save');
  const validate=()=>{ saveBtn.disabled = titleInput.value.trim().length<2; };
  titleInput.addEventListener('input', validate); validate();
  titleInput.focus();

  saveBtn.addEventListener('click', async ()=>{
    saveBtn.disabled = true;
    // خزّن الملف الجديد إن وُجد
    if(newBlob){
      try{ const fid=newFileId(); await filedb.put(fid, newBlob); fileMeta={ id:fid, name:newBlob.name, size:newBlob.size, type:newBlob.type }; }
      catch{ toast('تعذّر حفظ الملف'); }
    }
    const payload = {
      title:$('#p_title').value.trim(),
      clientId: $('#p_client').value || null,
      value: Number($('#p_value').value)||0,
      stage: pickedStage,
      notes: $('#p_notes').value.trim(),
      file: (fileMeta && fileMeta.id) ? fileMeta : null,
      updatedAt: Date.now(),
    };
    if(editing){ store.updateProposal(editId, payload); toast('تم حفظ التعديلات'); }
    else{
      const np = { id:'p'+Date.now().toString(36), createdAt:Date.now(), ...payload };
      store.addProposal(np); toast('أُضيف العرض ✓');
      notifyStage(np, pickedStage);   // إشعار قروب الواتساب (مع الملف إن وُجد)
    }
    propStage = pickedStage;
    sheet.close(); renderProposals();
  });
}

function proposalMenu(id){
  const p = store.proposals.find(x=>x.id===id); if(!p) return;
  const client = p.clientId ? store.clients.find(c=>c.id===p.clientId) : null;
  const idx = stageIndex(p.stage);
  const next = PROPOSAL_STAGES[idx+1], prev = PROPOSAL_STAGES[idx-1];
  sheet.open(`
    <h2>${esc(p.title)}</h2>
    <p class="sub">${esc(p.stage)}${client?' · '+esc(client.name):''}${p.value?' · '+esc(fmtSAR(p.value)):''}</p>
    ${p.notes?`<div class="note-box">${esc(p.notes)}</div>`:''}
    <div class="action-list">
      ${p.file?`<button class="action-item" onclick="openStoredFile('${p.file.id}')">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm0 2.5L17.5 8H14V4.5z"/></svg>
        فتح الملف (${esc(p.file.name)})</button>`:''}
      ${next?`<button class="action-item" onclick="moveProposal('${id}',1);sheet.close()">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M14 7l-1.4 1.4L16.2 12l-3.6 3.6L14 17l5-5z"/></svg>
        نقل إلى «${esc(next.key)}»</button>`:''}
      ${prev?`<button class="action-item" onclick="moveProposal('${id}',-1);sheet.close()">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M10 7l1.4 1.4L7.8 12l3.6 3.6L10 17l-5-5z"/></svg>
        رجوع إلى «${esc(prev.key)}»</button>`:''}
      <button class="action-item" onclick="sheet.close();openProposalForm('${id}')">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.58z"/></svg>
        تعديل العرض</button>
      <button class="action-item danger" onclick="(function(){store.removeProposal('${id}');toast('تم الحذف');sheet.close();renderProposals();})()">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M6 7h12v13a1 1 0 01-1 1H7a1 1 0 01-1-1V7zm3-3h6l1 2h4v2H4V6h4l1-2z"/></svg>
        حذف العرض</button>
    </div>
  `);
}
/* ===================================================================
   قسم: المهام
=================================================================== */
const TASK_PRIORITIES = [
  { key:'عاجلة',  color:'#c0392b' },
  { key:'مهمة',   color:'#b5852a' },
  { key:'عادية',  color:'#7a7a85' },
];
const PRIO_RANK = { 'عاجلة':0, 'مهمة':1, 'عادية':2 };

function prioColor(p){ return (TASK_PRIORITIES.find(x=>x.key===p)||TASK_PRIORITIES[2]).color; }

// تنسيق تاريخ الاستحقاق
function formatDue(due){
  if(!due) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(due+'T00:00:00');
  const diff = Math.round((d - today)/86400000);
  let text, cls='';
  if(diff < 0){ text = `متأخرة ${Math.abs(diff)} يوم`; cls='overdue'; }
  else if(diff === 0){ text = 'اليوم'; cls='soon'; }
  else if(diff === 1){ text = 'بكرة'; cls='soon'; }
  else if(diff <= 7){ text = `خلال ${diff} أيام`; }
  else { text = d.toLocaleDateString('ar-SA-u-ca-gregory', {day:'numeric', month:'short'}); }
  return { text, cls };
}

/* ===================================================================
   قسم المهام = مرآة Projecto — بحث فوري + أقسام + أشخاص + متأخرة
=================================================================== */
let PJ_DATA = null;        // بيانات المزامنة من السيرفر
let PJ_PROJECT = null;     // مشروع مفتوح (تفاصيل)
let PJ_PERSON = null;      // شخص مفتوح (تفاصيل)
let PJ_VIEW = 'sections';  // sections | people | overdue
let PJ_SEARCH = '';        // نص البحث

function timeAgo(ts){
  if(!ts) return 'ما تمت بعد';
  const s = Math.floor((Date.now()-ts)/1000);
  if(s<60) return 'الآن';
  if(s<3600) return `قبل ${Math.floor(s/60)} د`;
  if(s<86400) return `قبل ${Math.floor(s/3600)} س`;
  return `قبل ${Math.floor(s/86400)} يوم`;
}

/* ---------- أدوات ---------- */
function pjNorm(s){
  return String(s||'')
    .replace(/[ً-ْٰ]/g,'')
    .replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ؤ/g,'و').replace(/ئ/g,'ي')
    .replace(/\s+/g,' ').trim().toLowerCase();
}
const PJ_STAGE_RE = /اسبوع|حمل|مكتمل|منجز|نشر|اعلان|رعاي|خطه|عقود|بداي|حالات|ملفات|دولاب|ترويج|مهام|منصه|منبر|ماتشز|قولز|سهم|تيك ?توك|تيكتوك|keeta|snb|starb|ستارب/i;

function pjMemberNorms(){ return new Set(((PJ_DATA&&PJ_DATA.members)||[]).map(m=>pjNorm(m.name))); }
function pjIsPerson(name){
  const n = pjNorm(name); if(!n) return false;
  if(pjMemberNorms().has(n)) return true;   // عضو فريق مؤكّد
  if(PJ_STAGE_RE.test(n)) return false;     // عمود مرحلة/حملة
  if(/\d/.test(n)) return false;
  const w = n.split(' ').length;
  return w>=1 && w<=3;                       // اسم شخص محتمل
}
function pjAllTasks(){
  const out=[];
  for(const p of ((PJ_DATA&&PJ_DATA.projects)||[]))
    for(const b of (p.boards||[]))
      for(const t of b.tasks)
        out.push({...t, _proj:p.name, _projId:p.id, _color:p.color, _board:b.name});
  return out;
}
function pjDiffDays(end){
  if(!end) return null;
  const today=new Date(); today.setHours(0,0,0,0);
  const d=new Date(String(end).slice(0,10)+'T00:00:00'); if(isNaN(d)) return null;
  return Math.round((d-today)/86400000);
}
function pjPeople(){
  const map=new Map();
  for(const p of ((PJ_DATA&&PJ_DATA.projects)||[]))
    for(const b of (p.boards||[])){
      if(!pjIsPerson(b.name) || !b.tasks.length) continue;
      const k=pjNorm(b.name);
      if(!map.has(k)) map.set(k,{name:(b.name||'').trim(), tasks:[]});
      for(const t of b.tasks) map.get(k).tasks.push({...t,_proj:p.name,_projId:p.id,_color:p.color});
    }
  return [...map.values()].map(x=>({...x, open:x.tasks.filter(t=>!t.done).length, total:x.tasks.length}))
    .sort((a,b)=> b.open-a.open || b.total-a.total);
}

/* ---------- التحميل والتوجيه ---------- */
async function renderTasks(){
  const view=$('#view');
  if(!PJ_DATA) view.innerHTML=`<div class="section-head"><h1>المهام</h1></div><div class="pj-loading"><span class="spin"></span> جاري تحميل Projecto…</div>`;
  try{ const r=await fetch(bot.url()+'/projecto',{credentials:'same-origin'}); PJ_DATA=await r.json(); }catch{}
  paintTasks();
}
function paintTasks(){
  const d=PJ_DATA||{}; const view=$('#view');
  if(!d.connected){
    view.innerHTML=`
      <div class="section-head"><h1>المهام</h1></div>
      <div class="empty">
        <span class="emoji">🔗</span><h3>بروجيكتو غير مربوط</h3>
        <p>${APP_USER&&APP_USER.admin?'اربط حساب Projecto مرّة وحدة، وبعدها تتحدّث المهام تلقائياً كل ٣ ساعات.':'اطلب من المشرف ربط حساب Projecto.'}</p>
        ${APP_USER&&APP_USER.admin?`<button class="cta" onclick="openProjectoConnect()">ربط بروجيكتو</button>`:''}
      </div>`;
    return;
  }
  if(PJ_PROJECT) return renderProjectoProject(PJ_PROJECT);
  if(PJ_PERSON)  return renderPerson(PJ_PERSON);
  paintHub();
}

function pjHeader(){
  const d=PJ_DATA||{}; const stats=d.stats||{projects:0,tasks:0};
  const err=d.error?`<div class="pj-error">⚠️ ${esc(d.error)}${APP_USER&&APP_USER.admin?` — <a onclick="openProjectoConnect()">حدّث الربط</a>`:''}</div>`:'';
  const seg=(k,label)=>`<button class="pj-seg ${PJ_VIEW===k?'on':''}" onclick="pjSetView('${k}')">${label}</button>`;
  return `
    <div class="pj-syncbar">
      <span class="pj-sync-info"><span class="pj-dot"></span> ${stats.projects} مشروع · ${stats.tasks} مهمة</span>
      <span class="pj-sync-right"><span class="pj-ago">${timeAgo(d.lastSync)}</span>
        <button class="pj-refresh" id="pjRefresh" onclick="syncProjectoNow()" aria-label="تحديث"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg></button>
      </span>
    </div>
    ${err}
    <div class="pj-searchbar">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input id="pjSearch" type="search" placeholder="ابحث في كل المهام…" value="${esc(PJ_SEARCH)}" autocomplete="off">
    </div>
    <div class="pj-segs">${seg('sections','الأقسام')}${seg('people','الأشخاص')}${seg('overdue','المتأخرة')}</div>`;
}

function paintHub(){
  const view=$('#view');
  view.innerHTML = pjHeader()+`<div id="pjBody">${pjBodyHtml()}</div>`;
  const si=$('#pjSearch');
  if(si){ si.oninput=()=>{ PJ_SEARCH=si.value; const b=$('#pjBody'); if(b) b.innerHTML=pjBodyHtml(); }; }
  if(PJ_SEARCH){ const s=$('#pjSearch'); if(s){ s.focus(); const v=s.value; try{s.setSelectionRange(v.length,v.length);}catch{} } }
}
function pjBodyHtml(){
  if(PJ_SEARCH.trim()) return pjSearchResults();
  if(PJ_VIEW==='sections') return pjSectionsView();
  if(PJ_VIEW==='people')   return pjPeopleView();
  return pjOverdueView();
}
function pjSetView(v){ PJ_VIEW=v; PJ_SEARCH=''; paintHub(); }

/* ---------- عرض الأقسام (شبكة مشاريع) ---------- */
function pjSectionsView(){
  const projects=((PJ_DATA&&PJ_DATA.projects)||[]).filter(p=>p.total>0)
    .sort((a,b)=>(b.total-b.done)-(a.total-a.done)||b.total-a.total);
  if(!projects.length) return `<div class="all-done">ما فيه مشاريع فيها مهام.</div>`;
  let h=`<div class="pj-grid">`;
  projects.forEach(p=>{
    const pct=p.total?Math.round(100*p.done/p.total):0;
    h+=`<button class="pj-card" style="--pc:${esc(p.color)}" onclick="openProjectoProject(${p.id})">
      <div class="pj-card-top"><span class="pj-name">${esc(p.name)}</span><span class="pj-pct">${pct}%</span></div>
      <div class="pj-progress"><span style="width:${pct}%;background:${esc(p.color)}"></span></div>
      <div class="pj-sub">${p.done}/${p.total} مهمة · ${p.boards.length} لوحة</div>
    </button>`;
  });
  return h+`</div>`;
}

/* ---------- عرض الأشخاص ---------- */
function pjAvaColor(name){ const cs=['#4C0192','#1f9d55','#c0392b','#2980b9','#d98c1f','#8e44ad','#16a085','#d35400']; let h=0; for(const c of String(name))h=(h*31+c.charCodeAt(0))>>>0; return cs[h%cs.length]; }
function pjPeopleView(){
  const people=pjPeople();
  if(!people.length) return `<div class="all-done">ما فيه لوحات بأسماء أشخاص.</div>`;
  let h=`<div class="pj-people">`;
  people.forEach(pn=>{
    const initial=(pn.name.trim()[0]||'؟');
    h+=`<button class="pj-person" onclick="openPerson('${esc(pjNorm(pn.name))}')">
      <span class="pj-ava" style="background:${pjAvaColor(pn.name)}">${esc(initial)}</span>
      <span class="pj-person-info"><span class="pj-person-name">${esc(pn.name)}</span><span class="pj-person-sub">${pn.open} نشطة · ${pn.total} إجمالي</span></span>
      ${pn.open?`<span class="pj-person-badge">${pn.open}</span>`:''}
    </button>`;
  });
  return h+`</div>`;
}
function openPerson(key){ PJ_PERSON=key; renderPerson(key); }
function closePerson(){ PJ_PERSON=null; paintHub(); }
function renderPerson(key){
  const view=$('#view');
  const pn=pjPeople().find(x=>pjNorm(x.name)===key);
  if(!pn){ PJ_PERSON=null; return paintHub(); }
  const byProj=new Map();
  pn.tasks.forEach(t=>{ if(!byProj.has(t._proj)) byProj.set(t._proj,{color:t._color,tasks:[]}); byProj.get(t._proj).tasks.push(t); });
  let h=`<button class="pj-back" onclick="closePerson()"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg> الأشخاص</button>
    <div class="pj-proj-head" style="--pc:${pjAvaColor(pn.name)}"><h1>${esc(pn.name)}</h1><div class="pj-sub">${pn.open} نشطة · ${pn.total} إجمالي</div></div>`;
  for(const [proj,info] of byProj){
    const openT=info.tasks.filter(t=>!t.done), doneT=info.tasks.filter(t=>t.done);
    h+=`<div class="pj-board"><div class="pj-board-head"><span class="pj-board-name" style="color:${esc(info.color)}">${esc(proj)}</span><span class="pj-board-count">${info.tasks.length}</span></div>`;
    openT.forEach(t=>h+=pjTaskCard(t));
    if(doneT.length){ h+=`<details class="pj-done-wrap"><summary>${doneT.length} منجزة</summary>`; doneT.forEach(t=>h+=pjTaskCard(t)); h+=`</details>`; }
    h+=`</div>`;
  }
  view.innerHTML=h;
}

/* ---------- عرض المتأخرة / القريبة ---------- */
function pjOverdueView(){
  const all=pjAllTasks().filter(t=>!t.done && t.end).map(t=>({...t,_d:pjDiffDays(t.end)})).filter(t=>t._d!=null);
  const overdue=all.filter(t=>t._d<0).sort((a,b)=>a._d-b._d);
  const soon=all.filter(t=>t._d>=0&&t._d<=7).sort((a,b)=>a._d-b._d);
  if(!overdue.length && !soon.length) return `<div class="all-done">🎉 ما فيه مهام متأخرة أو مستحقّة قريب.</div>`;
  let h='';
  if(overdue.length){ h+=`<div class="group-label"><span class="gname" style="color:#c0392b">متأخرة</span><span class="gcount">${overdue.length}</span><span class="gline"></span></div>`; overdue.forEach(t=>h+=pjTaskCard(t,true)); }
  if(soon.length){ h+=`<div class="group-label"><span class="gname">هذا الأسبوع</span><span class="gcount">${soon.length}</span><span class="gline"></span></div>`; soon.forEach(t=>h+=pjTaskCard(t,true)); }
  return h;
}

/* ---------- البحث ---------- */
function pjSearchResults(){
  const q=pjNorm(PJ_SEARCH);
  const res=pjAllTasks().filter(t=> pjNorm(t.title).includes(q) || pjNorm(t._proj).includes(q) || pjNorm(t._board).includes(q));
  if(!res.length) return `<div class="all-done">ما فيه نتائج لـ «${esc(PJ_SEARCH)}»</div>`;
  const open=res.filter(t=>!t.done), done=res.filter(t=>t.done);
  let h=`<div class="pj-sub" style="margin:0 2px 12px">${res.length} نتيجة</div>`;
  open.forEach(t=>h+=pjTaskCard(t,true));
  if(done.length){ h+=`<div class="group-label"><span class="gname">منجزة</span><span class="gcount">${done.length}</span><span class="gline"></span></div>`; done.forEach(t=>h+=pjTaskCard(t,true)); }
  return h;
}

/* ---------- مشروع (تفاصيل) ---------- */
function openProjectoProject(id){ PJ_PROJECT=id; renderProjectoProject(id); }
function closeProjectoProject(){ PJ_PROJECT=null; paintHub(); }
function renderProjectoProject(id){
  const view=$('#view');
  const p=((PJ_DATA&&PJ_DATA.projects)||[]).find(x=>x.id===id);
  if(!p){ PJ_PROJECT=null; return paintHub(); }
  const pct=p.total?Math.round(100*p.done/p.total):0;
  let h=`<button class="pj-back" onclick="closeProjectoProject()"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg> كل المشاريع</button>
    <div class="pj-proj-head" style="--pc:${esc(p.color)}"><h1>${esc(p.name)}</h1>
      <div class="pj-progress big"><span style="width:${pct}%;background:${esc(p.color)}"></span></div>
      <div class="pj-sub">${p.done}/${p.total} مهمة منجزة · ${pct}%</div></div>`;
  const boards=(p.boards||[]).filter(b=>b.tasks.length);
  if(!boards.length) h+=`<div class="all-done">ما فيه مهام ظاهرة.</div>`;
  boards.forEach(b=>{
    const openT=b.tasks.filter(t=>!t.done), doneT=b.tasks.filter(t=>t.done);
    h+=`<div class="pj-board"><div class="pj-board-head"><span class="pj-board-name">${esc(b.name||'لوحة')}</span><span class="pj-board-count">${b.tasks.length}</span></div>`;
    openT.forEach(t=>h+=pjTaskCard(t));
    if(doneT.length){ h+=`<details class="pj-done-wrap"><summary>${doneT.length} منجزة</summary>`; doneT.forEach(t=>h+=pjTaskCard(t)); h+=`</details>`; }
    h+=`</div>`;
  });
  view.innerHTML=h;
}

/* ---------- بطاقة مهمة ---------- */
function pjDate(iso){ if(!iso) return ''; const d=new Date(iso); if(isNaN(d)) return ''; return d.toLocaleDateString('ar-SA-u-ca-gregory',{day:'numeric',month:'short'}); }
function pjTaskCard(t,showCtx){
  const meta=[];
  const dd=pjDiffDays(t.end);
  if(t.end){ let cls='',txt=pjDate(t.end); if(!t.done&&dd!=null){ if(dd<0){cls='overdue';txt=`متأخرة ${Math.abs(dd)} يوم`;} else if(dd===0){cls='soon';txt='اليوم';} else if(dd===1){cls='soon';txt='بكرة';} } meta.push(`<span class="due ${cls}">${esc(txt)}</span>`); }
  if(showCtx && t._proj) meta.push(`<span class="pj-ctx">${esc(t._proj)}${t._board?' · '+esc(t._board):''}</span>`);
  if(t.comments) meta.push(`<span class="pj-cm">💬 ${t.comments}</span>`);
  if(t.files) meta.push(`<span class="pj-cm">📎 ${t.files}</span>`);
  return `<div class="task-card pj ${t.done?'done':''}" onclick="pjTaskDetail(${t.id})">
    <span class="task-check ${t.done?'on':''}">${t.done?'<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 16.2l-3.5-3.5-1.4 1.4L9 19 20 8l-1.4-1.4z"/></svg>':''}</span>
    <div class="task-body"><div class="task-title">${esc(t.title)}</div>${meta.length?`<div class="task-meta">${meta.join('')}</div>`:''}</div>
  </div>`;
}
function pjTaskDetail(id){
  const d=PJ_DATA||{}; let task=null,proj=null,board=null;
  for(const p of (d.projects||[])) for(const b of (p.boards||[])){ const f=b.tasks.find(x=>x.id===id); if(f){task=f;proj=p;board=b;} }
  if(!task) return;
  sheet.open(`
    <h2>${esc(task.title)}</h2>
    <p class="sub">${esc(proj.name)} · ${esc(board.name||'')}${task.done?' · ✅ منجزة':''}</p>
    ${task.desc?`<div class="pj-desc">${esc(task.desc).replace(/\n/g,'<br>')}</div>`:'<p class="link-hint small">ما فيه وصف.</p>'}
    <div class="pj-detail-meta">
      ${task.start?`<div><span>البداية</span>${esc(pjDate(task.start))}</div>`:''}
      ${task.end?`<div><span>التسليم</span>${esc(pjDate(task.end))}</div>`:''}
      ${task.comments?`<div><span>تعليقات</span>${task.comments}</div>`:''}
      ${task.files?`<div><span>ملفات</span>${task.files}</div>`:''}
    </div>
    <button class="btn-ghost" onclick="sheet.close()">إغلاق</button>
  `);
}

async function syncProjectoNow(){
  const btn=$('#pjRefresh'); if(btn) btn.classList.add('spinning');
  try{
    const r=await fetch(bot.url()+'/projecto/sync',{method:'POST',credentials:'same-origin'});
    const j=await r.json();
    if(j.ok){ toast(`تمّت المزامنة · ${j.stats.tasks} مهمة`); PJ_DATA=null; await renderTasks(); }
    else toast(j.error||'تعذّرت المزامنة');
  }catch{ toast('ما قدرت أتصل بالسيرفر'); }
  finally{ const b=$('#pjRefresh'); if(b) b.classList.remove('spinning'); }
}

function openProjectoConnect(){
  sheet.open(`
    <h2>ربط Projecto</h2>
    <p class="sub">مرّة وحدة، وبعدها المهام تتحدّث تلقائياً كل ٣ ساعات على السيرفر.</p>
    <div class="link-box" style="text-align:right;align-items:stretch;gap:8px">
      <p class="link-hint" style="max-width:none;font-weight:700;color:var(--charcoal)">الطريقة:</p>
      <ol class="howto">
        <li>افتح Projecto في المتصفح على الكمبيوتر.</li>
        <li>افتح أدوات المطوّر (F12) → تبويب <b>Network</b>.</li>
        <li>كليك يمين على أي طلب اسمه <b>LoadActiveUsersByTeam</b> → Copy → <b>Copy as cURL</b>.</li>
        <li>الصقه في المربّع تحت.</li>
      </ol>
    </div>
    <div class="field"><textarea id="pj_curl" rows="4" placeholder="الصق أمر cURL هنا…" dir="ltr" style="text-align:left;font-family:monospace;font-size:12px"></textarea></div>
    <button class="btn-primary" id="pj_connect">ربط ومزامنة</button>
    <button class="btn-ghost" onclick="sheet.close()">إلغاء</button>
  `);
  $('#pj_connect').addEventListener('click', async ()=>{
    const curl = $('#pj_curl').value.trim();
    if(curl.length<40){ toast('الصق أمر cURL كامل'); return; }
    const btn=$('#pj_connect'); btn.disabled=true; btn.textContent='جاري الربط والمزامنة…';
    try{
      const r = await fetch(bot.url()+'/projecto/connect', {method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body:JSON.stringify({curl})});
      const j = await r.json();
      if(j.ok){ toast(`تم الربط · ${j.stats.tasks} مهمة`); sheet.close(); PJ_DATA=null; renderTasks(); }
      else { toast(j.error||'تعذّر الربط'); btn.disabled=false; btn.textContent='ربط ومزامنة'; }
    }catch{ toast('ما قدرت أتصل بالسيرفر'); btn.disabled=false; btn.textContent='ربط ومزامنة'; }
  });
}

function taskCard(t){
  const client = t.clientId ? store.clients.find(c=>c.id===t.clientId) : null;
  const clientName = client ? client.name : (t.clientName||'');
  const due = formatDue(t.due);
  const meta = [];
  if(clientName) meta.push(`<span class="tag">${esc(clientName)}</span>`);
  if(due) meta.push(`<span class="due ${due.cls}">${esc(due.text)}</span>`);
  if(t.source==='projecto') meta.push(`<span class="src">Projecto</span>`);
  return `
    <div class="task-card ${t.done?'done':''}">
      <button class="task-check ${t.done?'on':''}" onclick="toggleTask('${t.id}')" aria-label="تبديل الإنجاز">
        ${t.done ? '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 16.2l-3.5-3.5-1.4 1.4L9 19 20 8l-1.4-1.4z"/></svg>' : ''}
      </button>
      <div class="task-body" onclick="taskMenu('${t.id}')">
        <div class="task-title">${esc(t.title)}</div>
        ${meta.length?`<div class="task-meta">${meta.join('')}</div>`:''}
      </div>
      <span class="prio-dot" style="background:${prioColor(t.priority)}" title="${esc(t.priority||'عادية')}"></span>
    </div>`;
}

function toggleTask(id){
  const t = store.tasks.find(x=>x.id===id); if(!t) return;
  store.updateTask(id, { done: !t.done, doneAt: !t.done ? Date.now() : null });
  renderTasks();
}

function openTaskForm(editId){
  const editing = editId ? store.tasks.find(t=>t.id===editId) : null;
  const t = editing || { priority:'عادية' };
  const clients = store.clients;

  sheet.open(`
    <h2>${editing?'تعديل المهمة':'مهمة جديدة'}</h2>
    <p class="sub">${editing?'حدّث تفاصيل المهمة.':'اكتب المهمة وفاصيلها.'}</p>

    <div class="field">
      <label>المهمة *</label>
      <input id="t_title" value="${esc(t.title||'')}" placeholder="مثال: تجهيز عرض حملة رمضان" autocomplete="off">
    </div>

    <div class="field">
      <label>العميل (اختياري)</label>
      <select id="t_client">
        <option value="">— بدون عميل —</option>
        ${clients.map(c=>`<option value="${c.id}" ${c.id===t.clientId?'selected':''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>

    <div class="field">
      <label>الأولوية</label>
      <div class="prio-row" id="t_prio">
        ${TASK_PRIORITIES.map(p=>`<button type="button" class="prio-chip ${p.key===(t.priority||'عادية')?'on':''}" data-p="${p.key}" style="--pc:${p.color}">${p.key}</button>`).join('')}
      </div>
    </div>

    <div class="field">
      <label>تاريخ التسليم (اختياري)</label>
      <input id="t_due" type="date" value="${esc(t.due||'')}" style="text-align:right">
    </div>

    <button class="btn-primary" id="t_save" disabled>${editing?'حفظ التعديلات':'إضافة المهمة'}</button>
    <button class="btn-ghost" onclick="sheet.close()">إلغاء</button>
  `);

  let pickedPrio = t.priority || 'عادية';
  $('#t_prio').addEventListener('click', e=>{
    const b=e.target.closest('.prio-chip'); if(!b) return;
    $('#t_prio').querySelectorAll('.prio-chip').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); pickedPrio=b.dataset.p;
  });

  const titleInput=$('#t_title'), saveBtn=$('#t_save');
  const validate=()=>{ saveBtn.disabled = titleInput.value.trim().length<2; };
  titleInput.addEventListener('input', validate); validate();
  titleInput.focus();

  saveBtn.addEventListener('click', ()=>{
    const clientId = $('#t_client').value;
    const payload = {
      title:$('#t_title').value.trim(),
      clientId: clientId || null,
      priority: pickedPrio,
      due: $('#t_due').value || null,
    };
    if(editing){ store.updateTask(editId, payload); toast('تم حفظ التعديلات'); }
    else{ store.addTask({ id:'t'+Date.now().toString(36), createdAt:Date.now(), done:false, source:'manual', ...payload }); toast('أُضيفت المهمة ✓'); }
    sheet.close(); renderTasks();
  });
}

function taskMenu(id){
  const t = store.tasks.find(x=>x.id===id); if(!t) return;
  const client = t.clientId ? store.clients.find(c=>c.id===t.clientId) : null;
  sheet.open(`
    <h2>${esc(t.title)}</h2>
    <p class="sub">${t.priority||'عادية'}${client?' · '+esc(client.name):''}${t.due?' · '+esc(formatDue(t.due).text):''}</p>
    <div class="action-list">
      <button class="action-item" onclick="toggleTask('${id}');sheet.close()">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M9 16.2l-3.5-3.5-1.4 1.4L9 19 20 8l-1.4-1.4z"/></svg>
        ${t.done?'تحديد كغير منجزة':'تحديد كمنجزة'}</button>
      <button class="action-item" onclick="sheet.close();openTaskForm('${id}')">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.58z"/></svg>
        تعديل المهمة</button>
      <button class="action-item danger" onclick="(function(){store.removeTask('${id}');toast('تم الحذف');sheet.close();renderTasks();})()">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M6 7h12v13a1 1 0 01-1 1H7a1 1 0 01-1-1V7zm3-3h6l1 2h4v2H4V6h4l1-2z"/></svg>
        حذف المهمة</button>
    </div>
  `);
}

/* ---------- استيراد مهام Projecto (بدون API) ---------- */
function openProjecto(){
  sheet.open(`
    <h2>مهام Projecto</h2>
    <p class="sub">Projecto ما يوفّر API — نستورد المهام من ملف CSV.</p>
    <div class="link-box" style="text-align:right;align-items:stretch;gap:8px">
      <p class="link-hint" style="max-width:none;font-weight:700;color:var(--charcoal)">الطريقة:</p>
      <ol class="howto">
        <li>افتح Projecto على المتصفح → صفحة المهام.</li>
        <li>اضغط «تصدير / Export» — يطلع ملف <b>Excel</b>.</li>
        <li>ارجع هنا واختر الملف مباشرة (Excel أو CSV).</li>
      </ol>
    </div>
    <input type="file" id="pj_file" accept=".csv,.xlsx,.xls,text/csv" hidden>
    <button class="btn-primary" id="pj_pick" style="margin-top:16px">📁 اختر ملف (Excel أو CSV)</button>
    <button class="btn-ghost" onclick="sheet.close()">إغلاق</button>
  `);
  $('#pj_pick').addEventListener('click', ()=>$('#pj_file').click());
  $('#pj_file').addEventListener('change', async e=>{
    const file = e.target.files[0]; if(!file) return;
    try{
      let rows;
      const isExcel = /\.xlsx?$/i.test(file.name);
      if(isExcel){
        if(typeof XLSX === 'undefined'){ toast('مكتبة Excel ما حمّلت — حدّث الصفحة'); return; }
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type:'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:false, defval:'' });
      }else{
        rows = parseCSV(await file.text());
      }
      const tasks = parseTasksRows(rows);
      if(!tasks.length){ toast('ما لقيت مهام — تأكد إن الملف فيه عمود للعنوان'); return; }
      previewImport(tasks);
    }catch(err){ console.error(err); toast('تعذّر قراءة الملف'); }
  });
}

function previewImport(tasks){
  const sample = tasks.slice(0,5).map(t=>
    `<li>${esc(t.title)}${t.due?` <span style="color:var(--muted);font-size:12px">(${esc(t.due)})</span>`:''}</li>`).join('');
  sheet.open(`
    <h2>استيراد المهام</h2>
    <p class="sub">وجدنا ${tasks.length} مهمة في الملف.</p>
    <ul class="howto preview">${sample}</ul>
    ${tasks.length>5?`<p class="link-hint small">…و${tasks.length-5} مهمة أخرى</p>`:''}
    <button class="btn-primary" id="pj_confirm">استورد ${tasks.length} مهمة</button>
    <button class="btn-ghost" onclick="openProjecto()">رجوع</button>
  `);
  $('#pj_confirm').addEventListener('click', ()=>{
    let n=0;
    tasks.forEach(t=>{
      const client = t.clientName ? store.clients.find(c=>(c.name||'').trim()===t.clientName.trim()) : null;
      store.addTask({
        id:'t'+Date.now().toString(36)+(n++), createdAt:Date.now(), done:!!t.done, source:'projecto',
        title:t.title, due:t.due||null, priority:t.priority||'عادية',
        clientId: client?client.id:null, clientName: client?null:(t.clientName||null)
      });
    });
    store.setSettings({ projectoMode:'csv' });
    toast(`تم استيراد ${tasks.length} مهمة ✓`); sheet.close(); switchTab('tasks');
  });
}

// محلّل CSV (يدعم علامات الاقتباس والفواصل داخل الحقول)
function parseCSV(text){
  text = text.replace(/^﻿/, '');            // إزالة BOM
  const rows=[]; let row=[], field='', inQ=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(inQ){
      if(c==='"'){ if(text[i+1]==='"'){field+='"';i++;} else inQ=false; }
      else field+=c;
    }else{
      if(c==='"') inQ=true;
      else if(c===','){ row.push(field); field=''; }
      else if(c==='\n'||c==='\r'){ if(c==='\r'&&text[i+1]==='\n')i++; row.push(field); rows.push(row); row=[]; field=''; }
      else field+=c;
    }
  }
  if(field!==''||row.length){ row.push(field); rows.push(row); }
  return rows;
}

function parseTasksRows(allRows){
  const rows = (allRows||[]).filter(r=>Array.isArray(r) && r.some(c=>String(c==null?'':c).trim()!==''));
  if(rows.length<2) return [];
  const header = rows[0].map(h=>String(h==null?'':h).trim().toLowerCase());
  const find = (...keys)=> header.findIndex(h=> keys.some(k=>h.includes(k)));
  let ti = find('title','task','subject','name','المهمة','المهمه','العنوان','عنوان','اسم','البند');
  if(ti<0) ti=0;
  const di = find('due','date','deadline','تاريخ','التسليم','الموعد','استحقاق','نهاية');
  const si = find('status','state','الحالة','حالة','منجز');
  const pi = find('priority','الأولوية','الاولوية','اولوية','أهمية');
  const ci = find('client','project','assignee','عميل','مشروع','الجهة','المسؤول');
  const cell=(r,idx)=> idx>=0 ? String(r[idx]==null?'':r[idx]).trim() : '';
  const out=[];
  for(let i=1;i<rows.length;i++){
    const r=rows[i];
    const title=cell(r,ti);
    if(!title) continue;
    const statusVal=cell(r,si).toLowerCase();
    out.push({
      title,
      due: di>=0 ? toISODate(cell(r,di)) : null,
      done: /done|complete|completed|closed|finished|منجز|مكتمل|مغلق|انتهى/.test(statusVal),
      priority: pi>=0 ? mapPriority(cell(r,pi)) : 'عادية',
      clientName: ci>=0 ? cell(r,ci) : null,
    });
  }
  return out;
}
function mapPriority(v){
  v=(v||'').toLowerCase();
  if(/urgent|high|critical|عاجل|مرتفع|حرج/.test(v)) return 'عاجلة';
  if(/medium|important|مهم|متوسط/.test(v)) return 'مهمة';
  return 'عادية';
}
function toISODate(v){
  v=(v||'').trim(); if(!v) return null;
  let m=v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if(m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m=v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);          // DD/MM/YYYY
  if(m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  const d=new Date(v); if(!isNaN(d.getTime())) return d.toISOString().slice(0,10);
  return null;
}

/* ===================================================================
   التنقل
=================================================================== */
let activeTab='clients';
function switchTab(tab){
  activeTab=tab;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===tab));
  $('#searchWrap').hidden=true; $('#searchToggle').style.visibility = tab==='clients'?'visible':'hidden';
  const fab=$('#fab'); if(fab) fab.style.display = tab==='tasks' ? 'none' : '';
  if(tab==='clients') renderClients();
  else if(tab==='proposals'){ propsView='home'; renderProposals(); }
  else { PJ_PROJECT=null; PJ_PERSON=null; PJ_SEARCH=''; renderTasks(); }
}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>switchTab(t.dataset.tab)));

$('#fab').addEventListener('click', ()=>{
  if(activeTab==='clients') openClientForm();
  else if(activeTab==='tasks') openTaskForm();
  else if(activeTab==='proposals') openProposalForm();
});

// البحث
$('#searchToggle').addEventListener('click', ()=>{
  const w=$('#searchWrap'); w.hidden=!w.hidden;
  if(!w.hidden) $('#searchInput').focus();
  else { currentSearch=''; $('#searchInput').value=''; renderClients(); }
});
$('#searchInput').addEventListener('input', e=>{ currentSearch=e.target.value; renderClients(); });

/* ---------- تشغيل ---------- */
window.openClientForm=openClientForm; window.clientMenu=clientMenu;
window.confirmDelete=confirmDelete; window.sheet=sheet; window.store=store; window.toast=toast;
window.openSettings=openSettings;
window.openTaskForm=openTaskForm; window.taskMenu=taskMenu; window.toggleTask=toggleTask; window.openProjecto=openProjecto;
window.openProposalForm=openProposalForm; window.proposalMenu=proposalMenu; window.moveProposal=moveProposal;
window.openPropNotify=openPropNotify; window.showArchive=showArchive; window.propsHome=propsHome;
window.pickArchiveFile=pickArchiveFile; window.deleteArchiveFile=deleteArchiveFile; window.openStoredFile=openStoredFile;
window.logout=logout; window.openTeam=openTeam;

loadMe();   // جلب بيانات المستخدم المسجّل

// افتح التبويب المطلوب عند الرجوع من قسم المؤثرين (index.html?tab=...)
(function(){
  const t = new URLSearchParams(location.search).get('tab');
  if(t && ['clients','proposals','tasks'].includes(t)) switchTab(t);
  else renderClients();
})();

// أثناء التطوير: ألغِ أي service worker قديم وامسح الكاش (يمنع النسخ العالقة)
if('serviceWorker' in navigator){
  navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});
}
if(window.caches){ caches.keys().then(ks=>ks.forEach(k=>caches.delete(k))).catch(()=>{}); }
