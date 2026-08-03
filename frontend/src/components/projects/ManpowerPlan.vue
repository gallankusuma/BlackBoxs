<template>
<div class="mp">

  <!-- Header -->
  <div class="mp-hdr">
    <div style="display:flex;align-items:center;gap:10px">
      <span style="font-size:1.5rem">👷</span>
      <div>
        <div style="font-size:.95rem;font-weight:800;color:#0f172a">Manpower Mobilization Plan</div>
        <div style="font-size:.7rem;color:#64748b">Master schedule format · Terhubung ke data Team/HR · Estimasi biaya real</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <button v-if="rows.length" @click="deleteAll" class="btn-delall">🗑 Hapus Semua</button>
      <button @click="showModal=true" class="btn-add">＋ Tambah Job Title</button>
      <button @click="saveAll" :disabled="saving" class="btn-save">{{ saving?'Menyimpan...':'💾 Simpan' }}</button>
    </div>
  </div>

  <!-- Config -->
  <div class="cfg-bar">
    <div class="cfg-item"><label>Tanggal Mulai</label><input type="date" v-model="startDate" @change="rebuildWeeks"/></div>
    <div class="cfg-item"><label>Durasi (minggu)</label><input type="number" v-model.number="totalWeeks" min="1" max="104" @change="rebuildWeeks"/></div>
    <div class="cfg-item"><label>Hari Kerja/Minggu</label><input type="number" v-model.number="workDaysPerWeek" min="5" max="7"/></div>
    <div class="cfg-item stat"><label>Total Man-Week</label><div class="stat-val">{{ totalManWeek }}</div></div>
    <div class="cfg-item stat"><label>Peak Manpower</label><div class="stat-val red">{{ peakManpower }} org</div></div>
    <div class="cfg-item stat"><label>Est. Total Biaya</label><div class="stat-val green">{{ fmtRp(totalCost) }}</div></div>
  </div>

  <!-- S-Curve simple -->
  <div v-if="rows.length" class="scurve-wrap">
    <div class="scurve-title">📊 Resource Loading (Manpower per Minggu)</div>
    <div class="scurve-bars">
      <div v-for="(_,wi) in weeks" :key="wi" class="scurve-col">
        <div class="scurve-bar" :style="`height:${peakManpower?Math.round(weekTotal(wi)/peakManpower*80):0}px`"
          :title="`W${wi+1}: ${weekTotal(wi)} org`">
          <span class="bar-tip">{{ weekTotal(wi)||'' }}</span>
        </div>
        <div class="scurve-lbl">W{{wi+1}}</div>
      </div>
    </div>
  </div>

  <!-- Master Schedule Table -->
  <div class="tbl-wrap" v-if="rows.length">
    <table class="tbl">
      <thead>
        <tr>
          <th class="th-no">No</th>
          <th class="th-job">Job Title / Posisi</th>
          <th class="th-pos">Dari Employee</th>
          <th class="th-rate">Daily Rate (Rp)</th>
          <th v-for="(wk,wi) in weeks" :key="wi" class="th-wk">
            <div>W{{wi+1}}</div><div class="wk-dt">{{wk}}</div>
            <div class="wk-actions">
              <button @click="copyWeek(wi)" class="wk-btn" :class="{copied: copiedWeek===wi}" title="Copy kolom ini">📋</button>
              <button v-if="copiedWeek!==null && copiedWeek!==wi" @click="pasteWeek(wi)" class="wk-btn" title="Paste ke sini">📌</button>
              <button @click="fillRight(wi)" class="wk-btn" title="Fill ke semua minggu selanjutnya →">▶</button>
            </div>
          </th>
          <th class="th-tot">Total M/W</th>
          <th class="th-cost">Est. Biaya</th>
          <th class="th-act">×</th>
        </tr>
        <!-- Weekly totals -->
        <tr class="tr-sum">
          <td colspan="4" class="sum-lbl">Total Manpower per Minggu</td>
          <td v-for="(_,wi) in weeks" :key="wi" class="sum-val">{{ weekTotal(wi)||'' }}</td>
          <td class="sum-val">{{ totalManWeek }}</td>
          <td class="sum-cost">{{ fmtRp(totalCost) }}</td>
          <td></td>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r,ri) in rows" :key="r.id" :class="ri%2?'tr-odd':'tr-even'">
          <td class="td-no">{{ri+1}}</td>
          <td class="td-job">
            <input class="job-inp" v-model="r.jobTitle" placeholder="Job title..."/>
            <div class="job-sub">{{ r.positionRef||'—' }}</div>
          </td>
          <td class="td-pos">
            <select class="pos-sel" v-model="r.employeePositionId" @change="onEmployeeSelect(r)">
              <option value="">— Manual —</option>
              <optgroup label="📋 Master">
                <option v-for="e in employeePositions.filter(p => p.source === 'master')" :key="e.key" :value="e.key">{{ e.shortName }}</option>
              </optgroup>
              <optgroup label="👷 Karyawan">
                <option v-for="e in employeePositions.filter(p => p.source === 'employee')" :key="e.key" :value="e.key">{{ e.shortName }}</option>
              </optgroup>
            </select>
          </td>
          <td class="td-rate">
            <input type="number" class="rate-inp" v-model.number="r.dailyRate" min="0" step="50000"/>
          </td>
          <td v-for="(_,wi) in weeks" :key="wi" class="td-cell">
            <input type="number" class="qty-inp" :class="{active:getQty(r,wi)>0}"
              min="0" :value="getQty(r,wi)"
              @input="setQty(r,wi,+($event.target as HTMLInputElement).value)"/>
          </td>
          <td class="td-tot">{{ rowManWeek(r) }}</td>
          <td class="td-cost">{{ fmtRp(rowCost(r)) }}</td>
          <td class="td-act"><button @click="removeRow(ri)" class="btn-row-del" title="Hapus baris ini">🗑</button></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div v-else class="empty-state">
    <div style="font-size:2.5rem">👷‍♂️</div>
    <div style="font-weight:700;color:#374151;margin:8px 0">Belum ada rencana manpower</div>
    <div style="font-size:.8rem;color:#94a3b8">Klik <strong>＋ Tambah Job Title</strong> untuk mulai</div>
  </div>

  <!-- Summary bottom -->
  <div v-if="rows.length" class="sum-cards">
    <div class="sum-card" v-for="s in sumCards" :key="s.l">
      <div class="sc-icon">{{s.icon}}</div>
      <div class="sc-val">{{s.v}}</div>
      <div class="sc-l">{{s.l}}</div>
    </div>
  </div>

  <!-- Modal Add Job Title -->
  <div v-if="showModal" class="overlay" @click.self="showModal=false">
    <div class="modal modal-wide">
      <div class="modal-title">＋ Tambah Manpower</div>
      <p class="modal-sub">Pilih satu atau beberapa posisi/karyawan, lalu klik Tambah</p>

      <!-- Search -->
      <input v-model="modalSearch" placeholder="🔍 Cari posisi atau nama karyawan..." class="modal-search"/>

      <!-- Quick actions -->
      <div class="modal-actions">
        <label class="sel-all-label">
          <input type="checkbox" :checked="selectedKeys.length === filteredModalPositions.length && filteredModalPositions.length > 0" @change="toggleSelectAll" />
          Pilih Semua
        </label>
        <span class="sel-count" v-if="selectedKeys.length">{{ selectedKeys.length }} dipilih</span>
      </div>

      <!-- Checkbox list -->
      <div class="chk-list">
        <!-- Master group -->
        <div v-if="filteredModalPositions.filter(p => p.source === 'master').length" class="chk-group-label">📋 Master Standar Gaji</div>
        <label v-for="ep in filteredModalPositions.filter(p => p.source === 'master')" :key="ep.key" class="chk-item" :class="{checked: selectedKeys.includes(ep.key)}">
          <input type="checkbox" :value="ep.key" v-model="selectedKeys" />
          <div class="chk-info">
            <div class="chk-name">{{ ep.displayName }}</div>
            <div class="chk-rate">{{ fmtRp(ep.dailyRate) }}/hari</div>
          </div>
        </label>

        <!-- Employee group -->
        <div v-if="filteredModalPositions.filter(p => p.source === 'employee').length" class="chk-group-label">👷 Karyawan Aktif</div>
        <label v-for="ep in filteredModalPositions.filter(p => p.source === 'employee')" :key="ep.key" class="chk-item" :class="{checked: selectedKeys.includes(ep.key)}">
          <input type="checkbox" :value="ep.key" v-model="selectedKeys" />
          <div class="chk-info">
            <div class="chk-name">{{ ep.displayName }}</div>
            <div class="chk-sub">{{ ep.position }}</div>
            <div class="chk-rate">{{ fmtRp(ep.dailyRate) }}/hari</div>
          </div>
        </label>

        <div v-if="!filteredModalPositions.length" class="chk-empty">Tidak ditemukan</div>
      </div>

      <div class="modal-btns">
        <button @click="showModal=false" class="btn-cancel">Batal</button>
        <button @click="addSelectedRows" class="btn-add" :disabled="!selectedKeys.length">
          Tambah {{ selectedKeys.length || '' }} Manpower
        </button>
      </div>
    </div>
  </div>

