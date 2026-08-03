<template>
  <div class="mobile-app">
    <div class="topbar">
      <div>
        <div class="page-title">💰 Slip Gaji</div>
        <div class="page-sub">{{ emp?.name }}</div>
      </div>
      <select v-model="selectedYear" @change="loadPayslips" class="year-sel">
        <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
      </select>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-wrap">
      <div class="spinner"></div>
      <p>Memuat slip gaji...</p>
    </div>

    <!-- Empty -->
    <div v-else-if="!payslips.length" class="empty-wrap">
      <div style="font-size:48px">📄</div>
      <p>Belum ada slip gaji tersimpan</p>
    </div>

    <!-- Payslip list -->
    <div v-else class="payslip-list">
      <div v-for="ps in payslips" :key="ps.id" class="ps-card" @click="openSlip(ps)">
        <div class="ps-period">
          <div class="ps-month">{{ monthName(ps.period_month) }} {{ ps.period_year }}</div>
          <div class="ps-status">{{ ps.status === 'final' ? '✓ Final' : 'Draft' }}</div>
        </div>
        <div class="ps-amounts">
          <div class="ps-row-item">
            <span class="ps-lbl">Gaji Kotor</span>
            <span class="ps-val green">{{ fmt(ps.gross_salary) }}</span>
          </div>
          <div class="ps-row-item" v-if="(ps.advance_1||0)+(ps.advance_2||0)>0">
            <span class="ps-lbl">Kasbon</span>
            <span class="ps-val red">-{{ fmt((ps.advance_1||0)+(ps.advance_2||0)) }}</span>
          </div>
          <div class="ps-row-item" v-if="(ps.bpjs_kes||0)+(ps.bpjs_tk||0)+(ps.pph21||0)>0">
            <span class="ps-lbl">Pot. BPJS/PPh</span>
            <span class="ps-val red">-{{ fmt((ps.bpjs_kes||0)+(ps.bpjs_tk||0)+(ps.pph21||0)) }}</span>
          </div>
        </div>
        <div class="ps-nett">
          <span class="nett-lbl">Take Home Pay</span>
          <span class="nett-val">{{ fmt(ps.net_salary) }}</span>
        </div>
        <div class="ps-footer">
          <span>{{ ps.total_days }} hari kerja · {{ ps.total_ot_hours }} jam lembur</span>
          <span class="ps-arrow">›</span>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    <Teleport to="body">
      <div v-if="activeSlip" class="modal-overlay" @click.self="activeSlip=null">
        <div class="modal-sheet">
          <div class="modal-handle"></div>
          <div class="modal-header">
            <div>
              <div class="modal-title">Slip Gaji {{ monthName(activeSlip.period_month) }} {{ activeSlip.period_year }}</div>
              <div class="modal-sub">{{ activeSlip.employee_name }} · {{ activeSlip.position }}</div>
            </div>
            <button @click="printSlip" class="print-btn">🖨</button>
          </div>

          <div id="slip-print" class="slip-body">
            <div class="slip-company">🏗 BLACKBOX EPC</div>
            <div class="slip-period">SLIP GAJI — {{ monthName(activeSlip.period_month).toUpperCase() }} {{ activeSlip.period_year }}</div>

            <div class="slip-info">
              <div class="info-row"><span>Nama</span><span>{{ activeSlip.employee_name }}</span></div>
              <div class="info-row"><span>Kode</span><span>{{ activeSlip.employee_code }}</span></div>
              <div class="info-row"><span>Jabatan</span><span>{{ activeSlip.position }}</span></div>
              <div class="info-row"><span>Hari Kerja</span><span>{{ activeSlip.total_days }} hari</span></div>
              <div class="info-row" v-if="activeSlip.total_ot_hours > 0"><span>Lembur</span><span>{{ activeSlip.total_ot_hours }} jam</span></div>
            </div>

            <div class="slip-section">PENDAPATAN</div>
            <div class="info-row"><span>Gaji Pokok</span><span class="green">{{ fmt(activeSlip.basic_salary) }}</span></div>
            <div class="info-row" v-if="activeSlip.tunjangan > 0"><span>Tunjangan</span><span class="green">{{ fmt(activeSlip.tunjangan) }}</span></div>
            <div class="info-row" v-if="activeSlip.ot_pay > 0"><span>Upah Lembur</span><span class="green">{{ fmt(activeSlip.ot_pay) }}</span></div>
            <div class="info-row total"><span>Total Pendapatan</span><span>{{ fmt(activeSlip.gross_salary) }}</span></div>

            <div class="slip-section" style="color:#ef4444">POTONGAN</div>
            <div class="info-row" v-if="activeSlip.advance_1 > 0"><span>Kasbon 1</span><span class="red">-{{ fmt(activeSlip.advance_1) }}</span></div>
            <div class="info-row" v-if="activeSlip.advance_2 > 0"><span>Kasbon 2</span><span class="red">-{{ fmt(activeSlip.advance_2) }}</span></div>
            <div class="info-row" v-if="activeSlip.bpjs_kes > 0"><span>BPJS Kesehatan</span><span class="red">-{{ fmt(activeSlip.bpjs_kes) }}</span></div>
            <div class="info-row" v-if="activeSlip.bpjs_tk > 0"><span>BPJS TK</span><span class="red">-{{ fmt(activeSlip.bpjs_tk) }}</span></div>
            <div class="info-row" v-if="activeSlip.pph21 > 0"><span>PPh 21</span><span class="red">-{{ fmt(activeSlip.pph21) }}</span></div>
            <div class="info-row total"><span>Total Potongan</span><span class="red">-{{ fmt(activeSlip.total_deductions) }}</span></div>

            <div class="slip-nett">
              <span>GAJI BERSIH</span>
              <span>{{ fmt(activeSlip.net_salary) }}</span>
            </div>
          </div>

          <button @click="activeSlip=null" class="close-btn">Tutup</button>
        </div>
      </div>
    </Teleport>

    <!-- Bottom nav -->
    <nav class="bottom-nav">
      <router-link to="/mobile/home" class="nav-item">
        <span class="nav-ico">🏠</span><span class="nav-txt">Beranda</span>
      </router-link>
      <router-link to="/mobile/attend" class="nav-item">
        <span class="nav-ico">📋</span><span class="nav-txt">Absensi</span>
      </router-link>
      <router-link to="/mobile/payslip" class="nav-item active">
        <span class="nav-ico">💰</span><span class="nav-txt">Slip Gaji</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { mobileApi } from '../../lib/mobileApi';

