<template>
  <div class="onboard-shell">

    <!-- Progress bar -->
    <div class="progress-bar">
      <div class="progress-fill" :style="{ width: `${(step / totalSteps) * 100}%` }"></div>
    </div>

    <!-- ─── STEP 1: Welcome ─── -->
    <Transition name="slide" mode="out-in">
    <div v-if="step === 1" key="s1" class="step-page">
      <div class="welcome-hero">
        <img src="/blackbox-logo.png" alt="Blackboxs" class="hero-logo" />
        <div class="hero-badge">Blackboxs · Karyawan Baru</div>
      </div>
      <div class="step-content">
        <h1 class="welcome-title">Selamat Datang,<br>{{ emp?.name?.split(' ')[0] }}! 👋</h1>
        <p class="welcome-sub">{{ emp?.position }} · {{ emp?.department }}</p>
        <p class="welcome-desc">
          Sebelum mulai bekerja, kami perlu mendaftarkan <strong>sidik jari</strong> dan
          <strong>lokasi kerja</strong> Anda. Proses ini hanya dilakukan <strong>sekali saja</strong>.
        </p>

        <div class="what-to-do">
          <div class="todo-item">
            <div class="todo-num">1</div>
            <div class="todo-text">
              <div class="todo-title">📍 Lokasi Kerja</div>
              <div class="todo-desc">Capture GPS di lokasi Anda bekerja sehari-hari</div>
            </div>
          </div>
          <div class="todo-item">
            <div class="todo-num">2</div>
            <div class="todo-text">
              <div class="todo-title">👆 Sidik Jari</div>
              <div class="todo-desc">Scan jari untuk autentikasi absensi harian</div>
            </div>
          </div>
          <div class="todo-item">
            <div class="todo-num">3</div>
            <div class="todo-text">
              <div class="todo-title">✅ Siap Absen</div>
              <div class="todo-desc">Setiap hari cukup tap + scan jari dalam 5 detik</div>
            </div>
          </div>
        </div>
      </div>
      <div class="step-footer">
        <button @click="step = 2" class="btn-next">Mulai Setup →</button>
      </div>
    </div>
    </Transition>

    <!-- ─── STEP 2: Pick Location ─── -->
    <Transition name="slide" mode="out-in">
    <div v-if="step === 2" key="s2" class="step-page">
      <div class="step-header">
        <div class="step-icon-wrap">📍</div>
        <h2 class="step-title">Pilih Lokasi Kerja</h2>
        <p class="step-desc">Pilih lokasi tempat Anda bekerja sehari-hari. Absensi hanya bisa dilakukan dalam radius yang sudah ditentukan.</p>
      </div>

      <div class="step-content">
        <div v-if="loadingLocations" class="loc-loading">
          <div class="loc-spinner"></div>
          <div>Memuat daftar lokasi...</div>
        </div>

        <div v-else-if="!locations.length" class="loc-empty">
          <div style="font-size:36px;margin-bottom:8px">⚠️</div>
          <div style="font-weight:700;color:#92400e">Belum ada lokasi terdaftar</div>
          <div style="font-size:12px;color:#b45309;margin-top:4px;line-height:1.5">Admin belum mendaftarkan lokasi absensi.<br>Hubungi HRD untuk mendaftarkan lokasi terlebih dahulu.</div>
        </div>

        <div v-else class="loc-list">
          <div v-for="loc in locations" :key="loc.id"
            class="loc-item" :class="gpsForm.selected_location_id === loc.id ? 'selected' : ''"
            @click="selectLocation(loc)">
            <div class="loc-radio">
              <div class="radio-outer" :class="gpsForm.selected_location_id === loc.id ? 'checked' : ''">
                <div class="radio-inner" v-if="gpsForm.selected_location_id === loc.id"></div>
              </div>
            </div>
            <div class="loc-details">
              <div class="loc-name">{{ loc.name }}</div>
              <div class="loc-meta">
                <span class="loc-coord">{{ Number(loc.latitude).toFixed(5) }}, {{ Number(loc.longitude).toFixed(5) }}</span>
                <span class="loc-radius">radius {{ loc.radius_m }}m</span>
              </div>
            </div>
            <div v-if="gpsForm.selected_location_id === loc.id" class="loc-check">✓</div>
          </div>
        </div>

        <div v-if="gpsForm.selected_location_id" class="selected-info">
          <div class="sel-title">✅ Lokasi dipilih:</div>
          <div class="sel-name">{{ locations.find(l => l.id === gpsForm.selected_location_id)?.name }}</div>
          <div class="sel-detail">Radius toleransi: {{ locations.find(l => l.id === gpsForm.selected_location_id)?.radius_m }}m</div>
        </div>
      </div>

      <div class="step-footer">
        <button @click="step = 1" class="btn-back">← Kembali</button>
        <button @click="step = 3" :disabled="!gpsForm.selected_location_id || !locations.length" class="btn-next">
          Lanjut →
        </button>
      </div>
    </div>
    </Transition>

    <!-- ─── STEP 3: Fingerprint ─── -->
    <Transition name="slide" mode="out-in">
    <div v-if="step === 3" key="s3" class="step-page">
      <div class="step-header">
        <div class="step-icon-wrap">👆</div>
        <h2 class="step-title">Daftarkan Sidik Jari</h2>
        <p class="step-desc">Tap tombol di bawah, HP Anda akan meminta scan sidik jari. Gunakan jari yang sama yang biasa Anda pakai sehari-hari.</p>
      </div>

      <div class="step-content">
        <!-- Summary of what will be saved -->
        <div class="summary-box">
          <div class="sum-title">📋 Yang Akan Didaftarkan</div>
          <div class="sum-row"><span>👤 Nama</span><span>{{ emp?.name }}</span></div>
          <div class="sum-row"><span>🔑 NIK</span><span>{{ emp?.code }}</span></div>
          <div class="sum-row"><span>📍 Lokasi</span><span>{{ gpsForm.location_name }}</span></div>
          <div class="sum-row"><span>📏 Radius</span><span>{{ gpsForm.radius }}m</span></div>
          <div class="sum-row"><span>🗺️ Koordinat</span><span style="font-family:monospace;font-size:11px">{{ gpsForm.latitude?.toFixed(5) }}, {{ gpsForm.longitude?.toFixed(5) }}</span></div>
        </div>

        <!-- Fingerprint button -->
        <button @click="doRegister"
          :disabled="registering || registered"
          class="btn-fp"
          :class="{ 'fp-done': registered, 'fp-scanning': registering }">
          <div class="fp-ico">{{ registered ? '✅' : registering ? '⏳' : '👆' }}</div>
          <div class="fp-label">
            {{ registered ? 'Sidik Jari Terdaftar!' : registering ? 'Scan jari Anda...' : 'Tap untuk Scan Sidik Jari' }}
          </div>
          <div class="fp-sub" v-if="!registered">HP Anda akan meminta konfirmasi biometrik</div>
        </button>

        <div v-if="regError" class="reg-err">⚠️ {{ regError }}</div>
      </div>

      <div class="step-footer">
        <button @click="step = 2" :disabled="registering" class="btn-back">← Kembali</button>
        <button @click="finish" :disabled="!registered" class="btn-finish">
          🚀 Mulai Bekerja!
        </button>
      </div>
    </div>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { mobileApi } from '../../lib/mobileApi';

