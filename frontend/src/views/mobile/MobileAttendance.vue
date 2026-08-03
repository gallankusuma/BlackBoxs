<template>
  <div class="mobile-app">
    <div class="topbar">
      <div>
        <div class="page-title">📋 Riwayat Absensi</div>
        <div class="page-sub">{{ emp?.name }} · {{ emp?.code }}</div>
      </div>
    </div>

    <!-- Month Picker -->
    <div class="month-nav">
      <button @click="prevMonth" class="mn-btn">◀</button>
      <div class="mn-label">{{ monthLabel }}</div>
      <button @click="nextMonth" class="mn-btn">▶</button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-box">
      <div class="spinner"></div>
      <div>Memuat data...</div>
    </div>

    <template v-else>
      <!-- Mini Calendar -->
      <div class="section-card cal-card">
        <div class="cal-grid">
          <div v-for="d in dayHeaders" :key="d" class="cal-head">{{ d }}</div>
          <div v-for="(cell, i) in calendarCells" :key="'c'+i"
            class="cal-cell"
            :class="cellClass(cell)"
            @click="cell.date && selectDate(cell)">
            <span v-if="cell.day">{{ cell.day }}</span>
          </div>
        </div>

        <!-- Legend -->
        <div class="cal-legend">
          <span class="leg"><i class="dot dot-hadir"></i>Hadir</span>
          <span class="leg"><i class="dot dot-telat"></i>Terlambat</span>
          <span class="leg"><i class="dot dot-absen"></i>Absen</span>
          <span class="leg"><i class="dot dot-today"></i>Hari Ini</span>
        </div>
      </div>

      <!-- Summary Stats -->
      <div class="stats-row">
        <div class="stat-box">
          <div class="stat-val green">{{ stats.hadir }}</div>
          <div class="stat-lbl">Hadir</div>
        </div>
        <div class="stat-box">
          <div class="stat-val amber">{{ stats.telat }}</div>
          <div class="stat-lbl">Terlambat</div>
        </div>
        <div class="stat-box">
          <div class="stat-val red">{{ stats.absen }}</div>
          <div class="stat-lbl">Absen</div>
        </div>
        <div class="stat-box">
          <div class="stat-val blue">{{ stats.totalJam }}</div>
          <div class="stat-lbl">Total Jam</div>
        </div>
      </div>

      <!-- Selected Day Detail -->
      <Transition name="slide">
        <div v-if="selectedLog" class="detail-card">
          <div class="detail-header">
            <div class="detail-date">{{ formatFullDate(selectedLog.date) }}</div>
            <button @click="selectedLog = null" class="detail-close">✕</button>
          </div>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="di-icon in">▲</span>
              <div>
                <div class="di-label">Check-In</div>
                <div class="di-val">{{ selectedLog.check_in || '—' }}</div>
              </div>
            </div>
            <div class="detail-item">
              <span class="di-icon out">▼</span>
              <div>
                <div class="di-label">Check-Out</div>
                <div class="di-val">{{ selectedLog.check_out || '—' }}</div>
              </div>
            </div>
            <div class="detail-item">
              <span class="di-icon dur">⏱</span>
              <div>
                <div class="di-label">Durasi</div>
                <div class="di-val">{{ calcDuration(selectedLog) }}</div>
              </div>
            </div>
            <div class="detail-item">
              <span class="di-icon loc">📍</span>
              <div>
                <div class="di-label">Lokasi GPS</div>
                <div class="di-val" v-if="selectedLog.gps_lat">
                  {{ Number(selectedLog.gps_lat).toFixed(5) }}, {{ Number(selectedLog.gps_lng).toFixed(5) }}
                  <span v-if="selectedLog.gps_verified" class="gps-ok">✓</span>
                  <span v-else class="gps-no">✗</span>
                </div>
                <div class="di-val" v-else>Tidak tersedia</div>
              </div>
            </div>
          </div>
          <div class="detail-status" :class="selectedLog.status === 'present' ? 'st-ok' : 'st-abs'">
            {{ selectedLog.status === 'present' ? '✅ Hadir' : '❌ Absen' }}
            <span v-if="isLate(selectedLog)" class="late-badge">Terlambat</span>
          </div>
        </div>
      </Transition>

      <!-- Attendance List -->
      <div class="section-card list-card">
        <div class="list-title">📅 Detail per Hari</div>
        <div v-if="monthLogs.length" class="log-list">
          <div v-for="log in monthLogs" :key="log.date" class="log-row" @click="selectDate(log)">
            <div class="log-badge" :class="logBadgeClass(log)">
              <div class="lb-day">{{ new Date(log.date + 'T00:00:00').getDate() }}</div>
              <div class="lb-dow">{{ getDow(log.date) }}</div>
            </div>
            <div class="log-info">
              <div class="log-times">
                <span class="lt-in">▲ {{ log.check_in || '—' }}</span>
                <span class="lt-sep">→</span>
                <span class="lt-out">▼ {{ log.check_out || '—' }}</span>
              </div>
              <div class="log-meta">
                {{ calcDuration(log) }}
                <span v-if="log.gps_verified" class="log-gps">📍</span>
                <span v-if="isLate(log)" class="log-late">Terlambat</span>
              </div>
            </div>
            <div class="log-ts" :class="log.timesheet_value >= 1 ? 'ts-full' : log.timesheet_value >= 0.5 ? 'ts-half' : 'ts-abs'">
              {{ log.timesheet_value >= 1 ? '✓' : log.timesheet_value >= 0.5 ? '½' : '✗' }}
            </div>
          </div>
        </div>
        <div v-else class="empty-list">
          <div class="empty-ico">📋</div>
          <div>Belum ada data absensi bulan ini</div>
        </div>
      </div>
    </template>

    <!-- Bottom nav -->
    <nav class="bottom-nav">
      <router-link to="/mobile/home" class="nav-item">
        <span class="nav-ico">🏠</span><span class="nav-txt">Beranda</span>
      </router-link>
      <router-link to="/mobile/attend" class="nav-item active">
        <span class="nav-ico">📋</span><span class="nav-txt">Absensi</span>
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
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

