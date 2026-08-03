// ═══ AbsenKu — Smart Attendance System ═══
// Fingerprint (WebAuthn) + GPS Geofencing

// ── State ──
let currentUser = null;
let currentLocation = null;
let todayRecord = null;
let watchId = null;
let clockInterval = null;
let durationInterval = null;
let histYear, histMonth;

const DB_KEY = 'absenku_data';
const now = () => new Date();

// ── Init ──
window.addEventListener('DOMContentLoaded', () => {
  // Show splash for 2s then check setup
  setTimeout(() => {
    const data = loadData();
    if (data && data.user) {
      currentUser = data.user;
      showMainApp();
    } else {
      showScreen('setup-screen');
    }
  }, 2000);
});

// ── Data Persistence (localStorage) ──
function loadData() {
  try { return JSON.parse(localStorage.getItem(DB_KEY)) || null; } catch { return null; }
}
function saveData(data) {
  localStorage.setItem(DB_KEY, JSON.stringify(data));
}
function getData() {
  return loadData() || { user: null, records: [], settings: {} };
}

// ── Screen Management ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

// ── SETUP ──
function goSetupStep2() {
  const name = document.getElementById('setup-name').value.trim();
  const empid = document.getElementById('setup-empid').value.trim();
  const dept = document.getElementById('setup-dept').value;
  if (!name) { toast('Masukkan nama lengkap'); return; }
  if (!empid) { toast('Masukkan ID karyawan'); return; }
  if (!dept) { toast('Pilih departemen'); return; }
  // Save temp
  currentUser = { name, empid, dept, office_lat: null, office_lng: null, radius: 100, bio_registered: false };
  document.getElementById('setup-step-1').classList.add('hidden');
  document.getElementById('setup-step-2').classList.remove('hidden');
}

function captureOfficeLocation() {
  toast('📍 Mengambil lokasi...');
  if (!navigator.geolocation) { toast('❌ GPS tidak tersedia di perangkat ini'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    currentUser.office_lat = lat;
    currentUser.office_lng = lng;
    currentUser.radius = parseInt(document.getElementById('setup-radius').value) || 100;
    document.getElementById('setup-lat').textContent = lat.toFixed(6);
    document.getElementById('setup-lng').textContent = lng.toFixed(6);
    document.getElementById('setup-loc-info').classList.remove('hidden');
    document.getElementById('setup-finish-btn').classList.remove('hidden');
    document.querySelector('.location-preview').innerHTML = `<div class="map-placeholder"><span>✅</span><p>Lokasi berhasil diambil</p></div>`;
    toast('✅ Lokasi kantor berhasil disimpan');
  }, err => {
    toast('❌ Gagal ambil lokasi: ' + err.message);
  }, { enableHighAccuracy: true, timeout: 15000 });
}

function finishSetup() {
  const data = getData();
  data.user = currentUser;
  data.settings = {
    clockin_time: '08:00',
    clockout_time: '17:00',
    radius: currentUser.radius
  };
  saveData(data);
  showMainApp();
}

// ── MAIN APP ──
function showMainApp() {
  const data = getData();
  currentUser = data.user;
  showScreen('main-app');
  startClock();
  startGPS();
  updateGreeting();
  loadTodayRecord();
  updateUI();
  // Init history
  histYear = now().getFullYear();
  histMonth = now().getMonth();
}

function startClock() {
  const update = () => {
    const n = now();
    document.getElementById('clock-time').textContent = n.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', hour12:false });
    document.getElementById('clock-seconds').textContent = String(n.getSeconds()).padStart(2, '0');
    document.getElementById('status-time').textContent = n.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', hour12:false });
  };
  update();
  clockInterval = setInterval(update, 1000);
}

