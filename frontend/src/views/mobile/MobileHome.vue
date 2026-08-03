<template>
  <div class="mobile-app">
    <!-- Top bar -->
    <div class="topbar">
      <div>
        <div class="greeting">{{ greeting }}, {{ emp?.name?.split(' ')[0] }} 👋</div>
        <div class="subgreeting">{{ emp?.position }} · {{ emp?.department }}</div>
      </div>
      <button @click="logout" class="logout-btn">Keluar</button>
    </div>

    <!-- Date & Time live -->
    <div class="datetime-card">
      <div class="date-big">{{ currentDate }}</div>
      <div class="time-big">{{ currentTime }}</div>
      <div class="date-sub">{{ dayName }}</div>
    </div>

    <!-- TODAY status -->
    <div class="status-row">
      <div class="status-chip" :class="todayLog?.check_in ? 'chip-in' : 'chip-none'">
        <span class="chip-ico">🟢</span>
        <div>
          <div class="chip-label">Check-In</div>
          <div class="chip-time">{{ todayLog?.check_in || '—' }}</div>
        </div>
      </div>
      <div class="status-chip" :class="todayLog?.check_out ? 'chip-out' : 'chip-none'">
        <span class="chip-ico">🔴</span>
        <div>
          <div class="chip-label">Check-Out</div>
          <div class="chip-time">{{ todayLog?.check_out || '—' }}</div>
        </div>
      </div>
    </div>

    <!-- Main action buttons -->
    <div class="action-grid">
      <button class="action-btn btn-in" @click="doCheckin('in')" :disabled="checking || !!todayLog?.check_in">
        <div class="action-ico">{{ checking && checkType==='in' ? '⏳' : '👆' }}</div>
        <div class="action-label">{{ checking && checkType==='in' ? 'Verifikasi...' : 'CHECK IN' }}</div>
        <div class="action-sub">Sidik jari + GPS</div>
      </button>
      <button class="action-btn btn-out" @click="doCheckin('out')" :disabled="checking || !todayLog?.check_in || !!todayLog?.check_out">
        <div class="action-ico">{{ checking && checkType==='out' ? '⏳' : '👆' }}</div>
        <div class="action-label">{{ checking && checkType==='out' ? 'Verifikasi...' : 'CHECK OUT' }}</div>
        <div class="action-sub">Sidik jari + GPS</div>
      </button>
    </div>

    <!-- Toast notification -->
    <Transition name="toast">
      <div v-if="toast" class="toast" :class="toastType">{{ toast }}</div>
    </Transition>

    <!-- Monthly summary -->
    <div class="section-card">
      <div class="section-title">📊 Ringkasan Bulan Ini</div>
      <div class="summary-grid">
        <div class="sum-item">
          <div class="sum-val blue">{{ summary?.total_days || 0 }}</div>
          <div class="sum-label">Hari Kerja</div>
        </div>
        <div class="sum-item">
          <div class="sum-val green">{{ workdays }}</div>
          <div class="sum-label">Hari Kerja Seharusnya</div>
        </div>
        <div class="sum-item">
          <div class="sum-val purple">{{ attendancePct }}%</div>
          <div class="sum-label">Kehadiran</div>
        </div>
      </div>
    </div>

    <!-- Recent log -->
    <div class="section-card" style="margin-bottom:100px">
      <div class="section-title">📅 Log Absensi Terbaru</div>
      <div class="log-list">
        <div v-for="log in recentLogs" :key="log.date" class="log-item">
          <div class="log-date">{{ formatDate(log.date) }}</div>
          <div class="log-times">
            <span class="log-in">▲ {{ log.check_in || '—' }}</span>
            <span class="log-out">▼ {{ log.check_out || '—' }}</span>
          </div>
          <div class="log-ts" :class="log.timesheet_value>=1?'ts-full':log.timesheet_value>=0.5?'ts-half':'ts-absent'">
            {{ log.timesheet_value >= 1 ? '✓' : log.timesheet_value >= 0.5 ? '½' : '✗' }}
          </div>
        </div>
        <div v-if="!recentLogs.length" class="empty-log">Belum ada absensi bulan ini</div>
      </div>
    </div>

    <!-- Bottom nav -->
    <nav class="bottom-nav">
      <router-link to="/mobile/home" class="nav-item active">
        <span class="nav-ico">🏠</span><span class="nav-txt">Beranda</span>
      </router-link>
      <router-link to="/mobile/attend" class="nav-item">
        <span class="nav-ico">📋</span><span class="nav-txt">Absensi</span>
      </router-link>
      <router-link to="/mobile/material-request" class="nav-item">
        <span class="nav-ico">📦</span><span class="nav-txt">Material</span>
      </router-link>
      <router-link to="/mobile/payslip" class="nav-item">
        <span class="nav-ico">💰</span><span class="nav-txt">Slip Gaji</span>
      </router-link>
      <router-link to="/mobile/settings" class="nav-item">
        <span class="nav-ico">⚙️</span><span class="nav-txt">Pengaturan</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { mobileApi, setMobileToken } from '../../lib/mobileApi';