</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../../lib/api';

const props = defineProps<{ projectId: number|string }>();

const startDate      = ref(new Date().toISOString().slice(0,10));
const totalWeeks     = ref(26);
const workDaysPerWeek = ref(6);
const weeks          = ref<string[]>([]);
const saving         = ref(false);
const showModal      = ref(false);
const savedId        = ref<number|null>(null);

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899','#6366f1'];

interface Row { id:string; jobTitle:string; positionRef:string; employeePositionId:string; dailyRate:number; color:string; qty:Record<number,number>; }
const rows = ref<Row[]>([]);

interface EmpPos { key:string; label:string; dailyRate:number; position:string; source:string; displayName:string; shortName:string; }
const employeePositions = ref<EmpPos[]>([]);

const form = ref({ jobTitle:'', employeePositionId:'', dailyRate:0, color:COLORS[0] });
const selectedKeys = ref<string[]>([]);
const modalSearch = ref('');

const filteredModalPositions = computed(() => {
  const q = modalSearch.value.toLowerCase();
  if (!q) return employeePositions.value;
  return employeePositions.value.filter(ep =>
    ep.position.toLowerCase().includes(q) || ep.label.toLowerCase().includes(q)
  );
});

function uid() { return Math.random().toString(36).slice(2,9); }
function rebuildWeeks() {
  const d = new Date(startDate.value); const w:string[] = [];
  for(let i=0;i<(totalWeeks.value||26);i++){
    const x=new Date(d); x.setDate(x.getDate()+i*7);
    w.push(`${x.getDate()}/${x.getMonth()+1}`);
  }
  weeks.value=w;
}
function getQty(r:Row,wi:number){ return r.qty[wi]||0; }
function setQty(r:Row,wi:number,v:number){ r.qty[wi]=v>=0?v:0; }
function rowManWeek(r:Row){ return Object.values(r.qty).reduce((a,b)=>a+b,0); }
function rowCost(r:Row){ return rowManWeek(r)*workDaysPerWeek.value*r.dailyRate; }
function weekTotal(wi:number){ return rows.value.reduce((a,r)=>a+getQty(r,wi),0); }

