const STORAGE_KEY = 'nomercy_setoran';

const form = document.getElementById('setoran-form');
const setoranList = document.getElementById('setoran-list');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search');
const filterKeterangan = document.getElementById('filter-keterangan');
const jumlahInput = document.getElementById('jumlah');
const jumlahBtns = document.querySelectorAll('.jumlah-btn');
const exportBtn = document.getElementById('export-btn');
const modal = document.getElementById('modal');
const modalCancel = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toast-msg');
const loginModal = document.getElementById('login-modal');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const adminFormSection = document.getElementById('admin-form-section');
const viewerInfo = document.getElementById('viewer-info');
const listSection = document.getElementById('list-section');
const loadingEl = document.getElementById('loading');
const setupBanner = document.getElementById('setup-banner');
const btnMigrate = document.getElementById('btn-migrate');

let deleteId = null;
let allData = [];
let isAdmin = false;
let useFirebase = false;
let db = null;
let auth = null;

const barangIcons = {
  'Besi': '⚙️',
  'Emas': '🥇',
  'Tembaga': '🔶',
  'Potongan Kayu': '🪵',
};

const keteranganBadge = {
  'Setoran Mingguan': 'badge-mingguan',
  'Setoran Sanksi': 'badge-sanksi',
  'Setoran Donasi': 'badge-donasi',
  'Donasi Sukarela': 'badge-sukarela',
};

function isFirebaseConfigured() {
  return typeof firebaseConfig !== 'undefined'
    && firebaseConfig.apiKey
    && firebaseConfig.apiKey !== 'ISI_API_KEY_KAMU';
}

function loadLocalData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLocalData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getData() {
  return useFirebase ? allData : loadLocalData();
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatNumber(n) {
  return Number(n).toLocaleString('id-ID');
}

function showToast(msg) {
  toastMsg.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2500);
}

function parseDate(dateStr) {
  return new Date(dateStr + 'T00:00:00');
}

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

function getWeekStart() {
  return getWeekBounds().start;
}

function formatWeekRange(start, end) {
  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  return `${start.toLocaleDateString('id-ID', opts)} — ${end.toLocaleDateString('id-ID', opts)}`;
}

function getWeekKey(date) {
  const { start } = getWeekBounds(date);
  return start.toISOString().slice(0, 10);
}

function filterByWeek(data, weekDate) {
  const { start, end } = getWeekBounds(weekDate);
  return data.filter(s => {
    const d = parseDate(s.tanggal);
    return d >= start && d <= end;
  });
}

let selectedWeek = new Date();

function hideLoading() {
  loadingEl.classList.add('hidden');
}

function updateAdminUI() {
  const canEdit = isAdmin || !useFirebase;

  adminFormSection.classList.toggle('hidden', !canEdit);
  viewerInfo.classList.toggle('hidden', canEdit);
  listSection.classList.toggle('lg:col-span-3', canEdit);
  listSection.classList.toggle('lg:col-span-5', !canEdit);

  document.getElementById('btn-login').classList.toggle('hidden', isAdmin || !useFirebase);
  document.getElementById('btn-logout').classList.toggle('hidden', !isAdmin || !useFirebase);
  document.getElementById('admin-badge').classList.toggle('hidden', !isAdmin || !useFirebase);
  document.getElementById('btn-login-viewer')?.classList.toggle('hidden', isAdmin || !useFirebase);

  const localData = loadLocalData();
  const showMigrate = useFirebase && isAdmin && localData.length > 0;
  btnMigrate.classList.toggle('hidden', !showMigrate);

  setupBanner.classList.toggle('hidden', useFirebase);

  const modeText = document.getElementById('mode-text');
  const statusEl = document.getElementById('firebase-status');
  statusEl.classList.remove('hidden');

  if (!useFirebase) {
    modeText.innerHTML = '<span class="text-yellow-400">●</span> Mode lokal — isi firebase-config.js lalu push ke GitHub';
    statusEl.textContent = 'Firebase: belum aktif';
  } else if (isAdmin) {
    modeText.innerHTML = '<span class="text-green-400">●</span> Mode admin — data Firebase, kamu bisa input & hapus';
    statusEl.textContent = 'Firebase: terhubung ✓';
  } else {
    modeText.innerHTML = '<span class="text-blue-400">●</span> Mode lihat — data shared online, login admin untuk edit';
    statusEl.textContent = 'Firebase: terhubung ✓';
  }

  document.getElementById('empty-hint').textContent = canEdit
    ? 'Catat setoran pertama di form sebelah kiri'
    : 'Belum ada data setoran';
}

