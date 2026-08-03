<template>
  <div class="space-y-5">
    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-xl font-bold text-gray-900">💳 Payment Schedule</h1>
        <p class="text-xs text-gray-500 mt-0.5">Monitor jadwal pembayaran & cashflow plan dari PO, Expense, dan Invoice</p>
      </div>
      <div class="flex items-center gap-2">
        <button @click="exportCSV" class="flex items-center gap-1.5 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-gray-700">
          📥 Export
        </button>
        <button @click="generateFundRequests" :disabled="selectedItems.length === 0" class="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
          ⚡ Generate Fund Request ({{ selectedItems.length }})
        </button>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
      <div class="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
        <div class="text-xs text-gray-400 mb-1">Total Planned</div>
        <div class="font-bold text-gray-800 text-sm">{{ fmt(summary.total_planned) }}</div>
      </div>
      <div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 shadow-sm">
        <div class="text-xs text-amber-600 mb-1">Due Soon (7d)</div>
        <div class="font-bold text-amber-700 text-sm">{{ fmt(summary.due_soon) }}</div>
      </div>
      <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 shadow-sm">
        <div class="text-xs text-red-500 mb-1">Overdue</div>
        <div class="font-bold text-red-700 text-sm">{{ fmt(summary.overdue) }}</div>
      </div>
      <div class="bg-green-50 border border-green-200 rounded-xl px-4 py-3 shadow-sm">
        <div class="text-xs text-green-600 mb-1">Paid</div>
        <div class="font-bold text-green-700 text-sm">{{ fmt(summary.paid) }}</div>
      </div>
      <div class="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 shadow-sm">
        <div class="text-xs text-blue-600 mb-1">Remaining</div>
        <div class="font-bold text-blue-700 text-sm">{{ fmt(summary.remaining) }}</div>
      </div>
    </div>

    <!-- Filters & Period Toggle -->
    <div class="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
      <!-- Period toggle -->
      <div class="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
        <button v-for="p in periodOptions" :key="p"
          @click="period = p; fetchSchedules()"
          :class="period === p ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'"
          class="px-3 py-1.5 capitalize transition-colors border-r last:border-0 border-gray-200">
          {{ p === 'daily' ? 'Harian' : p === 'weekly' ? 'Mingguan' : 'Bulanan' }}
        </button>
      </div>

      <!-- Month/Year picker -->
      <div class="flex items-center gap-2">
        <button @click="prevMonth" class="p-1.5 rounded hover:bg-gray-100 text-gray-500">◀</button>
        <span class="text-sm font-semibold text-gray-700 min-w-[120px] text-center">{{ monthLabel }}</span>
        <button @click="nextMonth" class="p-1.5 rounded hover:bg-gray-100 text-gray-500">▶</button>
      </div>

      <!-- Project filter -->
      <select v-model="filterProject" @change="fetchSchedules()" class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 min-w-[180px]">
        <option value="">Semua Project</option>
        <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.project_name }}</option>
      </select>

      <!-- Status filter -->
      <select v-model="filterStatus" @change="fetchSchedules()" class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700">
        <option value="">Semua Status</option>
        <option value="open">Open</option>
        <option value="requested">Requested (FR Dibuat)</option>
        <option value="partial">Partial</option>
        <option value="paid">Paid</option>
        <option value="overdue">Overdue</option>
      </select>

      <!-- Source filter -->
      <select v-model="filterSource" @change="fetchSchedules()" class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700">
        <option value="">Semua Sumber</option>
        <option value="po">PO</option>
        <option value="expense">Expense</option>
        <option value="invoice">Invoice (AP)</option>
        <option value="kasbon">Kasbon</option>
        <option value="payroll">Payroll (Gaji)</option>
      </select>

      <span class="ml-auto text-xs text-gray-400">{{ scheduleRows.length }} item</span>
    </div>

    <!-- Timeline Grid -->
    <div class="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div v-if="loading" class="text-center py-16 text-gray-400">
        <div class="text-4xl mb-3 animate-pulse">📅</div>
        <div class="text-sm">Memuat jadwal pembayaran...</div>
      </div>
      <div v-else-if="scheduleRows.length === 0" class="text-center py-16 text-gray-400">
        <div class="text-4xl mb-3">📋</div>
        <div class="text-sm">Tidak ada jadwal pembayaran untuk periode ini</div>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="min-w-full">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200">
              <th class="sticky left-0 bg-gray-50 z-10 px-3 py-2 w-6">
                <input type="checkbox" @change="toggleSelectAll" class="rounded" />
              </th>
              <th class="sticky left-9 bg-gray-50 z-10 px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap min-w-[220px]">Deskripsi</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap min-w-[100px]">Vendor</th>
              <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
              <th class="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              <!-- Period columns -->
              <th v-for="col in periodCols" :key="col.key"
                class="px-2 py-2 text-center text-xs font-semibold text-gray-400 whitespace-nowrap border-l border-gray-100 min-w-[80px]"
                :class="col.isToday ? 'bg-blue-50 text-blue-600' : ''">
                {{ col.label }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-for="row in scheduleRows" :key="row.id" class="hover:bg-gray-50 transition-colors">
              <td class="sticky left-0 bg-white px-3 py-3 z-10">
                <input type="checkbox" :value="row.id" v-model="selectedItems" class="rounded"
                :disabled="row.status === 'paid' || row.status === 'requested'" />
              </td>
              <td class="sticky left-9 bg-white px-3 py-3 z-10">
                <div class="text-sm font-semibold text-gray-800">{{ row.label }}</div>
                <div class="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
                  <span :class="sourceChip(row.source)">{{ row.source.toUpperCase() }}</span>
                  <span>{{ row.ref_number }}</span>
                </div>
              </td>
              <td class="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">{{ row.vendor_name || '—' }}</td>
              <td class="px-3 py-3 text-right font-semibold text-gray-800 text-sm whitespace-nowrap">{{ fmt(row.amount) }}</td>
              <td class="px-3 py-3 text-center">
                <span :class="statusChip(row.status)" class="text-xs px-2 py-0.5 rounded-full font-semibold capitalize">{{ row.status }}</span>
              </td>
              <!-- Amount cells per period -->
              <td v-for="col in periodCols" :key="col.key"
                class="px-2 py-3 text-center border-l border-gray-50"
                :class="col.isToday ? 'bg-blue-50' : ''">
                <div v-if="row.period_map[col.key]"
                  class="inline-block text-xs font-bold px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 transition"
                  :class="cellClass(row, col.key)"
                  @click="openDetail(row)">
                  {{ fmtShort(row.period_map[col.key]) }}
                </div>
              </td>
            </tr>
          </tbody>
          <!-- Totals row -->
          <tfoot>
            <tr class="bg-gray-50 border-t-2 border-gray-200 font-bold">
              <td class="sticky left-0 bg-gray-50 z-10 px-3 py-2"></td>
              <td class="sticky left-9 bg-gray-50 z-10 px-3 py-2 text-xs font-bold text-gray-700 uppercase">TOTAL PERIODE</td>
              <td class="px-3 py-2"></td>
              <td class="px-3 py-2 text-right text-sm font-bold text-gray-800">{{ fmt(grandTotal) }}</td>
              <td class="px-3 py-2"></td>
              <td v-for="col in periodCols" :key="col.key"
                class="px-2 py-2 text-center text-xs font-bold border-l border-gray-100"
                :class="col.isToday ? 'bg-blue-50 text-blue-700' : 'text-gray-700'">
                {{ periodTotals[col.key] ? fmtShort(periodTotals[col.key]) : '' }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- Cashflow Chart -->
    <div class="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-gray-800">📈 Cashflow Plan</h3>
        <span class="text-xs text-gray-400">{{ monthLabel }}</span>
      </div>
      <div v-if="periodCols.length === 0" class="text-center py-8 text-gray-400 text-sm">Tidak ada data cashflow</div>
      <div v-else class="relative" style="height: 200px;">
        <!-- Simple bar chart using CSS -->
        <div class="flex items-end gap-1 h-full pb-6">
          <div v-for="col in periodCols" :key="col.key"
            class="flex-1 flex flex-col items-center justify-end gap-0.5 group">
            <div class="text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition whitespace-nowrap absolute -translate-y-6"
              style="font-size:10px">
              {{ periodTotals[col.key] ? fmtShort(periodTotals[col.key]) : '' }}
            </div>
            <div
              :style="{ height: barHeight(col.key) }"
              :class="col.isToday ? 'bg-blue-500' : 'bg-indigo-400 hover:bg-indigo-500'"
              class="w-full rounded-t transition-all duration-300 min-h-[2px] cursor-pointer"
              :title="`${col.label}: ${fmtShort(periodTotals[col.key] || 0)}`">
            </div>
            <div class="text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis w-full text-center" style="font-size:9px">
              {{ col.shortLabel }}
            </div>
          </div>
        </div>
      </div>
      <!-- Legend -->
      <div class="flex items-center gap-4 mt-2 text-xs text-gray-500">
        <div class="flex items-center gap-1.5"><div class="w-3 h-3 rounded bg-indigo-400"></div> Planned</div>
        <div class="flex items-center gap-1.5"><div class="w-3 h-3 rounded bg-blue-500"></div> Today</div>
      </div>
    </div>

    <!-- Detail Modal -->
    <Teleport to="body">
      <div v-if="detailRow" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="closeDetail">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          <div class="flex items-center justify-between px-6 py-4 border-b">
            <h4 class="font-bold text-gray-800">Detail Jadwal Pembayaran</h4>
            <button @click="closeDetail" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
          <div class="p-6 space-y-4">
            <!-- Info -->
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div><span class="text-gray-400 text-xs">Referensi</span><div class="font-semibold">{{ detailRow.ref_number }}</div></div>
              <div><span class="text-gray-400 text-xs">Sumber</span><div class="font-semibold uppercase">{{ detailRow.source }}</div></div>
              <div><span class="text-gray-400 text-xs">Vendor</span><div class="font-semibold">{{ detailRow.vendor_name || '—' }}</div></div>
              <div><span class="text-gray-400 text-xs">Status</span><div><span :class="statusChip(detailRow.status)" class="text-xs px-2 py-0.5 rounded-full font-semibold capitalize">{{ detailRow.status }}</span></div></div>
              <div><span class="text-gray-400 text-xs">Amount</span><div class="font-bold text-blue-700">{{ fmt(detailRow.amount) }}</div></div>
              <div><span class="text-gray-400 text-xs">Due Date Saat Ini</span><div class="font-semibold text-gray-800">{{ fmtDate(detailRow.due_date) }}</div></div>
            </div>

            <!-- Reschedule form (only for non-paid) -->
            <div v-if="detailRow.status !== 'paid'" class="border border-amber-200 bg-amber-50 rounded-xl p-4">
              <div class="text-xs font-bold text-amber-700 mb-3">📅 Geser Jadwal Pembayaran</div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-xs text-gray-500 block mb-1">Due Date Baru *</label>
                  <input type="date" v-model="rescheduleForm.due_date"
                    class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label class="text-xs text-gray-500 block mb-1">Jumlah (opsional)</label>
                  <input type="number" v-model.number="rescheduleForm.amount" :placeholder="String(detailRow.amount)"
                    class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div class="col-span-2">
                  <label class="text-xs text-gray-500 block mb-1">Alasan / Catatan</label>
                  <input v-model="rescheduleForm.notes" placeholder="cth: Permintaan vendor, menunggu invoice..."
                    class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
              </div>
              <button @click="saveReschedule" :disabled="!rescheduleForm.due_date || rescheduling"
                class="mt-3 w-full py-2 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-40 transition">
                {{ rescheduling ? 'Menyimpan...' : '💾 Simpan Perubahan Jadwal' }}
              </button>
            </div>

            <!-- Actions -->
            <div class="flex gap-2">
              <button v-if="detailRow.status !== 'paid'" @click="markPaid(detailRow); closeDetail()"
                class="flex-1 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700">
                ✓ Tandai Lunas
              </button>
              <button v-if="detailRow.status !== 'paid'" @click="genFundReqSingle(detailRow); closeDetail()"
                class="flex-1 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">
                ⚡ Buat Fund Request
              </button>
            </div>

            <!-- Payment Proof Upload -->
            <div class="border border-gray-200 rounded-xl overflow-hidden">
              <div class="px-4 py-3 bg-gray-50 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-sm">📎</span>
                  <span class="text-xs font-bold text-gray-700">Bukti Bayar / Transfer</span>
                </div>
                <label
                  class="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition"
                  :class="proofUploading ? 'opacity-50 pointer-events-none' : ''"
                >
                  <span>{{ proofUploading ? '⏳' : '📤' }}</span>
                  {{ proofUploading ? 'Uploading...' : 'Upload File' }}
                  <input type="file" class="hidden" accept="image/*,.pdf,.jpg,.jpeg,.png,.webp"
                    @change="uploadProof($event)" :disabled="proofUploading" />
                </label>
              </div>

              <!-- Loading -->
              <div v-if="proofLoading" class="px-4 py-6 text-center text-gray-400 text-xs">Memuat...</div>

              <!-- Empty -->
              <div v-else-if="proofFiles.length === 0" class="px-4 py-6 text-center text-gray-400 text-xs">
                Belum ada bukti bayar. Klik "Upload File" untuk menambahkan.
              </div>

              <!-- Proof list -->
              <div v-else class="divide-y divide-gray-100">
                <div v-for="pf in proofFiles" :key="pf.id" class="px-4 py-3 flex items-center gap-3">
                  <!-- Thumbnail or icon -->
                  <div class="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                    <img v-if="pf.file_type?.startsWith('image/')"
                      :src="apiBase + pf.file_path"
                      class="w-full h-full object-cover" />
                    <span v-else class="text-xl">📄</span>
                  </div>
                  <!-- Info -->
                  <div class="flex-1 min-w-0">
                    <a :href="apiBase + pf.file_path" target="_blank"
                      class="text-xs font-semibold text-blue-600 hover:underline truncate block">
                      {{ pf.original_name }}
                    </a>
                    <div class="text-[10px] text-gray-400 mt-0.5">
                      {{ fmtSize(pf.file_size) }} · {{ pf.uploaded_by_name || 'System' }} · {{ fmtDate(pf.created_at) }}
                    </div>
                  </div>
                  <!-- Delete -->
                  <button @click="deleteProof(pf)" class="text-red-400 hover:text-red-600 text-lg shrink-0" title="Hapus">&times;</button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/lib/api';
import { useRouter } from 'vue-router';

const router = useRouter();

// State
const loading    = ref(false);
const period     = ref<'daily'|'weekly'|'monthly'>('monthly');
const periodOptions = ['daily', 'weekly', 'monthly'] as const;
const viewYear   = ref(new Date().getFullYear());
const viewMonth  = ref(new Date().getMonth()); // 0-indexed
const filterProject = ref('');
const filterStatus  = ref('');
const filterSource  = ref('');
const projects   = ref<any[]>([]);
const scheduleRows = ref<any[]>([]);
const selectedItems = ref<number[]>([]);
const detailRow  = ref<any>(null);
const rescheduleForm = ref({ due_date: '', amount: 0, notes: '' });
const rescheduling = ref(false);

// Payment proof state
const proofFiles = ref<any[]>([]);
const proofLoading = ref(false);
const proofUploading = ref(false);
const apiBase = (api.defaults.baseURL || '').replace('/api', '');

function closeDetail() { detailRow.value = null; proofFiles.value = []; }

// Summary
const summary = ref({ total_planned: 0, due_soon: 0, overdue: 0, paid: 0, remaining: 0 });

// Month navigation
const monthLabel = computed(() => {
  const d = new Date(viewYear.value, viewMonth.value, 1);
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
});
function prevMonth() {
  if (viewMonth.value === 0) { viewMonth.value = 11; viewYear.value--; }
  else viewMonth.value--;
  fetchSchedules();
}
function nextMonth() {
  if (viewMonth.value === 11) { viewMonth.value = 0; viewYear.value++; }
  else viewMonth.value++;
  fetchSchedules();
}

// Period columns
const periodCols = computed(() => {
  const today = new Date();
  const cols: { key: string; label: string; shortLabel: string; isToday: boolean }[] = [];
  const y = viewYear.value;
  const m = viewMonth.value;

  if (period.value === 'daily') {
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday = today.getFullYear()===y && today.getMonth()===m && today.getDate()===d;
      cols.push({ key, label: String(d), shortLabel: String(d), isToday });
    }
  } else if (period.value === 'weekly') {
    const start = new Date(y, m, 1);
    let week = 1;
    let cur = new Date(start);
    while (cur.getMonth() === m) {
      const wEnd = new Date(cur); wEnd.setDate(wEnd.getDate() + 6);
      const key = `W${week}-${y}-${m+1}`;
      const isToday = today >= cur && today <= wEnd && today.getMonth() === m;
      cols.push({ key, label: `W${week} (${cur.getDate()}–${Math.min(wEnd.getDate(), new Date(y,m+1,0).getDate())})`, shortLabel: `W${week}`, isToday });
      cur.setDate(cur.getDate() + 7);
      week++;
    }
  } else {
    // monthly — show 12 months
    for (let mo = 0; mo < 12; mo++) {
      const key = `${y}-${String(mo+1).padStart(2,'0')}`;
      const isToday = today.getFullYear()===y && today.getMonth()===mo;
      const label = new Date(y, mo, 1).toLocaleDateString('id-ID', { month: 'short' });
      cols.push({ key, label, shortLabel: label, isToday });
    }
  }
  return cols;
});

// Period totals for chart
const periodTotals = computed(() => {
  const totals: Record<string,number> = {};
  for (const row of scheduleRows.value) {
    for (const [k, v] of Object.entries(row.period_map || {})) {
      totals[k] = (totals[k] || 0) + Number(v);
    }
  }
  return totals;
});
const grandTotal = computed(() => scheduleRows.value.reduce((s,r) => s + Number(r.amount||0), 0));
const maxPeriodTotal = computed(() => Math.max(...Object.values(periodTotals.value).map(Number), 1));

function barHeight(key: string): string {
  const v = periodTotals.value[key] || 0;
  const pct = Math.round((v / maxPeriodTotal.value) * 100);
  return `${Math.max(pct, v > 0 ? 4 : 0)}%`;
}

// Fetch
async function fetchSchedules() {
  loading.value = true;
  try {
    const res = await api.get('/finance/payment-schedule', {
      params: {
        year: viewYear.value,
        month: viewMonth.value + 1,
        period: period.value,
        project_id: filterProject.value || undefined,
        status: filterStatus.value || undefined,
        source: filterSource.value || undefined,
      }
    });
    scheduleRows.value = res.data?.data || [];
    summary.value      = res.data?.summary || { total_planned:0, due_soon:0, overdue:0, paid:0, remaining:0 };
  } catch { scheduleRows.value = []; }
  finally { loading.value = false; }
}

async function fetchProjects() {
  try {
    const res = await api.get('/projects?limit=200');
    projects.value = res.data?.data || res.data || [];
  } catch { projects.value = []; }
}

// Helpers
const fmt = (n: any) => 'Rp ' + Number(n||0).toLocaleString('id-ID');
const fmtShort = (n: any) => {
  const v = Number(n||0);
  if (v >= 1_000_000_000) return `${(v/1_000_000_000).toFixed(1)}M`;
  if (v >= 1_000_000) return `${(v/1_000_000).toFixed(1)}jt`;
  if (v >= 1_000) return `${(v/1_000).toFixed(0)}k`;
  return String(v);
};
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) : '—';

