/* ═══════════════════════════════════════════════════════════════
   CardCrafter — editor.js  (zones, drag/resize, font picker)
   ═══════════════════════════════════════════════════════════════ */

const E = {
  templateId: TEMPLATE_ID, templateCfg: null,
  zones: [], selectedId: null,
  tool: 'select',
  zoom: 1, panX: 0, panY: 0,
  isDragging: false, isPanning: false,
  isDrawing: false, isResizing: false,
  dragStart: null, resizeHandle: null,
  drawRect: null,
  history: [], histIdx: -1,
  showGrid: false,
  imgW: 0, imgH: 0,
};

let _availFonts = [];   // cache des polices disponibles

const viewport   = document.getElementById('editor-viewport');
const tplImage   = document.getElementById('tpl-image');
const canvas     = document.getElementById('editor-canvas');
const overlay    = document.getElementById('editor-overlay');
const canvasWrap = document.getElementById('canvas-wrap');
const ctx        = canvas.getContext('2d');
const propsPanel = document.getElementById('props-panel');
const zoneList   = document.getElementById('zone-list');

// ── Init ──────────────────────────────────────────────────────────
async function initEditor() {
  try {
    [E.templateCfg, _availFonts] = await Promise.all([
      api.get(`/api/templates/${E.templateId}`),
      api.get('/api/fonts').catch(() => []),
    ]);
    E.zones = E.templateCfg.zones || [];
    E.imgW  = E.templateCfg.img_w;
    E.imgH  = E.templateCfg.img_h;
    document.getElementById('tpl-name-label').textContent = E.templateCfg.name;

    tplImage.src = `/api/templates/${E.templateId}/image`;
    tplImage.onload = () => {
      canvas.width = E.imgW; canvas.height = E.imgH;
      fitToScreen(); renderAll(); pushHistory();
    };
  } catch(e) { toast('Erreur chargement : ' + e.message, 'error'); }
}

// ── Transform ─────────────────────────────────────────────────────
function applyTransform() {
  viewport.style.transform = `translate(${E.panX}px,${E.panY}px) scale(${E.zoom})`;
  viewport.style.transformOrigin = '0 0';
  document.getElementById('zoom-label').textContent = Math.round(E.zoom * 100) + '%';
}
function fitToScreen() {
  const r = canvasWrap.getBoundingClientRect();
  const s = Math.min((r.width - 60) / E.imgW, (r.height - 60) / E.imgH, 2);
  E.zoom = s;
  E.panX = (r.width  - E.imgW * s) / 2;
  E.panY = (r.height - E.imgH * s) / 2;
  applyTransform();
}
function resetView() { fitToScreen(); }
function zoom(d) {
  const nz = Math.max(0.1, Math.min(6, E.zoom + d));
  const r  = canvasWrap.getBoundingClientRect();
  E.panX   = r.width  / 2 - (r.width  / 2 - E.panX) * (nz / E.zoom);
  E.panY   = r.height / 2 - (r.height / 2 - E.panY) * (nz / E.zoom);
  E.zoom   = nz; applyTransform();
}
function screenToImg(sx, sy) {
  const r = canvasWrap.getBoundingClientRect();
  return { x: (sx - r.left - E.panX) / E.zoom, y: (sy - r.top - E.panY) / E.zoom };
}

// ── Tools ─────────────────────────────────────────────────────────
function setTool(t) {
  E.tool = t; E.selectedId = null;
  ['select','draw','detect'].forEach(id =>
    document.getElementById('tool-'+id)?.classList.toggle('active', id === t));
  canvasWrap.className = 'editor-canvas-wrap mode-' + t;
  document.getElementById('draw-hint')?.classList.toggle('hidden',   t !== 'draw');
  document.getElementById('detect-hint')?.classList.toggle('hidden', t !== 'detect');
  renderProps(); renderCanvas();
}

function nextZoneId() { return 'z_' + Date.now().toString(36); }