function updateStats(data) {
  const weekStart = getWeekStart();
  const weekData = data.filter(s => parseDate(s.tanggal) >= weekStart);
  const members = new Set(data.map(s => s.nama.toLowerCase()));

  document.getElementById('stat-total').textContent = data.length;
  document.getElementById('stat-week').textContent = weekData.length;
  document.getElementById('stat-amount').textContent = formatNumber(data.reduce((sum, s) => sum + s.jumlah, 0));
  document.getElementById('stat-members').textContent = members.size;
}

function renderList() {
  const data = getData();
  const search = searchInput.value.toLowerCase();
  const filter = filterKeterangan.value;
  const canEdit = isAdmin || !useFirebase;

  const filtered = data.filter(s => {
    const matchSearch = s.nama.toLowerCase().includes(search);
    const matchFilter = !filter || s.keterangan === filter;
    return matchSearch && matchFilter;
  });

  filtered.sort((a, b) => parseDate(b.tanggal) - parseDate(a.tanggal) || String(b.id).localeCompare(String(a.id)));

  setoranList.innerHTML = '';
  emptyState.classList.toggle('hidden', filtered.length > 0);

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
          <span class="flex items-center gap-1">
            <span class="barang-icon">${barangIcons[s.barang] || ''}</span>
            ${escapeHtml(s.barang)}
          </span>
          <span class="text-red-400 font-semibold">${formatNumber(s.jumlah)}</span>
          <span>→ ${escapeHtml(s.disetor)}</span>
        </div>
      </div>
      ${canEdit ? `<button class="delete-btn" data-id="${s.id}" title="Hapus">✕</button>` : ''}
    `;
    setoranList.appendChild(card);
  });

  document.getElementById('list-count').textContent = `${filtered.length} setoran`;
  updateStats(data);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderAll() {
  renderList();
  if (!document.getElementById('panel-laporan').classList.contains('hidden')) {
    renderWeeklyReport();
  }
}

async function addSetoran(entry) {
  if (useFirebase) {
    await db.collection('setoran').add({
      ...entry,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    const data = loadLocalData();
    data.push({ id: Date.now(), ...entry });
    saveLocalData(data);
    allData = data;
    renderAll();
  }
}

async function removeSetoran(id) {
  if (useFirebase) {
    await db.collection('setoran').doc(String(id)).delete();
  } else {
    const data = loadLocalData().filter(s => s.id !== id);
    saveLocalData(data);
    allData = data;
    renderAll();
  }
}

async function migrateLocalToFirebase() {
  const localData = loadLocalData();
  if (!localData.length) {
    showToast('⚠ Tidak ada data lokal untuk diupload');
    return;
  }
  if (!confirm(`Upload ${localData.length} setoran dari browser ke Firebase?`)) return;

  btnMigrate.disabled = true;
  btnMigrate.textContent = 'Mengupload...';

  try {
    const batch = db.batch();
    localData.forEach(s => {
      const ref = db.collection('setoran').doc();
      const { id, ...rest } = s;
      batch.set(ref, { ...rest, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    });
    await batch.commit();
    localStorage.removeItem(STORAGE_KEY);
    showToast(`✓ ${localData.length} setoran berhasil diupload ke Firebase`);
    updateAdminUI();
  } catch (err) {
    console.error(err);
    showToast('⚠ Gagal upload — cek Firestore Rules');
  } finally {
    btnMigrate.disabled = false;
    btnMigrate.textContent = '↑ Upload data lokal ke Firebase';
  }
}

function initFirebase() {
  if (!isFirebaseConfigured()) {
    useFirebase = false;
    allData = loadLocalData();
    isAdmin = true;
    updateAdminUI();
    renderAll();
    hideLoading();
    return;
  }

  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  useFirebase = true;
  isAdmin = false;

  auth.onAuthStateChanged(user => {
    isAdmin = !!user;
    updateAdminUI();
    renderList();
  });

  db.collection('setoran')
    .orderBy('tanggal', 'desc')
    .onSnapshot(
      snapshot => {
        allData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));
        renderAll();
        hideLoading();
      },
      err => {
        console.error(err);
        hideLoading();
        showToast('⚠ Gagal load Firebase — cek Rules & config');
      }
    );

  updateAdminUI();
}

function openLoginModal() {
  loginError.classList.add('hidden');
  loginForm.reset();
  loginModal.classList.remove('hidden');
}

function closeLoginModal() {
  loginModal.classList.add('hidden');
}

document.getElementById('tanggal').valueAsDate = new Date();

jumlahBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    jumlahBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    jumlahInput.value = btn.dataset.value;
  });
});

form.addEventListener('submit', async e => {
  e.preventDefault();

  if (useFirebase && !isAdmin) {
    showToast('⚠ Login admin dulu untuk input setoran');
    return;
  }

  if (!jumlahInput.value) {
    showToast('⚠ Pilih jumlah setoran dulu!');
    return;
  }

  const entry = {
    tanggal: form.tanggal.value,
    nama: form.nama.value.trim(),
    barang: form.barang.value,
    jumlah: Number(jumlahInput.value),
    disetor: form.disetor.value,
    keterangan: form.keterangan.value,
  };

  try {
    await addSetoran(entry);

    form.nama.value = '';
    form.barang.selectedIndex = 0;
    form.disetor.selectedIndex = 0;
    form.keterangan.selectedIndex = 0;
    jumlahInput.value = '';
    jumlahBtns.forEach(b => b.classList.remove('active'));

    showToast('✓ Setoran berhasil dicatat!');
  } catch (err) {
    console.error(err);
    showToast('⚠ Gagal menyimpan setoran');
  }
});

setoranList.addEventListener('click', e => {
  const btn = e.target.closest('.delete-btn');
  if (!btn) return;
  if (useFirebase && !isAdmin) return;
  deleteId = btn.dataset.id;
  modal.classList.remove('hidden');
});

modalCancel.addEventListener('click', () => {
  modal.classList.add('hidden');
  deleteId = null;
});

modalConfirm.addEventListener('click', async () => {
  if (deleteId) {
    try {
      await removeSetoran(deleteId);
      showToast('Setoran dihapus');
    } catch (err) {
      console.error(err);
      showToast('⚠ Gagal menghapus setoran');
    }
  }
  modal.classList.add('hidden');
  deleteId = null;
});

modal.querySelector('.modal-backdrop').addEventListener('click', () => {
  modal.classList.add('hidden');
  deleteId = null;
});

searchInput.addEventListener('input', renderList);
filterKeterangan.addEventListener('change', renderList);

exportBtn.addEventListener('click', () => {
  const data = getData();
  if (!data.length) {
    showToast('⚠ Tidak ada data untuk diexport');
    return;
  }

  const headers = ['Tanggal', 'Nama', 'Barang', 'Jumlah', 'Disetor Ke', 'Keterangan'];
  const rows = data.map(s => [
    s.tanggal, s.nama, s.barang, s.jumlah, s.disetor, s.keterangan,
  ]);

  downloadCsv(headers, rows, `setoran-no-mercy-${new Date().toISOString().slice(0, 10)}.csv`);
  showToast('✓ CSV berhasil didownload');
});

function downloadCsv(headers, rows, filename) {
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function groupSum(data, key) {
  const map = {};
  data.forEach(s => {
    const k = s[key];
    if (!map[k]) map[k] = { count: 0, total: 0 };
    map[k].count++;
    map[k].total += s.jumlah;
  });
  return Object.entries(map)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total);
}

function renderBarList(containerId, emptyId, items, showCount = true) {
  const container = document.getElementById(containerId);
  const empty = document.getElementById(emptyId);
  container.innerHTML = '';

  if (!items.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const max = items[0].total;
  items.forEach(item => {
    const pct = max ? (item.total / max) * 100 : 0;
    const row = document.createElement('div');
    row.className = 'report-row';
    row.innerHTML = `
      <span class="report-row-label" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
      <div class="report-row-bar-wrap">
        <div class="report-row-bar" style="width:${pct}%"></div>
      </div>
      <span class="report-row-value">${formatNumber(item.total)}</span>
      ${showCount ? `<span class="report-row-meta">${item.count}x</span>` : ''}
    `;
    container.appendChild(row);
  });
}

function renderWeeklyReport() {
  const data = getData();
  const weekData = filterByWeek(data, selectedWeek);
  const { start, end } = getWeekBounds(selectedWeek);

  document.getElementById('laporan-range').textContent = formatWeekRange(start, end);

  const mingguanCount = weekData.filter(s => s.keterangan === 'Setoran Mingguan').length;
  const members = new Set(weekData.map(s => s.nama.toLowerCase()));

  document.getElementById('week-stat-count').textContent = weekData.length;
  document.getElementById('week-stat-amount').textContent = formatNumber(weekData.reduce((s, r) => s + r.jumlah, 0));
  document.getElementById('week-stat-members').textContent = members.size;
  document.getElementById('week-stat-mingguan').textContent = mingguanCount;

  renderBarList('report-members', 'report-members-empty', groupSum(weekData, 'nama'));
  renderBarList('report-barang', 'report-barang-empty', groupSum(weekData, 'barang'));
  renderBarList('report-keterangan', 'report-keterangan-empty', groupSum(weekData, 'keterangan'));
  renderBarList('report-disetor', 'report-disetor-empty', groupSum(weekData, 'disetor'));

  const tbody = document.getElementById('report-table-body');
  const tableEmpty = document.getElementById('report-table-empty');
  tbody.innerHTML = '';

  const sorted = [...weekData].sort((a, b) => parseDate(b.tanggal) - parseDate(a.tanggal) || String(b.id).localeCompare(String(a.id)));

  if (!sorted.length) {
    tableEmpty.classList.remove('hidden');
  } else {
    tableEmpty.classList.add('hidden');
    sorted.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatDate(s.tanggal)}</td>
        <td class="font-semibold">${escapeHtml(s.nama)}</td>
        <td>${barangIcons[s.barang] || ''} ${escapeHtml(s.barang)}</td>
        <td class="amount">${formatNumber(s.jumlah)}</td>
        <td>${escapeHtml(s.disetor)}</td>
        <td><span class="badge ${keteranganBadge[s.keterangan] || ''}">${escapeHtml(s.keterangan)}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  const isCurrentWeek = getWeekKey(selectedWeek) === getWeekKey(new Date());
  document.getElementById('week-current').classList.toggle('ring-1', isCurrentWeek);
  document.getElementById('week-current').classList.toggle('ring-red-500/50', isCurrentWeek);
}

const tabSetoran = document.getElementById('tab-setoran');
const tabLaporan = document.getElementById('tab-laporan');
const panelSetoran = document.getElementById('panel-setoran');
const panelLaporan = document.getElementById('panel-laporan');
const statsSection = document.getElementById('stats');

function switchTab(tab) {
  const isSetoran = tab === 'setoran';
  tabSetoran.classList.toggle('active', isSetoran);
  tabLaporan.classList.toggle('active', !isSetoran);
  panelSetoran.classList.toggle('hidden', !isSetoran);
  panelLaporan.classList.toggle('hidden', isSetoran);
  statsSection.classList.toggle('hidden', !isSetoran);
  if (!isSetoran) renderWeeklyReport();
}

tabSetoran.addEventListener('click', () => switchTab('setoran'));
tabLaporan.addEventListener('click', () => switchTab('laporan'));

document.getElementById('week-prev').addEventListener('click', () => {
  selectedWeek = new Date(selectedWeek);
  selectedWeek.setDate(selectedWeek.getDate() - 7);
  renderWeeklyReport();
});

document.getElementById('week-next').addEventListener('click', () => {
  selectedWeek = new Date(selectedWeek);
  selectedWeek.setDate(selectedWeek.getDate() + 7);
  renderWeeklyReport();
});

document.getElementById('week-current').addEventListener('click', () => {
  selectedWeek = new Date();
  renderWeeklyReport();
});

document.getElementById('export-week-btn').addEventListener('click', () => {
  const weekData = filterByWeek(getData(), selectedWeek);
  if (!weekData.length) {
    showToast('⚠ Tidak ada data minggu ini');
    return;
  }

  const { start } = getWeekBounds(selectedWeek);
  const headers = ['Tanggal', 'Nama', 'Barang', 'Jumlah', 'Disetor Ke', 'Keterangan'];
  const rows = weekData
    .sort((a, b) => parseDate(a.tanggal) - parseDate(b.tanggal))
    .map(s => [s.tanggal, s.nama, s.barang, s.jumlah, s.disetor, s.keterangan]);

  downloadCsv(headers, rows, `laporan-no-mercy-${start.toISOString().slice(0, 10)}.csv`);
  showToast('✓ Laporan mingguan didownload');
});

document.getElementById('btn-login').addEventListener('click', openLoginModal);
document.getElementById('btn-login-viewer').addEventListener('click', openLoginModal);
document.getElementById('login-cancel').addEventListener('click', closeLoginModal);
loginModal.querySelector('[data-close="login-modal"]').addEventListener('click', closeLoginModal);

document.getElementById('btn-logout').addEventListener('click', async () => {
  try {
    await auth.signOut();
    showToast('Logout berhasil');
  } catch (err) {
    showToast('⚠ Gagal logout');
  }
});

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.classList.add('hidden');

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    await auth.signInWithEmailAndPassword(email, password);
    closeLoginModal();
    showToast('✓ Login berhasil — mode admin aktif');
  } catch (err) {
    loginError.textContent = 'Email atau password salah';
    loginError.classList.remove('hidden');
  }
});

btnMigrate.addEventListener('click', migrateLocalToFirebase);

initFirebase();
