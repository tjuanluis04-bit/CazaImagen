'use strict';

/* ---------- estado ---------- */
const state = {
  query: '',
  page: 1,
  source: 'openverse',
  orientation: '',
  type: '',
  results: [],
  totalKnown: 0,
  loading: false
};

const el = {
  form: document.getElementById('searchForm'),
  input: document.getElementById('queryInput'),
  orientation: document.getElementById('orientationSel'),
  type: document.getElementById('typeSel'),
  source: document.getElementById('sourceSel'),
  grid: document.getElementById('grid'),
  statusBay: document.getElementById('statusBay'),
  statusMsg: document.getElementById('statusMsg'),
  resultCount: document.getElementById('resultCount'),
  loadMoreWrap: document.getElementById('loadMoreWrap'),
  loadMoreBtn: document.getElementById('loadMoreBtn'),
  lightbox: document.getElementById('lightbox'),
  lbImg: document.getElementById('lbImg'),
  lbTitle: document.getElementById('lbTitle'),
  lbCredit: document.getElementById('lbCredit'),
  lbLicense: document.getElementById('lbLicense'),
  lbDownload: document.getElementById('lbDownload'),
  lbSource: document.getElementById('lbSource'),
  lbClose: document.getElementById('lbClose'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsDrawer: document.getElementById('settingsDrawer'),
  drawerClose: document.getElementById('drawerClose'),
  pixabayKeyInput: document.getElementById('pixabayKeyInput'),
  saveSettings: document.getElementById('saveSettings')
};

/* ---------- ajustes persistentes ---------- */
function loadSettings(){
  const key = localStorage.getItem('pixabayKey') || '';
  el.pixabayKeyInput.value = key;
  const src = localStorage.getItem('preferredSource');
  if (src) { el.source.value = src; state.source = src; }
}
el.saveSettings.addEventListener('click', () => {
  localStorage.setItem('pixabayKey', el.pixabayKeyInput.value.trim());
  closeDrawer();
});
el.settingsBtn.addEventListener('click', () => { el.settingsDrawer.hidden = false; });
el.drawerClose.addEventListener('click', closeDrawer);
el.settingsDrawer.addEventListener('click', (e) => { if (e.target === el.settingsDrawer) closeDrawer(); });
function closeDrawer(){ el.settingsDrawer.hidden = true; }

/* ---------- helpers de estado visual ---------- */
function setStatus(msg, isError=false){
  if (!msg){ el.statusBay.hidden = true; return; }
  el.statusBay.hidden = false;
  el.statusBay.classList.toggle('err', isError);
  el.statusMsg.textContent = msg;
}

/* ---------- adaptadores de fuentes ---------- */
// Cada adaptador recibe (query, page, filtros) y devuelve {items, hasMore}
// item normalizado: {id, thumb, full, title, credit, creditUrl, license, sourcePage}

async function searchOpenverse(query, page, {orientation, type}){
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    page_size: '24'
  });
  if (orientation) params.set('aspect_ratio', orientation === 'landscape' ? 'wide' : (orientation === 'portrait' ? 'tall' : 'square'));
  const url = `https://api.openverse.org/v1/images/?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Openverse respondió ${res.status}`);
  const data = await res.json();
  const items = (data.results || []).map(r => ({
    id: 'ov_' + r.id,
    thumb: r.thumbnail || r.url,
    full: r.url,
    title: r.title || query,
    credit: r.creator || 'autor desconocido',
    creditUrl: r.creator_url || r.foreign_landing_url,
    license: (r.license || '').toUpperCase() + (r.license_version ? ' ' + r.license_version : ''),
    sourcePage: r.foreign_landing_url || r.url
  }));
  return { items, hasMore: Boolean(data.result_count && page * 24 < data.result_count), total: data.result_count || items.length };
}

async function searchPixabay(query, page, {orientation, type}){
  const key = localStorage.getItem('pixabayKey');
  if (!key) throw new Error('Añade tu clave de Pixabay en Ajustes para usar esta fuente.');
  const params = new URLSearchParams({
    key,
    q: query,
    page: String(page),
    per_page: '24',
    safesearch: 'true'
  });
  if (orientation && orientation !== 'square') params.set('orientation', orientation);
  if (type) params.set('image_type', type === 'photo' ? 'photo' : (type === 'illustration' ? 'illustration' : 'vector'));
  const url = `https://pixabay.com/api/?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pixabay respondió ${res.status}`);
  const data = await res.json();
  const items = (data.hits || []).map(r => ({
    id: 'px_' + r.id,
    thumb: r.webformatURL,
    full: r.largeImageURL || r.webformatURL,
    title: r.tags || query,
    credit: r.user || 'autor desconocido',
    creditUrl: `https://pixabay.com/users/${encodeURIComponent(r.user)}-${r.user_id}/`,
    license: 'Licencia Pixabay',
    sourcePage: r.pageURL
  }));
  return { items, hasMore: page * 24 < data.totalHits, total: data.totalHits || items.length };
}