const router = useRouter();
const emp = ref<any>(null);
const allLogs = ref<any[]>([]);
const loading = ref(true);
const selectedLog = ref<any>(null);

const viewYear = ref(new Date().getFullYear());
const viewMonth = ref(new Date().getMonth()); // 0-indexed

const LATE_HOUR = 8; // 08:00 is the threshold

const dayHeaders = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const dowShort = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const monthLabel = computed(() => `${monthNames[viewMonth.value]} ${viewYear.value}`);

const monthLogs = computed(() => {
  const y = viewYear.value, m = viewMonth.value;
  return allLogs.value
    .filter(l => { const d = new Date(l.date); return d.getFullYear() === y && d.getMonth() === m; })
    .sort((a, b) => b.date.localeCompare(a.date));
});

// Calendar cells
const calendarCells = computed(() => {
  const y = viewYear.value, m = viewMonth.value;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const firstDay = new Date(y, m, 1).getDay(); // 0=Sun
  const todayStr = new Date().toISOString().slice(0, 10);
  const cells: any[] = [];

  // Empty cells
  for (let i = 0; i < firstDay; i++) cells.push({ day: 0, date: null });

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const log = allLogs.value.find(l => l.date === dateStr);
    const isToday = dateStr === todayStr;
    const dow = new Date(y, m, d).getDay();
    const isWeekend = dow === 0 || dow === 6;
    cells.push({ day: d, date: dateStr, log, isToday, isWeekend });
  }
  return cells;
});

// Stats
const stats = computed(() => {
  let hadir = 0, telat = 0, absen = 0, totalMin = 0;
  const todayStr = new Date().toISOString().slice(0, 10);
  const y = viewYear.value, m = viewMonth.value;
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = new Date(y, m, d).getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    if (dateStr > todayStr) continue; // skip future

    const log = allLogs.value.find(l => l.date === dateStr);
    if (log && log.check_in) {
      hadir++;
      if (isLate(log)) telat++;
      if (log.check_in && log.check_out) {
        const [h1, m1] = log.check_in.split(':').map(Number);
        const [h2, m2] = log.check_out.split(':').map(Number);
        totalMin += (h2 * 60 + m2) - (h1 * 60 + m1);
      }
    } else {
      absen++;
    }
  }
  return { hadir, telat, absen, totalJam: Math.round(totalMin / 60) };
});

function cellClass(cell: any) {
  if (!cell.day) return 'empty';
  if (cell.isToday) return 'today';
  if (cell.log?.check_in) return isLate(cell.log) ? 'late' : 'present';
  if (!cell.isWeekend && cell.date < new Date().toISOString().slice(0, 10)) return 'absent';
  if (cell.isWeekend) return 'weekend';
  return '';
}

function logBadgeClass(log: any) {
  if (log.check_in) return isLate(log) ? 'badge-late' : 'badge-ok';
  return 'badge-abs';
}

