<template>
  <div class="mobile-app">
    <div class="topbar">
      <div>
        <div class="page-title">⚙️ Pengaturan Absensi</div>
        <div class="page-sub">{{ emp?.name }} · {{ emp?.code }}</div>
      </div>
    </div>

    <!-- Registered devices/locations -->
    <div class="section-card">
      <div class="section-title">🔐 Sidik Jari & Lokasi Terdaftar</div>
      <p class="section-desc">
        Setiap pendaftaran menyimpan <strong>sidik jari</strong> + <strong>koordinat GPS</strong> Anda.
        Absensi hanya bisa dilakukan jika <strong>keduanya cocok</strong>.
      </p>

      <div v-if="credentials.length" class="cred-list">
        <div v-for="cred in credentials" :key="cred.id" class="cred-card">
          <div class="cred-header">
            <div class="cred-icon">📱</div>
            <div class="cred-info">
              <div class="cred-name">{{ cred.device_name }}</div>
              <div class="cred-since">Didaftarkan {{ formatDate(cred.created_at) }}</div>
              <div v-if="cred.last_used_at" class="cred-used">Terakhir dipakai {{ formatDate(cred.last_used_at) }}</div>
            </div>
            <button @click="deleteCred(cred.id)" class="btn-del">🗑</button>
          </div>
          <div class="cred-gps">
            <div v-if="cred.registered_lat" class="gps-info">
              <span>📍</span>
              <div>
                <div class="gps-name">{{ cred.location_name || 'Lokasi Kerja' }}</div>
                <div class="gps-coord">{{ Number(cred.registered_lat).toFixed(5) }}, {{ Number(cred.registered_lng).toFixed(5) }} · radius {{ cred.registered_radius }}m</div>
              </div>
              <button @click="updateLocation(cred)" class="btn-update-gps" title="Update lokasi">🔄</button>
            </div>
            <div v-else class="gps-missing">⚠️ Koordinat GPS belum dikonfigurasi</div>
          </div>
        </div>
      </div>
      <div v-else class="empty-cred">
        <div style="font-size:36px;margin-bottom:8px">👆</div>
        <div>Belum ada sidik jari terdaftar</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px">Daftarkan sidik jari + lokasi di bawah ini</div>
      </div>

      <!-- Register new -->
      <div class="register-box">
        <div class="register-title">➕ Daftarkan Sidik Jari Baru</div>

        <div class="form-row">
          <label>Nama Perangkat</label>
          <input v-model="regForm.device_name" type="text" :placeholder="`HP ${emp?.name?.split(' ')[0] || ''}`" class="form-input" />
        </div>

        <!-- DR-P0-06: lokasi kerja dipilih dari daftar yang dikelola admin.
             Dulu nama, koordinat, dan radius diketik/diambil sendiri karyawan —
             artinya "lokasi kerja" bisa diarahkan ke mana saja. -->
        <div class="form-row">
          <label>Lokasi Kerja</label>
          <select v-model="regForm.office_location_id" class="form-input">
            <option :value="null" disabled>— Pilih lokasi —</option>
            <option v-for="o in offices" :key="o.id" :value="o.id">
              {{ o.name }} (radius {{ o.radius_m }}m)
            </option>
          </select>
          <div v-if="!offices.length" style="font-size:11px;color:#b45309;margin-top:4px">
            Belum ada lokasi kerja terdaftar. Hubungi admin.
          </div>
        </div>

        <!-- GPS di sini hanya untuk memastikan izin lokasi HP sudah aktif;
             koordinat terdaftar diambil server dari lokasi yang dipilih. -->
        <div class="gps-capture-box" :class="gpsReady ? 'gps-captured' : ''">
          <div v-if="!gpsReady">
            <div style="font-size:28px;margin-bottom:6px">📍</div>
            <div style="font-size:13px;font-weight:600;color:#374151">Koordinat GPS belum diambil</div>
            <div style="font-size:12px;color:#64748b;margin-top:4px">Tekan tombol di bawah untuk capture GPS Anda saat ini</div>
          </div>
          <div v-else>
            <div style="font-size:28px;margin-bottom:6px">✅</div>
            <div style="font-size:13px;font-weight:600;color:#15803d">GPS Berhasil Dicapture</div>
            <div style="font-size:11px;color:#047857;margin-top:4px">
              {{ regForm.latitude?.toFixed(6) }}, {{ regForm.longitude?.toFixed(6) }}
            </div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">Akurasi: {{ gpsAccuracy }}m</div>
          </div>
        </div>

        <button @click="captureGPS" :disabled="detectingGPS" class="btn-capture-gps">
          {{ detectingGPS ? '⏳ Mendeteksi GPS...' : (gpsReady ? '🔄 Ambil Ulang GPS' : '📍 Ambil GPS Sekarang') }}
        </button>

        <button @click="startRegistration" :disabled="registering || !regForm.office_location_id" class="btn-register">
          <span v-if="registering">⏳ Scan sidik jari...</span>
          <span v-else>👆 Daftarkan Sidik Jari</span>
        </button>

        <div v-if="regMsg" class="reg-result" :class="regSuccess ? 'reg-ok' : 'reg-err'">{{ regMsg }}</div>
      </div>
    </div>

    <!-- Info section -->
    <div class="section-card info-card" style="margin-bottom:100px">
      <div class="section-title">ℹ️ Cara Kerja Sistem</div>
      <div class="info-steps">
        <div class="info-step">
          <div class="step-num">1</div>
          <div class="step-text"><strong>Daftar sekali</strong> — sidik jari + koordinat GPS lokasi kerja Anda disimpan ke server</div>
        </div>
        <div class="info-step">
          <div class="step-num">2</div>
          <div class="step-text"><strong>Setiap hari</strong> — tap Check-In/Out di beranda</div>
        </div>
        <div class="info-step">
          <div class="step-num">3</div>
          <div class="step-text"><strong>Sistem cek dua kondisi:</strong> sidik jari cocok ✓ DAN berada dalam radius lokasi terdaftar ✓</div>
        </div>
        <div class="info-step">
          <div class="step-num">4</div>
          <div class="step-text">Jika salah satu tidak cocok → <strong>absen ditolak</strong></div>
        </div>
      </div>
    </div>

    <!-- Bottom nav -->
    <nav class="bottom-nav">
      <router-link to="/mobile/home" class="nav-item">
        <span class="nav-ico">🏠</span><span class="nav-txt">Beranda</span>
      </router-link>
      <router-link to="/mobile/attend" class="nav-item">
        <span class="nav-ico">📋</span><span class="nav-txt">Absensi</span>
      </router-link>
      <router-link to="/mobile/payslip" class="nav-item">
        <span class="nav-ico">💰</span><span class="nav-txt">Slip Gaji</span>
      </router-link>
      <router-link to="/mobile/settings" class="nav-item active">
        <span class="nav-ico">⚙️</span><span class="nav-txt">Pengaturan</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { mobileApi } from '../../lib/mobileApi';