function updateGreeting() {
  const h = now().getHours();
  let greeting = h < 11 ? 'Selamat Pagi 🌤️' : h < 15 ? 'Selamat Siang ☀️' : h < 18 ? 'Selamat Sore 🌅' : 'Selamat Malam 🌙';
  document.getElementById('greeting-label').textContent = greeting;
  document.getElementById('greeting-name').textContent = currentUser.name;
  document.getElementById('greeting-dept').textContent = currentUser.dept;
  const n = now();
  document.getElementById('date-day').textContent = n.getDate();
  document.getElementById('date-full').textContent = n.toLocaleDateString('id-ID', { weekday:'short', month:'short', year:'numeric' });
  // Profile
  document.getElementById('profile-name').textContent = currentUser.name;
  document.getElementById('profile-empid').textContent = currentUser.empid;
  document.getElementById('profile-dept-display').textContent = currentUser.dept;
  const initials = currentUser.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  document.getElementById('profile-avatar').textContent = initials;
  document.getElementById('status-name').textContent = currentUser.name.split(' ')[0];
  // Settings
  const settings = getData().settings || {};
  document.getElementById('setting-clockin').value = settings.clockin_time || '08:00';
  document.getElementById('setting-clockout').value = settings.clockout_time || '17:00';
  document.getElementById('setting-radius').value = settings.radius || currentUser.radius || 100;
  document.getElementById('prof-lat').textContent = currentUser.office_lat?.toFixed(6) || '—';
  document.getElementById('prof-lng').textContent = currentUser.office_lng?.toFixed(6) || '—';
  document.getElementById('prof-radius').textContent = (settings.radius || currentUser.radius || 100) + ' m';
  document.getElementById('prof-bio').textContent = currentUser.bio_registered ? '✅ Terdaftar' : 'Belum terdaftar';
}

// ── GPS ──
function startGPS() {
  if (!navigator.geolocation) {
    updateGPSStatus('fail', '❌ GPS tidak tersedia');
    return;
  }
  updateGPSStatus('loading', '📍 Mencari lokasi GPS...');
  watchId = navigator.geolocation.watchPosition(
    pos => {
      currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
      const dist = getDistance(currentLocation.lat, currentLocation.lng, currentUser.office_lat, currentUser.office_lng);
      const radius = getData().settings?.radius || currentUser.radius || 100;
      if (dist <= radius) {
        updateGPSStatus('ok', `✅ Dalam radius kantor (${Math.round(dist)}m)`);
      } else {
        updateGPSStatus('fail', `⚠️ Di luar radius kantor (${Math.round(dist)}m / max ${radius}m)`);
      }
    },
    err => {
      updateGPSStatus('fail', '❌ GPS error: ' + err.message);
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
  );
}

function updateGPSStatus(status, text) {
  const el = document.getElementById('gps-status');
  el.className = 'gps-status ' + status;
  el.querySelector('span').textContent = text;
}

function getDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lat2) return 99999;
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Today Record ──
function todayKey() { return now().toISOString().slice(0, 10); }

function loadTodayRecord() {
  const data = getData();
  const key = todayKey();
  todayRecord = (data.records || []).find(r => r.date === key) || null;
}

function saveTodayRecord(rec) {
  const data = getData();
  if (!data.records) data.records = [];
  const idx = data.records.findIndex(r => r.date === rec.date);
  if (idx >= 0) data.records[idx] = rec;
  else data.records.push(rec);
  saveData(data);
  todayRecord = rec;
}

// ── Update UI ──
function updateUI() {
  const btn = document.getElementById('clock-btn');
  const btnText = document.getElementById('clock-btn-text');
  const hint = document.getElementById('action-hint');

  if (!todayRecord || !todayRecord.clock_in) {
    // Not clocked in
    btn.className = 'clock-btn';
    btnText.textContent = 'Clock In';
    hint.textContent = 'Sentuh untuk absen masuk dengan fingerprint';
    document.getElementById('clockin-time').textContent = '— : —';
    document.getElementById('clockin-loc').textContent = '—';
    document.getElementById('clockout-time').textContent = '— : —';
    document.getElementById('clockout-loc').textContent = '—';
  } else if (!todayRecord.clock_out) {
    // Clocked in, not out
    btn.className = 'clock-btn out';
    btnText.textContent = 'Clock Out';
    hint.textContent = 'Sentuh untuk absen pulang dengan fingerprint';
    document.getElementById('clockin-time').textContent = todayRecord.clock_in;
    document.getElementById('clockin-loc').textContent = `📍 ${todayRecord.in_lat?.toFixed(4)}, ${todayRecord.in_lng?.toFixed(4)}`;
    document.getElementById('clockout-time').textContent = '— : —';
    document.getElementById('clockout-loc').textContent = '—';
    startDurationTimer();
  } else {
    // Both done
    btn.className = 'clock-btn done';
    btnText.textContent = '✅ Selesai';
    hint.textContent = 'Absensi hari ini sudah lengkap';
    document.getElementById('clockin-time').textContent = todayRecord.clock_in;
    document.getElementById('clockin-loc').textContent = `📍 ${todayRecord.in_lat?.toFixed(4)}, ${todayRecord.in_lng?.toFixed(4)}`;
    document.getElementById('clockout-time').textContent = todayRecord.clock_out;
    document.getElementById('clockout-loc').textContent = `📍 ${todayRecord.out_lat?.toFixed(4)}, ${todayRecord.out_lng?.toFixed(4)}`;
    updateDurationDisplay();
  }
}