const router    = useRouter();
const emp       = ref<any>(null);
const step      = ref(1);
const totalSteps = 3;

// Location selection (from admin-configured list)
const locations       = ref<any[]>([]);
const loadingLocations = ref(false);
const gpsForm = ref({ selected_location_id: null as number|null, location_name: '', latitude: null as number|null, longitude: null as number|null, radius: 200 });
const regError    = ref('');
const registering = ref(false);
const registered  = ref(false);

async function loadLocations() {
  loadingLocations.value = true;
  try {
    const res = await mobileApi.get('/api/webauthn/offices');
    locations.value = (res.data.data || []).filter((l: any) => l.is_active);
  } catch { locations.value = []; }
  finally { loadingLocations.value = false; }
}

function selectLocation(loc: any) {
  gpsForm.value.selected_location_id = loc.id;
  gpsForm.value.location_name = loc.name;
  gpsForm.value.latitude  = parseFloat(loc.latitude);
  gpsForm.value.longitude = parseFloat(loc.longitude);
  gpsForm.value.radius    = loc.radius_m;
}

// WebAuthn helpers
function base64urlToBuffer(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  new Uint8Array(buf).forEach((_, i, a) => { a[i] = bin.charCodeAt(i); });
  return buf;
}
function bufferToBase64url(buf: ArrayBuffer): string {
  let str = '';
  new Uint8Array(buf).forEach(b => str += String.fromCharCode(b));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function attResponseToJSON(cred: PublicKeyCredential): any {
  const resp = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id, rawId: bufferToBase64url(cred.rawId), type: cred.type,
    response: {
      attestationObject: bufferToBase64url(resp.attestationObject),
      clientDataJSON:    bufferToBase64url(resp.clientDataJSON),
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}

async function doRegister() {
  regError.value = ''; registering.value = true;
  try {
    // 1. Get challenge
    const optRes = await mobileApi.post('/api/webauthn/register/options', {
      employee_id: emp.value.id,
      // DR-P0-06b: lokasi kerja dikirim DI SINI supaya server menolaknya
      // sebelum prompt sidik jari muncul. Kalau baru diperiksa saat verify,
      // passkey sudah terlanjur dibuat di perangkat sementara server tidak
      // menyimpannya — karyawan melihat "terdaftar" di HP padahal tidak.
      office_location_id: gpsForm.value.selected_location_id,
    });
    const options = optRes.data;
    options.challenge = base64urlToBuffer(options.challenge);
    options.user.id   = base64urlToBuffer(typeof options.user.id === 'string'
      ? options.user.id : bufferToBase64url(options.user.id));
    if (options.excludeCredentials) {
      options.excludeCredentials = options.excludeCredentials.map((c: any) => ({
        ...c, id: base64urlToBuffer(c.id)
      }));
    }
    // 2. Biometric prompt
    const credential = await navigator.credentials.create({ publicKey: options }) as PublicKeyCredential;
    if (!credential) throw new Error('Dibatalkan');

    // 3. Verify + save with admin-configured GPS
    await mobileApi.post('/api/webauthn/register/verify', {
      employee_id:           emp.value.id,
      registration_response: attResponseToJSON(credential),
      device_name:           `HP ${emp.value.name?.split(' ')[0]} - ${navigator.platform || 'Mobile'}`,
      // DR-P0-06: yang dikirim hanya ID kantor. Koordinat dan radius diambil
      // server dari `office_locations` yang dikelola admin — dulu ketiganya
      // dikirim dari sini, jadi karyawan bisa mendaftarkan koordinat rumahnya.
      office_location_id:    gpsForm.value.selected_location_id,
    });
    registered.value = true;
  } catch (e: any) {
    if (e?.name === 'NotAllowedError') regError.value = 'Scan sidik jari dibatalkan atau tidak diizinkan';
    else regError.value = e?.response?.data?.error || e?.message || 'Pendaftaran gagal';
  } finally { registering.value = false; }
}

function finish() {
  // Mark employee as onboarded
  const empData = { ...emp.value, onboarded: true };
  localStorage.setItem('mobile_employee', JSON.stringify(empData));
  localStorage.setItem('mobile_toast', JSON.stringify({
    msg: `🎉 Selamat datang, ${emp.value.name?.split(' ')[0]}! Sidik jari & lokasi berhasil didaftarkan.`,
    type: 'success'
  }));
  router.push('/mobile/home');
}

onMounted(async () => {
  const stored = localStorage.getItem('mobile_employee');
  if (!stored) { router.push('/mobile'); return; }
  const empData = JSON.parse(stored);

  // If already onboarded, go home
  if (empData.onboarded) { router.push('/mobile/home'); return; }

  // Double check server — if already has credentials, go home
  try {
    const res = await mobileApi.get(`/api/webauthn/credentials/${empData.id}`);
    if (res.data.data?.length > 0) {
      empData.onboarded = true;
      localStorage.setItem('mobile_employee', JSON.stringify(empData));
      router.push('/mobile/home'); return;
    }
  } catch {}

  emp.value = empData;
  await loadLocations();
});
</script>

<style scoped>
* { box-sizing: border-box; margin: 0; padding: 0; }
.onboard-shell {
  min-height: 100dvh; display: flex; flex-direction: column;
  background: #0f172a;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.progress-bar { height: 4px; background: rgba(255,255,255,0.1); }
.progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #7c3aed); transition: width .4s ease; border-radius: 0 2px 2px 0; }

/* Step pages */
.step-page { flex: 1; display: flex; flex-direction: column; min-height: calc(100dvh - 4px); }

/* STEP 1 — Welcome */
.welcome-hero { background: linear-gradient(160deg, #1e3a8a, #312e81); padding: 48px 24px 32px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.hero-logo { width: 80px; height: 80px; border-radius: 20px; box-shadow: 0 12px 32px rgba(0,0,0,0.4); background: white; object-fit: contain; padding: 6px; }
.hero-badge { background: rgba(99,102,241,0.3); border: 1px solid rgba(99,102,241,0.5); color: #a5b4fc; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; padding: 4px 12px; border-radius: 20px; }
.step-content { flex: 1; padding: 24px 20px; }
.welcome-title { font-size: 28px; font-weight: 800; color: white; line-height: 1.2; margin-bottom: 6px; }
.welcome-sub { font-size: 13px; color: #94a3b8; margin-bottom: 20px; }
.welcome-desc { font-size: 14px; color: #cbd5e1; line-height: 1.6; margin-bottom: 24px; }
.what-to-do { display: flex; flex-direction: column; gap: 12px; }
.todo-item { display: flex; align-items: center; gap: 14px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 14px; }
.todo-num { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6, #7c3aed); color: white; font-size: 15px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.todo-title { font-size: 14px; font-weight: 700; color: white; }
.todo-desc { font-size: 12px; color: #94a3b8; margin-top: 2px; }

/* STEP 2 & 3 header */
.step-header { background: linear-gradient(160deg, #1e3a8a, #312e81); padding: 48px 24px 28px; text-align: center; }
.step-icon-wrap { font-size: 48px; margin-bottom: 12px; }
.step-title { font-size: 22px; font-weight: 800; color: white; margin-bottom: 8px; }
.step-desc { font-size: 13px; color: #93c5fd; line-height: 1.5; }

/* Fields */
.field-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.field-label { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .5px; }
.field-input { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 13px 16px; color: white; font-size: 15px; outline: none; width: 100%; }
.field-input:focus { border-color: #3b82f6; }
.field-input::placeholder { color: #475569; }

/* Radius grid */
.radius-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.radius-btn { background: rgba(255,255,255,0.06); border: 1.5px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px 4px; cursor: pointer; text-align: center; transition: all .2s; }
.radius-btn.active { background: rgba(59,130,246,0.2); border-color: #3b82f6; }
.radius-val { color: white; font-size: 14px; font-weight: 700; }
.radius-desc { color: #64748b; font-size: 10px; margin-top: 2px; }
.radius-btn.active .radius-desc { color: #93c5fd; }

/* GPS box */
.gps-box { border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 12px; transition: all .3s; border: 2px solid; }
.idle { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.1); }
.loading { background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.3); }
.ok { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.3); }
.error { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); }
.gps-prompt { font-size: 14px; font-weight: 600; color: #e2e8f0; margin: 8px 0 4px; }
.gps-hint { font-size: 12px; color: #475569; }
.gps-spinner { width: 32px; height: 32px; border: 3px solid rgba(59,130,246,0.2); border-top-color: #3b82f6; border-radius: 50%; animation: spin .8s linear infinite; margin: 0 auto 8px; }
@keyframes spin { to { transform: rotate(360deg); } }
.gps-success-title { font-size: 15px; font-weight: 700; color: #6ee7b7; margin: 6px 0 4px; }
.gps-coords { font-size: 12px; color: #34d399; font-family: monospace; }
.gps-accuracy { font-size: 11px; color: #64748b; margin-top: 4px; }
.gps-err-msg { font-size: 13px; color: #fca5a5; margin-top: 8px; line-height: 1.5; }
.btn-gps { width: 100%; background: rgba(59,130,246,0.2); border: 1.5px solid rgba(59,130,246,0.4); color: #93c5fd; border-radius: 12px; padding: 13px; font-size: 14px; font-weight: 700; cursor: pointer; margin-bottom: 8px; }
.btn-gps:disabled { opacity: 0.5; cursor: not-allowed; }

/* Summary box (step 3) */
.summary-box { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 16px; margin-bottom: 20px; }
.sum-title { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 12px; }
.sum-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.05); }
.sum-row span:first-child { color: #64748b; }
.sum-row span:last-child { color: #e2e8f0; font-weight: 600; }

/* Fingerprint button */
.btn-fp { width: 100%; background: linear-gradient(135deg, #1d4ed8, #7c3aed); border: none; border-radius: 20px; padding: 28px 20px; cursor: pointer; text-align: center; transition: all .2s; box-shadow: 0 8px 24px rgba(99,102,241,0.4); }
.btn-fp:disabled { cursor: not-allowed; }
.btn-fp.fp-scanning { animation: pulse-glow 1.5s ease infinite; }
.btn-fp.fp-done { background: linear-gradient(135deg, #059669, #10b981); box-shadow: 0 8px 24px rgba(16,185,129,0.4); }
@keyframes pulse-glow { 0%,100% { box-shadow: 0 8px 24px rgba(99,102,241,0.4); } 50% { box-shadow: 0 8px 40px rgba(99,102,241,0.8); } }
.fp-ico { font-size: 44px; margin-bottom: 10px; }
.fp-label { color: white; font-size: 18px; font-weight: 800; }
.fp-sub { color: rgba(255,255,255,0.6); font-size: 12px; margin-top: 6px; }
.reg-err { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); border-radius: 10px; padding: 10px 14px; color: #fca5a5; font-size: 13px; margin-top: 12px; }

/* Footer nav */
.step-footer { padding: 16px 20px 32px; display: flex; gap: 10px; }
.btn-back { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: #94a3b8; border-radius: 14px; padding: 15px 20px; font-size: 14px; font-weight: 700; cursor: pointer; flex-shrink: 0; }
.btn-next { flex: 1; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border: none; border-radius: 14px; padding: 15px; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 16px rgba(59,130,246,0.4); }
.btn-next:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
.btn-finish { flex: 1; background: linear-gradient(135deg, #059669, #10b981); color: white; border: none; border-radius: 14px; padding: 15px; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 16px rgba(16,185,129,0.4); }
.btn-finish:disabled { opacity: 0.4; cursor: not-allowed; }

/* Location picker */
.loc-loading { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 40px; color: #94a3b8; font-size: 13px; }
.loc-spinner { width: 28px; height: 28px; border: 3px solid rgba(99,102,241,0.2); border-top-color: #7c3aed; border-radius: 50%; animation: spin .8s linear infinite; }
.loc-empty { background: rgba(234,179,8,0.1); border: 1px solid rgba(234,179,8,0.3); border-radius: 14px; padding: 24px; text-align: center; }
.loc-list { display: flex; flex-direction: column; gap: 10px; }
.loc-item { display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 14px; cursor: pointer; transition: all .2s; }
.loc-item.selected { background: rgba(59,130,246,0.15); border-color: #3b82f6; }
.loc-item:active { transform: scale(0.98); }
.loc-radio { flex-shrink: 0; }
.radio-outer { width: 20px; height: 20px; border-radius: 50%; border: 2px solid #475569; display: flex; align-items: center; justify-content: center; }
.radio-outer.checked { border-color: #3b82f6; background: #1d4ed8; }
.radio-inner { width: 8px; height: 8px; border-radius: 50%; background: white; }
.loc-details { flex: 1; }
.loc-name { font-size: 14px; font-weight: 700; color: white; }
.loc-meta { display: flex; gap: 8px; margin-top: 3px; flex-wrap: wrap; }
.loc-coord { font-size: 10px; color: #94a3b8; font-family: monospace; }
.loc-radius { font-size: 11px; background: rgba(16,185,129,0.2); color: #6ee7b7; padding: 1px 6px; border-radius: 20px; font-weight: 700; }
.loc-check { color: #3b82f6; font-size: 20px; font-weight: 800; }
.selected-info { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 12px; padding: 12px 14px; margin-top: 12px; }
.sel-title { font-size: 11px; font-weight: 700; color: #6ee7b7; text-transform: uppercase; letter-spacing: .5px; }
.sel-name { font-size: 15px; font-weight: 800; color: white; margin-top: 4px; }
.sel-detail { font-size: 12px; color: #6ee7b7; margin-top: 2px; }

/* Page transition */
.slide-enter-active, .slide-leave-active { transition: all .3s ease; }
.slide-enter-from { opacity: 0; transform: translateX(30px); }
.slide-leave-to { opacity: 0; transform: translateX(-30px); }
</style>