const adapters = { openverse: searchOpenverse, pixabay: searchPixabay };

/* ---------- búsqueda ---------- */
async function runSearch(reset){
  if (state.loading) return;
  if (reset){
    state.page = 1;
    state.results = [];
    el.grid.innerHTML = '';
  }
  state.loading = true;
  setStatus('Revelando resultados…');
  el.loadMoreWrap.hidden = true;

  try{
    const adapter = adapters[state.source];
    const { items, hasMore, total } = await adapter(state.query, state.page, {
      orientation: state.orientation, type: state.type
    });

    if (items.length === 0 && state.page === 1){
      setStatus('Sin resultados para esa búsqueda. Prueba con otras palabras clave.');
    } else {
      setStatus('');
    }

    state.results = state.results.concat(items);
    renderGrid(items, state.results.length - items.length);
    el.resultCount.textContent = total ? `${state.results.length} de ~${total} cuadros` : `${state.results.length} cuadros`;
    el.loadMoreWrap.hidden = !hasMore;
  } catch(err){
    console.error(err);
    setStatus(err.message || 'Ocurrió un error al buscar.', true);
  } finally {
    state.loading = false;
  }
}

function renderGrid(items, startIndex){
  const frag = document.createDocumentFragment();
  items.forEach((item, i) => {
    const frame = document.createElement('div');
    frame.className = 'frame';
    frame.tabIndex = 0;
    frame.setAttribute('role', 'button');
    frame.setAttribute('aria-label', item.title);

    const num = document.createElement('span');
    num.className = 'frame-num';
    num.textContent = '#' + String(startIndex + i + 1).padStart(3, '0');

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = item.thumb;
    img.alt = item.title;

    const src = document.createElement('span');
    src.className = 'frame-src';
    src.textContent = item.credit;

    frame.append(num, img, src);
    frame.addEventListener('click', () => openLightbox(item));
    frame.addEventListener('keypress', (e) => { if (e.key === 'Enter') openLightbox(item); });

    frag.appendChild(frame);
  });
  el.grid.appendChild(frag);
}

/* ---------- lightbox ---------- */
function openLightbox(item){
  el.lbImg.src = item.full;
  el.lbImg.alt = item.title;
  el.lbTitle.textContent = item.title;
  el.lbCredit.textContent = `por ${item.credit}`;
  el.lbLicense.textContent = item.license || '';
  el.lbSource.href = item.sourcePage || item.full;
  el.lbDownload.href = item.full;
  el.lbDownload.download = sanitizeFilename(item.title || 'imagen') + '.jpg';
  el.lbDownload.onclick = (e) => { e.preventDefault(); forceDownload(item.full, el.lbDownload.download); };
  el.lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeLightbox(){
  el.lightbox.hidden = true;
  document.body.style.overflow = '';
}
el.lbClose.addEventListener('click', closeLightbox);
el.lightbox.addEventListener('click', (e) => { if (e.target === el.lightbox) closeLightbox(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape'){ closeLightbox(); closeDrawer(); } });

function sanitizeFilename(name){
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'imagen';
}

/* descarga forzada vía blob; si el servidor bloquea CORS, cae a abrir en pestaña nueva */
async function forceDownload(url, filename){
  try{
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('no se pudo descargar');
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
  } catch(err){
    window.open(url, '_blank', 'noopener');
  }
}

/* ---------- eventos de búsqueda ---------- */
el.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = el.input.value.trim();
  if (!q) return;
  state.query = q;
  runSearch(true);
});
el.orientation.addEventListener('change', () => { state.orientation = el.orientation.value; if (state.query) runSearch(true); });
el.type.addEventListener('change', () => { state.type = el.type.value; if (state.query) runSearch(true); });
el.source.addEventListener('change', () => {
  state.source = el.source.value;
  localStorage.setItem('preferredSource', state.source);
  if (state.query) runSearch(true);
});
el.loadMoreBtn.addEventListener('click', () => { state.page += 1; runSearch(false); });

/* ---------- arranque ---------- */
loadSettings();
state.source = el.source.value;

if ('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
