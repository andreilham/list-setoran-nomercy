const STORAGE_KEY = 'nomercy_setoran';
const SETTINGS_DOC = 'main';

let allData = [];
let activityLogs = [];
let settings = { targetMingguan: 2000, discordWebhook: '' };
let isLoggedIn = false;
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
  else console.warn('[No Mercy] Elemen tidak ditemukan:', id);
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

// ─── Auth & UI shell ───────────────────────────────────────────

function showAuthGate() {
  $('auth-gate').classList.remove('hidden');
  $('app-shell').classList.add('hidden');
}

function showApp() {
  $('auth-gate').classList.add('hidden');
  $('app-shell').classList.remove('hidden');
  if (currentUser) $('user-email').textContent = currentUser.email;
}

function unsubscribeAll() {
  [unsubSetoran, unsubLog, unsubSettings].forEach(u => u?.());
  unsubSetoran = unsubLog = unsubSettings = null;
  allData = [];
  activityLogs = [];
}

function subscribeData() {
  if (!db || !isLoggedIn) return;
  unsubscribeAll();
  setListLoading(true);

  const applySetoran = snap => {
    allData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
    setListLoading(false);
  };

  // Load cepat pakai get(), lalu realtime pakai onSnapshot
  db.collection('setoran').orderBy('tanggal', 'desc').get()
    .then(applySetoran)
    .catch(err => {
      console.error(err);
      setListLoading(false);
      showToast('⚠ Gagal load setoran — cek Firestore Rules');
    });

  unsubSetoran = db.collection('setoran').orderBy('tanggal', 'desc').onSnapshot(
    applySetoran,
    err => {
      console.error(err);
      setListLoading(false);
      showToast('⚠ Gagal sync setoran — cek Firestore Rules');
    }
  );

  unsubLog = db.collection('activity_log').orderBy('createdAt', 'desc').limit(80).onSnapshot(
    snap => {
      activityLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderActivityLog();
    },
    err => console.warn('Log:', err)
  );

  unsubSettings = db.collection('settings').doc(SETTINGS_DOC).onSnapshot(
    snap => {
      if (snap.exists) {
        settings = { targetMingguan: 2000, discordWebhook: '', ...snap.data() };
        $('setting-target').value = settings.targetMingguan;
        $('setting-discord').value = settings.discordWebhook || '';
        $('target-display').textContent = formatNumber(settings.targetMingguan);
      }
      renderTargetProgress();
    },
    err => console.warn('Settings:', err)
  );
}

function onAuthChange(user) {
  hideLoading();
  isLoggedIn = !!user;
  currentUser = user;
  if (useFirebase) {
    if (user) {
      showApp();
      subscribeData();
    } else {
      unsubscribeAll();
      showAuthGate();
    }
  }
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
    if (activityLogs.length > 80) activityLogs.pop();
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
        embeds: [{ title, color, fields, footer: { text: 'No Mercy — Setoran Geng' }, timestamp: new Date().toISOString() }],
      }),
    });
  } catch (e) { console.warn('Discord webhook:', e); }
}

function discordFields(s) {
  return [
    { name: 'Nama', value: s.nama, inline: true },
    { name: 'Barang', value: s.barang, inline: true },
    { name: 'Jumlah', value: formatNumber(s.jumlah), inline: true },
    { name: 'Disetor Ke', value: s.disetor, inline: true },
    { name: 'Keterangan', value: s.keterangan, inline: true },
    { name: 'Tanggal', value: s.tanggal, inline: true },
    { name: 'Oleh', value: currentUser?.email || '—', inline: false },
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
    await logActivity('CREATE', `Tambah setoran: ${setoranSummary(entry)}`);
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
    await sendDiscord('✏️ Setoran Diedit', 0x22d3ee, discordFields(entry));
  } else {
    const i = allData.findIndex(s => s.id === id);
    if (i >= 0) allData[i] = { id, ...entry };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
    await logActivity('UPDATE', `Edit setoran: ${setoranSummary(entry)}`, id);
    renderAll();
  }
}

