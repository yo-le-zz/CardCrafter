/* ═══════════════════════════════════════════════════════════════════
   CardCrafter — card-gen.js
   Layout 3 colonnes : formulaire | préview | propriétés zone
   ═══════════════════════════════════════════════════════════════════ */

const G = {
  templateId:    TEMPLATE_ID,
  cfg:           null,
  zones:         [],
  localZones:    [],
  imageFiles:    {},
  currentCardId: null,
  currentSide:   'front',
  batch:         [],
  cardWmm:       63.5,
  cardHmm:       88.9,
  overlayScale:  1,
  overlayVisible:true,
  selectedZoneId:null,
  isDragging:    false,
  isResizing:    false,
  dragStart:     null,
  resizeHandle:  null,
  overlayDirty:  false,
};

const deepClone = z => z.map(z => ({ ...z, style: { ...(z.style||{}) } }));

// ── Init ──────────────────────────────────────────────────────────
async function initGenerator() {
  try {
    G.cfg      = await api.get(`/api/templates/${TEMPLATE_ID}`);
    G.zones    = G.cfg.zones || [];
    G.cardWmm  = G.cfg.card_w_mm || _settings.card_w_mm || 63.5;
    G.cardHmm  = G.cfg.card_h_mm || _settings.card_h_mm || 88.9;
    G.localZones = deepClone(G.zones);

    document.getElementById('gen-tpl-name').textContent = G.cfg.name;
    document.getElementById('gen-tpl-sub').textContent  =
      `${G.zones.length} zone(s)${G.cfg.has_back ? ' · Recto/Verso' : ''}`;

    if (G.cfg.has_back)
      document.getElementById('side-toggle').style.display = '';

    buildForm();
  } catch(e) { toast('Erreur chargement : ' + e.message, 'error'); }
}

// ── Formulaire ────────────────────────────────────────────────────
function buildForm() {
  const body = document.getElementById('gen-form-body');
  if (!G.zones.length) {
    body.innerHTML = `<div class="text-muted text-center" style="padding:40px 0">
      <p>Aucune zone.<br><a href="/editor/${G.templateId}">Ouvrir l'éditeur</a></p></div>`;
    return;
  }
  body.innerHTML = G.zones.map(renderField).join('');
}

function renderField(z) {
  if (z.type === 'image') {
    return `<div class="gen-field-group" id="fg-${z.id}">
      <div class="gen-field-label">${z.name}
        <span class="field-type-badge">📷 Image</span></div>
      ${G.imageFiles[z.name] ? renderImgPreview(z) : renderImgUpload(z)}
    </div>`;
  }
  const defVal = (z.default||'').replace(/</g,'&lt;');
  const rows   = z.width * z.height > 8000 ? 5 : 2;
  return `<div class="gen-field-group">
    <div class="gen-field-label">${z.name}
      <span class="field-type-badge">${z.type==='text_cover'?'✂ Replace':'✍ Texte'}</span></div>
    <textarea id="fi-${z.id}" rows="${rows}"
      placeholder="${z.name}…&#10;Entrée = nouvelle ligne · - item = puce"
      oninput="autoResize(this)">${defVal}</textarea>
    <small style="color:var(--text3);font-size:.68rem;margin-top:2px;display:block">
      <code>Entrée</code> = saut · <code>- texte</code> = puce
    </small>
  </div>`;
}

function renderImgUpload(z) {
  return `<div class="img-upload-zone" id="iz-${z.id}"
      onclick="document.getElementById('fi-${z.id}').click()"
      ondragover="event.preventDefault()"
      ondrop="handleImgDrop(event,'${z.id}','${z.name}')">
    <span style="font-size:1.4rem">🖼</span><p>Cliquez ou glissez</p>
  </div>
  <input type="file" id="fi-${z.id}" hidden accept="image/*"
         onchange="handleImgFile(event,'${z.id}','${z.name}')">`;
}