const copiedWeek = ref<number|null>(null);
const copiedData = ref<Record<string,number>>({});

function copyWeek(wi:number){
  copiedWeek.value = wi;
  copiedData.value = {};
  for(const r of rows.value) copiedData.value[r.id] = getQty(r,wi);
}
function pasteWeek(wi:number){
  if(copiedWeek.value===null) return;
  for(const r of rows.value) r.qty[wi] = copiedData.value[r.id] || 0;
}
function fillRight(wi:number){
  const total = weeks.value.length;
  if(wi >= total-1) return;
  const count = total - wi - 1;
  if(!confirm(`Copy W${wi+1} ke W${wi+2}~W${total}? (${count} minggu)`)) return;
  for(const r of rows.value){
    const v = getQty(r,wi);
    for(let i=wi+1;i<total;i++) r.qty[i] = v;
  }
}

const totalManWeek = computed(()=>rows.value.reduce((a,r)=>a+rowManWeek(r),0));
const totalCost    = computed(()=>rows.value.reduce((a,r)=>a+rowCost(r),0));
const peakManpower = computed(()=>{ let p=0; for(let i=0;i<weeks.value.length;i++) p=Math.max(p,weekTotal(i)); return p; });
const fmtRp = (v:number)=>'Rp '+v.toLocaleString('id-ID');

