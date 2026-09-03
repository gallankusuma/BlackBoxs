<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">⚙️ Pengaturan General Ledger</h1>
      <p class="text-gray-500 text-sm mt-1">
        Periode fiskal, pemetaan akun untuk jurnal otomatis, dan kapan jurnal otomatis mulai berlaku
      </p>
    </div>

    <!-- ── Jurnal otomatis ──────────────────────────────────────────── -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div class="px-5 py-3 bg-gray-50 border-b font-semibold text-gray-700">Jurnal Otomatis</div>
      <div class="p-5 space-y-4">
        <div :class="setelan?.auto_posting_aktif
              ? 'bg-green-50 border-green-200 text-green-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'"
          class="border rounded-lg px-4 py-3 text-sm">
          <template v-if="setelan?.auto_posting_aktif">
            <strong>Aktif.</strong> Transaksi bertanggal
            <strong>{{ tanggal(setelan.auto_posting_start_date) }}</strong> ke atas menjurnal sendiri.
            Transaksi sebelum tanggal itu tidak pernah dijurnal.
          </template>
          <template v-else>
            <strong>Belum aktif.</strong> Belum ada satu pun transaksi yang menjurnal.
          </template>
        </div>

        <!-- Urutannya penting dan disebutkan, karena melewatkan satu langkah
             menghasilkan kegagalan yang muncul di layar orang lain. -->
        <div class="text-sm text-gray-600 space-y-1">
          <p class="font-medium text-gray-800">Sebelum menyalakannya:</p>
          <ol class="list-decimal list-inside space-y-1">
            <li>Periode fiskal untuk tahun yang dipakai sudah dibuat (di bawah).</li>
            <li>Saldo awal sudah dimasukkan sebagai jurnal bertipe <strong>Saldo Awal</strong>,
              angkanya dari neraca terakhir — bukan dari data di aplikasi ini.</li>
            <li>Pemetaan akun di bawah tidak ada yang bermasalah.</li>
          </ol>
          <p class="text-gray-500">
            Transaksi lama <strong>tidak</strong> akan dijurnal mundur. Menjurnal transaksi yang aturannya
            belum ada saat itu menghasilkan buku besar yang tidak bisa direkonsiliasi dengan apa pun.
          </p>
        </div>

        <div class="flex items-end gap-2">
          <div>
            <label class="block text-[10px] text-gray-500 uppercase mb-1">Tanggal mulai</label>
            <input v-model="tanggalMulai" type="date" class="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <button @click="simpanTanggalMulai"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            Simpan
          </button>
          <button v-if="setelan?.auto_posting_aktif" @click="matikan"
            class="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50">
            Matikan
          </button>
        </div>
      </div>
    </div>

    <!-- ── Periode fiskal ───────────────────────────────────────────── -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div class="px-5 py-3 bg-gray-50 border-b flex items-center justify-between">
        <span class="font-semibold text-gray-700">Periode Fiskal</span>
        <div class="flex items-center gap-2">
          <input v-model.number="tahunBaru" type="number" min="2000" max="2100"
            class="border rounded-lg px-3 py-1.5 text-sm w-28" />
          <button @click="buatPeriode" class="px-3 py-1.5 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-800">
            Buat 12 periode
          </button>
        </div>
      </div>
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b">
          <tr class="text-left text-gray-600">
            <th class="px-4 py-2.5">Periode</th>
            <th class="px-4 py-2.5">Rentang</th>
            <th class="px-4 py-2.5 text-right">Jurnal Posted</th>
            <th class="px-4 py-2.5">Status</th>
            <th class="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!periode.length"><td colspan="5" class="text-center py-8 text-gray-400">
            Belum ada periode fiskal. Buat dulu — tanpa itu, jurnal pertama akan ditolak.
          </td></tr>
          <tr v-for="p in periode" :key="p.id" class="border-b">
            <td class="px-4 py-2 font-medium">{{ p.period_name }}</td>
            <td class="px-4 py-2 text-gray-500 text-xs">{{ tanggal(p.start_date) }} – {{ tanggal(p.end_date) }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ p.posted_entries }}</td>
            <td class="px-4 py-2">
              <span :class="p.status === 'closed' ? 'bg-gray-200 text-gray-700' : 'bg-green-100 text-green-700'"
                class="px-2 py-0.5 rounded text-xs font-medium">
                {{ p.status === 'closed' ? 'Tertutup' : 'Terbuka' }}
              </span>
            </td>
            <td class="px-4 py-2 text-right">
              <button v-if="p.status !== 'closed'" @click="tutup(p)"
                class="text-xs text-gray-500 hover:text-gray-800">Tutup</button>
              <button v-else @click="bukaLagi(p)" class="text-xs text-amber-600 hover:text-amber-800">Buka kembali</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Pemetaan akun ────────────────────────────────────────────── -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div class="px-5 py-3 bg-gray-50 border-b font-semibold text-gray-700">
        Pemetaan Akun untuk Jurnal Otomatis
      </div>

      <div class="p-5 pb-0 text-sm text-gray-600">
        Bentuk jurnalnya ada di kode — itu logika akuntansi. Yang bisa diubah di sini hanya
        <strong>akun mana</strong> yang mengisi tiap peran, jadi memindahkan beban ke akun lain tidak
        perlu deploy ulang.
      </div>

      <!-- Pemetaan rusak akan meledak saat jurnalnya dibentuk — di tengah
           transaksi bisnis orang lain, jam berapa pun itu. Ditampilkan di sini
           supaya ketahuan sebelum kejadian. -->
      <div v-if="bermasalah.length" class="mx-5 mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
        <strong>{{ bermasalah.length }} pemetaan bermasalah.</strong>
        Akunnya tidak ada, sudah nonaktif, atau akun header — jurnal otomatisnya akan gagal dan
        membatalkan transaksi bisnis yang memicunya.
        <div class="mt-1 font-mono text-xs">
          {{ bermasalah.map((b) => `${b.event_code}/${b.role} → ${b.account_code}`).join(', ') }}
        </div>
      </div>

      <div class="p-5 space-y-4">
        <div v-for="(peran, event) in petaPerEvent" :key="event"
          class="border rounded-lg overflow-hidden">
          <div class="px-4 py-2 bg-gray-50 border-b font-mono text-xs font-semibold text-gray-700">
            {{ event }}
          </div>
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="m in peran" :key="m.id" class="border-b last:border-b-0">
                <td class="px-4 py-2 w-40 font-mono text-xs text-gray-600">{{ m.role }}</td>
                <td class="px-4 py-2 text-xs text-gray-500">{{ m.note || '' }}</td>
                <td class="px-4 py-2 w-80">
                  <select :value="m.account_code" @change="ubahPeta(m, $event)"
                    class="w-full border rounded px-2 py-1.5 text-xs"
                    :class="!m.account_name || m.is_header || !m.account_active ? 'border-red-300 bg-red-50' : ''">
                    <option v-for="a in akunBisaJurnal" :key="a.id" :value="a.account_code">
                      {{ a.account_code }} — {{ a.account_name }}
                    </option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/lib/api';