function renderImgPreview(z) {
  const url = URL.createObjectURL(G.imageFiles[z.name]);
  return `<div class="img-field-preview">
    <img src="${url}" alt="${z.name}">
    <div class="img-field-actions">
      <button class="btn btn-secondary btn-sm" style="flex:1"
              onclick="changeImage('${z.id}','${z.name}')">🔄 Changer</button>
      <button class="btn btn-danger btn-sm"
              onclick="removeImage('${z.id}','${z.name}')">✕ Retirer</button>
    </div>
  </div>
  <input type="file" id="fi-${z.id}" hidden accept="image/*"
         onchange="handleImgFile(event,'${z.id}','${z.name}')">`;
}

function autoResize(el) { el.style.height='auto'; el.style.height=el.scrollHeight+'px'; }

// Gestion images
function handleImgFile(e,zid,zname) { const f=e.target.files[0]; if(f) attachImg(zid,zname,f); }
function handleImgDrop(e,zid,zname) {
  e.preventDefault();
  const f=e.dataTransfer.files[0];
  if(f&&f.type.startsWith('image/')) attachImg(zid,zname,f);
}
function attachImg(zid,zname,file) {
  G.imageFiles[zname]=file;
  const fg=document.getElementById('fg-'+zid);
  const z=G.zones.find(z=>z.id===zid);
  if(fg&&z) fg.innerHTML=`<div class="gen-field-label">${z.name}
    <span class="field-type-badge">📷 Image</span></div>${renderImgPreview(z)}`;
  toast(`Image "${zname}" prête`,'success');
}
function changeImage(zid,zname) { document.getElementById('fi-'+zid)?.click(); }
function removeImage(zid,zname) {
  delete G.imageFiles[zname];
  const fg=document.getElementById('fg-'+zid);
  const z=G.zones.find(z=>z.id===zid);
  if(fg&&z) fg.innerHTML=`<div class="gen-field-label">${z.name}
    <span class="field-type-badge">📷 Image</span></div>${renderImgUpload(z)}`;
  toast(`Image "${zname}" retirée`,'info');
}

function collectData() {
  const d={};
  G.zones.filter(z=>z.type!=='image').forEach(z=>{
    const el=document.getElementById('fi-'+z.id);
    if(el) d[z.name]=el.value||z.default||'';
  });
  return d;
}
function buildFd(data,zonesOverride=null) {
  const fd=new FormData();
  fd.append('template_id',G.templateId);
  fd.append('field_data',JSON.stringify(data));
  fd.append('side',G.currentSide);
  if(zonesOverride) fd.append('zones_override',JSON.stringify(zonesOverride));
  for(const [n,f] of Object.entries(G.imageFiles))
    fd.append('files',f.slice(0,f.size,f.type),`${n}.${f.name.split('.').pop()||'png'}`);
  return fd;
}

// Recto/Verso
function setSide(side) {
  G.currentSide=side;
  document.getElementById('btn-side-front').classList.toggle('active',side==='front');
  document.getElementById('btn-side-back').classList.toggle('active',side==='back');
  const body=document.getElementById('gen-form-body');
  body.style.opacity=side==='back'?'0.4':'';
  body.style.pointerEvents=side==='back'?'none':'';
  if(side==='back') toast('Verso : fond imprimé tel quel','info');
}