function onEmployeeSelect(r:Row){
  const ep=employeePositions.value.find(e=>e.key===r.employeePositionId);
  if(ep){ r.dailyRate=ep.dailyRate; r.positionRef=ep.position; if(!r.jobTitle) r.jobTitle=ep.position; }
}

function toggleSelectAll() {
  if (selectedKeys.value.length === filteredModalPositions.value.length) {
    selectedKeys.value = [];
  } else {
    selectedKeys.value = filteredModalPositions.value.map(ep => ep.key);
  }
}

function addSelectedRows(){
  if(!selectedKeys.value.length) return;
  for(const key of selectedKeys.value){
    const ep = employeePositions.value.find(e=>e.key===key);
    if(!ep) continue;
    rows.value.push({
      id: uid(),
      jobTitle: ep.position,
      positionRef: ep.position,
      employeePositionId: ep.key,
      dailyRate: ep.dailyRate,
      color: COLORS[rows.value.length % COLORS.length],
      qty: {}
    });
  }
  selectedKeys.value=[];
  modalSearch.value='';
  showModal.value=false;
}

function addRow(){
  if(!form.value.jobTitle) return alert('Job Title wajib diisi');
  const ep=employeePositions.value.find(e=>e.key===form.value.employeePositionId);
  rows.value.push({ id:uid(), jobTitle:form.value.jobTitle, positionRef:ep?.position||'', employeePositionId:form.value.employeePositionId, dailyRate:form.value.dailyRate||0, color:form.value.color, qty:{} });
  form.value={ jobTitle:'', employeePositionId:'', dailyRate:0, color:COLORS[rows.value.length%COLORS.length] };
  showModal.value=false;
}
function removeRow(i:number){ if(confirm('Hapus baris ini?')) rows.value.splice(i,1); }

async function deleteAll(){
  if(!confirm('Hapus SEMUA rencana manpower? Data akan dihapus dari database.')) return;
  rows.value=[];
  if(savedId.value){
    try{ await api.delete(`/projects/${props.projectId}/mto/${savedId.value}`); savedId.value=null; }catch(e){ console.error(e); }
  }
}

const sumCards = computed(()=>[
  {icon:'👷',l:'Total Job Title',v:String(rows.value.length)},
  {icon:'📈',l:'Peak Manpower',v:`${peakManpower.value} org`},
  {icon:'📊',l:'Total Man-Week',v:String(totalManWeek.value)},
  {icon:'📅',l:'Durasi',v:`${totalWeeks.value} minggu`},
  {icon:'💰',l:'Estimasi Total Biaya',v:fmtRp(totalCost.value)},
]);