function statusChip(s: string) {
  return {
    open:      'bg-blue-100 text-blue-700',
    requested: 'bg-purple-100 text-purple-700',
    partial:   'bg-amber-100 text-amber-700',
    paid:      'bg-green-100 text-green-700',
    overdue:   'bg-red-100 text-red-700',
  }[s] || 'bg-gray-100 text-gray-600';
}
function sourceChip(s: string) {
  return {
    po:      'bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-xs font-semibold',
    expense: 'bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded text-xs font-semibold',
    invoice: 'bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-xs font-semibold',
    kasbon:  'bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-xs font-semibold',
    payroll: 'bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-xs font-semibold',
  }[s] || 'bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs font-semibold';
}
function cellClass(row: any, key: string) {
  if (row.status === 'paid') return 'bg-green-100 text-green-700';
  const today = new Date().toISOString().slice(0,10);
  if (key < today) return 'bg-red-100 text-red-700';
  if (key === today) return 'bg-blue-500 text-white';
  return 'bg-indigo-100 text-indigo-700';
}

// Actions
function toggleSelectAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  selectedItems.value = checked ? scheduleRows.value.filter(r => r.status !== 'paid').map(r => r.id) : [];
}

function openDetail(row: any) {
  detailRow.value = row;
  rescheduleForm.value = {
    due_date: row.due_date ? new Date(row.due_date).toISOString().slice(0,10) : new Date().toISOString().slice(0,10),
    amount: Number(row.amount || 0),
    notes: '',
  };
  fetchProofs(row);
}