// ── Mouse ──────────────────────────────────────────────────────────
function onMouseDown(e) {
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    E.isPanning = true;
    E.dragStart = { x: e.clientX - E.panX, y: e.clientY - E.panY };
    canvasWrap.classList.add('dragging'); return;
  }
  if (e.button !== 0) return;
  const pos = screenToImg(e.clientX, e.clientY);

  if (E.tool === 'detect') { detectZoneAt(pos.x, pos.y); return; }
  if (E.tool === 'draw')   { E.isDrawing = true; E.drawRect = {x0:pos.x,y0:pos.y,x1:pos.x,y1:pos.y}; return; }

  if (E.tool === 'select') {
    if (E.selectedId) {
      const z = E.zones.find(z => z.id === E.selectedId);
      const h = hitHandle(z, pos.x, pos.y);
      if (h) { E.isResizing = true; E.resizeHandle = h; E.dragStart = {x:pos.x,y:pos.y,zone:{...z}}; return; }
    }
    const hit = [...E.zones].reverse().find(z =>
      z.visible && pos.x>=z.x && pos.x<=z.x+z.width && pos.y>=z.y && pos.y<=z.y+z.height);
    if (hit) {
      E.selectedId = hit.id; E.isDragging = true;
      E.dragStart = {x:pos.x-hit.x, y:pos.y-hit.y, zone:{...hit}};
    } else { E.selectedId = null; }
    renderZoneList(); renderProps(); renderCanvas();
  }
}
function onMouseMove(e) {
  const pos = screenToImg(e.clientX, e.clientY);
  if (E.isPanning) {
    E.panX = e.clientX - E.dragStart.x; E.panY = e.clientY - E.dragStart.y;
    applyTransform(); return;
  }
  if (E.isDrawing && E.drawRect) { E.drawRect.x1 = pos.x; E.drawRect.y1 = pos.y; renderCanvas(); return; }
  if (E.isResizing && E.selectedId) {
    const z = E.zones.find(z => z.id === E.selectedId);
    applyResize(z, E.dragStart.zone, E.resizeHandle, pos.x - E.dragStart.x, pos.y - E.dragStart.y);
    renderCanvas(); renderProps(); return;
  }
  if (E.isDragging && E.selectedId) {
    const z = E.zones.find(z => z.id === E.selectedId);
    if (z) {
      z.x = Math.round(Math.max(0, Math.min(pos.x - E.dragStart.x, E.imgW - z.width)));
      z.y = Math.round(Math.max(0, Math.min(pos.y - E.dragStart.y, E.imgH - z.height)));
      renderCanvas(); renderProps();
    }
  }
}
function onMouseUp(e) {
  canvasWrap.classList.remove('dragging');
  if (E.isPanning) { E.isPanning = false; return; }
  if (E.isDrawing && E.drawRect) {
    E.isDrawing = false;
    const r = E.drawRect, x = Math.round(Math.min(r.x0,r.x1)), y = Math.round(Math.min(r.y0,r.y1));
    const w = Math.round(Math.abs(r.x1-r.x0)), h = Math.round(Math.abs(r.y1-r.y0));
    E.drawRect = null; renderCanvas();
    if (w > 10 && h > 10) openZoneDialog({x,y,width:w,height:h});
    return;
  }
  if (E.isResizing || E.isDragging) {
    E.isResizing = false; E.isDragging = false; pushHistory();
  }
}
function onWheel(e) {
  e.preventDefault();
  const d = e.deltaY > 0 ? -0.1 : 0.1;
  const r = canvasWrap.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const nz = Math.max(0.1, Math.min(6, E.zoom + d));
  E.panX = mx - (mx - E.panX) * (nz / E.zoom);
  E.panY = my - (my - E.panY) * (nz / E.zoom);
  E.zoom = nz; applyTransform();
}

// ── Handles ────────────────────────────────────────────────────────
const HS = 10;
function handlePositions(z) {
  const {x,y,width:w,height:h} = z, hs = HS/2;
  return {
    tl:{x:x-hs,y:y-hs},       t:{x:x+w/2-hs,y:y-hs},    tr:{x:x+w-hs,y:y-hs},
    l:{x:x-hs,y:y+h/2-hs},                               r:{x:x+w-hs,y:y+h/2-hs},
    bl:{x:x-hs,y:y+h-hs},     b:{x:x+w/2-hs,y:y+h-hs},  br:{x:x+w-hs,y:y+h-hs},
  };
}
function hitHandle(z, px, py) {
  if (!z) return null;
  for (const [k,p] of Object.entries(handlePositions(z)))
    if (px>=p.x && px<=p.x+HS && py>=p.y && py<=p.y+HS) return k;
  return null;
}
function applyResize(z, orig, h, dx, dy) {
  const min = 10;
  if (h.includes('l')) { z.x = orig.x+dx; z.width  = Math.max(min, orig.width -dx); }
  if (h.includes('r')) {                   z.width  = Math.max(min, orig.width +dx); }
  if (h.includes('t')) { z.y = orig.y+dy; z.height = Math.max(min, orig.height-dy); }
  if (h.includes('b')) {                   z.height = Math.max(min, orig.height+dy); }
  z.x=Math.round(z.x); z.y=Math.round(z.y);
  z.width=Math.round(z.width); z.height=Math.round(z.height);
}