// ── Prévisualisation ──────────────────────────────────────────────
async function previewCard(zonesOverride=null) {
  const frame=document.getElementById('card-frame');
  const img=document.getElementById('preview-img');
  const ph=document.getElementById('preview-placeholder');
  const spinner=document.getElementById('preview-spinner');

  hideOverlayCanvas();
  showPropsEmpty();
  ph.style.display='none';
  frame.style.display='inline-block';
  spinner.classList.remove('hidden');
  img.style.opacity='0.3';

  try {
    const r=await api.form('/api/cards/generate',buildFd(collectData(),zonesOverride));
    G.currentCardId=r.card_id;

    img.onload=()=>{
      img.style.opacity='1';
      spinner.classList.add('hidden');
      ['btn-dl-png','btn-dl-pdf-single','btn-print'].forEach(id=>
        document.getElementById(id).disabled=false);

      const tb=document.getElementById('btn-toggle-overlay');
      tb.style.display=(G.currentSide==='front'&&G.localZones.length)?'':'none';

      if(G.currentSide==='front'&&G.localZones.length)
        requestAnimationFrame(()=>initOverlay(img));
    };
    img.src=r.url+'?t='+Date.now();
  } catch(e) {
    spinner.classList.add('hidden');
    img.style.opacity='1';
    ph.style.display='';
    frame.style.display='none';
    toast('Erreur : '+e.message,'error');
  }
}

// ═══════════════════════════════════════════════════════════════════
//  OVERLAY — canvas exactement superposé via card-frame (pos:relative)
// ═══════════════════════════════════════════════════════════════════

function initOverlay(imgEl) {
  const canvas=document.getElementById('preview-overlay');
  const dispW=imgEl.offsetWidth, dispH=imgEl.offsetHeight;

  if(!dispW||!dispH) { setTimeout(()=>initOverlay(imgEl),60); return; }

  G.overlayScale=dispW/(G.cfg.img_w||dispW);
  canvas.width=dispW; canvas.height=dispH;
  canvas.style.width=dispW+'px'; canvas.style.height=dispH+'px';

  if(!G.overlayDirty) G.localZones=deepClone(G.zones);
  G.selectedZoneId=null;
  G.overlayVisible=true;

  canvas.style.display='block';
  canvas.style.opacity='1';
  canvas.style.pointerEvents='all';
  canvas.style.cursor='default';

  renderOverlay();
  bindOverlayEvents();
  document.getElementById('btn-toggle-overlay').classList.add('active');
}

function hideOverlayCanvas() {
  const c=document.getElementById('preview-overlay');
  c.style.display='none';
}

function toggleOverlay() {
  G.overlayVisible=!G.overlayVisible;
  const c=document.getElementById('preview-overlay');
  const tb=document.getElementById('btn-toggle-overlay');
  c.style.opacity=G.overlayVisible?'1':'0';
  c.style.pointerEvents=G.overlayVisible?'all':'none';
  tb.classList.toggle('active',G.overlayVisible);
  if(!G.overlayVisible) { showPropsEmpty(); G.selectedZoneId=null; }
  else renderOverlay();
}

// ── Rendu canvas overlay ──────────────────────────────────────────
const OV_HANDLE=10;

function renderOverlay() {
  const canvas=document.getElementById('preview-overlay');
  if(canvas.style.display==='none') return;
  const ctx=canvas.getContext('2d');
  const s=G.overlayScale;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  for(const z of G.localZones) {
    if(!z.visible) continue;
    const sel=(z.id===G.selectedZoneId);
    const col=z.type==='image'?'#f0c040':'#00d8f5';
    const rx=z.x*s, ry=z.y*s, rw=z.width*s, rh=z.height*s;

    // Fond coloré
    ctx.fillStyle=sel?col+'44':col+'22';
    ctx.fillRect(rx,ry,rw,rh);

    // Bordure
    ctx.strokeStyle=sel?col:col+'99';
    ctx.lineWidth=sel?2.5:1.5;
    ctx.setLineDash(sel?[7,3]:[4,4]);
    ctx.strokeRect(rx+1,ry+1,rw-2,rh-2);
    ctx.setLineDash([]);

    // Label avec fond lisible
    const label=z.name+(z.type==='image'?' 🖼':' ✍');
    const fs=Math.max(9,Math.min(12,rh*0.22));
    ctx.font=`700 ${fs}px "Exo 2",sans-serif`;
    ctx.textBaseline='top';
    const tw=ctx.measureText(label).width;
    ctx.fillStyle='rgba(0,0,0,0.6)';
    ctx.fillRect(rx+2,ry+2,tw+10,fs+7);
    ctx.fillStyle=col;
    ctx.fillText(label,rx+7,ry+5);

    // Poignées corners si sélectionné
    if(sel) {
      [[z.x,z.y],[z.x+z.width,z.y],[z.x,z.y+z.height],[z.x+z.width,z.y+z.height]]
        .forEach(([hx,hy])=>{
          const px=hx*s-OV_HANDLE/2, py=hy*s-OV_HANDLE/2;
          ctx.fillStyle='#fff'; ctx.fillRect(px,py,OV_HANDLE,OV_HANDLE);
          ctx.strokeStyle=col; ctx.lineWidth=2;
          ctx.strokeRect(px,py,OV_HANDLE,OV_HANDLE);
        });
    }
  }
}