function isLate(log: any): boolean {
  if (!log?.check_in) return false;
  const [h, m] = log.check_in.split(':').map(Number);
  return (h * 60 + m) > (LATE_HOUR * 60);
}

function calcDuration(log: any): string {
  if (!log?.check_in || !log?.check_out) return '—';
  const [h1, m1] = log.check_in.split(':').map(Number);
  const [h2, m2] = log.check_out.split(':').map(Number);
  const dm = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (dm <= 0) return '—';
  return `${Math.floor(dm / 60)}j ${dm % 60}m`;
}

function getDow(dateStr: string) {
  return dowShort[new Date(dateStr + 'T00:00:00').getDay()];
}

function formatFullDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function selectDate(cell: any) {
  const dateStr = cell.date || cell.date;
  const log = allLogs.value.find(l => l.date === dateStr);
  if (log) {
    selectedLog.value = log;
  } else if (dateStr) {
    selectedLog.value = { date: dateStr, check_in: null, check_out: null, status: 'absent', gps_lat: null, gps_lng: null, gps_verified: false, timesheet_value: 0 };
  }
}

function prevMonth() {
  viewMonth.value--;
  if (viewMonth.value < 0) { viewMonth.value = 11; viewYear.value--; }
  fetchData();
}
function nextMonth() {
  viewMonth.value++;
  if (viewMonth.value > 11) { viewMonth.value = 0; viewYear.value++; }
  fetchData();
}

async function fetchData() {
  if (!emp.value?.id) return;
  loading.value = true;
  try {
    const res = await axios.get(`/api/hr/mobile/attendance/${emp.value.id}`, {
      params: { month: viewMonth.value + 1, year: viewYear.value }
    });
    // Normalize dates from ISO to YYYY-MM-DD for calendar matching
    allLogs.value = (res.data.data || []).map((l: any) => ({
      ...l,
      date: typeof l.date === 'string' ? l.date.slice(0, 10) : l.date,
      check_in: l.check_in ? l.check_in.slice(0, 5) : null,
      check_out: l.check_out ? l.check_out.slice(0, 5) : null,
    }));
  } catch { allLogs.value = []; }
  finally { loading.value = false; }
}

onMounted(async () => {
  const stored = localStorage.getItem('mobile_employee');
  if (!stored) { router.push('/mobile'); return; }
  emp.value = JSON.parse(stored);
  await fetchData();
});
</script>