function startDurationTimer() {
  if (durationInterval) clearInterval(durationInterval);
  const update = () => {
    if (!todayRecord?.clock_in) return;
    const [h, m] = todayRecord.clock_in.split(':').map(Number);
    const start = new Date(now()); start.setHours(h, m, 0, 0);
    const end = todayRecord.clock_out ? (() => { const [h2,m2] = todayRecord.clock_out.split(':').map(Number); const d = new Date(now()); d.setHours(h2,m2,0,0); return d; })() : now();
    const diffMs = end - start;
    const diffH = Math.floor(diffMs / 3600000);
    const diffM = Math.floor((diffMs % 3600000) / 60000);
    document.getElementById('duration-value').textContent = `${diffH}j ${diffM}m`;
    const pct = Math.min((diffMs / (8 * 3600000)) * 100, 100);
    document.getElementById('duration-fill').style.width = pct + '%';
  };
  update();
  durationInterval = setInterval(update, 30000);
}

function updateDurationDisplay() {
  if (!todayRecord?.clock_in || !todayRecord?.clock_out) return;
  const [h1, m1] = todayRecord.clock_in.split(':').map(Number);
  const [h2, m2] = todayRecord.clock_out.split(':').map(Number);
  const diffMin = (h2 * 60 + m2) - (h1 * 60 + m1);
  const diffH = Math.floor(diffMin / 60);
  const diffM = diffMin % 60;
  document.getElementById('duration-value').textContent = `${diffH}j ${diffM}m`;
  const pct = Math.min((diffMin / (8 * 60)) * 100, 100);
  document.getElementById('duration-fill').style.width = pct + '%';
}

// ── Clock Action (Fingerprint + GPS) ──
async function handleClockAction() {
  if (todayRecord?.clock_in && todayRecord?.clock_out) return;

  // 1. Check GPS
  if (!currentLocation) {
    toast('⚠️ Lokasi GPS belum tersedia, tunggu sebentar...');
    return;
  }
  const dist = getDistance(currentLocation.lat, currentLocation.lng, currentUser.office_lat, currentUser.office_lng);
  const radius = getData().settings?.radius || currentUser.radius || 100;
  if (dist > radius) {
    toast(`❌ Anda di luar radius kantor (${Math.round(dist)}m). Max ${radius}m`);
    return;
  }

  // 2. Biometric verification
  const isClockIn = !todayRecord || !todayRecord.clock_in;
  showModal('modal-processing');
  document.getElementById('processing-text').textContent = isClockIn ? 'Verifikasi fingerprint untuk Clock In...' : 'Verifikasi fingerprint untuk Clock Out...';

  let bioOk = false;
  try {
    bioOk = await verifyBiometric();
  } catch (e) {
    // Fallback: if WebAuthn not available, allow with confirmation
    bioOk = confirm('Biometric tidak tersedia di perangkat ini.\nLanjutkan absen tanpa fingerprint?');
  }
  closeModal('modal-processing');

  if (!bioOk) {
    toast('❌ Verifikasi fingerprint gagal');
    return;
  }

  // 3. Record attendance
  const timeStr = now().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', hour12:false });
  const key = todayKey();

  if (isClockIn) {
    const rec = {
      date: key,
      clock_in: timeStr,
      clock_out: null,
      in_lat: currentLocation.lat,
      in_lng: currentLocation.lng,
      in_acc: currentLocation.acc,
      out_lat: null, out_lng: null, out_acc: null,
      in_distance: Math.round(dist),
      out_distance: null,
    };
    // Check late
    const settings = getData().settings || {};
    const [sh, sm] = (settings.clockin_time || '08:00').split(':').map(Number);
    const [ch, cm] = timeStr.split(':').map(Number);
    rec.late = (ch * 60 + cm) > (sh * 60 + sm);
    saveTodayRecord(rec);
    showResult('✅', 'Clock In Berhasil!', `Absen masuk tercatat pada ${timeStr}`, [
      { label: 'Waktu', value: timeStr },
      { label: 'Lokasi', value: `${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}` },
      { label: 'Jarak', value: `${Math.round(dist)} meter` },
      { label: 'Status', value: rec.late ? '⚠️ Terlambat' : '✅ Tepat Waktu' },
    ]);
  } else {
    todayRecord.clock_out = timeStr;
    todayRecord.out_lat = currentLocation.lat;
    todayRecord.out_lng = currentLocation.lng;
    todayRecord.out_acc = currentLocation.acc;
    todayRecord.out_distance = Math.round(dist);
    saveTodayRecord(todayRecord);
    // Calc duration
    const [h1, m1] = todayRecord.clock_in.split(':').map(Number);
    const [h2, m2] = timeStr.split(':').map(Number);
    const dur = (h2*60+m2) - (h1*60+m1);
    showResult('✅', 'Clock Out Berhasil!', `Absen pulang tercatat pada ${timeStr}`, [
      { label: 'Clock In', value: todayRecord.clock_in },
      { label: 'Clock Out', value: timeStr },
      { label: 'Durasi', value: `${Math.floor(dur/60)}j ${dur%60}m` },
      { label: 'Lokasi', value: `${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}` },
    ]);
  }
  updateUI();
}