async function loadEmployees(){
  try{
    // Load both position_rates (master) and active employees (HR)
    const [prRes, empRes] = await Promise.all([
      api.get('/hr/position-rates').catch(() => ({ data: { data: [] } })),
      api.get('/hr/employees').catch(() => ({ data: { data: [] } })),
    ]);
    const positions: EmpPos[] = [];
    // 1. From position_rates master
    const rates = prRes.data.data || prRes.data || [];
    for (const pr of rates) {
      const br = parseFloat(pr.basic_rate) || 0;
      const tunj = parseFloat(pr.tunjangan_rate) || 0;
      const dailyRate = pr.salary_type === 'monthly' ? Math.round(br / 22) : br;
      positions.push({
        key: `pr-${pr.id}`,
        label: `[Master] ${pr.position_name}${pr.grade ? ' - ' + pr.grade : ''} (${fmtRp(dailyRate + tunj)}/hari)`,
        dailyRate: dailyRate + tunj,
        position: pr.position_name + (pr.grade ? ' ' + pr.grade : ''),
        displayName: pr.position_name + (pr.grade ? ' - ' + pr.grade : ''),
        shortName: pr.position_name + (pr.grade ? ' ' + pr.grade : ''),
        source: 'master',
      });
    }
    // 2. From active employees
    const emps = empRes.data.data || empRes.data || [];
    for (const e of emps) {
      if (e.status !== 'ACTIVE') continue;
      const br = parseFloat(e.basic_rate) || 0;
      const bs = parseFloat(e.basic_salary) || 0;
      const tunj = parseFloat(e.tunjangan_rate) || 0;
      const dailyRate = e.contract_type === 'daily' || e.salary_type === 'daily'
        ? br
        : Math.round((bs || br) / 22);
      const empName = e.first_name || e.name || '';
      positions.push({
        key: `emp-${e.id}`,
        label: `${e.employee_code || e.code} - ${empName} (${e.position || '-'}) ${fmtRp(dailyRate + tunj)}/hari`,
        dailyRate: dailyRate + tunj,
        position: e.position || '-',
        displayName: `${e.employee_code || e.code} - ${empName}`,
        shortName: empName,
        source: 'employee',
      });
    }
    employeePositions.value = positions;
  }catch(e){ console.error('load employees/positions',e); }
}

async function saveAll(){
  saving.value=true;
  try{
    const payload={ element_type:'manpower', element_name:'Manpower Mobilization Plan',
      parameters:{ startDate:startDate.value, totalWeeks:totalWeeks.value, workDaysPerWeek:workDaysPerWeek.value, rows:rows.value }};
    if(savedId.value){ await api.put(`/projects/${props.projectId}/mto/${savedId.value}`,payload); }
    else{ const r=await api.post(`/projects/${props.projectId}/mto`,payload); savedId.value=r.data.id; }
  }catch(e){ alert('Gagal menyimpan'); }
  finally{ saving.value=false; }
}

async function fetchData(){
  try{
    const res=await api.get(`/projects/${props.projectId}/mto`);
    const el=(res.data.elements||[]).find((e:any)=>e.element_type==='manpower');
    if(el){ savedId.value=el.id; const p=el.parameters||{};
      if(p.startDate) startDate.value=p.startDate;
      if(p.totalWeeks) totalWeeks.value=p.totalWeeks;
      if(p.workDaysPerWeek) workDaysPerWeek.value=p.workDaysPerWeek;
      if(p.rows?.length) rows.value=p.rows;
    }
  }catch(e){ console.error(e); }
  rebuildWeeks();
}

onMounted(async()=>{ await Promise.all([loadEmployees(), fetchData()]); });
</script>

