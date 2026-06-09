const STORAGE_KEY = 'nomercy_setoran';
const SETTINGS_DOC = 'main';

let allData = [];
let activityLogs = [];
let settings = { targetMingguan: 2000, discordWebhook: '' };
let isAdmin = false;
let currentUser = null;
let useFirebase = false;
let db = null;
let auth = null;
let unsubSetoran = null;
let unsubLog = null;
let unsubSettings = null;
let deleteId = null;
let selectedWeek = new Date();

const barangIcons = { 'Besi': '⚙️', 'Emas': '🥇', 'Tembaga': '🔶', 'Potongan Kayu': '🪵' };
const keteranganBadge = {
  'Setoran Mingguan': 'badge-mingguan', 'Setoran Sanksi': 'badge-sanksi',
  'Setoran Donasi': 'badge-donasi', 'Donasi Sukarela': 'badge-sukarela',
};
const logIcons = { CREATE: '➕', UPDATE: '✏️', DELETE: '🗑️', SETTINGS: '⚙️' };

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

function hideLoading() { $('loading').classList.add('hidden'); }

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

// ─── Auth & UI ─────────────────────────────────────────────────

function updateAdminUI() {
  const canEdit = isAdmin || !useFirebase;

  $('admin-form-section')?.classList.toggle('hidden', !canEdit);
  $('viewer-info')?.classList.toggle('hidden', canEdit);
  $('list-section')?.classList.toggle('lg:col-span-3', canEdit);
  $('list-section')?.classList.toggle('lg:col-span-5', !canEdit);

  $('btn-login')?.classList.toggle('hidden', isAdmin);
  $('btn-logout')?.classList.toggle('hidden', !isAdmin);
  $('admin-badge')?.classList.toggle('hidden', !isAdmin);
  $('btn-login-viewer')?.classList.toggle('hidden', isAdmin);
  $('tab-pengaturan')?.classList.toggle('hidden', !isAdmin);

  if (!isAdmin && document.querySelector('.tab-btn[data-tab="pengaturan"]')?.classList.contains('active')) {
    document.querySelector('.tab-btn[data-tab="setoran"]')?.click();
  }

  const modeText = $('mode-text');
  if (modeText) {
    if (isAdmin) {
      modeText.innerHTML = '<span class="text-cyan-400">●</span> Mode admin — kamu bisa input, edit & hapus setoran';
    } else {
      modeText.innerHTML = '<span class="text-blue-400">●</span> Mode lihat — login admin untuk input & edit';
    }
  }

  renderList();
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
  [unsubSetoran, unsubLog, unsubSettings].forEach(u => u?.());
  unsubSetoran = unsubLog = unsubSettings = null;
  allData = [];
  activityLogs = [];
}

function subscribeData() {
  if (!db) return;
  unsubscribeAll();
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
}

function onAuthChange(user) {
  hideLoading();
  isAdmin = !!user;
  currentUser = user;
  updateAdminUI();
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
    
    // Fitur: Keterangan Admin hanya bisa diakses oleh Admin
    const adminStatusHtml = isAdmin ? 
      `<span class="ml-2 px-2 py-0.5 rounded text-[10px] bg-cyan-900/30 text-cyan-300 border border-cyan-500/30">ADMIN: ${s.status_admin || 'BELUM'}</span>` : '';

    card.innerHTML = `
      <div class="flex-1">
        <div class="flex flex-wrap items-center gap-2 mb-1.5">
          <span class="font-display text-lg tracking-wide">${escapeHtml(s.nama)}</span>
          <span class="badge ${keteranganBadge[s.keterangan] || ''}">${escapeHtml(s.keterangan)}</span>
          ${adminStatusHtml}
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mercy-muted">
          <span>${formatDate(s.tanggal)}</span>
          <span>${barangIcons[s.barang] || ''} ${escapeHtml(s.barang)}</span>
          <span class="text-cyan-400 font-semibold">${formatNumber(s.jumlah)}</span>
          <span>→ ${escapeHtml(s.disetor)}</span>
        </div>
        ${s.catatan ? `<p class="text-xs italic text-mercy-muted mt-2 pl-2 border-l border-mercy-border">Note: "${escapeHtml(s.catatan)}"</p>` : ''}
      </div>
      ${canEdit ? `<div class="flex gap-1">
        <button class="edit-btn" data-id="${s.id}">✎</button>
        <button class="delete-btn" data-id="${s.id}">✕</button>
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

function renderAll() {
  renderList();
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

function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
      $(`panel-${btn.dataset.tab}`)?.classList.remove('hidden');
    });
  });

  document.querySelectorAll('.jumlah-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.jumlah-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setVal('jumlah', btn.dataset.value);
    });
  });

  on('setoran-form', 'submit', async e => {
    e.preventDefault();
    const entry = {
      tanggal: $('tanggal').value,
      nama: $('nama').value.trim(),
      barang: $('barang').value,
      jumlah: Number($('jumlah').value),
      disetor: $('disetor').value,
      keterangan: $('keterangan').value,
      catatan: $('catatan').value.trim(), // Data Catatan Manual
      status_admin: isAdmin ? $('status_admin').value : 'BELUM' // Data Khusus Admin
    };
    try {
      await addSetoran(entry);
      $('setoran-form').reset();
      showToast('✓ Setoran dicatat!');
    } catch (err) { showToast('⚠ Gagal simpan'); }
  });

  on('setoran-list', 'click', e => {
    const edit = e.target.closest('.edit-btn');
    const del = e.target.closest('.delete-btn');
    if (edit) openEditModal(edit.dataset.id);
    if (del) { deleteId = del.dataset.id; $('delete-modal').classList.remove('hidden'); }
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
      catatan: $('edit-catatan').value.trim(),
      status_admin: $('edit-status-admin').value // Admin bisa edit status
    };
    await updateSetoran(id, entry);
    $('edit-modal').classList.add('hidden');
  });

  on('delete-confirm', 'click', async () => {
    if (deleteId) await removeSetoran(deleteId);
    $('delete-modal').classList.add('hidden');
  });

  on('btn-login', 'click', openLoginModal);
  on('btn-logout', 'click', () => auth.signOut());
  on('login-form', 'submit', async e => {
    e.preventDefault();
    try {
      await auth.signInWithEmailAndPassword($('login-email').value, $('login-password').value);
      closeLoginModal();
    } catch { $('login-error').classList.remove('hidden'); }
  });
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
  setVal('edit-status-admin', s.status_admin || 'BELUM');
  $('edit-modal').classList.remove('hidden');
}

function initFirebase() {
  if (!isFirebaseConfigured()) return;
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  useFirebase = true;
  auth.onAuthStateChanged(onAuthChange);
  subscribeData();
}

bindEvents();
initFirebase();