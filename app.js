const STORAGE_KEY = 'nomercy_setoran';
const WD_STORAGE_KEY = 'nomercy_catatan_wd';
const SETTINGS_DOC = 'main';
const ADMIN_TABS = ['setoran', 'laporan', 'leaderboard', 'log', 'pengaturan'];
const PUBLIC_TAB = 'catatan-wd';

let allData = [];
let wdData = [];
let activityLogs = [];
let settings = { targetMingguan: 2000, discordWebhook: '' };
let isAdmin = false;
let currentUser = null;
let useFirebase = false;
let db = null;
let auth = null;
let unsubSetoran = null;
let unsubWd = null;
let unsubLog = null;
let unsubSettings = null;
let deleteId = null;
let deleteWdId = null;
let selectedWeek = new Date();

const barangIcons = { 'Besi': '⚙️', 'Emas': '🥇', 'Tembaga': '🔶', 'Potongan Kayu': '🪵' };
const keteranganBadge = {
  'Setoran Mingguan': 'badge-mingguan', 'Setoran Sanksi': 'badge-sanksi',
  'Setoran Donasi': 'badge-donasi', 'Donasi Sukarela': 'badge-sukarela',
};
const logIcons = { CREATE: '➕', UPDATE: '✏️', DELETE: '🗑️', SETTINGS: '⚙️' };
const wdStatusClass = {
  'BELUM DI KEMBALIKAN': 'bg-red-500/20 text-red-400 border border-red-500/30',
  'DI KEMBALIKAN': 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  'KOMA': 'bg-green-500/20 text-green-400 border border-green-500/30',
};

const $ = id => document.getElementById(id);

function on(id, event, handler) {
  const el = $(id);
  if (el) el.addEventListener(event, handler);
}