async function removeSetoran(id) {
  const s = allData.find(x => x.id === id);
  if (useFirebase) {
    await db.collection('setoran').doc(id).delete();
    if (s) {
      await logActivity('DELETE', `Hapus setoran: ${setoranSummary(s)}`, id);
      await sendDiscord('🗑️ Setoran Dihapus', 0xef4444, discordFields(s));
    }
  } else {
    allData = allData.filter(x => x.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
    if (s) await logActivity('DELETE', `Hapus setoran: ${setoranSummary(s)}`, id);
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
    card.innerHTML = `
      <div>
        <div class="flex flex-wrap items-center gap-2 mb-1.5">
          <span class="font-display text-lg tracking-wide">${escapeHtml(s.nama)}</span>
          <span class="badge ${keteranganBadge[s.keterangan] || ''}">${escapeHtml(s.keterangan)}</span>
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mercy-muted">
          <span>${formatDate(s.tanggal)}</span>
          <span>${barangIcons[s.barang] || ''} ${escapeHtml(s.barang)}</span>
          <span class="text-cyan-400 font-semibold">${formatNumber(s.jumlah)}</span>
          <span>→ ${escapeHtml(s.disetor)}</span>
        </div>
      </div>
      <div class="flex gap-1">
        <button class="edit-btn" data-id="${s.id}" title="Edit">✎</button>
        <button class="delete-btn" data-id="${s.id}" title="Hapus">✕</button>
      </div>`;
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
      <span class="report-row-value">${formatNumber(item.total)}</span>
      <span class="report-row-meta">${item.count}x</span>`;
    c.appendChild(row);
  });
}

function renderTargetProgress() {
  const target = settings.targetMingguan || 2000;
  $('target-display').textContent = formatNumber(target);
  const weekData = filterByWeek(getData(), selectedWeek)
    .filter(s => s.keterangan === 'Setoran Mingguan');

  const byMember = {};
  weekData.forEach(s => {
    const k = s.nama.toLowerCase();
    if (!byMember[k]) byMember[k] = { name: s.nama, total: 0 };
    byMember[k].total += s.jumlah;
  });

  const members = Object.values(byMember).sort((a, b) => b.total - a.total);
  const list = $('target-list');
  list.innerHTML = '';

  if (!members.length) {
    $('target-empty').classList.remove('hidden');
    return;
  }
  $('target-empty').classList.add('hidden');

  members.forEach(m => {
    const pct = Math.min(100, (m.total / target) * 100);
    const done = m.total >= target;
    const row = document.createElement('div');
    row.className = 'target-row';
    row.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <span class="font-semibold text-sm">${escapeHtml(m.name)}</span>
        <span class="text-xs ${done ? 'text-cyan-400' : 'text-mercy-muted'}">${formatNumber(m.total)} / ${formatNumber(target)} ${done ? '✓' : ''}</span>
      </div>
      <div class="target-bar-wrap"><div class="target-bar ${done ? 'target-bar-done' : ''}" style="width:${pct}%"></div></div>`;
    list.appendChild(row);
  });
}

