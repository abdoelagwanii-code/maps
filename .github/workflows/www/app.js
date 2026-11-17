(function () {
'use strict';
const $ = s => document.querySelector(s);
const TYPES = {
  well: ['بئر', '💧'], tank: ['خزان', '🛢️'], pump: ['مضخة / محطة ضخ', '⚙️'],
  spring: ['نبع / عين', '🌊'], ro: ['محطة تحلية / معالجة', '🧪'], pipe: ['شبكة / وصلة', '🔧'],
  dam: ['سد / حفرة مياه', '🏞️'], other: ['أخرى', '📍']
};
const STATUS = { ok: 'يعمل', stopped: 'متوقف', dry: 'جاف', unknown: 'غير معروف' };

const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('تعذر الحفظ على الجهاز'); } };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(m, ms) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms || 2600); }

let points = load('fm_points', []);
const view = load('fm_view', { c: [24.4539, 54.3773], z: 7, l: 'osm' });

/* ---------- Map ---------- */
const LAYERS = {
  osm: { name: 'خريطة الشوارع (OSM)', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    opt: { maxZoom: 19, attribution: '© OpenStreetMap contributors' } },
  sat: { name: 'أقمار صناعية (Esri World Imagery)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    opt: { maxZoom: 20, maxNativeZoom: 19, attribution: 'Tiles © Esri — Maxar, Earthstar Geographics, GIS User Community' } },
  topo: { name: 'طبوغرافية (Esri)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    opt: { maxZoom: 20, maxNativeZoom: 19, attribution: 'Tiles © Esri' } }
};
const LABELS_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

const map = L.map('map', { zoomControl: false, center: view.c, zoom: view.z, maxZoom: 20 });
L.control.zoom({ position: 'topright' }).addTo(map);
L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

const bases = {}; let currentKey = LAYERS[view.l] ? view.l : 'osm';
Object.keys(LAYERS).forEach(k => {
  bases[LAYERS[k].name] = L.tileLayer(LAYERS[k].url, Object.assign({ key: k }, LAYERS[k].opt));
});
const labels = L.tileLayer(LABELS_URL, { maxZoom: 20, maxNativeZoom: 19, attribution: 'Labels © Esri' });
bases[LAYERS[currentKey].name].addTo(map);
L.control.layers(bases, { 'أسماء الأماكن فوق الصور': labels }, { position: 'topleft' }).addTo(map);
map.on('baselayerchange', e => { currentKey = e.layer.options.key; if (currentKey === 'sat' && !map.hasLayer(labels)) labels.addTo(map); });

function saveView() { const c = map.getCenter(); store('fm_view', { c: [c.lat, c.lng], z: map.getZoom(), l: currentKey }); }
function showCenter() { const c = map.getCenter(); $('#coords').textContent = c.lat.toFixed(6) + ', ' + c.lng.toFixed(6); }
map.on('move', showCenter); map.on('moveend', saveView); showCenter();

/* ---------- Points ---------- */
const group = L.layerGroup().addTo(map);
const markers = {};
function icon(p) {
  return L.divIcon({ className: '', html: '<div class="pin st-' + esc(p.status) + '"><span>' + (TYPES[p.type] ? TYPES[p.type][1] : '📍') + '</span></div>',
    iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -32] });
}
function popupHtml(p) {
  const t = TYPES[p.type] ? TYPES[p.type][0] : 'أخرى';
  return '<div class="pop"><b>' + esc(p.name || 'بدون اسم') + '</b>' +
    '<div>' + esc(t) + ' • ' + esc(STATUS[p.status] || '') + '</div>' +
    '<div dir="ltr" style="text-align:right">' + p.lat.toFixed(6) + ', ' + p.lng.toFixed(6) + (p.acc ? ' (±' + Math.round(p.acc) + 'm)' : '') + '</div>' +
    (p.notes ? '<div>' + esc(p.notes) + '</div>' : '') +
    '<div class="a"><button data-act="edit" data-id="' + p.id + '">تعديل</button>' +
    '<a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lng + '">توجيه</a></div></div>';
}
function render() {
  group.clearLayers();
  Object.keys(markers).forEach(k => delete markers[k]);
  points.forEach(p => { markers[p.id] = L.marker([p.lat, p.lng], { icon: icon(p) }).bindPopup(popupHtml(p)).addTo(group); });
  $('#count').textContent = points.length;
  renderList();
}
map.on('popupopen', e => {
  const el = e.popup.getElement();
  el.querySelectorAll('[data-act="edit"]').forEach(b => b.onclick = () => { map.closePopup(); openForm(points.find(p => p.id === b.dataset.id)); });
});
function renderList() {
  const q = ($('#search').value || '').trim().toLowerCase();
  const box = $('#items'); box.innerHTML = '';
  const list = points.filter(p => !q || (p.name || '').toLowerCase().includes(q));
  if (!list.length) { box.innerHTML = '<div class="it"><div class="t"><small>لا توجد نقاط بعد. استخدم زر ＋ لإضافة نقطة.</small></div></div>'; return; }
  list.slice().reverse().forEach(p => {
    const d = document.createElement('div'); d.className = 'it';
    d.innerHTML = '<div class="e">' + (TYPES[p.type] ? TYPES[p.type][1] : '📍') + '</div><div class="t"><b>' + esc(p.name || 'بدون اسم') + '</b><small>' +
      esc((TYPES[p.type] || ['أخرى'])[0]) + ' • ' + esc(STATUS[p.status] || '') + '</small></div>';
    d.onclick = () => { $('#sheetList').hidden = true; map.setView([p.lat, p.lng], Math.max(map.getZoom(), 17)); markers[p.id] && markers[p.id].openPopup(); };
    box.appendChild(d);
  });
}
$('#search').oninput = renderList;

/* ---------- Form ---------- */
let editing = null;
Object.keys(TYPES).forEach(k => $('#fType').insertAdjacentHTML('beforeend', '<option value="' + k + '">' + TYPES[k][1] + ' ' + TYPES[k][0] + '</option>'));
Object.keys(STATUS).forEach(k => $('#fStatus').insertAdjacentHTML('beforeend', '<option value="' + k + '">' + STATUS[k] + '</option>'));
function openForm(p, lat, lng, acc) {
  editing = p || null;
  $('#mTitle').textContent = p ? 'تعديل النقطة' : 'نقطة جديدة';
  $('#fName').value = p ? p.name : '';
  $('#fType').value = p ? p.type : (load('fm_lastType', 'well'));
  $('#fStatus').value = p ? p.status : 'unknown';
  $('#fLat').value = p ? p.lat : lat.toFixed(6);
  $('#fLng').value = p ? p.lng : lng.toFixed(6);
  $('#fNotes').value = p ? p.notes : '';
  $('#fDel').hidden = !p;
  $('#modal').dataset.acc = p ? (p.acc || '') : (acc || '');
  $('#modal').hidden = false;
}
$('#fCancel').onclick = () => $('#modal').hidden = true;
$('#fSave').onclick = () => {
  const lat = parseFloat($('#fLat').value), lng = parseFloat($('#fLng').value);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { toast('الإحداثيات غير صحيحة'); return; }
  const data = { name: $('#fName').value.trim(), type: $('#fType').value, status: $('#fStatus').value, notes: $('#fNotes').value.trim(), lat, lng };
  store('fm_lastType', data.type);
  if (editing) Object.assign(editing, data);
  else points.push(Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), acc: parseFloat($('#modal').dataset.acc) || null, time: new Date().toISOString() }, data));
  store('fm_points', points); render(); $('#modal').hidden = true; toast('تم الحفظ');
};
$('#fDel').onclick = () => {
  if (!editing || !confirm('حذف هذه النقطة؟')) return;
  points = points.filter(p => p !== editing); store('fm_points', points); render(); $('#modal').hidden = true;
};
$('#btnAdd').onclick = () => { const c = map.getCenter(); openForm(null, c.lat, c.lng); };