function setVal(id, value) {
  const el = $(id);
  if (el) el.value = value;
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function isFirebaseConfigured() {
  return typeof firebaseConfig !== 'undefined' && firebaseConfig.apiKey && firebaseConfig.apiKey !== 'ISI_API_KEY_KAMU';
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatNumber(n) { return Number(n).toLocaleString('id-ID'); }

function formatDateTime(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function showToast(msg) {
  $('toast-msg').textContent = msg;
  $('toast').classList.remove('hidden');
  setTimeout(() => $('toast').classList.add('hidden'), 2800);
}

function hideLoading() { $('loading')?.classList.add('hidden'); }

let loadingTimeout = null;

function clearLoadingTimeout() {
  if (loadingTimeout) {
    clearTimeout(loadingTimeout);
    loadingTimeout = null;
  }
}

function startLoadingTimeout() {
  clearLoadingTimeout();
  loadingTimeout = setTimeout(() => {
    if (!$('loading')?.classList.contains('hidden')) {
      hideLoading();
      subscribeData();
      updateAdminUI();
      if (!isAdmin) switchTab(PUBLIC_TAB);
      showToast('⚠ Koneksi lambat — data mungkin belum lengkap, coba refresh');
    }
  }, 8000);
}

function setListLoading(on) {
  const list = $('setoran-list');
  if (!list) return;
  if (on && !list.querySelector('.list-loading')) {
    list.innerHTML = '<p class="list-loading text-center text-mercy-muted text-sm py-8">Memuat data setoran...</p>';
  }
}

function parseDate(s) { return new Date(s + 'T00:00:00'); }

function getWeekBounds(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d.getFullYear(), d.getMonth(), diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function formatWeekRange(start, end) {
  const o = { day: 'numeric', month: 'short', year: 'numeric' };
  return `${start.toLocaleDateString('id-ID', o)} — ${end.toLocaleDateString('id-ID', o)}`;
}

function getWeekKey(date) { return getWeekBounds(date).start.toISOString().slice(0, 10); }

function filterByWeek(data, weekDate) {
  const { start, end } = getWeekBounds(weekDate);
  return data.filter(s => { const d = parseDate(s.tanggal); return d >= start && d <= end; });
}

function getData() { return allData; }

function setoranSummary(s) {
  return `${s.nama} — ${s.barang} ${formatNumber(s.jumlah)} (${s.keterangan})`;
}

function wdSummary(s) {
  return `${s.nama} — ${s.barang} ${formatNumber(s.jumlah)} WD`;
}

function getActiveTab() {
  return document.querySelector('.tab-btn.active')?.dataset.tab || PUBLIC_TAB;
}

function isAdminTab(tab) {
  return ADMIN_TABS.includes(tab);
}

function switchTab(tab) {
  if (isAdminTab(tab) && !isAdmin && useFirebase) {
    showToast('⚠ Login admin diperlukan untuk mengakses tab ini');
    openLoginModal();
    return false;
  }

  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  $(`panel-${tab}`)?.classList.remove('hidden');
  $('stats')?.classList.toggle('hidden', tab !== 'setoran' || !isAdmin);

  if (tab === 'laporan') renderWeeklyReport();
  if (tab === 'leaderboard') renderLeaderboard();
  if (tab === 'log') renderActivityLog();
  if (tab === 'catatan-wd') renderWdList();
  return true;
}

function redirectFromAdminTabs() {
  if (!isAdmin && isAdminTab(getActiveTab())) {
    switchTab(PUBLIC_TAB);
  }
}

// ─── Auth & UI ─────────────────────────────────────────────────

function updateAdminUI() {
  $('admin-form-section')?.classList.remove('hidden');
  $('viewer-info')?.classList.add('hidden');
  $('list-section')?.className = 'lg:col-span-3';

  $('admin-status-field')?.classList.toggle('hidden', !isAdmin);
  $('wd-admin-status-field')?.classList.toggle('hidden', !isAdmin);
  $('edit-wd-status-field')?.classList.toggle('hidden', !isAdmin);

  $('btn-login')?.classList.toggle('hidden', isAdmin);
  $('btn-logout')?.classList.toggle('hidden', !isAdmin);
  $('admin-badge')?.classList.toggle('hidden', !isAdmin);
  $('tab-pengaturan')?.classList.toggle('hidden', !isAdmin);
  $('stats')?.classList.toggle('hidden', !isAdmin || getActiveTab() !== 'setoran');

  redirectFromAdminTabs();

  const modeText = $('mode-text');
  if (modeText) {
    if (isAdmin) {
      modeText.innerHTML = '<span class="text-cyan-400">●</span> Mode admin — Kelola setoran, konfirmasi WD, laporan & pengaturan';
    } else {
      modeText.innerHTML = '<span class="text-blue-400">●</span> Mode public — Isi catatan WD. Setoran & konfirmasi status wajib login admin';
    }
  }

  if (isAdmin) renderList();
  renderWdList();
}

function openLoginModal() {
  $('login-error')?.classList.add('hidden');
  $('login-form')?.reset();
  $('login-modal')?.classList.remove('hidden');
}

function closeLoginModal() {
  $('login-modal')?.classList.add('hidden');
}

function unsubscribeAll() {
  [unsubSetoran, unsubWd, unsubLog, unsubSettings].forEach(u => u?.());
  unsubSetoran = unsubWd = unsubLog = unsubSettings = null;
  allData = [];
  wdData = [];
  activityLogs = [];
}

function subscribeData() {
  if (!db) return;
  unsubscribeAll();

  const applyWd = snap => {
    wdData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderWdList();
  };
  db.collection('catatan_wd').orderBy('tanggal', 'desc').get()
    .then(applyWd)
    .catch(err => {
      console.error(err);
      renderWdList();
    });
  unsubWd = db.collection('catatan_wd').orderBy('tanggal', 'desc').onSnapshot(
    applyWd,
    err => {
      console.error(err);
      renderWdList();
    }
  );

  if (isAdmin) {
    setListLoading(true);
    const applySetoran = snap => {
      allData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll();
      setListLoading(false);
    };

    db.collection('setoran').orderBy('tanggal', 'desc').get()
      .then(applySetoran)
      .catch(err => {
        console.error(err);
        setListLoading(false);
      });

    unsubSetoran = db.collection('setoran').orderBy('tanggal', 'desc').onSnapshot(applySetoran);

    unsubLog = db.collection('activity_log').orderBy('createdAt', 'desc').limit(80).onSnapshot(
      snap => {
        activityLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderActivityLog();
      }
    );

    unsubSettings = db.collection('settings').doc(SETTINGS_DOC).onSnapshot(
      snap => {
        if (snap.exists) {
          settings = { targetMingguan: 2000, discordWebhook: '', ...snap.data() };
          if ($('setting-target')) $('setting-target').value = settings.targetMingguan;
          if ($('setting-discord')) $('setting-discord').value = settings.discordWebhook || '';
          if ($('target-display')) $('target-display').textContent = formatNumber(settings.targetMingguan);
        }
        renderTargetProgress();
      }
    );
  } else {
    allData = [];
    activityLogs = [];
    setListLoading(false);
  }
}

function onAuthChange(user) {
  clearLoadingTimeout();
  hideLoading();
  isAdmin = !!user;
  currentUser = user;
  subscribeData();
  updateAdminUI();
  if (!isAdmin) switchTab(PUBLIC_TAB);
}

// ─── Activity log & Discord ────────────────────────────────────

async function logActivity(action, message, setoranId = null) {
  if (!currentUser && useFirebase) return;
  if (useFirebase) {
    await db.collection('activity_log').add({
      action, message, setoranId,
      userEmail: currentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    activityLogs.unshift({
      id: String(Date.now()), action, message, setoranId,
      userEmail: 'local@dev', createdAt: new Date(),
    });
    renderActivityLog();
  }
}

async function sendDiscord(title, color, fields) {
  const url = settings.discordWebhook?.trim();
  if (!url || !url.includes('discord.com/api/webhooks')) return;
  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{ title, color, fields, footer: { text: 'No Mercy' }, timestamp: new Date().toISOString() }],
      }),
    });
  } catch (e) { console.warn(e); }
}