// ── Detect (OpenCV) ────────────────────────────────────────────────
async function detectZoneAt(ix, iy) {
  const tol = parseInt(document.getElementById('tol-slider').value) || 30;
  try {
    const r = await api.post(`/api/editor/${E.templateId}/detect`,
      {x:Math.round(ix), y:Math.round(iy), tolerance:tol});
    openZoneDialog({x:r.x,y:r.y,width:r.width,height:r.height,detected:r.detected});
  } catch(e) { toast('Détection échouée : '+e.message,'error'); }
}

// ── Zone dialog ────────────────────────────────────────────────────
let _pendingGeom = null, _pendingId = null;

function openZoneDialog(geom, existing = null) {
  _pendingGeom = geom; _pendingId = existing?.id || null;
  document.getElementById('zone-dialog-title').textContent = existing ? 'Modifier la zone' : 'Nouvelle zone';
  document.getElementById('zd-name').value    = existing?.name    || '';
  document.getElementById('zd-type').value    = existing?.type    || 'text';
  document.getElementById('zd-default').value = existing?.default || '';
  document.getElementById('zone-dialog-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('zd-name').focus(), 50);
}
function cancelZoneDialog() {
  document.getElementById('zone-dialog-overlay').classList.add('hidden');
  _pendingGeom = null; _pendingId = null; renderCanvas();
}
function confirmZoneDialog() {
  const name = document.getElementById('zd-name').value.trim();
  const type = document.getElementById('zd-type').value;
  const def  = document.getElementById('zd-default').value.trim();
  if (!name) { toast('Nom requis','error'); return; }
  if (E.zones.find(z => z.name===name && z.id!==_pendingId)) { toast('Nom déjà utilisé','error'); return; }

  document.getElementById('zone-dialog-overlay').classList.add('hidden');

  if (_pendingId) {
    const z = E.zones.find(z=>z.id===_pendingId);
    if (z) { z.name=name; z.type=type; z.default=def; }
  } else {
    const {x,y,width,height} = _pendingGeom;
    E.zones.push({
      id: nextZoneId(), name, type,
      x: Math.max(0,x), y: Math.max(0,y),
      width: Math.max(10,width), height: Math.max(10,height),
      visible: true, layer: E.zones.length, default: def,
      style: {
        color: '#000000', font_size: 24, bold: false,
        font_path: '',
        align: 'left', valign: 'top',
        line_gap: 4,
        outline: false, outline_color: '#000000', outline_width: 1,
        shadow: false, auto_fit: true,
        cover_color: '#FFFFFF',
      },
    });
    E.selectedId = E.zones[E.zones.length-1].id;
  }
  _pendingGeom = null; _pendingId = null;
  pushHistory(); renderAll(); setTool('select');
}

// ── Canvas render ──────────────────────────────────────────────────
const ZONE_COLORS = { text:'#00d4f0', image:'#e8b84b', text_cover:'#e05050', custom:'#3dc88a' };

function renderCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (E.showGrid) {
    const g = E.templateCfg?.settings?.grid || 20;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5;
    for (let x=0;x<=E.imgW;x+=g){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,E.imgH);ctx.stroke();}
    for (let y=0;y<=E.imgH;y+=g){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(E.imgW,y);ctx.stroke();}
  }

  for (const z of E.zones) {
    if (!z.visible) continue;
    const sel = z.id === E.selectedId;
    const col = ZONE_COLORS[z.type] || ZONE_COLORS.custom;

    ctx.fillStyle = sel ? col+'33' : col+'18';
    ctx.fillRect(z.x, z.y, z.width, z.height);
    ctx.strokeStyle = sel ? col : col+'aa'; ctx.lineWidth = sel?2:1.5;
    ctx.setLineDash(sel?[6,3]:[4,4]);
    ctx.strokeRect(z.x,z.y,z.width,z.height); ctx.setLineDash([]);

    ctx.fillStyle = col;
    const fs = Math.max(9, Math.min(13, z.height*0.25));
    ctx.font = `600 ${fs}px Exo2,sans-serif`; ctx.textBaseline='top';
    ctx.fillText(`[${z.type}] ${z.name}`, z.x+4, z.y+3);

    if (sel) {
      ctx.fillStyle = '#fff';
      for (const p of Object.values(handlePositions(z))) {
        ctx.fillRect(p.x,p.y,HS,HS);
        ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.strokeRect(p.x,p.y,HS,HS);
      }
    }
  }

  if (E.isDrawing && E.drawRect) {
    const r=E.drawRect, x=Math.min(r.x0,r.x1), y=Math.min(r.y0,r.y1);
    const w=Math.abs(r.x1-r.x0), h=Math.abs(r.y1-r.y0);
    ctx.strokeStyle='#00d4f0'; ctx.lineWidth=2; ctx.setLineDash([6,3]);
    ctx.strokeRect(x,y,w,h);
    ctx.fillStyle='#00d4f044'; ctx.fillRect(x,y,w,h); ctx.setLineDash([]);
    ctx.fillStyle='#00d4f0'; ctx.font='11px monospace';
    ctx.fillText(`${Math.round(w)}×${Math.round(h)}`, x+4, y+4);
  }
}