// ── WebAuthn Biometric ──
async function verifyBiometric() {
  if (!window.PublicKeyCredential) throw new Error('WebAuthn not supported');
  const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  if (!available) throw new Error('No platform authenticator');

  // If registered, authenticate; else register first
  if (currentUser.bio_registered && currentUser.credential_id) {
    return await authenticateBiometric();
  } else {
    return await registerBiometricFlow();
  }
}

async function registerBiometric() {
  showModal('modal-processing');
  document.getElementById('processing-text').textContent = 'Mendaftarkan fingerprint...';
  try {
    const ok = await registerBiometricFlow();
    closeModal('modal-processing');
    if (ok) {
      toast('✅ Fingerprint berhasil didaftarkan!');
      updateGreeting();
    }
  } catch (e) {
    closeModal('modal-processing');
    toast('❌ Gagal: ' + e.message);
  }
}

async function registerBiometricFlow() {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = new TextEncoder().encode(currentUser.empid);
  const createOptions = {
    publicKey: {
      challenge,
      rp: { name: 'AbsenKu', id: location.hostname },
      user: { id: userId, name: currentUser.empid, displayName: currentUser.name },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000,
    }
  };
  const cred = await navigator.credentials.create(createOptions);
  if (cred) {
    currentUser.bio_registered = true;
    currentUser.credential_id = bufToBase64(cred.rawId);
    const data = getData();
    data.user = currentUser;
    saveData(data);
    return true;
  }
  return false;
}

async function authenticateBiometric() {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const credId = base64ToBuf(currentUser.credential_id);
  const getOptions = {
    publicKey: {
      challenge,
      allowCredentials: [{ id: credId, type: 'public-key', transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60000,
    }
  };
  const assertion = await navigator.credentials.get(getOptions);
  return !!assertion;
}

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function base64ToBuf(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// ── Tab Navigation ──
function switchTab(tab, btnEl) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  btnEl?.classList.add('active');
  if (tab === 'history') renderHistory();
  if (tab === 'profile') updateGreeting();
}

// ── History ──
function renderHistory() {
  renderCalendar();
  renderHistList();
}

function prevHistMonth() {
  histMonth--; if (histMonth < 0) { histMonth = 11; histYear--; }
  renderHistory();
}
function nextHistMonth() {
  histMonth++; if (histMonth > 11) { histMonth = 0; histYear++; }
  renderHistory();
}

function renderCalendar() {
  const data = getData();
  const records = data.records || [];
  const y = histYear, m = histMonth;
  const label = new Date(y, m, 1).toLocaleDateString('id-ID', { month:'long', year:'numeric' });
  document.getElementById('hist-month-label').textContent = label;

  const daysInMonth = new Date(y, m+1, 0).getDate();
  const firstDay = new Date(y, m, 1).getDay(); // 0=Sun
  const today = now();
  const todayStr = today.toISOString().slice(0, 10);
  const dayNames = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];

  let html = dayNames.map(d => `<div class="cal-header">${d}</div>`).join('');
  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

  let hadir = 0, telat = 0, absen = 0, totalMin = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const rec = records.find(r => r.date === dateStr);
    const isToday = dateStr === todayStr;
    const dayOfWeek = new Date(y, m, d).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    let cls = 'cal-day';
    if (isToday) cls += ' today';
    else if (rec && rec.clock_in) {
      cls += rec.late ? ' late' : ' present';
      hadir++;
      if (rec.late) telat++;
      if (rec.clock_in && rec.clock_out) {
        const [h1,m1] = rec.clock_in.split(':').map(Number);
        const [h2,m2] = rec.clock_out.split(':').map(Number);
        totalMin += (h2*60+m2) - (h1*60+m1);
      }
    } else if (!isToday && !isWeekend && dateStr < todayStr) {
      cls += ' absent';
      absen++;
    }
    html += `<div class="${cls}">${d}</div>`;
  }

  // Today record
  if (todayRecord?.clock_in) { hadir++; if (todayRecord.late) telat++; }

  document.getElementById('mini-calendar').innerHTML = html;
  document.getElementById('sum-hadir').textContent = hadir;
  document.getElementById('sum-telat').textContent = telat;
  document.getElementById('sum-absen').textContent = absen;
  document.getElementById('sum-jam').textContent = Math.round(totalMin / 60);
}