function bindOverlayEvents() {
  // Remplacement du canvas pour éliminer les anciens listeners
  const old=document.getElementById('preview-overlay');
  const neo=old.cloneNode(true);
  old.parentNode.replaceChild(neo,old);
  const c=document.getElementById('preview-overlay');
  c.addEventListener('mousedown',ovDown);
  c.addEventListener('mousemove',ovMove);
  c.addEventListener('mouseup',ovUp);
  c.addEventListener('mouseleave',ovUp);
}

function ovCoords(e) {
  const c=document.getElementById('preview-overlay');
  const r=c.getBoundingClientRect();
  return {
    ix:(e.clientX-r.left)/G.overlayScale,
    iy:(e.clientY-r.top)/G.overlayScale,
    sx:e.clientX-r.left,
    sy:e.clientY-r.top,
  };
}

function ovHitHandle(z,sx,sy) {
  const s=G.overlayScale, hs=OV_HANDLE;
  for(const [k,hx,hy] of [
    ['tl',z.x,z.y],['tr',z.x+z.width,z.y],
    ['bl',z.x,z.y+z.height],['br',z.x+z.width,z.y+z.height]
  ]) {
    if(sx>=hx*s-hs/2&&sx<=hx*s+hs/2&&sy>=hy*s-hs/2&&sy<=hy*s+hs/2) return k;
  }
  return null;
}

function ovDown(e) {
  if(!G.overlayVisible) return;
  const p=ovCoords(e);

  // Tester les poignées de la zone sélectionnée en priorité
  if(G.selectedZoneId) {
    const z=G.localZones.find(z=>z.id===G.selectedZoneId);
    if(z) {
      const h=ovHitHandle(z,p.sx,p.sy);
      if(h) {
        G.isResizing=true; G.resizeHandle=h;
        G.dragStart={ix:p.ix,iy:p.iy,zone:{...z}};
        document.getElementById('preview-overlay').style.cursor='nwse-resize';
        return;
      }
    }
  }

  // Hit-test zones (dernière = devant)
  const hit=[...G.localZones].reverse().find(z=>
    z.visible&&p.ix>=z.x&&p.ix<=z.x+z.width&&p.iy>=z.y&&p.iy<=z.y+z.height);

  if(hit) {
    G.selectedZoneId=hit.id;
    G.isDragging=true;
    G.dragStart={ix:p.ix-hit.x,iy:p.iy-hit.y,zone:{...hit}};
    document.getElementById('preview-overlay').style.cursor='move';
    showZoneProps(hit);
  } else {
    G.selectedZoneId=null;
    showPropsEmpty();
    document.getElementById('preview-overlay').style.cursor='default';
  }
  renderOverlay();
}