function discordFields(s) {
  return [
    { name: 'Nama', value: s.nama, inline: true },
    { name: 'Barang', value: s.barang, inline: true },
    { name: 'Jumlah', value: formatNumber(s.jumlah), inline: true },
    { name: 'Keterangan', value: s.keterangan, inline: true },
    { name: 'Catatan', value: s.catatan || '-', inline: false }
  ];
}

// ─── CRUD Setoran ──────────────────────────────────────────────

async function addSetoran(entry) {
  if (useFirebase) {
    const ref = await db.collection('setoran').add({
      ...entry,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await logActivity('CREATE', `Tambah setoran: ${setoranSummary(entry)}`, ref.id);
    await sendDiscord('📦 Setoran Baru', 0x3b82f6, discordFields(entry));
  } else {
    allData.push({ id: String(Date.now()), ...entry });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
    renderAll();
  }
}

async function updateSetoran(id, entry) {
  if (useFirebase) {
    await db.collection('setoran').doc(id).update({
      ...entry,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await logActivity('UPDATE', `Edit setoran: ${setoranSummary(entry)}`, id);
  } else {
    const i = allData.findIndex(s => s.id === id);
    if (i >= 0) allData[i] = { id, ...entry };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
    renderAll();
  }
}

async function removeSetoran(id) {
  const s = allData.find(x => x.id === id);
  if (useFirebase) {
    await db.collection('setoran').doc(id).delete();
    if (s) await logActivity('DELETE', `Hapus setoran: ${setoranSummary(s)}`, id);
  } else {
    allData = allData.filter(x => x.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
    renderAll();
  }
}

// ─── CRUD Catatan WD ───────────────────────────────────────────

function getWdData() { return wdData; }

async function addWd(entry) {
  if (useFirebase) {
    const ref = await db.collection('catatan_wd').add({
      ...entry,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await logActivity('CREATE', `Tambah catatan WD: ${wdSummary(entry)}`, ref.id);
  } else {
    wdData.push({ id: String(Date.now()), ...entry });
    localStorage.setItem(WD_STORAGE_KEY, JSON.stringify(wdData));
    renderWdList();
  }
}

async function updateWd(id, entry) {
  if (useFirebase) {
    await db.collection('catatan_wd').doc(id).update({
      ...entry,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await logActivity('UPDATE', `Edit catatan WD: ${wdSummary(entry)}`, id);
  } else {
    const i = wdData.findIndex(s => s.id === id);
    if (i >= 0) wdData[i] = { id, ...entry };
    localStorage.setItem(WD_STORAGE_KEY, JSON.stringify(wdData));
    renderWdList();
  }
}

async function removeWd(id) {
  const s = wdData.find(x => x.id === id);
  if (useFirebase) {
    await db.collection('catatan_wd').doc(id).delete();
    if (s) await logActivity('DELETE', `Hapus catatan WD: ${wdSummary(s)}`, id);
  } else {
    wdData = wdData.filter(x => x.id !== id);
    localStorage.setItem(WD_STORAGE_KEY, JSON.stringify(wdData));
    renderWdList();
  }
}

// ─── Render ────────────────────────────────────────────────────

function updateStats(data) {
  const weekStart = getWeekBounds().start;
  const weekData = data.filter(s => parseDate(s.tanggal) >= weekStart);
  $('stat-total').textContent = data.length;
  $('stat-week').textContent = weekData.length;
  $('stat-amount').textContent = formatNumber(data.reduce((s, r) => s + r.jumlah, 0));
  $('stat-members').textContent = new Set(data.map(s => s.nama.toLowerCase())).size;
}

function renderList() {
  const search = $('search').value.toLowerCase();
  const filter = $('filter-keterangan').value;
  const filtered = getData().filter(s =>
    s.nama.toLowerCase().includes(search) && (!filter || s.keterangan === filter)
  ).sort((a, b) => parseDate(b.tanggal) - parseDate(a.tanggal));

  const list = $('setoran-list');
  list.innerHTML = '';
  $('empty-state').classList.toggle('hidden', filtered.length > 0);

  filtered.forEach(s => {
    const card = document.createElement('div');
    card.className = 'setoran-card';
    const canEdit = isAdmin || !useFirebase;
    
    // Warnai badge status admin secara dinamis
    let statusClass = 'bg-red-500/20 text-red-400 border border-red-500/30';
    if (s.statusAdmin === 'DIBALIKIN') statusClass = 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
    if (s.statusAdmin === 'KOMA') statusClass = 'bg-green-500/20 text-green-400 border border-green-500/30';

    card.innerHTML = `
      <div>
        <div class="flex flex-wrap items-center gap-2 mb-1.5">
          <span class="font-display text-lg tracking-wide">${escapeHtml(s.nama)}</span>
          <span class="badge ${keteranganBadge[s.keterangan] || ''}">${escapeHtml(s.keterangan)}</span>
          <span class="text-[11px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${statusClass}">${escapeHtml(s.statusAdmin || 'BELUM')}</span>
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mercy-muted mb-1">
          <span>${formatDate(s.tanggal)}</span>
          <span>${barangIcons[s.barang] || ''} ${escapeHtml(s.barang)}</span>
          <span class="text-cyan-400 font-semibold">${formatNumber(s.jumlah)}</span>
          <span>→ ${escapeHtml(s.disetor)}</span>
        </div>
        <div class="text-xs text-slate-400 bg-black/20 px-2 py-1 rounded border border-mercy-border/30 inline-block">
          <span class="text-mercy-muted">Catatan:</span> ${escapeHtml(s.catatan || '—')}
        </div>
      </div>
      ${canEdit ? `<div class="flex gap-1 items-start">
        <button class="edit-btn" data-id="${s.id}" title="Edit">✎</button>
        <button class="delete-btn" data-id="${s.id}" title="Hapus">✕</button>
      </div>` : ''}`;
    list.appendChild(card);
  });

  $('list-count').textContent = `${filtered.length} setoran`;
  updateStats(getData());
}

function groupSum(data, key) {
  const map = {};
  data.forEach(s => {
    if (!map[s[key]]) map[s[key]] = { count: 0, total: 0 };
    map[s[key]].count++;
    map[s[key]].total += s.jumlah;
  });
  return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);
}

function renderBarList(containerId, emptyId, items) {
  const c = $(containerId), e = $(emptyId);
  c.innerHTML = '';
  if (!items.length) { e.classList.remove('hidden'); return; }
  e.classList.add('hidden');
  const max = items[0].total;
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'report-row';
    row.innerHTML = `
      <span class="report-row-label">${escapeHtml(item.name)}</span>
      <div class="report-row-bar-wrap"><div class="report-row-bar" style="width:${max ? item.total / max * 100 : 0}%"></div></div>
      <span class="report-row-value">${formatNumber(item.total)}</span>`;
    c.appendChild(row);
  });
}

function renderTargetProgress() {
  const target = settings.targetMingguan || 2000;
  const weekData = filterByWeek(getData(), selectedWeek).filter(s => s.keterangan === 'Setoran Mingguan');
  const byMember = {};
  weekData.forEach(s => {
    const k = s.nama.toLowerCase();
    if (!byMember[k]) byMember[k] = { name: s.nama, total: 0 };
    byMember[k].total += s.jumlah;
  });
  const members = Object.values(byMember).sort((a, b) => b.total - a.total);
  const list = $('target-list');
  list.innerHTML = '';
  members.forEach(m => {
    const pct = Math.min(100, (m.total / target) * 100);
    const done = m.total >= target;
    const row = document.createElement('div');
    row.className = 'target-row';
    row.innerHTML = `
      <div class="flex justify-between mb-1 text-xs"><span>${escapeHtml(m.name)}</span><span>${formatNumber(m.total)} / ${formatNumber(target)}</span></div>
      <div class="target-bar-wrap"><div class="target-bar ${done ? 'target-bar-done' : ''}" style="width:${pct}%"></div></div>`;
    list.appendChild(row);
  });
}

function renderWdList() {
  const search = ($('wd-search')?.value || '').toLowerCase();
  const filter = $('wd-filter-status')?.value || '';
  const filtered = getWdData().filter(s =>
    s.nama.toLowerCase().includes(search) && (!filter || s.statusKonfirmasi === filter)
  ).sort((a, b) => parseDate(b.tanggal) - parseDate(a.tanggal));

  const list = $('wd-list');
  if (!list) return;
  list.innerHTML = '';
  $('wd-empty-state')?.classList.toggle('hidden', filtered.length > 0);

  const canEdit = isAdmin || !useFirebase;

  filtered.forEach(s => {
    const card = document.createElement('div');
    card.className = 'setoran-card';
    const status = s.statusKonfirmasi || 'BELUM DI KEMBALIKAN';
    const statusClass = wdStatusClass[status] || wdStatusClass['BELUM DI KEMBALIKAN'];

    card.innerHTML = `
      <div>
        <div class="flex flex-wrap items-center gap-2 mb-1.5">
          <span class="font-display text-lg tracking-wide">${escapeHtml(s.nama)}</span>
          <span class="text-[11px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${statusClass}">${escapeHtml(status)}</span>
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mercy-muted mb-1">
          <span>${formatDate(s.tanggal)}</span>
          <span>${barangIcons[s.barang] || ''} ${escapeHtml(s.barang)}</span>
          <span class="text-cyan-400 font-semibold">${formatNumber(s.jumlah)}</span>
        </div>
        <div class="text-xs text-slate-400 bg-black/20 px-2 py-1 rounded border border-mercy-border/30 inline-block">
          <span class="text-mercy-muted">Catatan:</span> ${escapeHtml(s.catatan || '—')}
        </div>
      </div>
      ${canEdit ? `<div class="flex gap-1 items-start">
        <button class="edit-wd-btn" data-id="${s.id}" title="Edit">✎</button>
        <button class="delete-wd-btn" data-id="${s.id}" title="Hapus">✕</button>
      </div>` : ''}`;
    list.appendChild(card);
  });

  if ($('wd-list-count')) $('wd-list-count').textContent = `${filtered.length} catatan`;
}

function renderAll() {
  renderList();
  renderWdList();
  renderWeeklyReport();
  renderLeaderboard();
  renderActivityLog();
}

function renderWeeklyReport() {
  const weekData = filterByWeek(getData(), selectedWeek);
  const { start, end } = getWeekBounds(selectedWeek);
  $('laporan-range').textContent = formatWeekRange(start, end);
  renderBarList('report-members', 'report-members-empty', groupSum(weekData, 'nama'));
  renderBarList('report-barang', 'report-barang-empty', groupSum(weekData, 'barang'));
  renderTargetProgress();
}

function renderLeaderboard() {
  const period = $('leaderboard-period').value;
  let data = period === 'week' ? filterByWeek(getData(), new Date()) : getData();
  const map = {};
  data.forEach(s => {
    const k = s.nama.toLowerCase();
    if (!map[k]) map[k] = { name: s.nama, total: 0, count: 0 };
    map[k].total += s.jumlah;
    map[k].count++;
  });
  const ranked = Object.values(map).sort((a, b) => b.total - a.total);
  const list = $('leaderboard-list');
  list.innerHTML = '';
  ranked.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.innerHTML = `<span class="leaderboard-rank">#${i + 1}</span><span class="leaderboard-name">${escapeHtml(m.name)}</span><span class="leaderboard-total">${formatNumber(m.total)}</span>`;
    list.appendChild(row);
  });
}

function renderActivityLog() {
  const list = $('activity-log');
  list.innerHTML = '';
  activityLogs.forEach(log => {
    const row = document.createElement('div');
    row.className = 'log-row';
    row.innerHTML = `<div class="text-sm"><strong>${log.action}</strong>: ${escapeHtml(log.message)}</div><div class="text-xs text-mercy-muted">${formatDateTime(log.createdAt)}</div>`;
    list.appendChild(row);
  });
}

// ─── Tabs & Events ─────────────────────────────────────────────

function downloadCsv(headers, rows, filename) {
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function openEditModal(id) {
  const s = allData.find(x => x.id === id);
  if (!s) return;
  setVal('edit-id', id);
  setVal('edit-tanggal', s.tanggal);
  setVal('edit-nama', s.nama);
  setVal('edit-barang', s.barang);
  setVal('edit-jumlah', s.jumlah);
  setVal('edit-disetor', s.disetor);
  setVal('edit-keterangan', s.keterangan);
  setVal('edit-catatan', s.catatan || '');
  setVal('edit-status-admin', s.statusAdmin || 'BELUM');
  $('edit-modal')?.classList.remove('hidden');
}

function openEditWdModal(id) {
  const s = wdData.find(x => x.id === id);
  if (!s) return;
  setVal('edit-wd-id', id);
  setVal('edit-wd-tanggal', s.tanggal);
  setVal('edit-wd-nama', s.nama);
  setVal('edit-wd-barang', s.barang);
  setVal('edit-wd-jumlah', s.jumlah);
  setVal('edit-wd-catatan', s.catatan || '');
  setVal('edit-wd-status', s.statusKonfirmasi || 'BELUM DI KEMBALIKAN');
  $('edit-wd-modal')?.classList.remove('hidden');
}

function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll('#jumlah-group .jumlah-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#jumlah-group .jumlah-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setVal('jumlah', btn.dataset.value);
    });
  });

  document.querySelectorAll('#wd-jumlah-group .wd-jumlah-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#wd-jumlah-group .wd-jumlah-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setVal('wd-jumlah', btn.dataset.value);
    });
  });

  on('setoran-form', 'submit', async e => {
    e.preventDefault();
    if (!isAdmin && useFirebase) { showToast('⚠ Hanya admin yang bisa input setoran'); return; }
    if (!$('jumlah')?.value) { showToast('⚠ Pilih jumlah dulu!'); return; }

    const entry = {
      tanggal: $('tanggal').value,
      nama: $('nama').value.trim(),
      barang: $('barang').value,
      jumlah: Number($('jumlah').value),
      disetor: $('disetor').value,
      keterangan: $('keterangan').value,
      catatan: $('catatan')?.value.trim() || '—',
      statusAdmin: isAdmin ? $('status_admin').value : 'BELUM'
    };

    try {
      if (useFirebase) {
        const ref = await db.collection('setoran').add({
          ...entry,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        if (isAdmin) await logActivity('CREATE', `Tambah setoran: ${setoranSummary(entry)}`, ref.id);
        await sendDiscord('📦 Setoran Baru', 0x3b82f6, discordFields(entry));
      } else {
        allData.push({ id: String(Date.now()), ...entry });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
        renderAll();
      }
      showToast('✓ Setoran berhasil dikirim!');
      $('setoran-form').reset();
      if ($('tanggal')) $('tanggal').valueAsDate = new Date();
      document.querySelectorAll('#jumlah-group .jumlah-btn').forEach(b => b.classList.remove('active'));
    } catch (err) {
      console.error(err);
      showToast('⚠ Gagal menyimpan setoran');
    }
  });

  on('wd-form', 'submit', async e => {
    e.preventDefault();
    if (!$('wd-jumlah')?.value) { showToast('⚠ Pilih jumlah dulu!'); return; }

    const entry = {
      tanggal: $('wd-tanggal').value,
      nama: $('wd-nama').value.trim(),
      barang: $('wd-barang').value,
      jumlah: Number($('wd-jumlah').value),
      catatan: $('wd-catatan')?.value.trim() || '—',
      statusKonfirmasi: isAdmin ? $('wd-status').value : 'BELUM DI KEMBALIKAN'
    };

    try {
      await addWd(entry);
      showToast('✓ Catatan WD berhasil dicatat!');
      $('wd-form').reset();
      if ($('wd-tanggal')) $('wd-tanggal').valueAsDate = new Date();
      document.querySelectorAll('#wd-jumlah-group .wd-jumlah-btn').forEach(b => b.classList.remove('active'));
    } catch (err) {
      console.error(err);
      showToast('⚠ Gagal menyimpan catatan WD');
    }
  });

  on('setoran-list', 'click', e => {
    const edit = e.target.closest('.edit-btn');
    const del = e.target.closest('.delete-btn');
    if (edit) openEditModal(edit.dataset.id);
    if (del) { deleteId = del.dataset.id; $('delete-modal')?.classList.remove('hidden'); }
  });

  on('wd-list', 'click', e => {
    const edit = e.target.closest('.edit-wd-btn');
    const del = e.target.closest('.delete-wd-btn');
    if (edit) openEditWdModal(edit.dataset.id);
    if (del) { deleteWdId = del.dataset.id; $('delete-wd-modal')?.classList.remove('hidden'); }
  });

  on('edit-form', 'submit', async e => {
    e.preventDefault();
    const id = $('edit-id').value;
    const entry = {
      tanggal: $('edit-tanggal').value,
      nama: $('edit-nama').value.trim(),
      barang: $('edit-barang').value,
      jumlah: Number($('edit-jumlah').value),
      disetor: $('edit-disetor').value,
      keterangan: $('edit-keterangan').value,
      catatan: $('edit-catatan').value.trim() || '—',
      statusAdmin: $('edit-status-admin').value
    };
    try {
      await updateSetoran(id, entry);
      $('edit-modal')?.classList.add('hidden');
      showToast('✓ Setoran berhasil diupdate!');
    } catch (err) { console.error(err); showToast('⚠ Gagal update'); }
  });

  on('edit-wd-form', 'submit', async e => {
    e.preventDefault();
    if (!isAdmin && useFirebase) { showToast('⚠ Hanya admin yang bisa edit catatan WD'); return; }
    const id = $('edit-wd-id').value;
    const existing = wdData.find(x => x.id === id);
    const entry = {
      tanggal: $('edit-wd-tanggal').value,
      nama: $('edit-wd-nama').value.trim(),
      barang: $('edit-wd-barang').value,
      jumlah: Number($('edit-wd-jumlah').value),
      catatan: $('edit-wd-catatan').value.trim() || '—',
      statusKonfirmasi: isAdmin ? $('edit-wd-status').value : (existing?.statusKonfirmasi || 'BELUM DI KEMBALIKAN')
    };
    try {
      await updateWd(id, entry);
      $('edit-wd-modal')?.classList.add('hidden');
      showToast('✓ Catatan WD berhasil diupdate!');
    } catch (err) { console.error(err); showToast('⚠ Gagal update catatan WD'); }
  });

  on('edit-cancel', 'click', () => $('edit-modal')?.classList.add('hidden'));
  on('edit-wd-cancel', 'click', () => $('edit-wd-modal')?.classList.add('hidden'));
  on('delete-cancel', 'click', () => { $('delete-modal')?.classList.add('hidden'); deleteId = null; });
  on('delete-wd-cancel', 'click', () => { $('delete-wd-modal')?.classList.add('hidden'); deleteWdId = null; });

  on('delete-confirm', 'click', async () => {
    if (deleteId) {
      try { await removeSetoran(deleteId); showToast('Setoran dihapus'); }
      catch (err) { console.error(err); showToast('⚠ Gagal hapus'); }
    }
    $('delete-modal')?.classList.add('hidden');
    deleteId = null;
  });

  on('delete-wd-confirm', 'click', async () => {
    if (deleteWdId) {
      try { await removeWd(deleteWdId); showToast('Catatan WD dihapus'); }
      catch (err) { console.error(err); showToast('⚠ Gagal hapus'); }
    }
    $('delete-wd-modal')?.classList.add('hidden');
    deleteWdId = null;
  });

  on('btn-login', 'click', openLoginModal);
  on('btn-login-viewer', 'click', openLoginModal);
  on('login-cancel', 'click', closeLoginModal);
  on('login-form', 'submit', async e => {
    e.preventDefault();
    if (!auth) { showToast('⚠ Firebase belum dikonfigurasi'); return; }
    $('login-error')?.classList.add('hidden');
    try {
      await auth.signInWithEmailAndPassword($('login-email').value.trim(), $('login-password').value);
      closeLoginModal();
      showToast('✓ Login berhasil!');
    } catch {
      const errEl = $('login-error');
      if (errEl) {
        errEl.textContent = 'Email atau password salah';
        errEl.classList.remove('hidden');
      }
    }
  });

  on('btn-logout', 'click', async () => {
    if (!auth) return;
    try {
      await auth.signOut();
      showToast('Logout berhasil');
    } catch {
      showToast('⚠ Gagal logout');
    }
  });

  document.querySelectorAll('[data-close]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.close;
      $(id)?.classList.add('hidden');
      if (id === 'delete-modal') deleteId = null;
      if (id === 'delete-wd-modal') deleteWdId = null;
    });
  });

  on('search', 'input', renderList);
  on('filter-keterangan', 'change', renderList);
  on('wd-search', 'input', renderWdList);
  on('wd-filter-status', 'change', renderWdList);
  on('leaderboard-period', 'change', renderLeaderboard);

  on('settings-form', 'submit', async e => {
    e.preventDefault();
    const targetMingguan = Number($('setting-target').value) || 2000;
    const discordWebhook = $('setting-discord').value.trim();
    try {
      if (useFirebase) {
        await db.collection('settings').doc(SETTINGS_DOC).set({ targetMingguan, discordWebhook }, { merge: true });
        await logActivity('SETTINGS', `Update pengaturan: target ${formatNumber(targetMingguan)}`);
      } else {
        settings = { targetMingguan, discordWebhook };
      }
      showToast('✓ Pengaturan disimpan!');
    } catch (err) { console.error(err); showToast('⚠ Gagal simpan pengaturan'); }
  });

  on('export-btn', 'click', () => {
    const data = getData();
    if (!data.length) { showToast('⚠ Tidak ada data'); return; }
    downloadCsv(
      ['Tanggal', 'Nama', 'Barang', 'Jumlah', 'Disetor Ke', 'Keterangan', 'Catatan', 'Status'],
      data.map(s => [s.tanggal, s.nama, s.barang, s.jumlah, s.disetor, s.keterangan, s.catatan, s.statusAdmin]),
      `setoran-no-mercy-${new Date().toISOString().slice(0, 10)}.csv`
    );
    showToast('✓ CSV didownload');
  });

  on('wd-export-btn', 'click', () => {
    const data = getWdData();
    if (!data.length) { showToast('⚠ Tidak ada data'); return; }
    downloadCsv(
      ['Tanggal', 'Nama', 'Barang', 'Jumlah', 'Catatan', 'Status Konfirmasi'],
      data.map(s => [s.tanggal, s.nama, s.barang, s.jumlah, s.catatan, s.statusKonfirmasi]),
      `catatan-wd-no-mercy-${new Date().toISOString().slice(0, 10)}.csv`
    );
    showToast('✓ CSV didownload');
  });

  on('week-prev', 'click', () => {
    selectedWeek = new Date(selectedWeek);
    selectedWeek.setDate(selectedWeek.getDate() - 7);
    renderWeeklyReport();
  });
  on('week-next', 'click', () => {
    selectedWeek = new Date(selectedWeek);
    selectedWeek.setDate(selectedWeek.getDate() + 7);
    renderWeeklyReport();
  });
  on('week-current', 'click', () => { selectedWeek = new Date(); renderWeeklyReport(); });

  on('export-week-btn', 'click', () => {
    const weekData = filterByWeek(getData(), selectedWeek);
    if (!weekData.length) { showToast('⚠ Kosong'); return; }
    const { start } = getWeekBounds(selectedWeek);
    downloadCsv(
      ['Tanggal', 'Nama', 'Barang', 'Jumlah', 'Disetor Ke', 'Keterangan'],
      weekData.sort((a, b) => parseDate(a.tanggal) - parseDate(b.tanggal)).map(s => [s.tanggal, s.nama, s.barang, s.jumlah, s.disetor, s.keterangan]),
      `laporan-${start.toISOString().slice(0, 10)}.csv`
    );
  });

  if ($('tanggal')) $('tanggal').valueAsDate = new Date();
  if ($('wd-tanggal')) $('wd-tanggal').valueAsDate = new Date();
}

function initLocalDev() {
  useFirebase = false;
  isAdmin = true;
  try { allData = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { allData = []; }
  try { wdData = JSON.parse(localStorage.getItem(WD_STORAGE_KEY)) || []; } catch { wdData = []; }
  $('setup-banner')?.classList.remove('hidden');
  hideLoading();
  updateAdminUI();
  renderAll();
}

function initFirebase() {
  if (!isFirebaseConfigured()) { initLocalDev(); return; }

  if (typeof firebase === 'undefined') {
    console.error('Firebase SDK tidak termuat');
    hideLoading();
    showToast('⚠ Gagal memuat Firebase — cek koneksi internet lalu refresh');
    return;
  }

  try {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    useFirebase = true;
    startLoadingTimeout();
    auth.onAuthStateChanged(onAuthChange, err => {
      console.error(err);
      clearLoadingTimeout();
      hideLoading();
      subscribeData();
      updateAdminUI();
      showToast('⚠ Gagal cek status login — coba refresh');
    });
  } catch (err) {
    console.error(err);
    clearLoadingTimeout();
    hideLoading();
    showToast('⚠ Gagal inisialisasi Firebase');
  }
}

bindEvents();
initFirebase();