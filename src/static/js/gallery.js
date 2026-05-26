/* CardCrafter — gallery.js */
let allTemplates = [], currentFilter = 'all';
let selectedFile = null, pdfSession = null;
let pickerFrontPage = 0, pickerBackPage = -1, pickerSelectingFor = 'front';

// ── Galerie ──────────────────────────────────────────────────────
async function loadGallery() {
  try { allTemplates = await api.get('/api/templates/'); renderGallery(); }
  catch(e) { toast('Chargement échoué : ' + e.message, 'error'); }
}
function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.filter === f));
  renderGallery();
}
function filterGallery() { renderGallery(); }

function renderGallery() {
  const q    = document.getElementById('search-input').value.toLowerCase();
  const grid = document.getElementById('gallery-grid');
  let list   = allTemplates.filter(t => {
    if (q && !t.name.toLowerCase().includes(q)) return false;
    if (currentFilter === 'fav' && !t.favorite) return false;
    return true;
  });
  if (currentFilter === 'recent') list = [...list].reverse();

  if (!list.length) {
    grid.innerHTML = `<div class="gallery-empty"><div class="empty-icon">⚔</div>
      <p>${q ? 'Aucun résultat.' : 'Importez une image ou un PDF pour commencer.'}</p></div>`;
    return;
  }
  grid.innerHTML = list.map(t => `
    <div class="tpl-card" onclick="openTemplate('${t.id}')"
         oncontextmenu="showCtxMenu(event,'${t.id}')">
      <button class="fav-btn ${t.favorite?'active':''}"
              onclick="event.stopPropagation();toggleFav('${t.id}')"
              title="${t.favorite?'Retirer des favoris':'Ajouter aux favoris'}">
        ${t.favorite ? '★' : '☆'}
      </button>
      ${t.has_back ? '<div style="position:absolute;top:6px;left:8px;font-size:.65rem;background:var(--gold)22;color:var(--gold);border-radius:3px;padding:1px 5px;border:1px solid var(--gold)44">RECTO/VERSO</div>' : ''}
      <img class="tpl-card-thumb" src="${t.thumbnail}?v=${Date.now()}" loading="lazy"
           alt="${esc(t.name)}"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <div class="tpl-card-thumb-placeholder" style="display:none">⚔</div>
      <div class="tpl-card-body">
        <div class="tpl-card-name">${esc(t.name)}</div>
        <div class="tpl-card-meta">
          <span>▭ ${t.field_count} zone${t.field_count!==1?'s':''}</span>
          <span>${t.img_w}×${t.img_h}</span>
        </div>
      </div>
      <div class="tpl-card-overlay">
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();location.href='/editor/${t.id}'">✏ Éditeur</button>
        <button class="btn btn-gold btn-sm"    onclick="event.stopPropagation();location.href='/generator/${t.id}'">🎴 Générer</button>
      </div>
    </div>
  `).join('');
}

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function openTemplate(id) { location.href = '/editor/' + id; }

// ── Context menu ──────────────────────────────────────────────────
const ctxMenu = document.getElementById('ctx-menu');
function showCtxMenu(e, tid) {
  e.preventDefault(); e.stopPropagation();
  const t = allTemplates.find(x => x.id === tid);
  ctxMenu.innerHTML = [
    {label:'✏ Éditeur',   fn:`location.href='/editor/${tid}'`},
    {label:'🎴 Générateur',fn:`location.href='/generator/${tid}'`},
    {sep:true},
    {label:`${t?.favorite?'★ Retirer des':'☆ Ajouter aux'} favoris`, fn:`toggleFav('${tid}')`},
    {label:'📋 Dupliquer', fn:`duplicateTemplate('${tid}')`},
    {label:'✎ Renommer',  fn:`renameTemplate('${tid}')`},
    {sep:true},
    {label:'🗑 Supprimer', fn:`deleteTemplate('${tid}')`, danger:true},
  ].map(i => i.sep
    ? `<div style="height:1px;background:var(--border);margin:4px 0"></div>`
    : `<div onclick="${i.fn};hideCtxMenu()" style="padding:8px 16px;cursor:pointer;font-size:.82rem;color:${i.danger?'var(--red)':'var(--text)'};white-space:nowrap"
           onmouseenter="this.style.background='var(--bg3)'"
           onmouseleave="this.style.background=''">${i.label}</div>`
  ).join('');
  ctxMenu.style.cssText = `display:block;left:${Math.min(e.clientX,innerWidth-185)}px;top:${Math.min(e.clientY,innerHeight-260)}px`;
}
function hideCtxMenu() { ctxMenu.style.display='none'; }
document.addEventListener('click', hideCtxMenu);

