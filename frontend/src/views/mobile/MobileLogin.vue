<template>
  <div class="mobile-app">

    <!-- PWA Install Banner (Android/Chrome auto-prompt) -->
    <Transition name="banner">
      <div v-if="showInstallBanner" class="install-banner">
        <img src="/blackbox-logo.png" class="banner-logo" />
        <div class="banner-text">
          <div class="banner-title">Install Aplikasi Blackboxs</div>
          <div class="banner-sub">Tambahkan ke homescreen untuk akses cepat</div>
        </div>
        <button @click="doInstall" class="banner-btn">Install</button>
        <button @click="showInstallBanner = false" class="banner-close">×</button>
      </div>
    </Transition>

    <!-- iOS install hint (one-time) -->
    <Transition name="banner">
      <div v-if="showIosHint" class="ios-hint">
        <div class="ios-hint-inner">
          <div style="font-size:20px">📲</div>
          <div class="ios-hint-text">
            Tap <strong>[ ⇑ ]</strong> lalu pilih
            <strong>&ldquo;Add to Home Screen&rdquo;</strong>
            untuk install aplikasi
          </div>
          <button @click="dismissIosHint" class="banner-close">×</button>
        </div>
        <div class="ios-arrow">▼</div>
      </div>
    </Transition>

    <div class="login-bg">
      <div class="login-card">
        <!-- Logo -->
        <div class="logo-wrap">
          <img src="/blackbox-logo.png" alt="Blackboxs" class="logo-img" />
          <div class="logo-title">Blackboxs</div>
          <div class="logo-sub">Employee Self-Service Portal</div>
        </div>

        <!-- STATE: Fingerprint quick login -->
        <div v-if="hasSavedEmployee && !showNikForm" class="fp-section">
          <div class="emp-badge">
            <div class="emp-avatar">{{ savedEmp?.name?.charAt(0) }}</div>
            <div>
              <div class="emp-name">{{ savedEmp?.name }}</div>
              <div class="emp-code">{{ savedEmp?.code }} · {{ savedEmp?.position }}</div>
            </div>
          </div>

          <button @click="loginWithFingerprint" :disabled="loading" class="btn-fingerprint"
            :class="{ scanning: loading }">
            <div class="fp-icon">{{ loading ? '⏳' : '👆' }}</div>
            <div class="fp-label">{{ loading ? 'Memverifikasi...' : 'Masuk dengan Sidik Jari' }}</div>
            <div class="fp-sub">Scan jari Anda untuk masuk</div>
          </button>

          <div v-if="gpsStatus" class="gps-badge" :class="gpsStatus.valid ? 'gps-ok' : 'gps-far'">
            <span>📍</span>
            <span v-if="gpsStatus.valid">{{ gpsStatus.location }} ({{ gpsStatus.distance }}m)</span>
            <span v-else>Di luar area ({{ gpsStatus.distance }}m dari {{ gpsStatus.location }})</span>
          </div>

          <div v-if="error" class="error-msg">⚠️ {{ error }}</div>

          <button @click="showNikForm = true" class="btn-nik-switch">
            Ganti akun / Login dengan NIK
          </button>
        </div>

        <!-- STATE: NIK form -->
        <div v-else>
          <form @submit.prevent="doNikLogin" class="login-form">
            <div class="field-group">
              <label class="field-label">NIK / Kode Karyawan</label>
              <input v-model="nik" type="text" placeholder="Contoh: EMP001" class="field-input"
                autocomplete="off" autocapitalize="characters" spellcheck="false" />
            </div>
            <div class="field-group">
              <label class="field-label">Nama (opsional, verifikasi)</label>
              <input v-model="nameInput" type="text" placeholder="Nama lengkap Anda" class="field-input" />
            </div>

            <div v-if="error" class="error-msg">⚠️ {{ error }}</div>

            <button type="submit" class="btn-login" :disabled="loading || !nik.trim()">
              <span v-if="loading">⏳ Memverifikasi...</span>
              <span v-else>🚀 Masuk</span>
            </button>
          </form>

          <button v-if="hasSavedEmployee" @click="showNikForm = false" class="btn-nik-switch" style="margin-top:12px">
            ← Kembali ke login sidik jari
          </button>
        </div>

        <div class="login-footer">
          <p>Hubungi HRD jika lupa NIK Anda</p>
          <a href="/" style="color:#475569;font-size:11px">Admin Portal →</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

const router    = useRouter();
const nik       = ref('');
const nameInput = ref('');
const error     = ref('');
const loading   = ref(false);
const showNikForm = ref(false);
const gpsStatus = ref<any>(null);

// ─── PWA Install Prompt ───────────────────────────────────────────────────────
const showInstallBanner = ref(false);
const showIosHint = ref(false);
let deferredPrompt: any = null;

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}
function isInStandaloneMode() {
  return ('standalone' in window.navigator) && (window.navigator as any).standalone;
}

window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallBanner.value = true;
});

async function doInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const result = await deferredPrompt.userChoice;
  deferredPrompt = null;
  showInstallBanner.value = false;
}

