/* CardCrafter — app.js (utilitaires partagés) */

// ── API ─────────────────────────────────────────────────────────
const api = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
    return r.json();
  },
  async post(url, body) {
    const r = await fetch(url, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    if (!r.ok) { const e = await r.json().catch(()=>({detail:r.statusText})); throw new Error(e.detail||r.statusText); }
    return r.json();
  },
  async put(url, body) {
    const r = await fetch(url, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    if (!r.ok) { const e = await r.json().catch(()=>({detail:r.statusText})); throw new Error(e.detail||r.statusText); }
    return r.json();
  },
  async delete(url) {
    const r = await fetch(url, {method:'DELETE'});
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  },
  async form(url, formData) {
    const r = await fetch(url, {method:'POST', body: formData});
    if (!r.ok) { const e = await r.json().catch(()=>({detail:r.statusText})); throw new Error(e.detail||r.statusText); }
    return r.json();
  },
};

// ── Download helper (contourne les bloqueurs de popup) ───────────
function downloadUrl(url, filename) {
  fetch(url)
    .then(r => { if (!r.ok) throw new Error(r.statusText); return r.blob(); })
    .then(blob => {
      const a = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 200);
    })
    .catch(e => toast('Téléchargement échoué : ' + e.message, 'error'));
}

// ── Toast ────────────────────────────────────────────────────────
const toasts = document.getElementById('toast-container');
function toast(msg, type='info', duration=3500) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${{info:'ℹ',success:'✓',error:'✕'}[type]||'ℹ'}</span><span>${msg}</span>`;
  toasts.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toast-out .25s ease forwards';
    setTimeout(() => el.remove(), 260);
  }, duration);
}

// ── Settings ─────────────────────────────────────────────────────
let _settings = {};

async function loadSettings() {
  try { _settings = await api.get('/api/settings'); } catch(e) {}
}

function openSettings() {
  document.getElementById('settings-overlay').classList.remove('hidden');
  renderSettingsForm();
}
function closeSettings() {
  document.getElementById('settings-overlay').classList.add('hidden');
}

function renderSettingsForm() {
  const s = _settings;
  document.getElementById('settings-body').innerHTML = `
    <p style="font-size:.8rem;color:var(--text2);margin-bottom:16px">
      Ces paramètres s'appliquent par défaut à tous les exports PDF.
      Les dimensions de carte peuvent être ajustées <strong>par template</strong> dans l'éditeur.
    </p>

    <div class="form-group">
      <label>Qualité export PNG (1–100)</label>
      <div style="display:flex;gap:10px;align-items:center">
        <input type="range" id="s-quality" min="60" max="100" value="${s.export_quality||95}"
               oninput="document.getElementById('s-qval').textContent=this.value" style="flex:1">
        <span id="s-qval" style="font-size:.8rem;color:var(--text2);min-width:28px">${s.export_quality||95}</span>
      </div>
    </div>

    <div class="divider"></div>
    <p style="font-size:.75rem;color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em">Export PDF — valeurs par défaut</p>

    <div class="form-row">
      <div class="form-group">
        <label>Cartes par ligne</label>
        <input type="number" id="s-cpr" value="${s.cards_per_row||3}" min="1" max="6">
        <small style="color:var(--text3);font-size:.72rem">Ex: 3 = 3 colonnes sur A4</small>
      </div>
      <div class="form-group">
        <label>Marge page (mm)</label>
        <input type="number" id="s-margin" value="${s.margin_mm||10}" min="0" max="30">
        <small style="color:var(--text3);font-size:.72rem">Espace autour des cartes</small>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Largeur carte défaut (mm)</label>
        <input type="number" id="s-cw" value="${s.card_w_mm||63.5}" step="0.5" min="30" max="150">
        <small style="color:var(--text3);font-size:.72rem">Format poker = 63,5 mm</small>
      </div>
      <div class="form-group">
        <label>Hauteur carte défaut (mm)</label>
        <input type="number" id="s-ch" value="${s.card_h_mm||88.9}" step="0.5" min="40" max="200">
        <small style="color:var(--text3);font-size:.72rem">Format poker = 88,9 mm</small>
      </div>
    </div>
    <div class="form-group">
      <label>Écart entre cartes (mm)</label>
      <input type="number" id="s-gap" value="${s.gap_mm||3}" step="0.5" min="0" max="10">
    </div>

    <div class="divider"></div>
    <p style="font-size:.75rem;color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em">Éditeur</p>

    <div class="form-group">
      <label class="form-check" style="cursor:pointer">
        <input type="checkbox" id="s-snap" ${s.snap?'checked':''}>
        <div>
          <div style="font-weight:600">Magnétisme (Snap)</div>
          <small style="color:var(--text3)">Les zones se collent aux bords des autres zones et à la grille lors du déplacement</small>
        </div>
      </label>
    </div>
    <div class="form-group">
      <label>Taille de la grille (px)</label>
      <input type="number" id="s-grid" value="${s.grid_size||10}" min="5" max="100">
      <small style="color:var(--text3);font-size:.72rem">Quadrillage visible avec la touche G dans l'éditeur</small>
    </div>
  `;
}

async function saveSettings() {
  const v = id => parseFloat(document.getElementById(id)?.value) || 0;
  const b = id => document.getElementById(id)?.checked ?? false;
  try {
    _settings = await api.put('/api/settings', {
      export_quality: v('s-quality'),
      cards_per_row:  v('s-cpr'),
      margin_mm:      v('s-margin'),
      card_w_mm:      v('s-cw'),
      card_h_mm:      v('s-ch'),
      gap_mm:         v('s-gap'),
      snap:           b('s-snap'),
      grid_size:      v('s-grid'),
    });
    toast('Paramètres sauvegardés', 'success');
    closeSettings();
  } catch(e) { toast('Erreur : ' + e.message, 'error'); }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeSettings();
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
  }
});

loadSettings();
