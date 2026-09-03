<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">📊 Laporan Keuangan</h1>
        <p class="text-gray-500 text-sm mt-1">
          Neraca saldo, neraca, laba rugi, dan buku besar — semuanya dari satu perhitungan
        </p>
      </div>
      <div class="flex gap-2 items-end">
        <div v-if="tab !== 'neraca'">
          <label class="block text-[10px] text-gray-500 uppercase mb-1">Dari</label>
          <input v-model="dari" type="date" class="border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-[10px] text-gray-500 uppercase mb-1">
            {{ tab === 'neraca' ? 'Per tanggal' : 'Sampai' }}
          </label>
          <input v-model="sampai" type="date" class="border rounded-lg px-3 py-2 text-sm" />
        </div>
        <button @click="muat" class="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-800">
          Tampilkan
        </button>
      </div>
    </div>

    <!-- Tab -->
    <div class="flex gap-1 border-b">
      <button v-for="t in TAB" :key="t.id" @click="pilihTab(t.id)"
        :class="tab === t.id ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-700'"
        class="px-4 py-2 border-b-2 text-sm">
        {{ t.label }}
      </button>
    </div>

    <div v-if="loading" class="text-center py-12 text-gray-400">Memuat...</div>

    <!-- ── Neraca Saldo ─────────────────────────────────────────────── -->
    <template v-else-if="tab === 'trial'">
      <!-- Kalau ini tidak seimbang, yang salah jalur posting-nya, bukan
           laporannya. Karena itu ditampilkan menonjol, bukan disembunyikan. -->
      <div :class="trial?.seimbang ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'"
        class="border rounded-xl px-4 py-3 text-sm">
        <template v-if="trial?.seimbang">Neraca saldo seimbang.</template>
        <template v-else>
          <strong>Tidak seimbang — selisih {{ rupiah(trial?.selisih) }}.</strong>
          Ini menandakan ada yang salah di jalur posting, bukan di laporannya.
        </template>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b">
            <tr class="text-left text-gray-600">
              <th class="px-4 py-2.5 w-24">Kode</th>
              <th class="px-4 py-2.5">Nama Akun</th>
              <th class="px-4 py-2.5 w-36 text-right">Mutasi Debit</th>
              <th class="px-4 py-2.5 w-36 text-right">Mutasi Kredit</th>
              <th class="px-4 py-2.5 w-36 text-right">Saldo Debit</th>
              <th class="px-4 py-2.5 w-36 text-right">Saldo Kredit</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!trial?.data?.length"><td colspan="6" class="text-center py-8 text-gray-400">
              Belum ada mutasi pada rentang ini.
            </td></tr>
            <tr v-for="r in trial?.data || []" :key="r.id" class="border-b hover:bg-gray-50 cursor-pointer"
              @click="bukaBukuBesar(r)">
              <td class="px-4 py-2 font-mono text-xs">{{ r.account_code }}</td>
              <td class="px-4 py-2">{{ r.account_name }}</td>
              <td class="px-4 py-2 text-right tabular-nums text-gray-500">{{ rupiah(r.mutasi_debit) }}</td>
              <td class="px-4 py-2 text-right tabular-nums text-gray-500">{{ rupiah(r.mutasi_kredit) }}</td>
              <td class="px-4 py-2 text-right tabular-nums">{{ r.debit ? rupiah(r.debit) : '' }}</td>
              <td class="px-4 py-2 text-right tabular-nums">{{ r.kredit ? rupiah(r.kredit) : '' }}</td>
            </tr>
          </tbody>
          <tfoot class="bg-gray-50 border-t font-bold">
            <tr>
              <td colspan="4" class="px-4 py-2.5 text-right text-xs text-gray-500 uppercase">Total</td>
              <td class="px-4 py-2.5 text-right tabular-nums">{{ rupiah(trial?.total_debit) }}</td>
              <td class="px-4 py-2.5 text-right tabular-nums">{{ rupiah(trial?.total_credit) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </template>

    <!-- ── Neraca ───────────────────────────────────────────────────── -->
    <template v-else-if="tab === 'neraca'">
      <div :class="neraca?.seimbang ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'"
        class="border rounded-xl px-4 py-3 text-sm">
        <template v-if="neraca?.seimbang">Neraca seimbang per {{ tanggal(neraca?.as_of) }}.</template>
        <template v-else><strong>Tidak seimbang — selisih {{ rupiah(neraca?.selisih) }}.</strong></template>
      </div>
      <div class="grid md:grid-cols-2 gap-4">
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div class="px-4 py-3 bg-gray-50 border-b font-semibold text-gray-700">Aset</div>
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="a in neraca?.aset || []" :key="a.id" class="border-b">
                <td class="px-4 py-2 font-mono text-xs w-20">{{ a.account_code }}</td>
                <td class="px-4 py-2">{{ a.account_name }}</td>
                <td class="px-4 py-2 text-right tabular-nums">{{ rupiah(a.amount) }}</td>
              </tr>
            </tbody>
            <tfoot class="bg-gray-50 border-t font-bold">
              <tr><td colspan="2" class="px-4 py-2.5">Total Aset</td>
                <td class="px-4 py-2.5 text-right tabular-nums">{{ rupiah(neraca?.total_aset) }}</td></tr>
            </tfoot>
          </table>
        </div>
        <div class="space-y-4">
          <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div class="px-4 py-3 bg-gray-50 border-b font-semibold text-gray-700">Liabilitas</div>
            <table class="w-full text-sm">
              <tbody>
                <tr v-for="l in neraca?.liabilitas || []" :key="l.id" class="border-b">
                  <td class="px-4 py-2 font-mono text-xs w-20">{{ l.account_code }}</td>
                  <td class="px-4 py-2">{{ l.account_name }}</td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ rupiah(l.amount) }}</td>
                </tr>
              </tbody>
              <tfoot class="bg-gray-50 border-t font-bold">
                <tr><td colspan="2" class="px-4 py-2.5">Total Liabilitas</td>
                  <td class="px-4 py-2.5 text-right tabular-nums">{{ rupiah(neraca?.total_liabilitas) }}</td></tr>
              </tfoot>
            </table>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div class="px-4 py-3 bg-gray-50 border-b font-semibold text-gray-700">Ekuitas</div>
            <table class="w-full text-sm">
              <tbody>
                <tr v-for="k in neraca?.ekuitas || []" :key="k.id" class="border-b">
                  <td class="px-4 py-2 font-mono text-xs w-20">{{ k.account_code }}</td>
                  <td class="px-4 py-2">{{ k.account_name }}</td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ rupiah(k.amount) }}</td>
                </tr>
                <!-- Laba berjalan belum masuk akun ekuitas sampai tutup buku,
                     jadi ia disebutkan terpisah supaya jumlahnya bisa ditelusuri. -->
                <tr class="border-b bg-blue-50/40">
                  <td class="px-4 py-2 font-mono text-xs w-20">—</td>
                  <td class="px-4 py-2 italic">Laba (Rugi) Berjalan</td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ rupiah(neraca?.laba_berjalan) }}</td>
                </tr>
              </tbody>
              <tfoot class="bg-gray-50 border-t font-bold">
                <tr><td colspan="2" class="px-4 py-2.5">Total Ekuitas</td>
                  <td class="px-4 py-2.5 text-right tabular-nums">{{ rupiah(neraca?.total_ekuitas) }}</td></tr>
                <tr class="border-t"><td colspan="2" class="px-4 py-2.5">Liabilitas + Ekuitas</td>
                  <td class="px-4 py-2.5 text-right tabular-nums">{{ rupiah(neraca?.total_liabilitas_ekuitas) }}</td></tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Laba Rugi ────────────────────────────────────────────────── -->
    <template v-else-if="tab === 'labarugi'">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-xl border p-4 shadow-sm">
          <p class="text-xs text-gray-500 uppercase font-medium">Pendapatan</p>
          <p class="text-xl font-black text-gray-900 mt-1">{{ rupiah(lr?.total_pendapatan) }}</p>
        </div>
        <div class="bg-white rounded-xl border p-4 shadow-sm">
          <p class="text-xs text-gray-500 uppercase font-medium">Laba Kotor</p>
          <p class="text-xl font-black text-gray-900 mt-1">{{ rupiah(lr?.laba_kotor) }}</p>
          <p v-if="lr?.margin_kotor_pct !== null" class="text-[10px] text-gray-500">
            margin {{ lr?.margin_kotor_pct }}%
          </p>
        </div>
        <div class="bg-white rounded-xl border p-4 shadow-sm">
          <p class="text-xs text-gray-500 uppercase font-medium">Laba Operasi</p>
          <p class="text-xl font-black text-gray-900 mt-1">{{ rupiah(lr?.laba_operasi) }}</p>
        </div>
        <div class="bg-white rounded-xl border p-4 shadow-sm"
          :class="Number(lr?.laba_bersih) >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'">
          <p class="text-xs uppercase font-medium"
            :class="Number(lr?.laba_bersih) >= 0 ? 'text-green-600' : 'text-red-600'">Laba Bersih</p>
          <p class="text-xl font-black mt-1"
            :class="Number(lr?.laba_bersih) >= 0 ? 'text-green-700' : 'text-red-700'">{{ rupiah(lr?.laba_bersih) }}</p>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table class="w-full text-sm">
          <tbody>
            <template v-for="grup in grupLabaRugi" :key="grup.judul">
              <tr class="bg-gray-50 border-b">
                <td colspan="2" class="px-4 py-2 font-semibold text-gray-700 text-xs uppercase">{{ grup.judul }}</td>
                <td class="px-4 py-2 text-right font-bold tabular-nums">{{ rupiah(grup.total) }}</td>
              </tr>
              <tr v-for="r in grup.baris" :key="r.id" class="border-b">
                <td class="px-4 py-2 font-mono text-xs w-20 pl-8">{{ r.account_code }}</td>
                <td class="px-4 py-2">{{ r.account_name }}</td>
                <td class="px-4 py-2 text-right tabular-nums text-gray-600">{{ rupiah(r.amount) }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ── Buku Besar ───────────────────────────────────────────────── -->
    <template v-else>
      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <label class="block text-[10px] text-gray-500 uppercase mb-1">Akun</label>
        <select v-model.number="akunDipilih" @change="muat" class="w-full md:w-1/2 border rounded-lg px-3 py-2 text-sm">
          <option :value="null">— pilih akun —</option>
          <option v-for="a in akunBisaJurnal" :key="a.id" :value="a.id">
            {{ a.account_code }} — {{ a.account_name }}
          </option>
        </select>
      </div>

      <div v-if="ledger" class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div class="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
          <div>
            <span class="font-mono text-xs">{{ ledger.account?.account_code }}</span>
            <span class="font-semibold ml-2">{{ ledger.account?.account_name }}</span>
          </div>
          <div class="text-sm">
            <span class="text-gray-500">Saldo awal {{ rupiah(ledger.saldo_awal) }}</span>
            <span class="mx-2 text-gray-300">→</span>
            <span class="font-bold">Saldo akhir {{ rupiah(ledger.saldo_akhir) }}</span>
          </div>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b">
            <tr class="text-left text-gray-600">
              <th class="px-4 py-2.5">Tanggal</th>
              <th class="px-4 py-2.5">Nomor</th>
              <th class="px-4 py-2.5">Keterangan</th>
              <th class="px-4 py-2.5">Proyek</th>
              <th class="px-4 py-2.5 text-right">Debit</th>
              <th class="px-4 py-2.5 text-right">Kredit</th>
              <th class="px-4 py-2.5 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!ledger.mutasi?.length"><td colspan="7" class="text-center py-8 text-gray-400">
              Belum ada mutasi pada rentang ini.
            </td></tr>
            <tr v-for="m in ledger.mutasi" :key="m.id" class="border-b">
              <td class="px-4 py-2">{{ tanggal(m.entry_date) }}</td>
              <td class="px-4 py-2 font-mono text-xs">{{ m.entry_number }}</td>
              <td class="px-4 py-2">{{ m.line_description || m.description }}</td>
              <td class="px-4 py-2 text-xs text-gray-500">{{ m.project_name || '-' }}</td>
              <td class="px-4 py-2 text-right tabular-nums">{{ Number(m.debit) ? rupiah(m.debit) : '' }}</td>
              <td class="px-4 py-2 text-right tabular-nums">{{ Number(m.credit) ? rupiah(m.credit) : '' }}</td>
              <td class="px-4 py-2 text-right tabular-nums font-medium">{{ rupiah(m.saldo_berjalan) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/lib/api';

const TAB = [
  { id: 'trial', label: 'Neraca Saldo' },
  { id: 'neraca', label: 'Neraca' },
  { id: 'labarugi', label: 'Laba Rugi' },
  { id: 'ledger', label: 'Buku Besar' },
];

const tab = ref('trial');
const loading = ref(false);
const dari = ref('');
const sampai = ref('');
const trial = ref<any>(null);
const neraca = ref<any>(null);
const lr = ref<any>(null);
const ledger = ref<any>(null);
const akun = ref<any[]>([]);
const akunDipilih = ref<number | null>(null);

const akunBisaJurnal = computed(() => akun.value.filter(a => !a.is_header && a.is_postable && a.is_active));
const grupLabaRugi = computed(() => !lr.value ? [] : [
  { judul: 'Pendapatan', baris: lr.value.pendapatan || [], total: lr.value.total_pendapatan },
  { judul: 'Beban Pokok Proyek', baris: lr.value.beban_pokok || [], total: lr.value.total_beban_pokok },
  { judul: 'Beban Operasional', baris: lr.value.beban_operasional || [], total: lr.value.total_beban_operasional },
  { judul: 'Pendapatan & Beban Lain', baris: lr.value.pendapatan_beban_lain || [], total: lr.value.total_lain },
  { judul: 'Pajak', baris: lr.value.pajak || [], total: lr.value.total_pajak },
].filter(g => g.baris.length));

const rupiah = (v: any) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(v) || 0);
const tanggal = (d: any) => d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

function pilihTab(id: string) { tab.value = id; muat(); }

function bukaBukuBesar(baris: any) {
  akunDipilih.value = Number(baris.id);
  tab.value = 'ledger';
  muat();
}

async function muat() {
  loading.value = true;
  try {
    const q = new URLSearchParams();
    if (dari.value) q.append('from', dari.value);
    if (sampai.value) q.append('to', sampai.value);

    if (tab.value === 'trial') {
      trial.value = (await api.get(`/gl/trial-balance?${q}`)).data;
    } else if (tab.value === 'neraca') {
      neraca.value = (await api.get(`/gl/reports/balance-sheet?as_of=${sampai.value || ''}`)).data;
    } else if (tab.value === 'labarugi') {
      lr.value = (await api.get(`/gl/reports/income-statement?${q}`)).data;
    } else if (akunDipilih.value) {
      ledger.value = (await api.get(`/gl/ledger/${akunDipilih.value}?${q}`)).data?.data;
    } else {
      ledger.value = null;
    }
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal memuat laporan');
  } finally { loading.value = false; }
}

onMounted(async () => {
  const kini = new Date();
  dari.value = new Date(kini.getFullYear(), 0, 1).toISOString().slice(0, 10);
  sampai.value = kini.toISOString().slice(0, 10);
  try { akun.value = (await api.get('/gl/coa')).data?.data || []; } catch {}
  muat();
});
</script>