function renderAll() { renderCanvas(); renderZoneList(); renderProps(); }

// ── Zone list ──────────────────────────────────────────────────────
function renderZoneList() {
  if (!E.zones.length) {
    zoneList.innerHTML='<div class="zone-empty">Aucune zone — dessinez ou détectez</div>'; return;
  }
  zoneList.innerHTML = E.zones.map(z=>`
    <div class="zone-item ${z.id===E.selectedId?'selected':''}" onclick="selectZone('${z.id}')">
      <span class="zone-item-icon">${z.type==='image'?'🖼':z.type==='text_cover'?'✂':'T'}</span>
      <span class="zone-item-name">${z.name}</span>
      <span class="zone-item-type">${z.type}</span>
      <div class="zone-item-actions">
        <button class="zone-action" onclick="event.stopPropagation();toggleVis('${z.id}')">${z.visible?'👁':'🙈'}</button>
        <button class="zone-action" onclick="event.stopPropagation();editZoneName('${z.id}')">✎</button>
        <button class="zone-action del" onclick="event.stopPropagation();deleteZone('${z.id}')">✕</button>
      </div>
    </div>`).join('');
}

function selectZone(id)  { E.selectedId=id; renderAll(); }
function toggleVis(id)   { const z=E.zones.find(z=>z.id===id); if(z){z.visible=!z.visible;renderAll();} }
function editZoneName(id){ const z=E.zones.find(z=>z.id===id); if(z) openZoneDialog({x:z.x,y:z.y,width:z.width,height:z.height},z); }
function deleteZone(id)  {
  E.zones=E.zones.filter(z=>z.id!==id);
  if(E.selectedId===id) E.selectedId=null;
  pushHistory(); renderAll();
}
function duplicateZone(id){
  const z=E.zones.find(z=>z.id===id); if(!z) return;
  const nz={...z, id:nextZoneId(), name:z.name+'_copy', x:z.x+15, y:z.y+15, style:{...z.style}};
  E.zones.push(nz); E.selectedId=nz.id; pushHistory(); renderAll();
}

// ── Font picker helpers ────────────────────────────────────────────
function buildFontOptions(selectedPath) {
  const cats = {};
  for (const f of _availFonts) {
    if (!cats[f.category]) cats[f.category] = [];
    cats[f.category].push(f);
  }
  let html = `<option value="">── Défaut (Arial/Liberation) ──</option>`;
  for (const [cat, list] of Object.entries(cats)) {
    html += `<optgroup label="${cat}">`;
    for (const f of list) {
      const sel = f.path === selectedPath ? 'selected' : '';
      html += `<option value="${f.path}" ${sel}>${f.name}</option>`;
    }
    html += `</optgroup>`;
  }
  return html;
}