<style scoped>
* { box-sizing: border-box; }
.mobile-app { min-height: 100dvh; background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding-bottom: 80px; }
.topbar { background: linear-gradient(135deg, #0f172a, #1e3a8a); padding: 52px 20px 20px; }
.page-title { color: white; font-size: 20px; font-weight: 800; }
.page-sub { color: #93c5fd; font-size: 12px; margin-top: 2px; }

/* Month nav */
.month-nav { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px 0; }
.mn-btn { width: 36px; height: 36px; border-radius: 10px; border: none; background: white; box-shadow: 0 2px 6px rgba(0,0,0,0.08); font-size: 14px; cursor: pointer; color: #374151; display: flex; align-items: center; justify-content: center; }
.mn-btn:active { transform: scale(0.94); }
.mn-label { font-size: 16px; font-weight: 700; color: #0f172a; }

/* Section card */
.section-card { background: white; margin: 14px 16px 0; border-radius: 16px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }

/* Calendar */
.cal-card { padding: 14px 10px 12px; }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
.cal-head { font-size: 10px; font-weight: 700; color: #94a3b8; text-align: center; padding: 4px 0; text-transform: uppercase; }
.cal-cell {
  aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  border-radius: 10px; font-size: 13px; font-weight: 500; color: #475569;
  cursor: pointer; transition: all .15s; position: relative;
}
.cal-cell:active { transform: scale(0.9); }
.cal-cell.empty { visibility: hidden; }
.cal-cell.today { background: #1d4ed8; color: white; font-weight: 800; box-shadow: 0 2px 8px rgba(29,78,216,0.35); }
.cal-cell.present { background: #dcfce7; color: #15803d; font-weight: 600; }
.cal-cell.late { background: #fef3c7; color: #92400e; font-weight: 600; }
.cal-cell.absent { background: #fee2e2; color: #b91c1c; font-weight: 600; }
.cal-cell.weekend { color: #d1d5db; }

.cal-legend { display: flex; gap: 12px; justify-content: center; margin-top: 10px; flex-wrap: wrap; }
.leg { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #64748b; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot-hadir { background: #22c55e; }
.dot-telat { background: #f59e0b; }
.dot-absen { background: #ef4444; }
.dot-today { background: #1d4ed8; }

/* Stats row */
.stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 14px 16px 0; }
.stat-box { background: white; border-radius: 14px; padding: 12px 8px; text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
.stat-val { font-size: 24px; font-weight: 800; }
.stat-val.green { color: #10b981; }
.stat-val.amber { color: #f59e0b; }
.stat-val.red { color: #ef4444; }
.stat-val.blue { color: #3b82f6; }
.stat-lbl { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .3px; margin-top: 2px; }

/* Detail card */
.detail-card { background: white; margin: 14px 16px 0; border-radius: 16px; padding: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); border: 2px solid #dbeafe; }
.detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.detail-date { font-size: 14px; font-weight: 700; color: #0f172a; }
.detail-close { background: #f1f5f9; border: none; width: 28px; height: 28px; border-radius: 8px; font-size: 14px; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
.detail-item { display: flex; gap: 8px; align-items: flex-start; }
.di-icon { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; }
.di-icon.in { background: #dcfce7; }
.di-icon.out { background: #fee2e2; }
.di-icon.dur { background: #e0e7ff; }
.di-icon.loc { background: #fef3c7; }
.di-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: .3px; }
.di-val { font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 1px; }
.gps-ok { color: #10b981; font-size: 11px; margin-left: 2px; }
.gps-no { color: #ef4444; font-size: 11px; margin-left: 2px; }
.detail-status { text-align: center; padding: 8px; border-radius: 10px; font-size: 13px; font-weight: 700; }
.st-ok { background: #dcfce7; color: #15803d; }
.st-abs { background: #fee2e2; color: #b91c1c; }
.late-badge { margin-left: 6px; background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 6px; font-size: 11px; }

/* Log list */
.list-card { margin-bottom: 20px; }
.list-title { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
.log-list { display: flex; flex-direction: column; gap: 6px; }
.log-row { display: flex; align-items: center; gap: 10px; padding: 10px; background: #f8fafc; border-radius: 12px; cursor: pointer; transition: background .15s; }
.log-row:active { background: #e2e8f0; }
.log-badge { width: 42px; height: 42px; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; }
.badge-ok { background: #dcfce7; }
.badge-late { background: #fef3c7; }
.badge-abs { background: #fee2e2; }
.lb-day { font-size: 16px; font-weight: 800; line-height: 1; color: #0f172a; }
.lb-dow { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: .3px; }
.log-info { flex: 1; min-width: 0; }
.log-times { font-size: 13px; font-weight: 600; color: #0f172a; display: flex; gap: 4px; align-items: center; }
.lt-in { color: #10b981; }
.lt-sep { color: #cbd5e1; font-size: 11px; }
.lt-out { color: #f59e0b; }
.log-meta { font-size: 11px; color: #94a3b8; margin-top: 2px; display: flex; gap: 6px; align-items: center; }
.log-gps { font-size: 10px; }
.log-late { color: #f59e0b; font-weight: 600; font-size: 10px; background: #fef3c7; padding: 1px 5px; border-radius: 4px; }
.log-ts { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
.ts-full { background: #dcfce7; color: #15803d; }
.ts-half { background: #fef3c7; color: #854d0e; }
.ts-abs { background: #fee2e2; color: #b91c1c; }

.empty-list { text-align: center; color: #94a3b8; padding: 32px 0; }
.empty-ico { font-size: 36px; margin-bottom: 8px; }

/* Loading */
.loading-box { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 0; color: #94a3b8; font-size: 13px; }
.spinner { width: 32px; height: 32px; border: 3px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Slide transition */
.slide-enter-active, .slide-leave-active { transition: all .25s ease; }
.slide-enter-from { opacity: 0; transform: translateY(-12px); }
.slide-leave-to { opacity: 0; transform: translateY(-12px); }

/* Bottom nav */
.bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-top: 1px solid #e2e8f0; display: grid; grid-template-columns: repeat(4, 1fr); height: 64px; box-shadow: 0 -4px 16px rgba(0,0,0,0.08); z-index: 100; }
.nav-item { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; text-decoration: none; color: #94a3b8; transition: color .2s; }
.nav-item.active, .nav-item.router-link-active { color: #3b82f6; }
.nav-ico { font-size: 20px; }
.nav-txt { font-size: 10px; font-weight: 600; }
</style>