function renderWeeklyReport() {
  const weekData = filterByWeek(getData(), selectedWeek);
  const { start, end } = getWeekBounds(selectedWeek);
  $('laporan-range').textContent = formatWeekRange(start, end);
  $('week-stat-count').textContent = weekData.length;
  $('week-stat-amount').textContent = formatNumber(weekData.reduce((s, r) => s + r.jumlah, 0));
  $('week-stat-members').textContent = new Set(weekData.map(s => s.nama.toLowerCase())).size;
  $('week-stat-mingguan').textContent = weekData.filter(s => s.keterangan === 'Setoran Mingguan').length;

  renderBarList('report-members', 'report-members-empty', groupSum(weekData, 'nama'));
  renderBarList('report-barang', 'report-barang-empty', groupSum(weekData, 'barang'));
  renderTargetProgress();

  const tbody = $('report-table-body');
  tbody.innerHTML = '';
  const sorted = [...weekData].sort((a, b) => parseDate(b.tanggal) - parseDate(a.tanggal));
  $('report-table-empty').classList.toggle('hidden', sorted.length > 0);
  sorted.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(s.tanggal)}</td><td class="font-semibold">${escapeHtml(s.nama)}</td>
      <td>${barangIcons[s.barang] || ''} ${escapeHtml(s.barang)}</td>
      <td class="amount">${formatNumber(s.jumlah)}</td>
      <td>${escapeHtml(s.disetor)}</td>
      <td><span class="badge ${keteranganBadge[s.keterangan] || ''}">${escapeHtml(s.keterangan)}</span></td>`;
    tbody.appendChild(tr);
  });

  const cur = getWeekKey(selectedWeek) === getWeekKey(new Date());
  $('week-current').classList.toggle('ring-1', cur);
  $('week-current').classList.toggle('ring-blue-500/50', cur);
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

  if (!ranked.length) { $('leaderboard-empty').classList.remove('hidden'); return; }
  $('leaderboard-empty').classList.add('hidden');

  const medals = ['🥇', '🥈', '🥉'];
  ranked.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.innerHTML = `
      <span class="leaderboard-rank">${medals[i] || `#${i + 1}`}</span>
      <span class="leaderboard-name">${escapeHtml(m.name)}</span>
      <span class="leaderboard-meta">${m.count}x setoran</span>
      <span class="leaderboard-total">${formatNumber(m.total)}</span>`;
    list.appendChild(row);
  });
}

function renderActivityLog() {
  const list = $('activity-log');
  list.innerHTML = '';
  if (!activityLogs.length) { $('activity-empty').classList.remove('hidden'); return; }
  $('activity-empty').classList.add('hidden');

  activityLogs.forEach(log => {
    const row = document.createElement('div');
    row.className = 'log-row';
    row.innerHTML = `
      <span class="log-icon">${logIcons[log.action] || '•'}</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white">${escapeHtml(log.message)}</p>
        <p class="text-xs text-mercy-muted mt-0.5">${escapeHtml(log.userEmail)} · ${formatDateTime(log.createdAt)}</p>
      </div>
      <span class="log-badge log-${(log.action || '').toLowerCase()}">${log.action}</span>`;
    list.appendChild(row);
  });
}

function renderAll() {
  if (!isLoggedIn && useFirebase) return;
  renderList();
  const active = document.querySelector('.tab-btn.active')?.dataset.tab;
  if (active === 'laporan') renderWeeklyReport();
  if (active === 'leaderboard') renderLeaderboard();
  if (active === 'log') renderActivityLog();
}

// ─── Tabs & Events ─────────────────────────────────────────────

function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
      const panel = $(`panel-${btn.dataset.tab}`);
      if (panel) panel.classList.remove('hidden');
      if (btn.dataset.tab === 'laporan') renderWeeklyReport();
      if (btn.dataset.tab === 'leaderboard') renderLeaderboard();
      if (btn.dataset.tab === 'log') renderActivityLog();
    });
  });

  const tanggal = $('tanggal');
  if (tanggal) tanggal.valueAsDate = new Date();

  document.querySelectorAll('.jumlah-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.jumlah-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setVal('jumlah', btn.dataset.value);
    });
  });

  on('setoran-form', 'submit', async e => {
    e.preventDefault();
    if (!$('jumlah')?.value) { showToast('⚠ Pilih jumlah dulu!'); return; }
    const entry = {
      tanggal: $('tanggal').value,
      nama: $('nama').value.trim(),
      barang: $('barang').value,
      jumlah: Number($('jumlah').value),
      disetor: $('disetor').value,
      keterangan: $('keterangan').value,
    };
    try {
      await addSetoran(entry);
      $('setoran-form').reset();
      if ($('tanggal')) $('tanggal').valueAsDate = new Date();
      setVal('jumlah', '');
      document.querySelectorAll('.jumlah-btn').forEach(b => b.classList.remove('active'));
      showToast('✓ Setoran dicatat!');
    } catch (err) { console.error(err); showToast('⚠ Gagal menyimpan'); }
  });

  on('setoran-list', 'click', e => {
    const edit = e.target.closest('.edit-btn');
    const del = e.target.closest('.delete-btn');
    if (edit) openEditModal(edit.dataset.id);
    if (del) { deleteId = del.dataset.id; $('delete-modal')?.classList.remove('hidden'); }
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
    };
    try {
      await updateSetoran(id, entry);
      $('edit-modal')?.classList.add('hidden');
      showToast('✓ Setoran diupdate!');
    } catch (err) { console.error(err); showToast('⚠ Gagal update'); }
  });

  on('edit-cancel', 'click', () => $('edit-modal')?.classList.add('hidden'));
  $('edit-modal')?.querySelector('[data-close="edit-modal"]')?.addEventListener('click', () => $('edit-modal')?.classList.add('hidden'));

  on('delete-cancel', 'click', () => { $('delete-modal')?.classList.add('hidden'); deleteId = null; });
  $('delete-modal')?.querySelector('[data-close="delete-modal"]')?.addEventListener('click', () => { $('delete-modal')?.classList.add('hidden'); deleteId = null; });

  on('delete-confirm', 'click', async () => {
    if (deleteId) {
      try { await removeSetoran(deleteId); showToast('Setoran dihapus'); }
      catch (err) { showToast('⚠ Gagal hapus'); }
    }
    $('delete-modal')?.classList.add('hidden');
    deleteId = null;
  });

  on('settings-form', 'submit', async e => {
    e.preventDefault();
    const targetMingguan = Number($('setting-target')?.value) || 2000;
    const discordWebhook = $('setting-discord')?.value.trim() || '';
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

  on('search', 'input', renderList);
  on('filter-keterangan', 'change', renderList);
  on('leaderboard-period', 'change', renderLeaderboard);

  on('export-btn', 'click', () => {
    const data = getData();
    if (!data.length) { showToast('⚠ Tidak ada data'); return; }
    downloadCsv(
      ['Tanggal', 'Nama', 'Barang', 'Jumlah', 'Disetor Ke', 'Keterangan'],
      data.map(s => [s.tanggal, s.nama, s.barang, s.jumlah, s.disetor, s.keterangan]),
      `setoran-no-mercy-${new Date().toISOString().slice(0, 10)}.csv`
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

  on('gate-login-form', 'submit', async e => {
    e.preventDefault();
    await handleLogin($('gate-email').value.trim(), $('gate-password').value, $('gate-login-error'));
  });

  on('btn-logout', 'click', async () => {
    try { await auth.signOut(); showToast('Logout berhasil'); } catch { showToast('⚠ Gagal logout'); }
  });
}

function downloadCsv(headers, rows, filename) {
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

async function handleLogin(email, password, errorEl) {
  if (errorEl) errorEl.classList.add('hidden');
  try {
    await auth.signInWithEmailAndPassword(email, password);
    showToast('✓ Login berhasil!');
    return true;
  } catch {
    if (errorEl) {
      errorEl.textContent = 'Email atau password salah';
      errorEl.classList.remove('hidden');
    }
    return false;
  }
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
  $('edit-modal')?.classList.remove('hidden');
}

function initLocalDev() {
  useFirebase = false;
  isLoggedIn = true;
  try { allData = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { allData = []; }
  showApp();
  $('user-email').textContent = 'Mode lokal (dev)';
  $('setup-banner').classList.remove('hidden');
  hideLoading();
  renderAll();
}

function initFirebase() {
  if (!isFirebaseConfigured()) { initLocalDev(); return; }

  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  useFirebase = true;

  // Cadangan: spinner max 5 detik, jangan muter selamanya
  setTimeout(hideLoading, 5000);

  auth.onAuthStateChanged(onAuthChange);
  showAuthGate();
  hideLoading();
}

bindEvents();
initFirebase();