const router = useRouter();
const emp = ref<any>(null);
const credentials = ref<any[]>([]);
const registering = ref(false);
const detectingGPS = ref(false);
const gpsReady = ref(false);
const gpsAccuracy = ref(0);
const regMsg = ref('');
const regSuccess = ref(false);
const regForm = ref({ device_name: '', office_location_id: null as number|null, latitude: null as number|null, longitude: null as number|null });
const offices = ref<any[]>([]);

async function loadOffices() {
  try {
    const res = await mobileApi.get('/api/webauthn/offices');
    offices.value = res.data?.data || res.data || [];
  } catch { offices.value = []; }
}

function formatDate(d: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: '2-digit' });
}

async function loadCredentials() {
  if (!emp.value?.id) return;
  try {
    const res = await mobileApi.get(`/api/webauthn/credentials/${emp.value.id}`);
    credentials.value = res.data.data || [];
  } catch { credentials.value = []; }
}

async function captureGPS() {
  detectingGPS.value = true; gpsReady.value = false;
  try {
    const pos: any = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, enableHighAccuracy: true })
    );
    regForm.value.latitude  = pos.coords.latitude;
    regForm.value.longitude = pos.coords.longitude;
    gpsAccuracy.value = Math.round(pos.coords.accuracy);
    gpsReady.value = true;
  } catch (e: any) {
    alert('❌ GPS gagal diambil. Pastikan:\n1. Izin lokasi diaktifkan\n2. Sinyal GPS tersedia\n\nError: ' + e.message);
  } finally { detectingGPS.value = false; }
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