async function fetchProofs(row: any) {
  proofLoading.value = true;
  proofFiles.value = [];
  try {
    const res = await api.get(`/finance/payment-schedule/${row.id}/proofs`, { params: { source: row.source || 'po' } });
    proofFiles.value = res.data?.data || [];
  } catch { proofFiles.value = []; }
  finally { proofLoading.value = false; }
}

async function uploadProof(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !detailRow.value) return;
  proofUploading.value = true;
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('source', detailRow.value.source || 'po');
    await api.post(`/finance/payment-schedule/${detailRow.value.id}/proof`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    await fetchProofs(detailRow.value);
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Gagal upload bukti bayar');
  } finally {
    proofUploading.value = false;
    input.value = ''; // reset file input
  }
}

async function deleteProof(pf: any) {
  if (!confirm(`Hapus bukti bayar "${pf.original_name}"?`)) return;
  try {
    await api.delete(`/finance/payment-schedule/proof/${pf.id}`);
    proofFiles.value = proofFiles.value.filter((f: any) => f.id !== pf.id);
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Gagal hapus');
  }
}

const fmtSize = (bytes: number) => {
  if (!bytes) return '0 B';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
};

async function saveReschedule() {
  if (!detailRow.value || !rescheduleForm.value.due_date) return;
  rescheduling.value = true;
  try {
    await api.patch(`/finance/payment-schedule/${detailRow.value.id}/reschedule`, {
      source: detailRow.value.source,
      due_date: rescheduleForm.value.due_date,
      amount: rescheduleForm.value.amount || undefined,
      notes: rescheduleForm.value.notes || undefined,
    });
    alert(`✅ Jadwal diperbarui ke ${rescheduleForm.value.due_date}`);
    closeDetail();
    await fetchSchedules();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal update jadwal');
  } finally {
    rescheduling.value = false;
  }
}