/* ---------- GPS ---------- */
let me = null, meMarker = null, meCircle = null, watchId = null, firstFix = false;
function startGPS() {
  if (!navigator.geolocation) { toast('الجهاز لا يدعم تحديد الموقع'); return; }
  if (watchId != null) return;
  firstFix = true;
  watchId = navigator.geolocation.watchPosition(onPos, err => {
    watchId = null; toast('تعذّر تحديد الموقع — فعّل GPS وامنح التطبيق الإذن', 4000);
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 25000 });
}
function onPos(pos) {
  const c = pos.coords; me = { lat: c.latitude, lng: c.longitude, acc: c.accuracy };
  if (!meMarker) {
    meMarker = L.marker([me.lat, me.lng], { icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false, zIndexOffset: 1000 }).addTo(map);
    meCircle = L.circle([me.lat, me.lng], { radius: me.acc, weight: 1, color: '#2563eb', fillOpacity: .12, interactive: false }).addTo(map);
  } else { meMarker.setLatLng([me.lat, me.lng]); meCircle.setLatLng([me.lat, me.lng]).setRadius(me.acc); }
  $('#gpsinfo').textContent = 'GPS ±' + Math.round(me.acc) + ' م';
  if (firstFix) { firstFix = false; map.setView([me.lat, me.lng], Math.max(map.getZoom(), 17)); }
}
$('#btnLoc').onclick = () => { if (me) map.setView([me.lat, me.lng], Math.max(map.getZoom(), 17)); else { toast('جاري تحديد الموقع…'); startGPS(); } };
$('#btnAddGps').onclick = () => {
  if (!me) { toast('جاري تحديد الموقع… اضغط مرة أخرى بعد ظهور النقطة الزرقاء'); startGPS(); return; }
  openForm(null, me.lat, me.lng, me.acc);
};

/* ---------- Sheets ---------- */
$('#btnList').onclick = () => { $('#sheetMore').hidden = true; $('#sheetList').hidden = !$('#sheetList').hidden; renderList(); };
$('#btnMore').onclick = () => { $('#sheetList').hidden = true; $('#sheetMore').hidden = !$('#sheetMore').hidden; };
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $('#' + b.dataset.close).hidden = true);