const router = useRouter();
const emp         = ref<any>(null);
const payslips    = ref<any[]>([]);
const loading     = ref(false);
const activeSlip  = ref<any>(null);
const selectedYear = ref(new Date().getFullYear());
const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

const MONTHS = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const monthName = (m: number) => MONTHS[m] || String(m);
const fmt = (v: number) => 'Rp ' + Math.round(v || 0).toLocaleString('id-ID');

async function loadPayslips() {
  if (!emp.value?.id) return;
  loading.value = true;
  try {
    const res = await mobileApi.get(`/api/hr/mobile/payslip/${emp.value.id}`);
    payslips.value = (res.data.data || []).filter((p: any) => p.period_year == selectedYear.value);
  } catch { payslips.value = []; }
  finally { loading.value = false; }
}

function openSlip(ps: any) { activeSlip.value = ps; }
function printSlip() { window.print(); }

onMounted(async () => {
  const stored = localStorage.getItem('mobile_employee');
  if (!stored) { router.push('/mobile'); return; }
  emp.value = JSON.parse(stored);
  await loadPayslips();
});
</script>

<style scoped>
* { box-sizing: border-box; }
.mobile-app { min-height: 100dvh; background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding-bottom: 80px; }
.topbar { background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 52px 20px 20px; display: flex; justify-content: space-between; align-items: flex-start; }
.page-title { color: white; font-size: 20px; font-weight: 800; }
.page-sub { color: #c4b5fd; font-size: 12px; margin-top: 2px; }
.year-sel { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 8px; padding: 6px 10px; font-size: 13px; }
.loading-wrap, .empty-wrap { text-align: center; padding: 60px 20px; color: #94a3b8; }
.spinner { width: 32px; height: 32px; border: 3px solid #e2e8f0; border-top-color: #7c3aed; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px; }
@keyframes spin { to { transform: rotate(360deg); } }
.payslip-list { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.ps-card { background: white; border-radius: 16px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #f1f5f9; cursor: pointer; transition: all .2s; }
.ps-card:active { transform: scale(0.98); }
.ps-period { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.ps-month { font-size: 16px; font-weight: 700; color: #0f172a; }
.ps-status { font-size: 11px; font-weight: 700; background: #dcfce7; color: #15803d; padding: 3px 8px; border-radius: 20px; }
.ps-amounts { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.ps-row-item { display: flex; justify-content: space-between; font-size: 13px; }
.ps-lbl { color: #64748b; }
.ps-val { font-weight: 600; }
.ps-val.green { color: #10b981; }
.ps-val.red { color: #ef4444; }
.ps-nett { background: linear-gradient(135deg, #7c3aed, #4f46e5); border-radius: 12px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.nett-lbl { color: #c4b5fd; font-size: 12px; font-weight: 600; }
.nett-val { color: white; font-size: 18px; font-weight: 800; }
.ps-footer { display: flex; justify-content: space-between; color: #94a3b8; font-size: 12px; }
.ps-arrow { font-size: 18px; }
/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 500; display: flex; align-items: flex-end; }
.modal-sheet { background: white; border-radius: 20px 20px 0 0; width: 100%; max-height: 90dvh; overflow-y: auto; padding: 0 0 20px; }
.modal-handle { width: 40px; height: 4px; background: #e2e8f0; border-radius: 2px; margin: 12px auto; }
.modal-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 0 20px 16px; border-bottom: 1px solid #f1f5f9; }
.modal-title { font-size: 17px; font-weight: 700; color: #0f172a; }
.modal-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
.print-btn { background: #f1f5f9; border: none; border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 18px; }
.slip-body { padding: 16px 20px; }
.slip-company { font-size: 18px; font-weight: 800; color: #0f172a; text-align: center; margin-bottom: 4px; }
.slip-period { font-size: 11px; color: #64748b; text-align: center; letter-spacing: 1px; margin-bottom: 16px; }
.slip-info { background: #f8fafc; border-radius: 10px; padding: 12px; margin-bottom: 14px; }
.slip-section { font-size: 11px; font-weight: 700; color: #64748b; letter-spacing: 1px; text-transform: uppercase; margin: 12px 0 8px; }
.info-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
.info-row span:first-child { color: #64748b; }
.info-row span:last-child { font-weight: 600; color: #0f172a; }
.info-row.total { border-top: 2px solid #e2e8f0; margin-top: 4px; }
.info-row.total span { font-weight: 700; font-size: 14px; }
.green { color: #10b981 !important; }
.red { color: #ef4444 !important; }
.slip-nett { background: linear-gradient(135deg, #7c3aed, #4f46e5); border-radius: 12px; padding: 14px; display: flex; justify-content: space-between; align-items: center; margin-top: 16px; }
.slip-nett span:first-child { color: #c4b5fd; font-size: 12px; font-weight: 600; }
.slip-nett span:last-child { color: white; font-size: 20px; font-weight: 800; }
.close-btn { width: calc(100% - 40px); margin: 16px 20px 0; background: #f1f5f9; border: none; border-radius: 14px; padding: 14px; font-size: 15px; font-weight: 700; cursor: pointer; color: #374151; }
/* Bottom nav */
.bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-top: 1px solid #e2e8f0; display: grid; grid-template-columns: repeat(3, 1fr); height: 64px; z-index: 100; }
.nav-item { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; text-decoration: none; color: #94a3b8; transition: color .2s; }
.nav-item.active, .nav-item.router-link-active { color: #7c3aed; }
.nav-ico { font-size: 22px; }
.nav-txt { font-size: 10px; font-weight: 600; }
@media print { .bottom-nav, .modal-header, .close-btn, .modal-handle { display: none; } }
</style>