function dismissIosHint() {
  showIosHint.value = false;
  localStorage.setItem('bb_ios_hint_dismissed', '1');
}

// Check iOS hint on mount
function checkIosInstall() {
  if (isIos() && !isInStandaloneMode() && !localStorage.getItem('bb_ios_hint_dismissed')) {
    setTimeout(() => { showIosHint.value = true; }, 1500);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

const savedEmp = computed(() => {
  try { return JSON.parse(localStorage.getItem('mobile_employee') || 'null'); } catch { return null; }
});
const hasSavedEmployee = computed(() => !!savedEmp.value);

async function getGPS(): Promise<{ lat: number|null, lng: number|null }> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve({ lat: null, lng: null });
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({ lat: null, lng: null }),
      { timeout: 6000, enableHighAccuracy: true }
    );
  });
}

async function loginWithFingerprint() {
  error.value = '';
  loading.value = true;
  try {
    // 1. Get auth options from server
    const optRes = await axios.post('/api/webauthn/auth/options', { employee_id: savedEmp.value.id });
    const options = optRes.data;

    // 2. Convert challenge from base64url to ArrayBuffer
    options.challenge = base64urlToBuffer(options.challenge);
    if (options.allowCredentials) {
      options.allowCredentials = options.allowCredentials.map((c: any) => ({
        ...c, id: base64urlToBuffer(c.id),
      }));
    }

    // 3. Trigger browser biometric prompt (FaceID / Fingerprint)
    const credential = await navigator.credentials.get({ publicKey: options }) as PublicKeyCredential;
    if (!credential) throw new Error('Autentikasi dibatalkan');

    // 4. Get GPS
    const { lat, lng } = await getGPS();

    // 5. Serialize response for server
    const authResp = credentialToJSON(credential);

    // 6. Verify on server + auto checkin
    const verifyRes = await axios.post('/api/webauthn/auth/verify', {
      employee_id: savedEmp.value.id,
      auth_response: authResp,
      latitude: lat, longitude: lng,
      auto_checkin: true,
    });

    const { employee, gps, checkin } = verifyRes.data;
    gpsStatus.value = gps;

    // Update stored employee
    localStorage.setItem('mobile_employee', JSON.stringify(employee));

    // Show checkin result then navigate
    if (checkin) {
      localStorage.setItem('mobile_toast', JSON.stringify({ msg: checkin.message, type: 'success' }));
    }
    router.push('/mobile/home');
  } catch (e: any) {
    if (e?.response?.data?.code === 'NO_CREDENTIAL') {
      error.value = '⚠️ Sidik jari belum didaftarkan di server.\nLogin dengan NIK dulu, lalu daftarkan fingerprint di Pengaturan.';
      showNikForm.value = true;
    } else if (e?.name === 'NotAllowedError' || e?.name === 'InvalidStateError' || e?.message?.includes('No passkeys')) {
      error.value = '📱 Passkey / sidik jari tidak tersedia di perangkat ini.\nSilakan login dengan NIK, lalu daftarkan sidik jari baru di menu Pengaturan.';
      showNikForm.value = true;
    } else if (e?.name === 'AbortError') {
      error.value = 'Verifikasi sidik jari dibatalkan';
    } else {
      error.value = e?.response?.data?.error || e?.message || 'Login gagal';
    }
  } finally {
    loading.value = false;
  }
}

async function doNikLogin() {
  error.value = '';
  loading.value = true;
  try {
    const res = await axios.post('/api/hr/mobile/login', {
      nik: nik.value.trim().toUpperCase(),
      name: nameInput.value || undefined,
    });
    const emp = res.data.employee;
    localStorage.setItem('mobile_employee', JSON.stringify(emp));

    // Check if employee already has registered credentials
    try {
      const credRes = await axios.get(`/api/webauthn/credentials/${emp.id}`);
      const hasCreds = credRes.data.data?.length > 0;
      if (hasCreds) {
        // Already onboarded → go home
        emp.onboarded = true;
        localStorage.setItem('mobile_employee', JSON.stringify(emp));
        router.push('/mobile/home');
      } else {
        // First time → onboarding wizard
        router.push('/mobile/setup');
      }
    } catch {
      // If check fails, go to setup to be safe
      router.push('/mobile/setup');
    }
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Login gagal';
  } finally {
    loading.value = false;
  }
}