async function startRegistration() {
  if (!gpsReady.value || !regForm.value.latitude || !regForm.value.longitude) {
    alert('Ambil GPS dulu sebelum mendaftarkan sidik jari!'); return;
  }
  regMsg.value = ''; registering.value = true;
  try {
    // 1. Get challenge
    const optRes = await mobileApi.post('/api/webauthn/register/options', { employee_id: emp.value.id });
    const options = optRes.data;
    options.challenge = base64urlToBuffer(options.challenge);
    options.user.id   = base64urlToBuffer(typeof options.user.id === 'string' ? options.user.id : bufferToBase64url(options.user.id));
    if (options.excludeCredentials) {
      options.excludeCredentials = options.excludeCredentials.map((c: any) => ({ ...c, id: base64urlToBuffer(c.id) }));
    }
    // 2. Trigger biometric
    const credential = await navigator.credentials.create({ publicKey: options }) as PublicKeyCredential;
    if (!credential) throw new Error('Dibatalkan');

    // 3. Send credential + GPS to server
    // Hanya ID lokasi yang dikirim; koordinat dan radius diambil server dari
    // `office_locations`.
    await mobileApi.post('/api/webauthn/register/verify', {
      employee_id: emp.value.id,
      registration_response: attResponseToJSON(credential),
      device_name: regForm.value.device_name || `HP ${emp.value.name?.split(' ')[0]}`,
      office_location_id: regForm.value.office_location_id,
    });

    const dipilih = offices.value.find(o => o.id === regForm.value.office_location_id);
    regMsg.value = `✅ Berhasil!\nSidik jari terdaftar untuk "${dipilih?.name || 'lokasi terpilih'}".\nRadius ${dipilih?.radius_m ?? '-'}m.`;
    regSuccess.value = true;
    gpsReady.value = false;
    regForm.value = { device_name: '', office_location_id: null, latitude: null, longitude: null };
    await loadCredentials();
  } catch (e: any) {
    if (e?.name === 'NotAllowedError') regMsg.value = 'Pendaftaran dibatalkan oleh pengguna';
    else regMsg.value = e?.response?.data?.error || e?.message || 'Gagal';
    regSuccess.value = false;
  } finally { registering.value = false; }
}

async function deleteCred(id: number) {
  if (!confirm('Hapus sidik jari ini?\nAnda harus daftar ulang untuk bisa absen.')) return;
  await mobileApi.delete(`/api/webauthn/credentials/${id}`);
  await loadCredentials();
}

// DR-P0-06: memindahkan lokasi terdaftar berarti MEMILIH lokasi kerja lain yang
// sah, bukan menyalin koordinat HP saat ini. Versi lama mengirim posisi GPS
// karyawan apa adanya — jadi ia tinggal berdiri di rumah, menekan tombol ini,
// dan seterusnya bisa absen dari rumah.
async function updateLocation(cred: any) {
  if (!offices.value.length) { alert('Belum ada lokasi kerja terdaftar. Hubungi admin.'); return; }

  const daftar = offices.value.map((o, i) => `${i + 1}. ${o.name} (radius ${o.radius_m}m)`).join('\n');
  const jawab = prompt(`Pindahkan "${cred.device_name || 'perangkat ini'}" ke lokasi kerja mana?\n\n${daftar}\n\nKetik nomornya:`);
  if (!jawab) return;

  const pilih = offices.value[Number(jawab) - 1];
  if (!pilih) { alert('Nomor tidak dikenal.'); return; }

  try {
    await mobileApi.put(`/api/webauthn/credentials/${cred.id}/location`, {
      office_location_id: pilih.id,
    });
    await loadCredentials();
    alert(`✅ Lokasi perangkat dipindah ke "${pilih.name}".`);
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal memperbarui lokasi');
  }
}