// ── Actions ───────────────────────────────────────────────────────
async function toggleFav(tid) {
  try {
    const cfg = await api.post(`/api/templates/${tid}/favorite`, {});
    const t   = allTemplates.find(x => x.id === tid);
    if (t) t.favorite = cfg.favorite;
    renderGallery();
    toast(cfg.favorite ? '★ Ajouté aux favoris' : 'Retiré des favoris', 'info');
  } catch(e) { toast(e.message,'error'); }
}
async function duplicateTemplate(tid) {
  try { const c = await api.post(`/api/templates/${tid}/duplicate`,{}); toast('Dupliqué : '+c.name,'success'); loadGallery(); }
  catch(e) { toast(e.message,'error'); }
}
async function deleteTemplate(tid) {
  const t = allTemplates.find(x=>x.id===tid);
  if (!confirm(`Supprimer "${t?.name}" ?`)) return;
  try { await api.delete(`/api/templates/${tid}`); toast('Supprimé','info'); loadGallery(); }
  catch(e) { toast(e.message,'error'); }
}
async function renameTemplate(tid) {
  const t = allTemplates.find(x=>x.id===tid);
  const n = prompt('Nouveau nom :',t?.name||''); if(!n?.trim()) return;
  try {
    const fd=new FormData(); fd.append('name',n.trim());
    const r=await fetch(`/api/templates/${tid}/rename`,{method:'PUT',body:fd});
    if(!r.ok) throw new Error((await r.json()).detail);
    toast('Renommé','success'); loadGallery();
  } catch(e){toast(e.message,'error');}
}

// ── Upload modal ──────────────────────────────────────────────────
function openUploadModal()  { document.getElementById('upload-overlay').classList.remove('hidden'); }
function closeUploadModal() {
  document.getElementById('upload-overlay').classList.add('hidden');
  selectedFile=null; pdfSession=null; pickerFrontPage=0; pickerBackPage=-1;
  document.getElementById('upload-name').value='';
  document.getElementById('file-input').value='';
  document.getElementById('upload-preview').innerHTML='';
  document.getElementById('upload-submit').disabled=true;
  showStep(1);
}
function showStep(n) {
  document.getElementById('step-upload').style.display    = n===1 ? '' : 'none';
  document.getElementById('step-pdf-picker').style.display = n===2 ? '' : 'none';
}
function backToStep1() { showStep(1); }

function handleFileSelect(e) { const f=e.target.files[0]; if(f) processFile(f); }
function handleDrop(e) {
  e.preventDefault(); document.getElementById('upload-zone').classList.remove('drag-over');
  const f=e.dataTransfer.files[0]; if(f) processFile(f);
}

async function processFile(file) {
  selectedFile = file;
  if (!document.getElementById('upload-name').value)
    document.getElementById('upload-name').value = file.name.replace(/\.[^.]+$/,'');

  const isPdf = file.type==='application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    document.getElementById('upload-preview').innerHTML =
      `<div style="margin-top:8px;color:var(--text2);font-size:.82rem">
        📄 ${esc(file.name)} — ${(file.size/1024/1024).toFixed(1)} MB
        <span style="color:var(--cyan);margin-left:8px">⟳ Extraction des pages…</span>
       </div>`;
    document.getElementById('upload-submit').disabled = true;

    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/templates/pdf-extract', {method:'POST', body:fd});
      if (!res.ok) throw new Error((await res.json()).detail);
      const data = await res.json();
      pdfSession = data;
      pickerFrontPage = 0;
      pickerBackPage  = -1;
      document.getElementById('pdf-picker-title').textContent =
        `${data.count} page${data.count>1?'s':''} — Choisissez le Recto (et Verso si double face)`;
      buildPdfPicker(data.pages);
      showStep(2);
      document.getElementById('upload-submit').disabled = false;
    } catch(e) {
      document.getElementById('upload-preview').innerHTML =
        `<div style="color:var(--red);font-size:.82rem;margin-top:8px">Erreur : ${e.message}</div>`;
    }
  } else {
    const url = URL.createObjectURL(file);
    document.getElementById('upload-preview').innerHTML =
      `<img src="${url}" style="max-width:100%;max-height:180px;border-radius:6px;margin-top:8px;border:1px solid var(--border)">`;
    document.getElementById('upload-submit').disabled = false;
  }
}

