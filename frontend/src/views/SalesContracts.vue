<template>
  <div class="min-h-screen bg-gray-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Contracts</h1>
          <p class="text-sm text-gray-500 mt-0.5">
            Nilai kontrak asli, change order yang disetujui, dan nilai yang berlaku sekarang.
          </p>
        </div>
        <span v-if="memuat" class="text-sm text-gray-500">Memuat…</span>
      </div>

      <!-- Kegagalan memuat TIDAK boleh menyamar sebagai "belum ada kontrak" -->
      <div v-if="galat" class="mb-4 border border-red-200 bg-red-50 rounded-lg px-4 py-3">
        <p class="text-sm font-semibold text-red-800">❌ {{ galat }}</p>
        <p class="text-xs text-red-600 mt-1">
          Daftar di bawah tidak menggambarkan isi sebenarnya.
          <button @click="muat" class="underline font-medium">Coba muat lagi</button>
        </p>
      </div>

      <div v-if="!memuat && !galat && !items.length" class="text-center py-16 bg-white rounded-xl border">
        <p class="text-gray-700 font-medium">Belum ada kontrak</p>
        <p class="text-sm text-gray-500 mt-1">
          Kontrak terbentuk otomatis saat sebuah proposal menjadi <strong>Deal</strong>.
        </p>
      </div>

      <div v-if="items.length" class="bg-white rounded-xl border overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-600">
              <tr>
                <th class="text-left px-4 py-3 font-semibold">Nomor</th>
                <th class="text-left px-4 py-3 font-semibold">Project</th>
                <th class="text-left px-4 py-3 font-semibold">Client</th>
                <th class="text-right px-4 py-3 font-semibold">Nilai Asli</th>
                <th class="text-right px-4 py-3 font-semibold">CO Disetujui</th>
                <th class="text-right px-4 py-3 font-semibold">Nilai Berlaku</th>
                <th class="text-right px-4 py-3 font-semibold">Tertunda</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="c in items" :key="c.id" class="hover:bg-gray-50 cursor-pointer"
                @click="buka(c.id)">
                <td class="px-4 py-3 font-mono text-xs text-gray-700">{{ c.contract_number }}</td>
                <td class="px-4 py-3">
                  <div class="font-medium text-gray-900">{{ c.project_name || '-' }}</div>
                  <div class="text-xs text-gray-400">{{ c.project_number }}</div>
                </td>
                <td class="px-4 py-3 text-gray-700">{{ c.client_name || '-' }}</td>
                <td class="px-4 py-3 text-right tabular-nums">{{ rp(c.nilai?.original_value) }}</td>
                <td class="px-4 py-3 text-right tabular-nums"
                  :class="Number(c.nilai?.approved_co_value) ? 'text-emerald-700 font-medium' : 'text-gray-400'">
                  {{ Number(c.nilai?.approved_co_value) ? rp(c.nilai.approved_co_value) : '—' }}
                </td>
                <td class="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                  {{ rp(c.nilai?.revised_value) }}
                </td>
                <td class="px-4 py-3 text-right tabular-nums">
                  <!-- Yang belum disetujui BUKAN bagian nilai kontrak, tapi
                       menyembunyikannya membuat eksposur tidak terlihat sampai
                       terlambat. Ditampilkan terpisah dan ditandai. -->
                  <span v-if="Number(c.nilai?.pending_co_value)" class="text-amber-700">
                    {{ rp(c.nilai.pending_co_value) }}
                  </span>
                  <span v-else class="text-gray-300">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Detail -->
      <div v-if="detail" class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
        @click.self="detail = null">
        <div class="bg-white rounded-xl max-w-4xl w-full max-h-[88vh] overflow-y-auto">
          <div class="px-5 py-4 border-b flex items-start justify-between sticky top-0 bg-white">
            <div>
              <div class="font-mono text-xs text-gray-500">{{ detail.contract_number }}</div>
              <h2 class="text-lg font-bold text-gray-900">{{ detail.project_name }}</h2>
              <div class="text-sm text-gray-500">{{ detail.client_name }}</div>
            </div>
            <button @click="detail = null" class="text-gray-400 hover:text-gray-700 text-xl">×</button>
          </div>

          <div class="p-5 space-y-5">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div class="bg-gray-50 rounded-lg p-3">
                <div class="text-xs text-gray-500">Nilai Asli</div>
                <div class="font-bold text-gray-900 tabular-nums">{{ rp(detail.nilai?.original_value) }}</div>
              </div>
              <div class="bg-emerald-50 rounded-lg p-3">
                <div class="text-xs text-emerald-700">CO Disetujui</div>
                <div class="font-bold text-emerald-800 tabular-nums">{{ rp(detail.nilai?.approved_co_value) }}</div>
              </div>
              <div class="bg-slate-900 rounded-lg p-3">
                <div class="text-xs text-slate-300">Nilai Berlaku</div>
                <div class="font-bold text-white tabular-nums">{{ rp(detail.nilai?.revised_value) }}</div>
              </div>
              <div class="bg-amber-50 rounded-lg p-3">
                <div class="text-xs text-amber-700">Tertunda</div>
                <div class="font-bold text-amber-800 tabular-nums">{{ rp(detail.nilai?.pending_co_value) }}</div>
              </div>
            </div>

            <!-- Baseline yang berubah adalah keadaan yang harus terlihat, bukan
                 disembunyikan: dokumen kontraknya tidak lagi cocok dengan
                 potret saat award. -->
            <div v-if="detail.baseline_checksum && detail.baseline_checksum_sekarang
                       && detail.baseline_checksum !== detail.baseline_checksum_sekarang"
              class="border border-red-200 bg-red-50 rounded-lg px-4 py-3 text-sm text-red-800">
              ⚠️ Baseline kontrak ini <strong>berbeda dari potret saat award</strong>.
              Checksum tersimpan {{ detail.baseline_checksum.slice(0, 12) }}…,
              sekarang {{ detail.baseline_checksum_sekarang.slice(0, 12) }}…
            </div>

            <div>
              <h3 class="font-semibold text-gray-800 mb-2">
                Change Order
                <span class="text-xs font-normal text-gray-500">({{ detail.change_orders?.length || 0 }})</span>
              </h3>
              <div v-if="!detail.change_orders?.length" class="text-sm text-gray-500">
                Belum ada change order.
              </div>
              <table v-else class="w-full text-sm">
                <thead class="text-gray-500 text-xs">
                  <tr>
                    <th class="text-left py-1.5">Nomor</th>
                    <th class="text-left py-1.5">Judul</th>
                    <th class="text-left py-1.5">Sumber</th>
                    <th class="text-right py-1.5">Nilai</th>
                    <th class="text-right py-1.5">Hari</th>
                    <th class="text-left py-1.5 pl-3">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="co in detail.change_orders" :key="co.id">
                    <td class="py-2 font-mono text-xs">{{ co.co_number }}</td>
                    <td class="py-2">{{ co.title }}</td>
                    <td class="py-2 text-gray-500 text-xs">{{ co.source }}</td>
                    <td class="py-2 text-right tabular-nums">{{ rp(co.value_delta) }}</td>
                    <td class="py-2 text-right tabular-nums">{{ co.schedule_days_delta || 0 }}</td>
                    <td class="py-2 pl-3">
                      <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                        :class="warnaStatus(co.status)">{{ co.status }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <details>
              <summary class="cursor-pointer font-semibold text-gray-800 text-sm">
                Baseline BOQ saat award ({{ detail.baseline?.length || 0 }} baris)
              </summary>
              <table class="w-full text-xs mt-2">
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="b in detail.baseline" :key="b.id"
                    :class="Number(b.is_section) ? 'bg-gray-50 font-semibold' : ''">
                    <td class="py-1.5 pr-2 text-gray-400">{{ b.line_no }}</td>
                    <td class="py-1.5">{{ Number(b.is_section) ? b.section_label : b.description }}</td>
                    <td class="py-1.5 text-right tabular-nums text-gray-500">
                      {{ Number(b.is_section) ? '' : `${b.qty} ${b.unit || ''}` }}
                    </td>
                    <td class="py-1.5 text-right tabular-nums">
                      {{ Number(b.is_section) ? '' : rp(b.amount) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </details>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/lib/api';

const items = ref<any[]>([]);
const detail = ref<any>(null);
const memuat = ref(false);
const galat = ref('');

/** Format rupiah tanpa `toLocaleString` — hasilnya tidak boleh bergantung locale runtime. */
const rp = (v: any) => {
  const n = Number(v) || 0;
  const [b, p] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}Rp ${b.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${p}`;
};

const warnaStatus = (s: string) => ({
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-400',
}[s] || 'bg-gray-100 text-gray-700');

const muat = async () => {
  memuat.value = true;
  galat.value = '';
  try {
    const { data } = await api.get('/contracts');
    items.value = data?.items || [];
  } catch (e: any) {
    galat.value = e?.response?.data?.error || 'Gagal memuat daftar kontrak.';
    items.value = [];
  } finally {
    memuat.value = false;
  }
};

const buka = async (id: number) => {
  try {
    const { data } = await api.get(`/contracts/${id}`);
    detail.value = data;
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal memuat kontrak.');
  }
};

onMounted(muat);
</script>