onMounted(async () => {
  const stored = localStorage.getItem('mobile_employee');
  if (!stored) { router.push('/mobile'); return; }
  emp.value = JSON.parse(stored);
  await Promise.all([loadCredentials(), loadOffices()]);
});
</script>

<style scoped>
* { box-sizing: border-box; }
.mobile-app { min-height: 100dvh; background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding-bottom: 80px; }
.topbar { background: linear-gradient(135deg, #0f172a, #374151); padding: 52px 20px 20px; }
.page-title { color: white; font-size: 20px; font-weight: 800; }
.page-sub { color: #9ca3af; font-size: 12px; margin-top: 2px; }
.section-card { background: white; margin: 14px 16px 0; border-radius: 16px; padding: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.section-title { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 6px; }
.section-desc { font-size: 12px; color: #64748b; margin-bottom: 16px; line-height: 1.5; }

/* Credential cards */
.cred-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.cred-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
.cred-header { display: flex; align-items: center; gap: 10px; padding: 12px; }
.cred-icon { font-size: 24px; flex-shrink: 0; }
.cred-info { flex: 1; }
.cred-name { font-size: 14px; font-weight: 700; color: #0f172a; }
.cred-since { font-size: 11px; color: #64748b; margin-top: 1px; }
.cred-used { font-size: 11px; color: #94a3b8; }
.cred-gps { padding: 0 12px 12px; }
.gps-info { display: flex; align-items: flex-start; gap: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 8px 10px; }
.gps-name { font-size: 12px; font-weight: 600; color: #15803d; }
.gps-coord { font-size: 10px; color: #4ade80; margin-top: 1px; font-family: monospace; }
.gps-missing { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 8px 10px; font-size: 12px; color: #c2410c; }
.btn-update-gps { background: none; border: none; cursor: pointer; font-size: 16px; flex-shrink: 0; margin-left: auto; }
.empty-cred { text-align: center; padding: 24px 0; color: #94a3b8; font-size: 13px; margin-bottom: 16px; }
.btn-del { background: #fee2e2; border: none; color: #b91c1c; border-radius: 8px; padding: 6px 10px; cursor: pointer; flex-shrink: 0; }

/* Registration form */
.register-box { background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 14px; padding: 16px; margin-top: 8px; }
.register-title { font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 14px; }
.form-row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.form-row label { font-size: 12px; font-weight: 600; color: #374151; }
.form-input { background: white; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 14px; width: 100%; }
.gps-capture-box { background: white; border: 2px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center; margin: 12px 0 8px; transition: all .3s; }
.gps-captured { border-color: #86efac; background: #f0fdf4; }
.btn-capture-gps { width: 100%; background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; border-radius: 10px; padding: 11px; font-size: 13px; font-weight: 700; cursor: pointer; margin-bottom: 8px; }
.btn-capture-gps:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-register { width: 100%; background: linear-gradient(135deg, #1d4ed8, #7c3aed); color: white; border: none; border-radius: 12px; padding: 14px; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(99,102,241,0.3); }
.btn-register:disabled { opacity: 0.5; cursor: not-allowed; }
.reg-result { margin-top: 10px; padding: 10px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; white-space: pre-line; }
.reg-ok { background: #dcfce7; color: #15803d; }
.reg-err { background: #fee2e2; color: #b91c1c; }

/* Info steps */
.info-steps { display: flex; flex-direction: column; gap: 12px; }
.info-step { display: flex; gap: 12px; align-items: flex-start; }
.step-num { width: 24px; height: 24px; border-radius: 50%; background: #1d4ed8; color: white; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
.step-text { font-size: 13px; color: #374151; line-height: 1.5; }
.info-card { border: 1px solid #dbeafe; background: #eff6ff; }

/* Bottom nav */
.bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-top: 1px solid #e2e8f0; display: grid; grid-template-columns: repeat(4, 1fr); height: 64px; z-index: 100; box-shadow: 0 -4px 16px rgba(0,0,0,0.08); }
.nav-item { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; text-decoration: none; color: #94a3b8; transition: color .2s; }
.nav-item.active, .nav-item.router-link-active { color: #374151; }
.nav-ico { font-size: 20px; }
.nav-txt { font-size: 10px; font-weight: 600; }
</style>