const setelan = ref<any>(null);
const periode = ref<any[]>([]);
const peta = ref<any[]>([]);
const bermasalah = ref<any[]>([]);
const akun = ref<any[]>([]);
const tanggalMulai = ref('');
const tahunBaru = ref(new Date().getFullYear());

const akunBisaJurnal = computed(() => akun.value.filter(a => !a.is_header && a.is_postable && a.is_active));
const petaPerEvent = computed(() => {
  const g: Record<string, any[]> = {};
  for (const m of peta.value) (g[m.event_code] ||= []).push(m);
  return g;
});

const tanggal = (d: any) => d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const gagal = (e: any, bawaan: string) => alert(e?.response?.data?.error || bawaan);

async function muat() {
  try {
    const [s, p, m, a] = await Promise.all([
      api.get('/gl/settings'),
      api.get('/gl/fiscal-periods'),
      api.get('/gl/mappings'),
      api.get('/gl/coa'),
    ]);
    setelan.value = s.data;
    tanggalMulai.value = s.data?.auto_posting_start_date || '';
    periode.value = p.data?.data || [];
    peta.value = m.data?.data || [];
    bermasalah.value = m.data?.bermasalah || [];
    akun.value = a.data?.data || [];
  } catch (e: any) { gagal(e, 'Gagal memuat pengaturan GL'); }
}

async function simpanTanggalMulai() {
  if (!tanggalMulai.value) return gagal(null, 'Isi tanggal mulainya dulu');
  if (!confirm(
    `Mulai menjurnal otomatis untuk transaksi bertanggal ${tanggalMulai.value} ke atas?\n\n` +
    `Transaksi sebelum tanggal itu tidak akan pernah dijurnal.`
  )) return;
  try {
    const r = await api.put('/gl/settings/auto-posting-start', { start_date: tanggalMulai.value });
    alert(r.data?.message || 'Tersimpan');
    await muat();
  } catch (e: any) { gagal(e, 'Gagal menyimpan tanggal mulai'); }
}

async function matikan() {
  if (!confirm('Matikan jurnal otomatis? Transaksi baru berhenti menjurnal sampai dinyalakan lagi.')) return;
  try {
    await api.put('/gl/settings/auto-posting-start', { start_date: null });
    await muat();
  } catch (e: any) { gagal(e, 'Gagal mematikan jurnal otomatis'); }
}

async function buatPeriode() {
  try {
    const r = await api.post('/gl/fiscal-periods/generate', { fiscal_year: tahunBaru.value });
    alert(r.data?.message || 'Periode dibuat');
    await muat();
  } catch (e: any) { gagal(e, 'Gagal membuat periode'); }
}

async function tutup(p: any) {
  if (!confirm(`Tutup ${p.period_name}? Setelah ditutup, tidak ada jurnal baru yang bisa masuk ke periode itu.`)) return;
  try { await api.put(`/gl/fiscal-periods/${p.id}/close`); await muat(); }
  catch (e: any) { gagal(e, 'Gagal menutup periode'); }
}

async function bukaLagi(p: any) {
  const alasan = prompt(`Alasan membuka kembali ${p.period_name} (wajib, tercatat permanen):`);
  if (!alasan) return;
  try { await api.put(`/gl/fiscal-periods/${p.id}/reopen`, { reason: alasan }); await muat(); }
  catch (e: any) { gagal(e, 'Gagal membuka periode'); }
}

async function ubahPeta(m: any, ev: Event) {
  const kode = (ev.target as HTMLSelectElement).value;
  try {
    const r = await api.put(`/gl/mappings/${m.id}`, { account_code: kode });
    await muat();
    console.log(r.data?.message);
  } catch (e: any) { gagal(e, 'Gagal mengubah pemetaan'); await muat(); }
}

onMounted(muat);
</script>