function ovMove(e) {
  if(!G.overlayVisible) return;
  const p=ovCoords(e);

  if(G.isResizing&&G.selectedZoneId) {
    const z=G.localZones.find(z=>z.id===G.selectedZoneId);
    if(!z) return;
    const orig=G.dragStart.zone;
    const dx=p.ix-G.dragStart.ix, dy=p.iy-G.dragStart.iy, min=12;
    if(G.resizeHandle.includes('l')){z.x=orig.x+dx;z.width=Math.max(min,orig.width-dx);}
    if(G.resizeHandle.includes('r')){z.width=Math.max(min,orig.width+dx);}
    if(G.resizeHandle.includes('t')){z.y=orig.y+dy;z.height=Math.max(min,orig.height-dy);}
    if(G.resizeHandle.includes('b')){z.height=Math.max(min,orig.height+dy);}
    z.x=Math.round(z.x);z.y=Math.round(z.y);
    z.width=Math.round(z.width);z.height=Math.round(z.height);
    G.overlayDirty=true;
    renderOverlay(); syncPropsCoords(z);
    return;
  }
  if(G.isDragging&&G.selectedZoneId) {
    const z=G.localZones.find(z=>z.id===G.selectedZoneId);
    if(!z) return;
    z.x=Math.round(Math.max(0,Math.min(p.ix-G.dragStart.ix,(G.cfg.img_w||9999)-z.width)));
    z.y=Math.round(Math.max(0,Math.min(p.iy-G.dragStart.iy,(G.cfg.img_h||9999)-z.height)));
    G.overlayDirty=true;
    renderOverlay(); syncPropsCoords(z);
  }
}

function ovUp() {
  G.isDragging=false; G.isResizing=false;
  const c=document.getElementById('preview-overlay');
  if(c) c.style.cursor='default';
}

// ═══════════════════════════════════════════════════════════════════
//  PANNEAU PROPRIÉTÉS DROITE — pas de flottant, colonne fixe
// ═══════════════════════════════════════════════════════════════════

function showPropsEmpty() {
  document.getElementById('zone-props-empty').style.display='';
  document.getElementById('zone-props-form').style.display='none';
}

function showZoneProps(zone) {
  document.getElementById('zone-props-empty').style.display='none';
  document.getElementById('zone-props-form').style.display='';

  const isText=(zone.type!=='image');
  document.getElementById('zp-name').textContent=zone.name;
  document.getElementById('zp-type').textContent=zone.type;
  document.getElementById('zp-text-section').style.display=isText?'':'none';

  if(isText) {
    const s=zone.style||{};
    // Synchroniser avec le textarea du formulaire
    const formEl=document.getElementById('fi-'+zone.id);
    document.getElementById('zp-text').value=formEl?formEl.value:(zone.default||'');
    document.getElementById('zp-size').value=s.font_size||24;
    document.getElementById('zp-bold').checked=!!s.bold;
    const col=s.color||'#000000';
    document.getElementById('zp-color').value=col;
    document.getElementById('zp-color-hex').value=col;
    document.getElementById('zp-align').value=s.align||'left';
    document.getElementById('zp-gap').value=s.line_gap||4;
  }
  syncPropsCoords(zone);

  // Scroller vers le haut du panneau props
  document.getElementById('zone-props-content').scrollTop=0;
}

function syncPropsCoords(z) {
  document.getElementById('zp-x').value=Math.round(z.x);
  document.getElementById('zp-y').value=Math.round(z.y);
  document.getElementById('zp-w').value=Math.round(z.width);
  document.getElementById('zp-h').value=Math.round(z.height);
}

function deselectOverlayZone() {
  G.selectedZoneId=null;
  showPropsEmpty();
  renderOverlay();
}