// WebAuthn helpers
function base64urlToBuffer(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}
function bufferToBase64url(buf: ArrayBuffer): string {
  const view = new Uint8Array(buf);
  let str = '';
  view.forEach(b => str += String.fromCharCode(b));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function credentialToJSON(cred: PublicKeyCredential): any {
  const resp = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: bufferToBase64url(cred.rawId),
    type: cred.type,
    response: {
      authenticatorData: bufferToBase64url(resp.authenticatorData),
      clientDataJSON:    bufferToBase64url(resp.clientDataJSON),
      signature:         bufferToBase64url(resp.signature),
      userHandle:        resp.userHandle ? bufferToBase64url(resp.userHandle) : undefined,
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}

onMounted(() => {
  // Already logged in? Go home
  if (savedEmp.value) { showNikForm.value = false; }
  checkIosInstall();
});
</script>

<style scoped>
* { box-sizing: border-box; margin: 0; padding: 0; }
.mobile-app { min-height: 100dvh; }
.login-bg {
  min-height: 100dvh;
  background: linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #0f2044 100%);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.login-card {
  background: rgba(255,255,255,0.05); backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 24px;
  padding: 32px 28px; width: 100%; max-width: 400px;
  box-shadow: 0 25px 50px rgba(0,0,0,0.5);
}
.logo-wrap { text-align: center; margin-bottom: 28px; }
.logo-img { width: 76px; height: 76px; border-radius: 20px; margin-bottom: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.6); background: white; object-fit: contain; padding: 6px; }
.logo-title { font-size: 22px; font-weight: 800; color: white; }
.logo-sub { font-size: 12px; color: #94a3b8; margin-top: 3px; }

/* Fingerprint section */
.fp-section { display: flex; flex-direction: column; gap: 14px; }
.emp-badge { display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.08); border-radius: 14px; padding: 12px 14px; }
.emp-avatar { width: 42px; height: 42px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; font-size: 18px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.emp-name { color: white; font-weight: 700; font-size: 15px; }
.emp-code { color: #94a3b8; font-size: 12px; margin-top: 2px; }
.btn-fingerprint {
  background: linear-gradient(135deg, #1d4ed8, #7c3aed);
  border: none; border-radius: 20px; padding: 24px 20px;
  cursor: pointer; transition: all .2s; text-align: center;
  box-shadow: 0 8px 24px rgba(99,102,241,0.4);
}
.btn-fingerprint:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-fingerprint:not(:disabled):active { transform: scale(0.97); }
.btn-fingerprint.scanning { animation: pulse-ring 1.5s ease infinite; }
@keyframes pulse-ring { 0%,100% { box-shadow: 0 8px 24px rgba(99,102,241,0.4); } 50% { box-shadow: 0 8px 40px rgba(99,102,241,0.8); } }
.fp-icon { font-size: 40px; margin-bottom: 8px; }
.fp-label { color: white; font-size: 17px; font-weight: 700; }
.fp-sub { color: #c4b5fd; font-size: 12px; margin-top: 4px; }
.gps-badge { display: flex; align-items: center; gap: 8px; border-radius: 10px; padding: 8px 12px; font-size: 12px; font-weight: 600; }
.gps-ok { background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: #6ee7b7; }
.gps-far { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color: #fca5a5; }
.btn-nik-switch { background: none; border: none; color: #64748b; font-size: 13px; cursor: pointer; text-align: center; width: 100%; padding: 4px; text-decoration: underline; }

/* NIK form */
.login-form { display: flex; flex-direction: column; gap: 14px; }
.field-group { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 13px; font-weight: 600; color: #cbd5e1; }
.field-input { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 14px 16px; color: white; font-size: 16px; outline: none; transition: border .2s; width: 100%; }
.field-input:focus { border-color: #3b82f6; background: rgba(59,130,246,0.1); }
.field-input::placeholder { color: #64748b; }
.error-msg { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); border-radius: 10px; padding: 10px 14px; color: #fca5a5; font-size: 13px; white-space: pre-line; line-height: 1.5; }
.btn-login { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border: none; border-radius: 14px; padding: 16px; font-size: 16px; font-weight: 700; cursor: pointer; transition: all .2s; box-shadow: 0 4px 16px rgba(59,130,246,0.4); width: 100%; }
.btn-login:disabled { opacity: 0.5; cursor: not-allowed; }
.login-footer { text-align: center; margin-top: 24px; color: #64748b; font-size: 12px; }

/* ── PWA Install Banner ─────────────────────────────────────── */
.install-banner {
  position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
  background: white; padding: 10px 14px;
  display: flex; align-items: center; gap: 10px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.25);
}
.banner-logo { width: 44px; height: 44px; border-radius: 10px; object-fit: contain; background: #0f172a; padding: 4px; flex-shrink: 0; }
.banner-text { flex: 1; min-width: 0; }
.banner-title { font-size: 13px; font-weight: 800; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.banner-sub { font-size: 11px; color: #64748b; }
.banner-btn { background: #0f172a; color: white; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
.banner-close { background: none; border: none; font-size: 22px; color: #94a3b8; cursor: pointer; padding: 0 4px; line-height: 1; flex-shrink: 0; }

/* iOS hint — bottom banner */
.ios-hint { position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999; padding: 0 12px 24px; }
.ios-hint-inner { background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 14px 16px; display: flex; align-items: center; gap: 10px; }
.ios-hint-text { flex: 1; font-size: 13px; color: #e2e8f0; line-height: 1.5; }
.ios-arrow { text-align: center; font-size: 20px; color: #475569; margin-top: 6px; }

/* Transitions */
.banner-enter-active, .banner-leave-active { transition: all .35s cubic-bezier(.4,0,.2,1); }
.banner-enter-from, .banner-leave-to { transform: translateY(-110%); opacity: 0; }
</style>