function buildPdfPicker(pages) {
  // Reset UI
  document.getElementById('front-preview').innerHTML = 'Cliquez une page ci-dessous';
  document.getElementById('back-preview').innerHTML  = 'Optionnel — laisser vide si pas de verso';
  document.getElementById('box-front').className = 'pdf-side-box';
  document.getElementById('box-back').className  = 'pdf-side-box';

  const grid = document.getElementById('pdf-pages-grid');
  grid.innerHTML = pages.map(p => `
    <div>
      <img class="pdf-page-thumb" id="pthumb-${p.index}"
           src="${p.thumb_url}" loading="lazy"
           alt="Page ${p.index+1}"
           onclick="pickPage(${p.index},'${p.thumb_url}','${p.full_url}')">
      <div class="pdf-page-label">Page ${p.index+1}</div>
      <div class="pdf-page-badges" id="pbadge-${p.index}"></div>
    </div>
  `).join('');
}

function pickPage(idx, thumbUrl, fullUrl) {
  // Premier clic → recto, deuxième clic sur une autre → verso
  if (idx === pickerFrontPage && pickerFrontPage >= 0) {
    // Clic sur le recto déjà sélectionné → passer en mode sélection verso
    pickerSelectingFor = 'back';
  } else if (pickerBackPage === idx) {
    // Désélectionner le verso
    pickerBackPage = -1; updatePickerUI(); return;
  } else if (pickerFrontPage < 0 || pickerSelectingFor === 'front') {
    pickerFrontPage = idx; pickerSelectingFor = 'back';
  } else {
    pickerBackPage = idx; pickerSelectingFor = 'front';
  }
  updatePickerUI();
}

function updatePickerUI() {
  const pages = pdfSession?.pages || [];
  pages.forEach(p => {
    const thumb = document.getElementById('pthumb-'+p.index);
    const badge = document.getElementById('pbadge-'+p.index);
    if (!thumb) return;
    thumb.className = 'pdf-page-thumb' +
      (p.index===pickerFrontPage?' sel-front':'') +
      (p.index===pickerBackPage ?' sel-back':'');
    badge.innerHTML =
      (p.index===pickerFrontPage ? '<span class="pdf-page-badge badge-front">RECTO</span>' : '') +
      (p.index===pickerBackPage  ? '<span class="pdf-page-badge badge-back">VERSO</span>'  : '');
  });

  // Update side boxes
  const fp = pages.find(p=>p.index===pickerFrontPage);
  const bp = pages.find(p=>p.index===pickerBackPage);
  const frontBox = document.getElementById('box-front');
  const backBox  = document.getElementById('box-back');

  if (fp) {
    frontBox.className = 'pdf-side-box has-selection';
    document.getElementById('front-preview').innerHTML =
      `<img class="pdf-side-img" src="${fp.thumb_url}" alt="Recto">`;
  }
  if (bp) {
    backBox.className = 'pdf-side-box has-back';
    document.getElementById('back-preview').innerHTML =
      `<img class="pdf-side-img" src="${bp.thumb_url}" alt="Verso">`;
  } else {
    backBox.className = 'pdf-side-box';
    document.getElementById('back-preview').innerHTML = 'Optionnel — laisser vide si pas de verso';
  }
}

async function submitUpload() {
  if (!selectedFile) return;
  const name = document.getElementById('upload-name').value.trim();
  if (!name) { toast('Donnez un nom au template','error'); return; }

  const isPdf = selectedFile.type==='application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');
  const fd    = new FormData();
  fd.append('name', name);
  fd.append('file', selectedFile);

  if (isPdf && pdfSession) {
    fd.append('session_id',  pdfSession.session_id);
    fd.append('front_page',  pickerFrontPage);
    fd.append('back_page',   pickerBackPage);
  }

  const btn = document.getElementById('upload-submit');
  btn.disabled=true; btn.textContent='⟳ Création…';

  try {
    const cfg = await api.form('/api/templates/upload', fd);
    toast(`Template créé : ${cfg.name}${cfg.has_back?' (recto/verso)':''}`, 'success');
    closeUploadModal(); loadGallery();
  } catch(e) {
    toast('Erreur : '+e.message,'error');
    btn.disabled=false; btn.textContent='Créer le template';
  }
}

loadGallery();