// Appelé quand l'utilisateur modifie un champ dans le panneau droite
function zpPropChanged() {
  if(!G.selectedZoneId) return;
  const z=G.localZones.find(z=>z.id===G.selectedZoneId);
  if(!z) return;

  if(z.type!=='image') {
    const newText=document.getElementById('zp-text').value;
    const newSize=parseInt(document.getElementById('zp-size').value)||20;
    const newBold=document.getElementById('zp-bold').checked;
    const newCol=document.getElementById('zp-color').value;
    const newAlign=document.getElementById('zp-align').value;
    const newGap=parseInt(document.getElementById('zp-gap').value)||4;

    // Répercuter le texte dans le textarea du formulaire gauche
    const formEl=document.getElementById('fi-'+z.id);
    if(formEl){formEl.value=newText;autoResize(formEl);}

    z.style={...z.style,font_size:newSize,bold:newBold,
              color:newCol,align:newAlign,line_gap:newGap};
  }

  // Coordonnées
  const nx=+document.getElementById('zp-x').value;
  const ny=+document.getElementById('zp-y').value;
  const nw=+document.getElementById('zp-w').value;
  const nh=+document.getElementById('zp-h').value;
  if(!isNaN(nx)) z.x=nx;
  if(!isNaN(ny)) z.y=ny;
  if(nw>0) z.width=nw;
  if(nh>0) z.height=nh;

  G.overlayDirty=true;
  renderOverlay();
}

function zpColorChanged(val) {
  if(/^#[0-9A-Fa-f]{6}$/.test(val)) {
    document.getElementById('zp-color').value=val;
    document.getElementById('zp-color-hex').value=val;
    zpPropChanged();
  }
}

async function regenFromOverlay() {
  G.selectedZoneId=null;
  showPropsEmpty();
  await previewCard(G.overlayDirty?G.localZones:null);
}

async function saveLayoutToTemplate() {
  if(!G.overlayDirty){toast('Aucune modification','info');return;}
  try {
    await api.put(`/api/templates/${G.templateId}/zones`,{
      zones:G.localZones,card_w_mm:G.cardWmm,card_h_mm:G.cardHmm,
    });
    G.zones=deepClone(G.localZones);
    G.overlayDirty=false;
    toast('Layout sauvegardé ✓','success');
  } catch(e){toast('Erreur : '+e.message,'error');}
}

// ── Downloads ──────────────────────────────────────────────────────
function downloadCurrentPNG(){
  if(!G.currentCardId)return;
  downloadUrl(`/data/generated/${G.currentCardId}/card.png`,`card_${G.currentCardId}.png`);
}
async function downloadSinglePDF(){
  if(!G.currentCardId)return;
  const btn=document.getElementById('btn-dl-pdf-single');
  btn.disabled=true;btn.textContent='⟳…';
  try{
    const r=await api.post('/api/cards/export-pdf',{
      card_ids:[G.currentCardId],cards_per_row:1,gap_mm:0,
      card_w_mm:G.cardWmm,card_h_mm:G.cardHmm,margin_mm:(_settings.margin_mm||10),
    });
    downloadUrl(`/api/cards/pdf/${r.pdf_id}`,`card_${G.currentCardId}.pdf`);
  }catch(e){toast('Erreur PDF : '+e.message,'error');}
  finally{btn.disabled=false;btn.textContent='↓ PDF';}
}
function printCard(){
  if(!G.currentCardId)return;
  const win=window.open('','_blank',
    `width=${Math.round(G.cardWmm*3.78+40)},height=${Math.round(G.cardHmm*3.78+80)}`);
  win.document.write(`<!DOCTYPE html><html><head><title>Impression</title>
  <style>*{margin:0;padding:0}body{display:flex;align-items:center;
  justify-content:center;min-height:100vh;background:#fff}
  img{width:${G.cardWmm}mm;height:${G.cardHmm}mm;object-fit:contain}
  @media print{@page{size:A4;margin:10mm}}</style></head><body>
  <img src="/data/generated/${G.currentCardId}/card.png">
  <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),600)}<\/script>
  </body></html>`);
  win.document.close();
}