function renderHistList() {
  const data = getData();
  const records = (data.records || [])
    .filter(r => { const d = new Date(r.date); return d.getFullYear() === histYear && d.getMonth() === histMonth; })
    .sort((a, b) => b.date.localeCompare(a.date));

  const el = document.getElementById('hist-list');
  if (records.length === 0) {
    el.innerHTML = '<div class="empty-state"><span>📋</span><p>Belum ada data absensi bulan ini</p></div>';
    return;
  }
  const dowNames = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  el.innerHTML = records.map(r => {
    const d = new Date(r.date + 'T00:00:00');
    const day = d.getDate();
    const dow = dowNames[d.getDay()];
    let dur = '—';
    if (r.clock_in && r.clock_out) {
      const [h1,m1] = r.clock_in.split(':').map(Number);
      const [h2,m2] = r.clock_out.split(':').map(Number);
      const dm = (h2*60+m2)-(h1*60+m1);
      dur = `${Math.floor(dm/60)}j ${dm%60}m`;
    }
    const status = r.late ? 'telat' : 'hadir';
    const statusText = r.late ? 'Terlambat' : 'Hadir';
    return `<div class="hist-item">
      <div class="hist-date-badge"><span class="day">${day}</span><span class="dow">${dow}</span></div>
      <div class="hist-info">
        <div class="hist-times">${r.clock_in || '—'} <span class="arr">→</span> ${r.clock_out || '—'}</div>
        <div class="hist-dur">Durasi: ${dur} · Jarak: ${r.in_distance || '—'}m</div>
      </div>
      <span class="hist-status ${status}">${statusText}</span>
    </div>`;
  }).join('');
}

// ── Settings ──
function saveSetting(key, value) {
  const data = getData();
  if (!data.settings) data.settings = {};
  data.settings[key] = value;
  if (key === 'radius') { currentUser.radius = parseInt(value); data.user = currentUser; }
  saveData(data);
  toast('✅ Pengaturan disimpan');
  updateGreeting();
}

function updateOfficeLocation() {
  toast('📍 Mengambil lokasi baru...');
  navigator.geolocation.getCurrentPosition(pos => {
    currentUser.office_lat = pos.coords.latitude;
    currentUser.office_lng = pos.coords.longitude;
    const data = getData();
    data.user = currentUser;
    saveData(data);
    updateGreeting();
    toast('✅ Lokasi kantor diperbarui');
  }, err => {
    toast('❌ Gagal: ' + err.message);
  }, { enableHighAccuracy: true });
}

function showSettings() { switchTab('profile', document.getElementById('nav-profile')); }

function resetApp() {
  if (!confirm('Hapus semua data AbsenKu? Tindakan ini tidak bisa dibatalkan.')) return;
  localStorage.removeItem(DB_KEY);
  location.reload();
}

// ── Modals ──
function showModal(id) { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

function showResult(icon, title, message, details) {
  document.getElementById('result-icon').textContent = icon;
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-message').textContent = message;
  const detailsEl = document.getElementById('result-details');
  if (details && details.length) {
    detailsEl.innerHTML = details.map(d => `<div class="rd-row"><span>${d.label}</span><strong>${d.value}</strong></div>`).join('');
    detailsEl.style.display = '';
  } else {
    detailsEl.style.display = 'none';
  }
  showModal('modal-result');
}

// ── Toast ──
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ── PWA Service Worker ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