// ── Properties panel ───────────────────────────────────────────────
function renderProps() {
  const zone = E.zones.find(z=>z.id===E.selectedId);
  if (!zone) { renderTemplateSettings(); return; }
  const s = zone.style || {};
  const isText = zone.type==='text' || zone.type==='text_cover';

  propsPanel.innerHTML = `
    <div class="prop-group">
      <div class="prop-label">Position & Taille</div>
      <div class="prop-4">
        <input type="number" value="${zone.x}"      onchange="propChange('${zone.id}','x',+this.value)"      placeholder="X">
        <input type="number" value="${zone.y}"      onchange="propChange('${zone.id}','y',+this.value)"      placeholder="Y">
        <input type="number" value="${zone.width}"  onchange="propChange('${zone.id}','width',+this.value)"  placeholder="W">
        <input type="number" value="${zone.height}" onchange="propChange('${zone.id}','height',+this.value)" placeholder="H">
      </div>
      <div style="font-size:.66rem;color:var(--text3);margin-top:3px;padding:0 2px">X ·· Y ·· W ·· H</div>
    </div>

    <div class="prop-group">
      <div class="prop-label">Général</div>
      <div class="prop-row"><label>Nom</label>
        <input type="text" value="${zone.name}" onchange="propChange('${zone.id}','name',this.value)" style="flex:1"></div>
      <div class="prop-row"><label>Type</label>
        <select onchange="propChange('${zone.id}','type',this.value)">
          <option value="text"       ${zone.type==='text'?'selected':''}>Texte</option>
          <option value="text_cover" ${zone.type==='text_cover'?'selected':''}>Texte (couvre original)</option>
          <option value="image"      ${zone.type==='image'?'selected':''}>Image</option>
        </select>
      </div>
      <div class="prop-row"><label>Défaut</label>
        <input type="text" value="${zone.default||''}" onchange="propChange('${zone.id}','default',this.value)" style="flex:1">
      </div>
      <div class="prop-row"><label>Layer</label>
        <input type="number" value="${zone.layer||0}" onchange="propChange('${zone.id}','layer',+this.value)" style="flex:1">
      </div>
    </div>

    ${isText ? `
    <div class="prop-group">
      <div class="prop-label">Police</div>
      <div class="prop-row" style="flex-direction:column;align-items:stretch;gap:6px">
        <select id="font-sel" onchange="styleProp('${zone.id}','font_path',this.value);updateFontPreview('${zone.id}')">
          ${buildFontOptions(s.font_path||'')}
        </select>
        <div id="font-preview" style="
          padding:6px 8px;background:var(--bg);border:1px solid var(--border);
          border-radius:5px;font-size:13px;color:var(--text);min-height:28px;
          letter-spacing:.02em">Abc 123 — Prévisualisation</div>
        <small style="color:var(--text3);font-size:.68rem">
          Déposez des .ttf dans <code>assets/fonts/</code> pour ajouter des polices
        </small>
      </div>
    </div>

    <div class="prop-group">
      <div class="prop-label">Texte</div>
      <div class="prop-row">
        <label>Taille</label>
        <input type="number" value="${s.font_size||24}" min="4" max="300"
               onchange="styleProp('${zone.id}','font_size',+this.value)" style="flex:1">
        <label class="form-check" style="width:auto;font-size:.72rem;white-space:nowrap">
          <input type="checkbox" ${s.bold?'checked':''} onchange="styleProp('${zone.id}','bold',this.checked)"> Gras
        </label>
      </div>
      <div class="prop-row">
        <label>Couleur</label>
        <input type="color" value="${s.color||'#000000'}" oninput="styleProp('${zone.id}','color',this.value)">
        <input type="text" value="${s.color||'#000000'}" style="flex:1;font-size:.75rem"
               onchange="styleProp('${zone.id}','color',this.value);this.previousElementSibling.value=this.value"
               placeholder="#000000">
      </div>
      <div class="prop-row">
        <label>Alignement</label>
        <select onchange="styleProp('${zone.id}','align',this.value)">
          ${['left','center','right'].map(a=>`<option value="${a}" ${(s.align||'left')===a?'selected':''}>${a}</option>`).join('')}
        </select>
      </div>
      <div class="prop-row">
        <label>Vertical</label>
        <select onchange="styleProp('${zone.id}','valign',this.value)">
          ${['top','center','bottom'].map(a=>`<option value="${a}" ${(s.valign||'top')===a?'selected':''}>${a}</option>`).join('')}
        </select>
      </div>
      <div class="prop-row">
        <label>Interligne</label>
        <input type="number" value="${s.line_gap||4}" min="0" max="40"
               onchange="styleProp('${zone.id}','line_gap',+this.value)" style="flex:1">
        <span style="font-size:.7rem;color:var(--text3)">px extra</span>
      </div>
      <div class="prop-row">
        <label class="form-check" style="width:auto">
          <input type="checkbox" ${s.auto_fit?'checked':''} onchange="styleProp('${zone.id}','auto_fit',this.checked)">
          Auto-fit taille
        </label>
      </div>
    </div>

    <div class="prop-group">
      <div class="prop-label">Effets</div>
      <div class="prop-row">
        <label class="form-check" style="width:auto">
          <input type="checkbox" id="cb-outline" ${s.outline?'checked':''}
                 onchange="styleProp('${zone.id}','outline',this.checked);renderProps()"> Contour
        </label>
      </div>
      ${s.outline ? `
      <div class="prop-row" style="padding-left:20px">
        <label>Couleur</label>
        <input type="color" value="${s.outline_color||'#000000'}" oninput="styleProp('${zone.id}','outline_color',this.value)">
        <input type="number" value="${s.outline_width||1}" min="1" max="8" style="width:50px"
               onchange="styleProp('${zone.id}','outline_width',+this.value)"> px
      </div>` : ''}
      <div class="prop-row">
        <label class="form-check" style="width:auto">
          <input type="checkbox" ${s.shadow?'checked':''} onchange="styleProp('${zone.id}','shadow',this.checked)"> Ombre
        </label>
      </div>
    </div>

    ${zone.type==='text_cover' ? `
    <div class="prop-group">
      <div class="prop-label">Couvrir l'original</div>
      <div class="prop-row">
        <label>Fond</label>
        <input type="color" value="${s.cover_color&&s.cover_color!=='auto'?s.cover_color:'#FFFFFF'}"
               oninput="styleProp('${zone.id}','cover_color',this.value)">
        <select onchange="styleProp('${zone.id}','cover_color',this.value)" style="flex:1;font-size:.75rem">
          <option value="#FFFFFF" ${(s.cover_color||'#FFFFFF')==='#FFFFFF'?'selected':''}>Blanc</option>
          <option value="auto"    ${s.cover_color==='auto'?'selected':''}>Auto (détect.)</option>
          <option value="#000000" ${s.cover_color==='#000000'?'selected':''}>Noir</option>
        </select>
      </div>
      <small style="color:var(--text3);font-size:.7rem">
        Peint la zone avant d'écrire le texte — permet de remplacer visuellement le texte du template
      </small>
    </div>` : ''}
    ` : ''}

    <div class="prop-group" style="padding-bottom:14px">
      <div style="display:flex;gap:6px">
        <button class="btn btn-danger btn-sm"    onclick="deleteZone('${zone.id}')">🗑 Supprimer</button>
        <button class="btn btn-secondary btn-sm" onclick="duplicateZone('${zone.id}')">📋 Dupliquer</button>
      </div>
    </div>
  `;

  if (isText) updateFontPreview(zone.id);
}