// ── Batch ──────────────────────────────────────────────────────────
async function addToBatch(){
  const data=collectData();
  const label=G.zones.filter(z=>z.type!=='image').map(z=>data[z.name]).find(v=>v?.trim())||`Carte ${G.batch.length+1}`;
  const btn=document.querySelector('[onclick="addToBatch()"]');
  const orig=btn.textContent;btn.textContent='⟳…';btn.disabled=true;
  try{
    const r=await api.form('/api/cards/generate',buildFd(data,G.overlayDirty?G.localZones:null));
    G.batch.push({card_id:r.card_id,label:label.split('\n')[0].slice(0,40),url:r.url});
    renderBatch();toast(`"${label.split('\n')[0].slice(0,30)}" ajouté`,'success');
  }catch(e){toast('Erreur : '+e.message,'error');}
  finally{btn.textContent=orig;btn.disabled=false;}
}
function removeFromBatch(i){G.batch.splice(i,1);renderBatch();}
function clearBatch(){if(G.batch.length&&!confirm('Vider le batch ?'))return;G.batch=[];renderBatch();}
function renderBatch(){
  document.getElementById('batch-count').textContent=G.batch.length;
  document.getElementById('btn-export-pdf').disabled=G.batch.length===0;
  const list=document.getElementById('batch-list');
  list.innerHTML=G.batch.length
    ?G.batch.map((b,i)=>`<div class="batch-item">
        <img src="${b.url}?t=${Date.now()}" onerror="this.style.display='none'">
        <span class="batch-item-name">${b.label}</span>
        <button class="batch-item-del" onclick="removeFromBatch(${i})">✕</button>
      </div>`).join('')
    :'<div class="text-muted text-sm">Aucune carte</div>';
}
function clearForm(){
  G.imageFiles={};G.currentCardId=null;G.overlayDirty=false;
  G.localZones=deepClone(G.zones);
  hideOverlayCanvas();showPropsEmpty();
  document.getElementById('card-frame').style.display='none';
  document.getElementById('preview-placeholder').style.display='';
  document.getElementById('btn-toggle-overlay').style.display='none';
  ['btn-dl-png','btn-dl-pdf-single','btn-print'].forEach(id=>
    document.getElementById(id).disabled=true);
  buildForm();
}

function exportBatchPDF(){
  if(!G.batch.length)return;
  document.getElementById('pdf-cw').value=G.cardWmm;
  document.getElementById('pdf-ch').value=G.cardHmm;
  document.getElementById('pdf-cpr').value=_settings.cards_per_row||3;
  document.getElementById('pdf-margin').value=_settings.margin_mm||10;
  document.getElementById('pdf-gap').value=_settings.gap_mm||3;
  document.getElementById('pdf-modal-overlay').classList.remove('hidden');
}
function closePdfModal(){document.getElementById('pdf-modal-overlay').classList.add('hidden');}
async function confirmExportPDF(){
  closePdfModal();
  const btn=document.getElementById('btn-export-pdf');
  btn.textContent='⟳ PDF…';btn.disabled=true;
  try{
    const r=await api.post('/api/cards/export-pdf',{
      card_ids:G.batch.map(b=>b.card_id),
      cards_per_row:+document.getElementById('pdf-cpr').value||3,
      margin_mm:+document.getElementById('pdf-margin').value||10,
      card_w_mm:+document.getElementById('pdf-cw').value||G.cardWmm,
      card_h_mm:+document.getElementById('pdf-ch').value||G.cardHmm,
      gap_mm:+document.getElementById('pdf-gap').value||3,
    });
    downloadUrl(`/api/cards/pdf/${r.pdf_id}`,'cards_batch.pdf');
    toast('PDF généré !','success');
  }catch(e){toast('Erreur PDF : '+e.message,'error');}
  finally{btn.textContent='📄 Export PDF';btn.disabled=G.batch.length===0;}
}

document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();previewCard();}
  if((e.ctrlKey||e.metaKey)&&e.key==='b'){e.preventDefault();addToBatch();}
  if(e.key==='Escape'&&G.selectedZoneId) deselectOverlayZone();
  if(e.key==='z'&&!e.ctrlKey&&!e.metaKey) toggleOverlay();
});

if(Object.keys(_settings).length) initGenerator(); else setTimeout(initGenerator,300);