<style scoped>
.mp{display:flex;flex-direction:column;gap:14px;}
.mp-hdr{background:white;border-radius:14px;border:1px solid #e2e8f0;padding:16px 18px;display:flex;justify-content:space-between;align-items:center;}
.btn-add{padding:8px 16px;background:#1d4ed8;color:white;border:none;border-radius:8px;font-size:.8rem;font-weight:700;cursor:pointer;}
.btn-save{padding:8px 16px;background:#059669;color:white;border:none;border-radius:8px;font-size:.8rem;font-weight:700;cursor:pointer;}
.btn-save:disabled{opacity:.6;}
/* Config */
.cfg-bar{background:white;border-radius:14px;border:1px solid #e2e8f0;padding:14px 18px;display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;}
.cfg-item{display:flex;flex-direction:column;gap:4px;}
.cfg-item label{font-size:.62rem;font-weight:700;color:#6b7280;text-transform:uppercase;}
.cfg-item input{border:1px solid #d1d5db;border-radius:7px;padding:5px 10px;font-size:.82rem;width:130px;}
.stat{}
.stat-val{font-size:.95rem;font-weight:800;color:#1d4ed8;padding:4px 0;}
.stat-val.red{color:#ef4444;}
.stat-val.green{color:#059669;}
/* S-Curve */
.scurve-wrap{background:white;border-radius:14px;border:1px solid #e2e8f0;padding:14px 18px;}
.scurve-title{font-size:.75rem;font-weight:700;color:#374151;margin-bottom:10px;}
.scurve-bars{display:flex;align-items:flex-end;gap:3px;height:100px;overflow-x:auto;padding-bottom:18px;}
.scurve-col{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:26px;}
.scurve-bar{width:18px;background:linear-gradient(180deg,#3b82f6,#1d4ed8);border-radius:3px 3px 0 0;position:relative;min-height:2px;transition:height .3s;}
.bar-tip{position:absolute;top:-16px;font-size:.55rem;color:#374151;white-space:nowrap;}
.scurve-lbl{font-size:.54rem;color:#94a3b8;}
/* Table */
.tbl-wrap{background:white;border-radius:14px;border:1px solid #e2e8f0;overflow-x:auto;overflow-y:visible;max-width:100%;}
.tbl{border-collapse:collapse;min-width:max-content;font-size:.74rem;}
.tbl thead th{background:#f8fafc;padding:6px 6px;white-space:nowrap;font-weight:700;color:#374151;border-bottom:2px solid #e2e8f0;text-align:center;position:sticky;top:0;}
.th-no{min-width:30px;position:sticky;left:0;z-index:3;background:#f8fafc;}
.th-job{min-width:180px;text-align:left!important;position:sticky;left:30px;z-index:3;background:#f8fafc;}
.th-pos{min-width:160px;position:sticky;left:210px;z-index:3;background:#f8fafc;}
.th-rate{min-width:110px;position:sticky;left:370px;z-index:3;background:#f8fafc;border-right:2px solid #e2e8f0;}
.th-wk{min-width:38px;font-size:.64rem;}
.wk-dt{font-size:.56rem;font-weight:400;color:#94a3b8;}
.wk-actions{display:flex;gap:1px;justify-content:center;margin-top:2px;opacity:0;transition:opacity .15s;}
.th-wk:hover .wk-actions{opacity:1;}
.wk-btn{background:none;border:none;cursor:pointer;font-size:.6rem;padding:1px 3px;border-radius:3px;opacity:.6;transition:all .15s;}
.wk-btn:hover{opacity:1;background:#e0e7ff;}
.wk-btn.copied{opacity:1;background:#dbeafe;}
.th-tot,.th-cost{min-width:70px;}
.th-act{min-width:36px;}
.tr-sum td{background:#0f172a;color:#38bdf8;font-weight:700;text-align:center;padding:5px 6px;font-size:.7rem;}
.sum-lbl{text-align:left!important;padding-left:12px!important;font-size:.7rem;}
.sum-cost{color:#4ade80!important;}
.tr-even{background:white;}
.tr-odd{background:#fafafa;}
.tbl tbody td{border-bottom:1px solid #f1f5f9;padding:4px 4px;vertical-align:middle;}
.td-no{text-align:center;color:#94a3b8;font-size:.66rem;position:sticky;left:0;background:inherit;z-index:1;}
.td-job{padding-left:8px!important;position:sticky;left:30px;background:inherit;z-index:1;}
.td-pos{position:sticky;left:210px;background:inherit;z-index:1;}
.td-rate{position:sticky;left:370px;background:inherit;z-index:1;border-right:2px solid #f1f5f9;}
.job-inp{border:none;background:transparent;font-size:.76rem;font-weight:600;color:#1e293b;width:100%;outline:none;}
.job-inp:focus{background:#eff6ff;border-radius:4px;padding:2px 4px;}
.job-sub{font-size:.6rem;color:#94a3b8;margin-top:1px;}
.pos-sel{border:1px solid #e2e8f0;border-radius:5px;padding:3px 5px;font-size:.7rem;width:100%;background:white;}
.rate-inp{border:1px solid #e2e8f0;border-radius:5px;padding:3px 6px;font-size:.72rem;width:100%;text-align:right;}
.td-cell{padding:2px 2px!important;}
.qty-inp{width:32px;border:1px solid transparent;border-radius:4px;padding:3px 1px;text-align:center;font-size:.72rem;background:transparent;}
.qty-inp:hover,.qty-inp:focus{border-color:#3b82f6;background:white;outline:none;}
.qty-inp.active{background:#eff6ff;color:#1d4ed8;font-weight:700;border-color:#bfdbfe;}
.td-tot{text-align:center;font-weight:700;color:#1d4ed8;background:#eff6ff;}
.td-cost{text-align:right;font-size:.66rem;color:#059669;font-weight:600;white-space:nowrap;padding-right:6px!important;}
.btn-del{background:none;border:none;color:#ef4444;cursor:pointer;font-size:1rem;font-weight:700;padding:0 4px;}
.btn-row-del{background:none;border:none;cursor:pointer;font-size:.9rem;padding:2px 4px;opacity:.4;transition:opacity .15s;}
.btn-row-del:hover{opacity:1;}
.btn-delall{padding:8px 14px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:8px;font-size:.8rem;font-weight:600;cursor:pointer;}
/* Empty */
.empty-state{background:white;border-radius:14px;border:2px dashed #e2e8f0;padding:60px;text-align:center;}
/* Summary */
.sum-cards{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;}
@media(max-width:900px){.sum-cards{grid-template-columns:repeat(3,1fr);}}
.sum-card{background:#0f172a;border-radius:12px;padding:14px;text-align:center;}
.sc-icon{font-size:1.2rem;}
.sc-val{font-size:.92rem;font-weight:800;color:#38bdf8;margin:4px 0;}
.sc-l{font-size:.62rem;color:#64748b;}
/* Modal */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;}
.modal{background:white;border-radius:16px;padding:24px;width:440px;max-width:95vw;display:flex;flex-direction:column;gap:8px;}
.modal-wide{width:520px;}
.modal-title{font-size:.95rem;font-weight:800;color:#0f172a;margin-bottom:0;}
.modal-sub{font-size:.72rem;color:#64748b;margin:0;}
.modal-search{border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:.82rem;width:100%;}
.modal-actions{display:flex;align-items:center;justify-content:space-between;padding:4px 0;}
.sel-all-label{display:flex;align-items:center;gap:6px;font-size:.78rem;font-weight:600;color:#374151;cursor:pointer;}
.sel-all-label input{width:16px;height:16px;accent-color:#1d4ed8;}
.sel-count{font-size:.72rem;font-weight:700;color:#1d4ed8;background:#eff6ff;padding:2px 10px;border-radius:20px;}
.chk-list{max-height:400px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:10px;padding:4px;}
.chk-group-label{font-size:.68rem;font-weight:700;color:#6b7280;text-transform:uppercase;padding:8px 10px 4px;position:sticky;top:0;background:white;z-index:1;}
.chk-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;transition:background .1s;border:1px solid transparent;margin:2px 0;}
.chk-item:hover{background:#f8fafc;}
.chk-item.checked{background:#eff6ff;border-color:#bfdbfe;}
.chk-item input[type="checkbox"]{width:18px;height:18px;accent-color:#1d4ed8;flex-shrink:0;}
.chk-info{flex:1;min-width:0;}
.chk-name{font-size:.82rem;font-weight:600;color:#1e293b;}
.chk-rate{font-size:.7rem;color:#059669;font-weight:500;}
.chk-sub{font-size:.66rem;color:#6b7280;}
.chk-empty{text-align:center;color:#94a3b8;padding:30px;font-size:.82rem;}
.modal label{font-size:.68rem;font-weight:700;color:#374151;text-transform:uppercase;}
.modal input,.modal select{border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:.82rem;width:100%;}
.form-hint{font-size:.68rem;color:#059669;background:#f0fdf4;border-radius:6px;padding:6px 10px;}
.color-row{display:flex;gap:6px;flex-wrap:wrap;}
.cdot{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:transform .15s;}
.cdot:hover,.cdot.sel{border-color:#1e293b;transform:scale(1.2);}
.modal-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:8px;}
.btn-cancel{padding:7px 16px;background:#f1f5f9;color:#374151;border:none;border-radius:8px;font-size:.8rem;cursor:pointer;}
.btn-add:disabled{opacity:.5;cursor:not-allowed;}
</style>