function updateFontPreview(zid) {
  const sel  = document.getElementById('font-sel');
  const prev = document.getElementById('font-preview');
  if (!sel || !prev) return;
  const path = sel.value;
  if (path) {
    // Charger la police via @font-face dynamique
    const fname = 'cc_' + btoa(path).replace(/[^a-zA-Z0-9]/g,'').slice(0,12);
    if (!document.getElementById('ff_'+fname)) {
      const style = document.createElement('style');
      style.id = 'ff_'+fname;
      style.textContent = `@font-face{font-family:'${fname}';src:url('/assets/fonts/${path.split('/').pop()}');}`;
      document.head.appendChild(style);
    }
    prev.style.fontFamily = `'${fname}', sans-serif`;
  } else {
    prev.style.fontFamily = '';
  }
}

function propChange(id, key, val) {
  const z = E.zones.find(z=>z.id===id);
  if (z) { z[key]=val; renderAll(); }
}
function styleProp(id, key, val) {
  const z = E.zones.find(z=>z.id===id);
  if (z) { z.style=z.style||{}; z.style[key]=val; renderProps(); renderCanvas(); }
}

// ── Template settings (aucune zone sélectionnée) ───────────────────
function renderTemplateSettings() {
  const wMm = E.templateCfg?.card_w_mm || 63.5;
  const hMm = E.templateCfg?.card_h_mm || 88.9;
  propsPanel.innerHTML = `
    <div class="prop-group">
      <div class="prop-label">Dimensions d'impression</div>
      <p style="font-size:.72rem;color:var(--text3);margin-bottom:10px;line-height:1.5">
        Taille physique de la carte dans le PDF.<br>Format poker standard = 63,5 × 88,9 mm
      </p>
      <div class="prop-row">
        <label>Largeur</label>
        <input type="number" id="tpl-wmm" value="${wMm}" step="0.5" min="20">
        <span style="font-size:.72rem;color:var(--text3)">mm</span>
      </div>
      <div class="prop-row">
        <label>Hauteur</label>
        <input type="number" id="tpl-hmm" value="${hMm}" step="0.5" min="30">
        <span style="font-size:.72rem;color:var(--text3)">mm</span>
      </div>
      <button class="btn btn-secondary btn-sm w-full" style="margin-top:8px"
              onclick="saveTemplateDims()">💾 Appliquer</button>
    </div>
    <div class="prop-group" style="padding-top:12px">
      <div class="prop-label">Raccourcis</div>
      <p style="font-size:.72rem;color:var(--text3);line-height:1.8">
        <b>V</b> Sélect · <b>D</b> Dessiner · <b>C</b> Détecter<br>
        <b>G</b> Grille · <b>+/-</b> Zoom · <b>Alt+Clic</b> Pan<br>
        <b>Ctrl+Z/Y</b> Undo/Redo · <b>Ctrl+S</b> Sauvegarder<br>
        <b>Suppr</b> Effacer zone sélectionnée
      </p>
    </div>`;
}

