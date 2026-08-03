<template>
<div class="ts-wrap">
  <!-- Sub-tabs -->
  <div class="ts-tabs">
    <button :class="['ts-tab', tab==='absensi'?'active':'']" @click="tab='absensi'">📋 Absensi Harian</button>
    <button :class="['ts-tab', tab==='kasbon'?'active':'']" @click="tab='kasbon';loadAdvances()">💳 Kasbon</button>
    <button :class="['ts-tab', tab==='slip'?'active':'']" @click="tab='slip'">💰 Slip Gaji</button>
  </div>

  <!-- TAB: ABSENSI -->
  <div v-if="tab==='absensi'" class="ts-card">
    <div class="ts-toolbar">
      <div class="ts-toolbar-left">
        <span class="ts-title">📋 Input Absensi Harian</span>
        <input type="date" v-model="attendDate" class="ts-inp"/>
        <span class="ts-badge">{{ activeEmployees.length }} karyawan aktif</span>
      </div>
      <button @click="saveBulk" :disabled="saving" class="ts-btn-primary">{{ saving?'Menyimpan...':'💾 Simpan' }}</button>
    </div>
    <div class="ts-tbl-wrap">
      <table class="ts-tbl">
        <thead><tr>
          <th>No</th><th class="th-l">Karyawan</th><th>Posisi</th>
          <th>Status</th><th>Check In</th><th>Check Out</th><th>OT</th><th class="th-l">Catatan</th>
        </tr></thead>
        <tbody>
          <tr v-if="!activeEmployees.length"><td colspan="8" class="ts-empty">Tidak ada karyawan aktif. Aktifkan di menu Data Karyawan.</td></tr>
          <tr v-for="(e,i) in activeEmployees" :key="e.id" :class="i%2?'ts-odd':''">
            <td class="tc">{{i+1}}</td>
            <td class="th-l"><div class="emp-n">{{e.name}}</div><div class="emp-c">{{e.code}}</div></td>
            <td class="tc ts-sm">{{e.position}}</td>
            <td class="tc">
              <div class="st-btns">
                <button :class="['st-b','st-p',dailyRec[e.id]?.status==='present'?'on':'']" @click="setStatus(e.id,'present')">✓</button>
                <button :class="['st-b','st-a',dailyRec[e.id]?.status==='absent'?'on':'']" @click="setStatus(e.id,'absent')">✗</button>
              </div>
            </td>
            <td><input type="time" class="ts-time" v-model="dailyRec[e.id].check_in"/></td>
            <td><input type="time" class="ts-time" v-model="dailyRec[e.id].check_out"/></td>
            <td><input type="number" class="ts-ot" v-model.number="dailyRec[e.id].overtime_hours" min="0" max="8" step="0.5"/></td>
            <td><input class="ts-note" v-model="dailyRec[e.id].notes" placeholder="..."/></td>
          </tr>
        </tbody>
        <tfoot v-if="activeEmployees.length">
          <tr class="ts-foot">
            <td colspan="3" class="th-l ts-fl">Total Hari Ini</td>
            <td class="tc"><strong>{{ countPresent }} hadir · {{ activeEmployees.length - countPresent }} absen</strong></td>
            <td colspan="4"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

  <!-- TAB: KASBON -->
  <div v-if="tab==='kasbon'" class="ts-card">
    <div class="ts-toolbar">
      <span class="ts-title">💳 Kasbon / Salary Advance</span>
      <button @click="showKasbon=true" class="ts-btn-primary">+ Tambah Kasbon</button>
    </div>
    <div class="ts-tbl-wrap">
      <table class="ts-tbl">
        <thead><tr>
          <th>Tanggal</th><th class="th-l">Karyawan</th><th>Jumlah</th><th>Sisa</th><th>Keterangan</th><th>Status</th>
        </tr></thead>
        <tbody>
          <tr v-if="!advances.length"><td colspan="6" class="ts-empty">Belum ada kasbon</td></tr>
          <tr v-for="a in advances" :key="a.id">
            <td class="tc ts-sm">{{ fmtDate(a.advance_date) }}</td>
            <td class="th-l"><strong>{{ a.employee_name }}</strong></td>
            <td class="tc">{{ fmtRp(a.amount) }}</td>
            <td class="tc" :class="parseFloat(a.remaining)>0?'ts-red':''">{{ fmtRp(a.remaining) }}</td>
            <td class="ts-sm">{{ a.description||'-' }}</td>
            <td class="tc"><span :class="['ts-badge2', a.status==='paid'?'bg-green':'bg-yellow']">{{ a.status }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Kasbon Modal -->
    <div v-if="showKasbon" class="ts-overlay" @click.self="showKasbon=false">
      <div class="ts-modal">
        <div class="ts-modal-title">+ Tambah Kasbon</div>
        <label>Karyawan</label>
        <select v-model="kForm.employee_id">
          <option value="">— Pilih —</option>
          <option v-for="e in activeEmployees" :key="e.id" :value="e.id">{{ e.name }} ({{ e.code }})</option>
        </select>
        <label>Jumlah (Rp)</label>
        <input type="number" v-model.number="kForm.amount" min="0" step="50000" placeholder="500000"/>
        <label>Tanggal</label>
        <input type="date" v-model="kForm.advance_date"/>
        <label>Keterangan</label>
        <input v-model="kForm.description" placeholder="cth: Kasbon untuk kebutuhan pribadi"/>
        <div class="ts-modal-btns">
          <button @click="showKasbon=false" class="ts-btn-cancel">Batal</button>
          <button @click="saveKasbon" class="ts-btn-primary">Simpan</button>
        </div>
      </div>
    </div>
  </div>

  <!-- TAB: SLIP GAJI -->
  <div v-if="tab==='slip'" class="ts-card">
    <div class="ts-toolbar">
      <div class="ts-toolbar-left">
        <span class="ts-title">💰 Generate Slip Gaji</span>
        <input type="month" v-model="slipMonth" class="ts-inp"/>
        <select v-model="slipEmpId" class="ts-inp">
          <option value="">— Pilih Karyawan —</option>
          <option v-for="e in activeEmployees" :key="e.id" :value="e.id">{{ e.name }}</option>
        </select>
        <button @click="generateSlip" :disabled="!slipEmpId" class="ts-btn-primary">Hitung</button>
      </div>
    </div>
    <div v-if="slip" class="slip-card">
      <div class="slip-header">
        <div class="slip-title">SLIP GAJI — {{ slip.employee_name }}</div>
        <div class="slip-period">Periode: {{ slip.period }}</div>
      </div>
      <div class="slip-grid">
        <div class="slip-row"><span>Hari Kerja</span><span>{{ slip.total_days }} hari</span></div>
        <div class="slip-row"><span>Gaji Pokok</span><span>{{ fmtRp(slip.basic) }}</span></div>
        <div class="slip-row"><span>Tunjangan</span><span>{{ fmtRp(slip.allowance) }}</span></div>
        <div class="slip-row"><span>Overtime</span><span>{{ fmtRp(slip.overtime) }}</span></div>
        <div class="slip-row slip-sep"><span><strong>Total Pendapatan</strong></span><span><strong>{{ fmtRp(slip.gross) }}</strong></span></div>
        <div class="slip-row ts-red" v-if="slip.advances_total"><span>Potongan Kasbon</span><span>-{{ fmtRp(slip.advances_total) }}</span></div>
        <div class="slip-row slip-net"><span>GAJI BERSIH</span><span>{{ fmtRp(slip.net_salary) }}</span></div>
      </div>
    </div>
    <div v-else class="ts-empty-box">Pilih karyawan dan bulan, lalu klik Hitung untuk generate slip gaji.</div>
  </div>
</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '../../lib/api';

const props = defineProps<{ projectId: string|number }>();
const tab = ref('absensi');
const allEmployees = ref<any[]>([]);
const attendDate = ref(new Date().toISOString().slice(0,10));
const dailyRec = ref<Record<number,any>>({});
const saving = ref(false);
const advances = ref<any[]>([]);
const showKasbon = ref(false);
const kForm = ref({ employee_id:'', amount:0, advance_date:new Date().toISOString().slice(0,10), description:'' });
const slipMonth = ref(new Date().toISOString().slice(0,7));
const slipEmpId = ref('');
const slip = ref<any>(null);

const activeEmployees = computed(() => allEmployees.value.filter(e => e.status === 'ACTIVE'));
const countPresent = computed(() => Object.values(dailyRec.value).filter((r:any) => r.status === 'present').length);
const fmtRp = (v:any) => 'Rp ' + (parseFloat(v)||0).toLocaleString('id-ID');
const fmtDate = (d:string) => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';

async function loadEmployees(){
  try {
    const res = await api.get('/hr/employees');
    allEmployees.value = (res.data.data || res.data || []).map((e:any) => ({
      id: e.id, code: e.employee_code || e.code, name: e.first_name || e.name,
      position: e.position, status: e.status || 'ACTIVE',
      basic_rate: parseFloat(e.basic_rate)||0, tunjangan_rate: parseFloat(e.tunjangan_rate)||0,
      ot_rate: parseFloat(e.ot_rate)||0, contract_type: e.contract_type || e.salary_type,
    }));
    initDaily();
  } catch(e){ console.error(e); }
}

function initDaily(){
  const rec:Record<number,any> = {};
  for(const e of activeEmployees.value){
    rec[e.id] = dailyRec.value[e.id] || { status:'present', check_in:'', check_out:'', overtime_hours:0, notes:'' };
  }
  dailyRec.value = rec;
}

async function loadAttendance(){
  try {
    const res = await api.get(`/hr/attendance?date=${attendDate.value}&project_id=${props.projectId}`);
    const logs = res.data.data || res.data || [];
    for(const log of logs){
      if(dailyRec.value[log.employee_id]){
        dailyRec.value[log.employee_id] = {
          id: log.id, status: log.status, check_in: log.check_in||'', check_out: log.check_out||'',
          overtime_hours: log.overtime_hours||0, notes: log.notes||''
        };
      }
    }
  } catch(e){ console.error(e); }
}

function setStatus(eid:number, st:string){
  if(dailyRec.value[eid]) dailyRec.value[eid].status = st;
}

async function saveBulk(){
  saving.value = true;
  try {
    const records = activeEmployees.value.map(e => ({
      employee_id: e.id,
      ...dailyRec.value[e.id],
      timesheet_value: dailyRec.value[e.id].status === 'present' ? 1 : 0,
    }));
    await api.post('/hr/attendance/bulk', { date: attendDate.value, project_id: props.projectId, records });
  } catch(e){ alert('Gagal menyimpan'); }
  finally { saving.value = false; }
}

async function loadAdvances(){
  try {
    const res = await api.get('/hr/advances');
    advances.value = res.data.data || res.data || [];
  } catch(e){ console.error(e); }
}

async function saveKasbon(){
  if(!kForm.value.employee_id || !kForm.value.amount) return alert('Lengkapi data');
  try {
    const now = new Date(kForm.value.advance_date);
    await api.post('/hr/advances', { ...kForm.value, period_month: now.getMonth()+1, period_year: now.getFullYear() });
    showKasbon.value = false;
    kForm.value = { employee_id:'', amount:0, advance_date:new Date().toISOString().slice(0,10), description:'' };
    loadAdvances();
  } catch(e){ alert('Gagal menyimpan kasbon'); }
}

async function generateSlip(){
  if(!slipEmpId.value) return;
  const [y,m] = slipMonth.value.split('-');
  try {
    const res = await api.get(`/hr/payslip?employee_id=${slipEmpId.value}&month=${m}&year=${y}&project_id=${props.projectId}`);
    slip.value = res.data;
  } catch(e){ alert('Gagal generate slip'); }
}

watch(attendDate, () => { initDaily(); loadAttendance(); });
onMounted(async () => { await loadEmployees(); await loadAttendance(); });
</script>

<style scoped>
.ts-wrap{display:flex;flex-direction:column;gap:12px;}
.ts-tabs{display:flex;gap:4px;background:white;border-radius:12px;border:1px solid #e2e8f0;padding:6px;overflow-x:auto;}
.ts-tab{padding:8px 16px;border:none;background:transparent;border-radius:8px;font-size:.82rem;font-weight:600;color:#64748b;cursor:pointer;white-space:nowrap;transition:all .15s;}
.ts-tab.active{background:#1d4ed8;color:white;}
.ts-tab:hover:not(.active){background:#f1f5f9;}
.ts-card{background:white;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;}
.ts-toolbar{padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;border-bottom:1px solid #e2e8f0;}
.ts-toolbar-left{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.ts-title{font-size:.88rem;font-weight:700;color:#0f172a;}
.ts-inp{border:1px solid #d1d5db;border-radius:7px;padding:5px 10px;font-size:.8rem;}
.ts-badge{font-size:.7rem;background:#eff6ff;color:#1d4ed8;padding:3px 10px;border-radius:20px;font-weight:600;}
.ts-btn-primary{padding:7px 16px;background:#1d4ed8;color:white;border:none;border-radius:8px;font-size:.8rem;font-weight:600;cursor:pointer;}
.ts-btn-primary:disabled{opacity:.5;}
.ts-btn-cancel{padding:7px 16px;background:#f1f5f9;color:#374151;border:none;border-radius:8px;font-size:.8rem;cursor:pointer;}
.ts-tbl-wrap{overflow-x:auto;}
.ts-tbl{width:100%;border-collapse:collapse;font-size:.78rem;}
.ts-tbl thead th{background:#f8fafc;padding:8px 10px;font-weight:700;color:#374151;text-align:center;border-bottom:2px solid #e2e8f0;white-space:nowrap;}
.th-l{text-align:left!important;}
.ts-tbl tbody td{padding:6px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle;}
.tc{text-align:center;}
.ts-sm{font-size:.72rem;color:#6b7280;}
.ts-odd{background:#fafafa;}
.ts-empty{text-align:center;color:#94a3b8;padding:30px;font-size:.82rem;}
.ts-empty-box{text-align:center;color:#94a3b8;padding:40px;font-size:.84rem;}
.emp-n{font-weight:600;color:#1e293b;}
.emp-c{font-size:.66rem;color:#94a3b8;}
.st-btns{display:flex;gap:4px;justify-content:center;}
.st-b{width:28px;height:28px;border-radius:50%;border:2px solid #e2e8f0;font-size:.7rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;background:white;color:#94a3b8;}
.st-p.on{background:#059669;color:white;border-color:#059669;}
.st-a.on{background:#ef4444;color:white;border-color:#ef4444;}
.st-b:hover{transform:scale(1.1);}
.ts-time{border:1px solid #e2e8f0;border-radius:5px;padding:3px 6px;font-size:.76rem;width:80px;}
.ts-ot{border:1px solid #e2e8f0;border-radius:5px;padding:3px 6px;font-size:.76rem;width:50px;text-align:center;}
.ts-note{border:1px solid #e2e8f0;border-radius:5px;padding:3px 6px;font-size:.76rem;width:100%;}
.ts-foot{background:#f8fafc;}
.ts-fl{font-size:.78rem;font-weight:700;padding-left:12px!important;}
.ts-red{color:#ef4444;}
.ts-badge2{font-size:.66rem;font-weight:600;padding:2px 8px;border-radius:12px;}
.bg-green{background:#d1fae5;color:#065f46;}
.bg-yellow{background:#fef3c7;color:#92400e;}
/* Slip */
.slip-card{margin:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;}
.slip-header{background:#0f172a;color:white;padding:14px 18px;}
.slip-title{font-size:.9rem;font-weight:800;}
.slip-period{font-size:.72rem;color:#94a3b8;margin-top:2px;}
.slip-grid{padding:12px 18px;}
.slip-row{display:flex;justify-content:space-between;padding:6px 0;font-size:.82rem;border-bottom:1px solid #e2e8f0;}
.slip-sep{border-top:2px solid #1d4ed8;margin-top:4px;padding-top:8px;}
.slip-net{background:#1d4ed8;color:white;margin:8px -18px -12px;padding:12px 18px;font-size:.92rem;font-weight:800;border-bottom:none;}
/* Modal */
.ts-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;}
.ts-modal{background:white;border-radius:16px;padding:24px;width:440px;max-width:95vw;display:flex;flex-direction:column;gap:8px;}
.ts-modal-title{font-size:.92rem;font-weight:800;color:#0f172a;}
.ts-modal label{font-size:.68rem;font-weight:700;color:#374151;text-transform:uppercase;}
.ts-modal input,.ts-modal select{border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:.82rem;width:100%;}
.ts-modal-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:8px;}
</style>