const router = useRouter();
const emp       = ref<any>(null);
const todayLog  = ref<any>(null);
const summary   = ref<any>(null);
const recentLogs = ref<any[]>([]);
const checking  = ref(false);
const checkType = ref('');
const toast     = ref('');
const toastType = ref('success');
let toastTimer: any = null;
let clockTimer: any = null;

const now = ref(new Date());
const currentTime = computed(() => now.value.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
const currentDate = computed(() => now.value.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }));
const dayName = computed(() => now.value.toLocaleDateString('id-ID', { weekday: 'long' }));
const greeting = computed(() => {
  const h = now.value.getHours();
  return h < 12 ? 'Selamat Pagi' : h < 15 ? 'Selamat Siang' : h < 18 ? 'Selamat Sore' : 'Selamat Malam';
});
const workdays = computed(() => {
  const d = new Date(); let count = 0;
  for (let i = 1; i <= d.getDate(); i++) {
    const day = new Date(d.getFullYear(), d.getMonth(), i).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
});
const attendancePct = computed(() => {
  if (!workdays.value) return 0;
  return Math.round(((summary.value?.total_days || 0) / workdays.value) * 100);
});

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
}

async function loadAttendance() {
  if (!emp.value?.id) return;
  const res = await mobileApi.get(`/api/hr/mobile/attendance/${emp.value.id}`);
  todayLog.value = res.data.today;
  summary.value = res.data.summary;
  recentLogs.value = res.data.data?.slice(0, 7) || [];
}

async function doCheckin(type: string) {
  checking.value = true; checkType.value = type;
  try {
    // 1. Get auth options from server
    const optRes = await axios.post('/api/webauthn/auth/options', { employee_id: emp.value.id });
    const options = optRes.data;

    // 2. Convert challenge
    options.challenge = base64urlToBuffer(options.challenge);
    if (options.allowCredentials) {
      options.allowCredentials = options.allowCredentials.map((c: any) => ({
        ...c, id: base64urlToBuffer(c.id),
      }));
    }

    // 3. Trigger fingerprint scan 👆
    const credential = await navigator.credentials.get({ publicKey: options }) as PublicKeyCredential;
    if (!credential) throw new Error('Dibatalkan');

    // 4. Get GPS
    let lat: number|null = null, lng: number|null = null;
    try {
      const pos: any = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, enableHighAccuracy: true })
      );
      lat = pos.coords.latitude; lng = pos.coords.longitude;
    } catch { showToast('⚠️ GPS tidak tersedia, absen ditolak', 'error'); return; }

    // 5. Verify fingerprint + GPS + auto check-in/out at server
    const authResp = credentialToJSON(credential);
    const verifyRes = await axios.post('/api/webauthn/auth/verify', {
      employee_id: emp.value.id,
      auth_response: authResp,
      latitude: lat, longitude: lng,
      type,
    });

    // Absen sidik jari juga memperbarui token — perpanjang sesi selama HP aktif dipakai
    if (verifyRes.data.token) setMobileToken(verifyRes.data.token);

    showToast(verifyRes.data.checkin?.message || '✅ Berhasil!', 'success');
    await loadAttendance();
  } catch (e: any) {
    const msg = e?.response?.data?.error || e?.message || 'Gagal';
    if (e?.name === 'NotAllowedError') showToast('Scan sidik jari dibatalkan', 'error');
    else showToast(msg, 'error');
  } finally {
    checking.value = false; checkType.value = '';
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
  let str = '';
  new Uint8Array(buf).forEach(b => str += String.fromCharCode(b));
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

function showToast(msg: string, type: string) {
  toast.value = msg; toastType.value = type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ''; }, 3500);
}

function logout() {
  localStorage.removeItem('mobile_employee');
  router.push('/mobile');
}