/* ---------- Export / Import ---------- */
async function saveFile(name, text, mime) {
  const C = window.Capacitor;
  try {
    if (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.Filesystem && C.Plugins.Share) {
      const r = await C.Plugins.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
      await C.Plugins.Share.share({ title: name, url: r.uri, dialogTitle: 'حفظ أو مشاركة الملف' });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { toast('تعذر تصدير الملف: ' + (e.message || e), 4000); }
}
const stamp = () => new Date().toISOString().slice(0, 10);
function needPts() { if (!points.length) { toast('لا توجد نقاط للتصدير'); return false; } return true; }
$('#exGeo').onclick = () => {
  if (!needPts()) return;
  const gj = { type: 'FeatureCollection', features: points.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    properties: { id: p.id, name: p.name, type: p.type, status: p.status, notes: p.notes, accuracy_m: p.acc, time: p.time } })) };
  saveFile('water-points-' + stamp() + '.geojson', JSON.stringify(gj, null, 2), 'application/geo+json');
};
$('#exCsv').onclick = () => {
  if (!needPts()) return;
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [['id', 'name', 'type', 'status', 'lat', 'lng', 'accuracy_m', 'notes', 'time'].join(',')]
    .concat(points.map(p => [p.id, p.name, (TYPES[p.type] || ['other'])[0], STATUS[p.status], p.lat, p.lng, p.acc, p.notes, p.time].map(q).join(',')));
  saveFile('water-points-' + stamp() + '.csv', '\ufeff' + rows.join('\r\n'), 'text/csv');
};
$('#exKml').onclick = () => {
  if (!needPts()) return;
  const x = s => esc(s);
  const kml = '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Water Points</name>\n' +
    points.map(p => '<Placemark><name>' + x(p.name) + '</name><description>' + x((TYPES[p.type] || ['أخرى'])[0] + ' | ' + STATUS[p.status] + ' | ' + (p.notes || '')) +
      '</description><Point><coordinates>' + p.lng + ',' + p.lat + ',0</coordinates></Point></Placemark>').join('\n') + '\n</Document></kml>';
  saveFile('water-points-' + stamp() + '.kml', kml, 'application/vnd.google-earth.kml+xml');
};
$('#imp').onclick = () => $('#file').click();
$('#file').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const gj = JSON.parse(r.result); let n = 0;
      (gj.features || []).forEach(ft => {
        if (!ft.geometry || ft.geometry.type !== 'Point') return;
        const pr = ft.properties || {};
        points.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: pr.name || '', type: TYPES[pr.type] ? pr.type : 'other',
          status: STATUS[pr.status] ? pr.status : 'unknown', notes: pr.notes || '', lat: ft.geometry.coordinates[1], lng: ft.geometry.coordinates[0],
          acc: pr.accuracy_m || null, time: pr.time || new Date().toISOString() });
        n++;
      });
      store('fm_points', points); render(); toast('تم استيراد ' + n + ' نقطة');
    } catch (err) { toast('ملف غير صالح'); }
    e.target.value = '';
  };
  r.readAsText(f);
};
$('#clearAll').onclick = () => { if (points.length && confirm('حذف كل النقاط نهائياً؟ (صدّرها أولاً)')) { points = []; store('fm_points', points); render(); } };

/* ---------- Offline tiles ---------- */
const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * Math.pow(2, z));
const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z)); };
$('#offArea').onclick = async () => {
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) { toast('أعد فتح التطبيق مرة واحدة ثم حاول مجدداً'); return; }
  const L0 = LAYERS[currentKey], b = map.getBounds(), z0 = Math.round(map.getZoom()), maxZ = L0.opt.maxNativeZoom || L0.opt.maxZoom, urls = [];
  for (let z = z0; z <= Math.min(z0 + 2, maxZ); z++) {
    const x1 = lon2x(b.getWest(), z), x2 = lon2x(b.getEast(), z), y1 = lat2y(b.getNorth(), z), y2 = lat2y(b.getSouth(), z);
    for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) urls.push(L0.url.replace('{z}', z).replace('{x}', x).replace('{y}', y));
  }
  if (urls.length > 500) { toast('المنطقة كبيرة (' + urls.length + ' مربع). قرّب الخريطة على منطقة أصغر.', 4000); return; }
  if (!confirm('سيتم حفظ ' + urls.length + ' مربع خريطة من "' + L0.name + '" للعمل بدون إنترنت. متابعة؟')) return;
  $('#sheetMore').hidden = true; let done = 0, i = 0;
  const worker = async () => { while (i < urls.length) { const u = urls[i++]; try { await fetch(u, { mode: 'no-cors' }); } catch (e) {} done++; if (done % 10 === 0) toast('جاري الحفظ… ' + done + '/' + urls.length, 1500); } };
  await Promise.all([worker(), worker(), worker(), worker()]);
  toast('تم حفظ المنطقة (' + urls.length + ' مربع)', 3500);
};
$('#offClear').onclick = async () => { if (window.caches) { await caches.delete('tiles-v1'); toast('تم مسح الخرائط المحفوظة'); } };

/* ---------- Boot ---------- */
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