async function saveTemplateDims() {
  const w = parseFloat(document.getElementById('tpl-wmm')?.value) || 63.5;
  const h = parseFloat(document.getElementById('tpl-hmm')?.value) || 88.9;
  if (E.templateCfg) { E.templateCfg.card_w_mm=w; E.templateCfg.card_h_mm=h; }
  await saveZones();
}

// ── Grid ────────────────────────────────────────────────────────────
function toggleGrid() {
  E.showGrid=!E.showGrid;
  document.getElementById('btn-grid')?.classList.toggle('active',E.showGrid);
  renderCanvas();
}

// ── Save ────────────────────────────────────────────────────────────
async function saveZones() {
  const btn = document.getElementById('btn-save');
  if (btn) btn.textContent='💾 Sauvegarde…';
  try {
    await api.put(`/api/templates/${E.templateId}/zones`, {
      zones:      E.zones,
      card_w_mm:  E.templateCfg?.card_w_mm || 63.5,
      card_h_mm:  E.templateCfg?.card_h_mm || 88.9,
    });
    toast('Zones sauvegardées ✓','success');
  } catch(e) { toast('Erreur sauvegarde : '+e.message,'error'); }
  finally { if (btn) btn.textContent='💾 Sauvegarder'; }
}

// ── History ─────────────────────────────────────────────────────────
function pushHistory() {
  E.history = E.history.slice(0, E.histIdx+1);
  E.history.push(JSON.stringify(E.zones));
  if (E.history.length > 50) E.history.shift(); else E.histIdx++;
  updateHistBtns();
}
function undoAction() {
  if (E.histIdx<=0) return;
  E.histIdx--; E.zones=JSON.parse(E.history[E.histIdx]); E.selectedId=null; renderAll(); updateHistBtns();
}
function redoAction() {
  if (E.histIdx>=E.history.length-1) return;
  E.histIdx++; E.zones=JSON.parse(E.history[E.histIdx]); E.selectedId=null; renderAll(); updateHistBtns();
}
function updateHistBtns() {
  const u=document.getElementById('btn-undo'), r=document.getElementById('btn-redo');
  if(u) u.disabled=E.histIdx<=0;
  if(r) r.disabled=E.histIdx>=E.history.length-1;
}

// ── Keyboard ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
  if (e.key==='v'||e.key==='V') setTool('select');
  if (e.key==='d'||e.key==='D') setTool('draw');
  if (e.key==='c'||e.key==='C') setTool('detect');
  if (e.key==='g'||e.key==='G') toggleGrid();
  if (e.key==='Home') resetView();
  if (e.key==='+'||e.key==='=') zoom(0.15);
  if (e.key==='-') zoom(-0.15);
  if ((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undoAction();}
  if ((e.ctrlKey||e.metaKey)&&e.key==='y'){e.preventDefault();redoAction();}
  if ((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveZones();}
  if ((e.key==='Delete'||e.key==='Backspace')&&E.selectedId) deleteZone(E.selectedId);
});

// Autosave 60s
setInterval(()=>{ if(E.zones.length) saveZones(); }, 60000);

initEditor();
