<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">📓 Jurnal Umum</h1>
        <p class="text-gray-500 text-sm mt-1">
          Buku besar: jurnal manual, jurnal otomatis dari modul lain, dan pembalikannya
        </p>
      </div>
      <button @click="bukaFormBaru"
        class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
        + Jurnal Manual
      </button>
    </div>

    <!-- Peringatan auto-posting -->
    <div v-if="setelan && !setelan.auto_posting_aktif"
      class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
      <strong>Jurnal otomatis belum aktif.</strong>
      Transaksi dari Procurement, Finance, HR, dan Aset belum menjurnal apa pun.
      Aktifkan lewat <router-link to="/finance/gl/settings" class="underline font-medium">Pengaturan GL</router-link>
      setelah periode fiskal dan saldo awal siap.
    </div>

    <!-- Filter -->
    <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label class="block text-[10px] text-gray-500 uppercase mb-1">Dari</label>
          <input v-model="filter.from" type="date" class="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-[10px] text-gray-500 uppercase mb-1">Sampai</label>
          <input v-model="filter.to" type="date" class="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-[10px] text-gray-500 uppercase mb-1">Status</label>
          <select v-model="filter.status" class="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">Semua</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
            <option value="reversed">Dibalik</option>
          </select>
        </div>
        <div>
          <label class="block text-[10px] text-gray-500 uppercase mb-1">Jenis</label>
          <select v-model="filter.journal_type" class="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">Semua</option>
            <option value="MANUAL">Manual</option>
            <option value="SYSTEM">Otomatis</option>
            <option value="OPENING">Saldo Awal</option>
            <option value="REVERSAL">Pembalikan</option>
            <option value="ADJUSTMENT">Penyesuaian</option>
          </select>
        </div>
        <div class="flex items-end">
          <button @click="muat" class="w-full px-4 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-800">
            Terapkan
          </button>
        </div>
      </div>
    </div>

    <!-- Daftar jurnal -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b">
          <tr class="text-left text-gray-600">
            <th class="px-4 py-2.5">Nomor</th>
            <th class="px-4 py-2.5">Tanggal</th>
            <th class="px-4 py-2.5">Keterangan</th>
            <th class="px-4 py-2.5">Jenis</th>
            <th class="px-4 py-2.5 text-right">Nilai</th>
            <th class="px-4 py-2.5">Status</th>
            <th class="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="7" class="text-center py-8 text-gray-400">Memuat...</td></tr>
          <tr v-else-if="!jurnal.length"><td colspan="7" class="text-center py-8 text-gray-400">
            Belum ada jurnal pada rentang ini.
          </td></tr>
          <tr v-for="j in jurnal" :key="j.id" @click="bukaDetail(j)"
            class="border-b hover:bg-blue-50/50 cursor-pointer">
            <td class="px-4 py-2.5 font-mono text-xs font-medium text-gray-700">{{ j.entry_number }}</td>
            <td class="px-4 py-2.5">{{ tanggal(j.entry_date) }}</td>
            <td class="px-4 py-2.5">
              {{ j.description }}
              <span v-if="j.source_event" class="block text-[10px] text-gray-400 font-mono">{{ j.source_event }}</span>
            </td>
            <td class="px-4 py-2.5"><span :class="kelasJenis(j.journal_type)"
              class="px-2 py-0.5 rounded text-[10px] font-semibold">{{ labelJenis(j.journal_type) }}</span></td>
            <td class="px-4 py-2.5 text-right font-semibold tabular-nums">{{ rupiah(j.total_debit) }}</td>
            <td class="px-4 py-2.5"><span :class="kelasStatus(j.status)"
              class="px-2 py-0.5 rounded text-xs font-medium">{{ labelStatus(j.status) }}</span></td>
            <td class="px-4 py-2.5 text-right text-gray-400">{{ j.line_count }} baris</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal: buat jurnal manual -->
    <div v-if="formBuka" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      @click.self="formBuka = false">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        <div class="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <h3 class="font-bold text-gray-800">Jurnal Manual Baru</h3>
          <button @click="formBuka = false" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>
        <div class="p-6 space-y-4">
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Tanggal</label>
              <input v-model="form.entry_date" type="date" class="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Jenis</label>
              <select v-model="form.journal_type" class="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="MANUAL">Manual</option>
                <option value="OPENING">Saldo Awal</option>
                <option value="ADJUSTMENT">Penyesuaian</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">No. Referensi</label>
              <input v-model="form.reference_number" type="text" class="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Keterangan</label>
            <input v-model="form.description" type="text" class="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="mis. Koreksi pembebanan beban kantor Agustus" />
          </div>

          <!-- Baris jurnal -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs font-medium text-gray-600">Baris Jurnal</label>
              <button @click="tambahBaris" class="text-xs text-blue-600 hover:underline">+ Tambah baris</button>
            </div>
            <table class="w-full text-sm border rounded-lg overflow-hidden">
              <thead class="bg-gray-50 border-b">
                <tr class="text-left text-gray-500 text-[10px] uppercase">
                  <th class="px-3 py-2">Akun</th>
                  <th class="px-3 py-2">Keterangan baris</th>
                  <th class="px-3 py-2 w-36 text-right">Debit</th>
                  <th class="px-3 py-2 w-36 text-right">Kredit</th>
                  <th class="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(b, i) in form.lines" :key="i" class="border-b">
                  <td class="px-3 py-2">
                    <select v-model.number="b.account_id" class="w-full border rounded px-2 py-1.5 text-xs">
                      <option :value="null">— pilih akun —</option>
                      <option v-for="a in akunBisaJurnal" :key="a.id" :value="a.id">
                        {{ a.account_code }} — {{ a.account_name }}
                      </option>
                    </select>
                  </td>
                  <td class="px-3 py-2">
                    <input v-model="b.description" type="text" class="w-full border rounded px-2 py-1.5 text-xs" />
                  </td>
                  <td class="px-3 py-2">
                    <input v-model.number="b.debit" type="number" step="0.01" min="0"
                      @input="b.credit = 0" class="w-full border rounded px-2 py-1.5 text-xs text-right tabular-nums" />
                  </td>
                  <td class="px-3 py-2">
                    <input v-model.number="b.credit" type="number" step="0.01" min="0"
                      @input="b.debit = 0" class="w-full border rounded px-2 py-1.5 text-xs text-right tabular-nums" />
                  </td>
                  <td class="px-3 py-2 text-center">
                    <button v-if="form.lines.length > 2" @click="form.lines.splice(i, 1)"
                      class="text-gray-400 hover:text-red-600">&times;</button>
                  </td>
                </tr>
              </tbody>
              <tfoot class="bg-gray-50 border-t font-semibold">
                <tr>
                  <td colspan="2" class="px-3 py-2 text-right text-xs text-gray-500">Total</td>
                  <td class="px-3 py-2 text-right tabular-nums text-sm">{{ rupiah(totalDebit) }}</td>
                  <td class="px-3 py-2 text-right tabular-nums text-sm">{{ rupiah(totalKredit) }}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            <!-- Selisih ditampilkan sebelum disimpan: server tetap yang
                 menegakkan, tapi tidak ada gunanya menyuruh orang menekan
                 Simpan untuk diberi tahu jurnalnya timpang. -->
            <p v-if="selisih !== 0" class="mt-2 text-xs text-red-600">
              Belum seimbang — selisih {{ rupiah(Math.abs(selisih)) }}
              ({{ selisih > 0 ? 'debit lebih besar' : 'kredit lebih besar' }}).
            </p>
            <p v-else-if="totalDebit > 0" class="mt-2 text-xs text-green-700">Seimbang.</p>
          </div>
        </div>
        <div class="px-6 py-4 border-t flex justify-end gap-2 sticky bottom-0 bg-white">
          <button @click="formBuka = false" class="px-4 py-2 border rounded-lg text-sm">Batal</button>
          <button @click="simpan" :disabled="menyimpan"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {{ menyimpan ? 'Menyimpan...' : 'Simpan sebagai Draft' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: detail jurnal -->
    <div v-if="detail" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      @click.self="detail = null">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div class="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h3 class="font-bold text-gray-800 font-mono">{{ detail.entry_number }}</h3>
            <p class="text-xs text-gray-500">{{ detail.description }}</p>
          </div>
          <button @click="detail = null" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>
        <div class="p-6 space-y-4">
          <div class="grid grid-cols-4 gap-3 text-sm">
            <div><span class="block text-[10px] text-gray-500 uppercase">Tanggal</span>{{ tanggal(detail.entry_date) }}</div>
            <div><span class="block text-[10px] text-gray-500 uppercase">Periode</span>{{ detail.period_name || '-' }}</div>
            <div><span class="block text-[10px] text-gray-500 uppercase">Jenis</span>{{ labelJenis(detail.journal_type) }}</div>
            <div><span class="block text-[10px] text-gray-500 uppercase">Status</span>
              <span :class="kelasStatus(detail.status)" class="px-2 py-0.5 rounded text-xs">{{ labelStatus(detail.status) }}</span>
            </div>
          </div>

          <div v-if="detail.reversal_entry_number" class="text-xs bg-gray-50 border rounded-lg px-3 py-2">
            Sudah dibalik lewat <strong class="font-mono">{{ detail.reversal_entry_number }}</strong>.
            <span v-if="detail.reversal_reason">Alasan: {{ detail.reversal_reason }}</span>
          </div>
          <div v-if="detail.original_entry_number" class="text-xs bg-gray-50 border rounded-lg px-3 py-2">
            Ini pembalikan atas <strong class="font-mono">{{ detail.original_entry_number }}</strong>.
          </div>

          <table class="w-full text-sm border rounded-lg overflow-hidden">
            <thead class="bg-gray-50 border-b">
              <tr class="text-left text-gray-500 text-[10px] uppercase">
                <th class="px-3 py-2">Akun</th>
                <th class="px-3 py-2">Keterangan</th>
                <th class="px-3 py-2">Proyek</th>
                <th class="px-3 py-2 text-right">Debit</th>
                <th class="px-3 py-2 text-right">Kredit</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in detail.lines" :key="l.id" class="border-b">
                <td class="px-3 py-2"><span class="font-mono text-xs">{{ l.account_code }}</span>
                  <span class="block text-xs text-gray-500">{{ l.account_name }}</span></td>
                <td class="px-3 py-2 text-gray-600">{{ l.description || '-' }}</td>
                <td class="px-3 py-2 text-gray-500 text-xs">{{ l.project_name || '-' }}</td>
                <td class="px-3 py-2 text-right tabular-nums">{{ Number(l.debit) ? rupiah(l.debit) : '' }}</td>
                <td class="px-3 py-2 text-right tabular-nums">{{ Number(l.credit) ? rupiah(l.credit) : '' }}</td>
              </tr>
            </tbody>
            <tfoot class="bg-gray-50 border-t font-semibold">
              <tr>
                <td colspan="3" class="px-3 py-2 text-right text-xs text-gray-500">Total</td>
                <td class="px-3 py-2 text-right tabular-nums">{{ rupiah(detail.total_debit) }}</td>
                <td class="px-3 py-2 text-right tabular-nums">{{ rupiah(detail.total_credit) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="px-6 py-4 border-t flex justify-between items-center">
          <p class="text-xs text-gray-500">
            <template v-if="detail.status === 'posted'">
              Jurnal yang sudah di-post tidak bisa diubah atau dihapus — koreksinya lewat pembalikan.
            </template>
          </p>
          <div class="flex gap-2">
            <button v-if="detail.status === 'draft'" @click="hapusDraft"
              class="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50">Hapus draft</button>
            <button v-if="detail.status === 'draft'" @click="post"
              class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">Post</button>
            <button v-if="detail.status === 'posted'" @click="balik"
              class="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">Balikkan</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/lib/api';

const jurnal = ref<any[]>([]);
const akun = ref<any[]>([]);
const setelan = ref<any>(null);
const loading = ref(false);
const menyimpan = ref(false);
const formBuka = ref(false);
const detail = ref<any>(null);

const filter = ref<any>({ from: '', to: '', status: '', journal_type: '' });
const barisKosong = () => ({ account_id: null, description: '', debit: 0, credit: 0 });
const form = ref<any>({ entry_date: '', journal_type: 'MANUAL', description: '', reference_number: '', lines: [] });

const akunBisaJurnal = computed(() => akun.value.filter(a => !a.is_header && a.is_postable && a.is_active));
const totalDebit = computed(() => form.value.lines.reduce((t: number, b: any) => t + (Number(b.debit) || 0), 0));
const totalKredit = computed(() => form.value.lines.reduce((t: number, b: any) => t + (Number(b.credit) || 0), 0));
const selisih = computed(() => Math.round((totalDebit.value - totalKredit.value) * 10000) / 10000);

const rupiah = (v: any) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(v) || 0);
const tanggal = (d: any) => d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

const labelJenis = (t: string) => ({
  MANUAL: 'Manual', SYSTEM: 'Otomatis', OPENING: 'Saldo Awal',
  CLOSING: 'Tutup Buku', REVERSAL: 'Pembalikan', ADJUSTMENT: 'Penyesuaian',
} as Record<string, string>)[t] || t;
const kelasJenis = (t: string) => ({
  SYSTEM: 'bg-blue-100 text-blue-700', MANUAL: 'bg-gray-100 text-gray-600',
  OPENING: 'bg-violet-100 text-violet-700', REVERSAL: 'bg-amber-100 text-amber-800',
  ADJUSTMENT: 'bg-teal-100 text-teal-700',
} as Record<string, string>)[t] || 'bg-gray-100 text-gray-600';
const labelStatus = (s: string) => ({ draft: 'Draft', posted: 'Posted', reversed: 'Dibalik' } as Record<string, string>)[s] || s;
const kelasStatus = (s: string) => ({
  draft: 'bg-gray-100 text-gray-600', posted: 'bg-green-100 text-green-700',
  reversed: 'bg-amber-100 text-amber-800',
} as Record<string, string>)[s] || 'bg-gray-100 text-gray-600';

const pesanGagal = (e: any, bawaan: string) => e?.response?.data?.error || bawaan;

async function muat() {
  loading.value = true;
  try {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filter.value)) if (v) q.append(k, String(v));
    const r = await api.get(`/gl/journal-entries?${q.toString()}`);
    jurnal.value = r.data?.data || [];
  } catch (e) {
    console.error('Gagal memuat jurnal', e);
  } finally { loading.value = false; }
}

async function muatAkun() {
  try { akun.value = (await api.get('/gl/coa')).data?.data || []; }
  catch (e) { console.error('Gagal memuat bagan akun', e); }
}
async function muatSetelan() {
  try { setelan.value = (await api.get('/gl/settings')).data; }
  catch (e) { console.error('Gagal memuat setelan GL', e); }
}

function bukaFormBaru() {
  form.value = {
    entry_date: new Date().toISOString().slice(0, 10),
    journal_type: 'MANUAL', description: '', reference_number: '',
    lines: [barisKosong(), barisKosong()],
  };
  formBuka.value = true;
}
function tambahBaris() { form.value.lines.push(barisKosong()); }

async function simpan() {
  menyimpan.value = true;
  try {
    const lines = form.value.lines
      .filter((b: any) => b.account_id && ((Number(b.debit) || 0) > 0 || (Number(b.credit) || 0) > 0));
    await api.post('/gl/journal-entries', { ...form.value, lines });
    formBuka.value = false;
    await muat();
  } catch (e: any) {
    // Sebab penolakan ditampilkan apa adanya. Server menyebut akun mana yang
    // header, periode mana yang tertutup, atau berapa selisihnya — menggantinya
    // dengan "gagal menyimpan" membuang satu-satunya petunjuk yang berguna.
    alert(pesanGagal(e, 'Gagal menyimpan jurnal'));
  } finally { menyimpan.value = false; }
}

async function bukaDetail(j: any) {
  try { detail.value = (await api.get(`/gl/journal-entries/${j.id}`)).data?.data; }
  catch (e: any) { alert(pesanGagal(e, 'Gagal memuat detail jurnal')); }
}

async function post() {
  try {
    await api.put(`/gl/journal-entries/${detail.value.id}/post`);
    await bukaDetail(detail.value); await muat();
  } catch (e: any) { alert(pesanGagal(e, 'Gagal mem-post jurnal')); }
}

async function balik() {
  const alasan = prompt('Alasan pembalikan (wajib diisi, tercatat permanen):');
  if (!alasan) return;
  try {
    const r = await api.put(`/gl/journal-entries/${detail.value.id}/reverse`, { reason: alasan });
    alert(r.data?.message || 'Jurnal dibalik');
    detail.value = null; await muat();
  } catch (e: any) { alert(pesanGagal(e, 'Gagal membalik jurnal')); }
}

async function hapusDraft() {
  if (!confirm(`Hapus draft ${detail.value.entry_number}?`)) return;
  try {
    await api.delete(`/gl/journal-entries/${detail.value.id}`);
    detail.value = null; await muat();
  } catch (e: any) { alert(pesanGagal(e, 'Gagal menghapus draft')); }
}

onMounted(() => {
  const kini = new Date();
  filter.value.from = new Date(kini.getFullYear(), kini.getMonth(), 1).toISOString().slice(0, 10);
  filter.value.to = new Date(kini.getFullYear(), kini.getMonth() + 1, 0).toISOString().slice(0, 10);
  muat(); muatAkun(); muatSetelan();
});
</script>