onMounted(async () => {
  const stored = localStorage.getItem('mobile_employee');
  if (!stored) { router.push('/mobile'); return; }
  emp.value = JSON.parse(stored);
  // Handle toast from fingerprint login
  const storedToast = localStorage.getItem('mobile_toast');
  if (storedToast) {
    try {
      const t = JSON.parse(storedToast);
      showToast(t.msg, t.type);
      localStorage.removeItem('mobile_toast');
    } catch {}
  }
  await loadAttendance();
  clockTimer = setInterval(() => { now.value = new Date(); }, 1000);
});
onUnmounted(() => { clearInterval(clockTimer); clearTimeout(toastTimer); });
</script>

<style scoped>
* { box-sizing: border-box; }
.mobile-app { min-height: 100dvh; background: #f1f5f9; display: flex; flex-direction: column; gap: 12px; padding: 0 0 80px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.topbar { background: linear-gradient(135deg, #0f172a, #1e3a8a); padding: 52px 20px 20px; display: flex; justify-content: space-between; align-items: flex-start; }
.greeting { color: white; font-size: 18px; font-weight: 700; }
.subgreeting { color: #93c5fd; font-size: 12px; margin-top: 2px; }
.logout-btn { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
.datetime-card { background: linear-gradient(135deg, #0f172a, #1e3a8a); margin: -4px 16px 0; border-radius: 16px; padding: 20px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
.date-big { color: #93c5fd; font-size: 14px; }
.time-big { color: white; font-size: 48px; font-weight: 800; letter-spacing: -1px; line-height: 1; }
.date-sub { color: #64748b; font-size: 13px; margin-top: 4px; color: #94a3b8; }
.status-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 0 16px; }
.status-chip { background: white; border-radius: 14px; padding: 14px; display: flex; align-items: center; gap: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 2px solid transparent; }
.chip-in { border-color: #86efac; background: #f0fdf4; }
.chip-out { border-color: #fca5a5; background: #fff1f2; }
.chip-ico { font-size: 22px; }
.chip-label { font-size: 10px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .5px; }
.chip-time { font-size: 18px; font-weight: 800; color: #0f172a; }
.action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 0 16px; }
.action-btn { border: none; border-radius: 20px; padding: 24px 16px; cursor: pointer; transition: all .2s; box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }
.action-btn:not(:disabled):active { transform: scale(0.96); }
.btn-in { background: linear-gradient(135deg, #10b981, #059669); color: white; }
.btn-out { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; }
.action-ico { font-size: 32px; margin-bottom: 8px; }
.action-label { font-size: 16px; font-weight: 800; letter-spacing: 0.5px; }
.action-sub { font-size: 11px; opacity: 0.8; margin-top: 2px; }
.toast { position: fixed; top: 24px; left: 50%; transform: translateX(-50%); padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 600; z-index: 999; box-shadow: 0 8px 24px rgba(0,0,0,0.2); white-space: nowrap; }
.toast.success { background: #10b981; color: white; }
.toast.error { background: #ef4444; color: white; }
.toast-enter-active, .toast-leave-active { transition: all .3s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-16px); }
.section-card { background: white; margin: 0 16px; border-radius: 16px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.section-title { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 14px; }
.summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.sum-item { text-align: center; }
.sum-val { font-size: 26px; font-weight: 800; }
.sum-val.blue { color: #3b82f6; }
.sum-val.green { color: #10b981; }
.sum-val.purple { color: #8b5cf6; }
.sum-label { font-size: 10px; color: #64748b; margin-top: 2px; }
.log-list { display: flex; flex-direction: column; gap: 8px; }
.log-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
.log-date { flex: 1; font-size: 13px; font-weight: 600; color: #374151; }
.log-times { font-size: 12px; color: #64748b; display: flex; gap: 8px; }
.log-in { color: #10b981; }
.log-out { color: #f59e0b; }
.log-ts { width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
.ts-full { background: #dcfce7; color: #15803d; }
.ts-half { background: #fef9c3; color: #854d0e; }
.ts-absent { background: #fee2e2; color: #b91c1c; }
.empty-log { text-align: center; color: #94a3b8; font-size: 13px; padding: 20px 0; }
.bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-top: 1px solid #e2e8f0; display: grid; grid-template-columns: repeat(5, 1fr); height: 64px; box-shadow: 0 -4px 16px rgba(0,0,0,0.08); z-index: 100; }
.nav-item { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; text-decoration: none; color: #94a3b8; transition: color .2s; }
.nav-item.active, .nav-item.router-link-active { color: #3b82f6; }
.nav-ico { font-size: 22px; }
.nav-txt { font-size: 10px; font-weight: 600; }
</style>