async function markPaid(row: any) {
  try {
    await api.patch(`/finance/payment-schedule/${row.id}/paid`, { source: row.source });
    await fetchSchedules();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal update status');
  }
}

async function genFundReqSingle(row: any) {
  try {
    await api.post('/finance/payment-schedule/generate-fund-request', { ids: [row.id] });
    alert('✅ Fund Request berhasil dibuat! Cek menu Fund Requests.');
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal membuat Fund Request');
  }
}

async function generateFundRequests() {
  if (selectedItems.value.length === 0) return;
  if (!confirm(`Generate Fund Request untuk ${selectedItems.value.length} item?`)) return;
  try {
    const res = await api.post('/finance/payment-schedule/generate-fund-request', { ids: selectedItems.value });
    alert(`✅ ${res.data?.message || 'Fund Request berhasil dibuat!'}`);
    selectedItems.value = [];
    await fetchSchedules();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal membuat Fund Request');
  }
}

function exportCSV() {
  const rows = scheduleRows.value;
  const headers = ['Ref Number','Label','Vendor','Source','Amount','Due Date','Status'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([r.ref_number, `"${r.label}"`, `"${r.vendor_name||''}"`, r.source, r.amount, r.due_date||'', r.status].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `payment-schedule-${viewYear.value}-${viewMonth.value+1}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

onMounted(() => { fetchProjects(); fetchSchedules(); });
</script>
