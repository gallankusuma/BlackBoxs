<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <div class="max-w-7xl mx-auto">

      <!-- Keadaan memuat & gagal dinyatakan.
           Sebelumnya kegagalan apa pun hanya masuk console, sementara halaman
           tetap merender dokumen RAB lengkap dengan tombol Print dan seluruh
           angka Rp0 — dokumen kosong yang tampak sah dan bisa diedarkan. -->
      <div v-if="memuat" class="rounded-lg bg-white p-8 text-center text-gray-500 shadow-sm">
        ⏳ Memuat dokumen RAB…
      </div>

      <div v-else-if="galatMuat" class="rounded-lg border border-red-200 bg-red-50 p-6 shadow-sm">
        <p class="font-semibold text-red-800">Dokumen RAB tidak bisa dimuat</p>
        <p class="mt-1 text-sm text-red-700">{{ galatMuat }}</p>
        <p class="mt-2 text-sm text-red-700">
          Yang ditampilkan di bawah <strong>bukan</strong> dokumen kosong bernilai nol —
          memang tidak ada yang bisa ditampilkan. Jangan dicetak atau diedarkan.
        </p>
        <div class="mt-4 flex gap-3">
          <button @click="muatRab"
            class="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">
            Coba muat ulang
          </button>
          <button @click="goBack"
            class="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-800 hover:bg-red-100">
            Kembali
          </button>
        </div>
      </div>

      <div v-else-if="!sections.length" class="rounded-lg border border-amber-300 bg-amber-50 p-6 shadow-sm">
        <p class="font-semibold text-amber-900">Proposal ini belum punya baris RAB</p>
        <p class="mt-1 text-sm text-amber-800">
          Tambahkan pekerjaan di editor proposal lebih dulu. Dokumen tanpa baris
          tidak bisa dipakai sebagai penawaran.
        </p>
        <button @click="goBack"
          class="mt-4 rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm text-amber-900 hover:bg-amber-100">
          Kembali ke proposal
        </button>
      </div>

      <template v-else>
      <!-- Header -->
      <div class="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div class="flex justify-between items-start mb-6">
          <div>
            <h1 class="text-3xl font-bold text-gray-900">RAB - Rencana Anggaran Biaya</h1>
            <p class="text-gray-600 mt-2">{{ proposal?.projectName }}</p>
          </div>
          <div class="flex gap-3">
            <button
              @click="printRAB"
              :disabled="!dokumenSiap"
              class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
            <!--
              Tombol Export Excel disembunyikan atas permintaan pemilik pekerjaan
              (13 Agustus 2026), bukan dihapus.

              Alasannya: format ekspor belum dibereskan (EST-MTO-027 masih
              terbuka), sementara angka RAB baru saja berubah cukup besar setelah
              perbaikan kalkulator MTO. Berkas yang terlanjur diedarkan lebih
              sulit ditarik daripada tombol yang belum ditampilkan.

              Untuk menyalakan kembali: hapus `v-if="false"` di bawah ini.
              Fungsi `exportToExcel` sengaja dibiarkan utuh.
            -->
            <button data-fitur="import-export"
              v-if="false"
              @click="exportToExcel"
              class="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Excel
            </button>
            <button
              @click="goBack"
              class="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
              Kembali
            </button>
          </div>
        </div>

        <!-- Project Details -->
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p class="text-gray-600">No. Proposal</p>
            <p class="font-semibold">{{ proposal?.proposalNumber }}</p>
          </div>
          <div>
            <p class="text-gray-600">Revisi</p>
            <p class="font-semibold">{{ proposal?.revision }}</p>
          </div>
          <div>
            <p class="text-gray-600">Client</p>
            <p class="font-semibold">{{ proposal?.client }}</p>
          </div>
          <div>
            <p class="text-gray-600">Lokasi</p>
            <p class="font-semibold">{{ proposal?.lokasi }}</p>
          </div>
        </div>
      </div>

      <!-- RAB Table -->
      <div class="bg-white rounded-lg shadow-sm overflow-hidden mb-6">
        <table class="w-full text-sm">
          <thead class="bg-blue-600 text-white sticky top-0">
            <tr>
              <th class="px-4 py-3 text-left">NO</th>
              <th class="px-4 py-3 text-left">DISIPLIN</th>
              <th class="px-4 py-3 text-left">SUB DISIPLIN</th>
              <th class="px-4 py-3 text-left">PEKERJAAN</th>
              <th class="px-4 py-3 text-left">AHSP</th>
              <th class="px-4 py-3 text-left">KODE</th>
              <th class="px-4 py-3 text-right">VOLUME</th>
              <th class="px-4 py-3 text-right">HARGA SATUAN</th>
              <th class="px-4 py-3 text-right">JUMLAH HARGA</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <template v-for="(section, sectionIdx) in sections" :key="sectionIdx">
              <!-- Discipline Row -->
              <tr class="bg-blue-50 hover:bg-blue-100 cursor-pointer" @click="toggleSection(sectionIdx)">
                <td colspan="9" class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <svg
                      :class="['w-5 h-5 transition-transform', expandedSections[sectionIdx] ? 'rotate-90' : '']"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" />
                    </svg>
                    <span class="font-bold">{{ section.code }} - {{ section.name }}</span>
                  </div>
                </td>
              </tr>

              <!-- Collapsed Content -->
              <template v-if="expandedSections[sectionIdx]">
                <!-- Sub-discipline headers -->
                <template v-for="(subSection, subIdx) in section.subDisciplines" :key="`${sectionIdx}-${subIdx}`">
                  <tr class="bg-gray-50" v-if="subSection.items.length > 0">
                    <td colspan="9" class="px-8 py-2">
                      <div class="font-semibold text-gray-700">
                        {{ subSection.code }} - {{ subSection.name }}
                      </div>
                    </td>
                  </tr>

                  <!-- Items -->
                  <tr
                    v-for="(item, itemIdx) in subSection.items"
                    :key="`${sectionIdx}-${subIdx}-${itemIdx}`"
                    class="hover:bg-gray-100"
                  >
                    <td class="px-4 py-3 text-gray-600">{{ item.rowNo }}</td>
                    <td class="px-4 py-3 text-gray-600">{{ section.name }}</td>
                    <td class="px-4 py-3 text-gray-600">{{ subSection.name }}</td>
                    <td class="px-4 py-3">{{ item.ahspName }}</td>
                    <td class="px-4 py-3 text-gray-600">{{ item.ahspCode }}</td>
                    <td class="px-4 py-3 text-gray-600">{{ item.ahspCode }}</td>
                    <td class="px-4 py-3 text-right">{{ formatNumber(item.qty) }} {{ item.unit }}</td>
                    <td class="px-4 py-3 text-right">{{ formatCurrency(item.unitPrice) }}</td>
                    <td class="px-4 py-3 text-right font-semibold">{{ formatCurrency(item.totalPrice) }}</td>
                  </tr>

                  <!-- Sub-discipline Subtotal -->
                  <tr class="bg-blue-100 font-semibold" v-if="subSection.items.length > 0">
                    <td colspan="8" class="px-8 py-2 text-right">SUB TOTAL {{ subSection.code }}</td>
                    <td class="px-4 py-3 text-right">{{ formatCurrency(subSection.subtotal) }}</td>
                  </tr>
                </template>

                <!-- Discipline Total -->
                <tr class="bg-blue-200 font-bold">
                  <td colspan="8" class="px-4 py-3 text-right">TOTAL {{ section.code }} - {{ section.name }}</td>
                  <td class="px-4 py-3 text-right">{{ formatCurrency(section.totalAmount) }}</td>
                </tr>
              </template>
            </template>

            <!-- Penutup dokumen.
                 Dulu di sini hanya ada satu baris berlabel "GRAND TOTAL" yang
                 isinya biaya langsung saja, sementara beberapa baris di bawah
                 layar mencetak "TOTAL PROYEK" yang sudah memuat overhead dan
                 kontinjensi. Untuk overhead bukan nol, satu dokumen memuat dua
                 total berbeda tanpa satu pun keterangan bahwa yang pertama
                 belum lengkap. Sekarang penutupnya dieja bertingkat sehingga
                 dokumennya rekonsiliasi baris demi baris. -->
            <tr class="bg-blue-100 font-bold">
              <td colspan="8" class="px-4 py-3 text-right">JUMLAH BIAYA LANGSUNG</td>
              <td class="px-4 py-3 text-right">{{ formatCurrency(grandTotal) }}</td>
            </tr>
            <tr v-if="summary.overhead" class="bg-blue-50">
              <td colspan="8" class="px-4 py-2 text-right">Overhead &amp; Profit</td>
              <td class="px-4 py-2 text-right">{{ formatCurrency(summary.overhead) }}</td>
            </tr>
            <tr v-if="summary.riskContingency" class="bg-blue-50">
              <td colspan="8" class="px-4 py-2 text-right">Risiko &amp; Kontinjensi</td>
              <td class="px-4 py-2 text-right">{{ formatCurrency(summary.riskContingency) }}</td>
            </tr>
            <tr class="bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-lg">
              <td colspan="8" class="px-4 py-4 text-right">TOTAL PROYEK</td>
              <td class="px-4 py-4 text-right">{{ formatCurrency(summary.totalProject) }}</td>
            </tr>
            <tr v-if="!rekonsiliasi" class="bg-amber-100 text-amber-900">
              <td colspan="9" class="px-4 py-3 text-sm">
                ⚠️ Rincian di atas berjumlah {{ formatCurrency(grandTotal) }}, sedangkan biaya
                langsung pada header proposal tercatat {{ formatCurrency(summary.directCost) }}.
                Selisih {{ formatCurrency(Math.abs(Number(summary.directCost) - Number(grandTotal))) }}
                — dokumen ini belum bisa dipakai sebagai dasar penawaran.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Summary Section -->
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h2 class="text-lg font-bold mb-4">Ringkasan Biaya</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div class="border-b-2 border-gray-200 pb-4">
            <p class="text-gray-600 text-sm">Biaya Langsung</p>
            <p class="text-2xl font-bold text-gray-900">{{ formatCurrency(summary.directCost) }}</p>
          </div>
          <div class="border-b-2 border-gray-200 pb-4">
            <p class="text-gray-600 text-sm">Overhead</p>
            <p class="text-2xl font-bold text-gray-900">{{ formatCurrency(summary.overhead) }}</p>
          </div>
          <div class="border-b-2 border-gray-200 pb-4">
            <p class="text-gray-600 text-sm">Risiko & Kontinjensi</p>
            <p class="text-2xl font-bold text-gray-900">{{ formatCurrency(summary.riskContingency) }}</p>
          </div>
          <div class="border-b-2 border-blue-600 pb-4">
            <p class="text-blue-600 text-sm font-semibold">TOTAL PROYEK</p>
            <p class="text-2xl font-bold text-blue-600">{{ formatCurrency(summary.totalProject) }}</p>
          </div>
        </div>
      </div>
      </template><!-- dokumen siap -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../lib/api';
import { formatCurrency } from '../utils/format';

const route = useRoute();
const router = useRouter();
const proposalId = route.params.id;

const proposal = ref<any>(null);
const sections = ref<any[]>([]);
const summary = ref<any>({
  directCost: 0,
  overhead: 0,
  riskContingency: 0,
  totalProject: 0
});

const expandedSections = ref<{ [key: number]: boolean }>({});

const grandTotalApi = ref<number | null>(null);

/**
 * Rincian RAB harus sama dengan biaya langsung yang tercatat di header proposal.
 * Kalau tidak, ada dua kebenaran dalam satu dokumen dan salah satunya akan
 * dipakai orang lain sebagai dasar penawaran.
 */
const rekonsiliasi = computed(() => {
  const rincian = Math.round(Number(grandTotal.value || 0) * 100);
  const header = Math.round(Number(summary.value?.directCost || 0) * 100);
  return rincian === header;
});

/**
 * Grand total diambil dari server kalau tersedia — di sanalah rincian dan
 * ringkasannya dijamin rekonsiliasi.
 *
 * Cadangannya menjumlahkan sendiri, dengan `Number()` yang eksplisit. Kolom uang
 * datang dari MySQL sebagai string DECIMAL; `0 + "100.00" + "200.00"` bukan 300
 * melainkan `"0100.00200.00"`. Itu bug yang baru saja diperbaiki di sisi
 * backend, dan konversi di sini menahan agar tidak lahir kembali di sisi klien.
 */
const grandTotal = computed(() => {
  if (grandTotalApi.value !== null) return grandTotalApi.value;
  return sections.value.reduce((sum, section) => sum + Number(section.totalAmount || 0), 0);
});

/**
 * Muat dokumen RAB.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Sebelumnya kegagalan apa pun — jaringan putus, 401/403, 404, 500, respons
 * tak terbaca — hanya masuk `console.error`. Halaman tetap merender judul,
 * tabel, ringkasan, dan tombol **Print** dengan seluruh angka Rp0. Yang terlihat
 * di layar adalah dokumen RAB yang tampak sah: identitas kosong, tanpa baris,
 * total nol. Dokumen semacam itu bisa dicetak dan diedarkan sebagai penawaran.
 *
 * Penulisannya juga tidak atomik: `proposal`, `sections`, dan `summary` ditulis
 * satu per satu, jadi respons parsial bisa meninggalkan header baru bersama
 * tabel lama.
 *
 * Sekarang: keadaan memuat/gagal dinyatakan, respons divalidasi dulu lalu
 * ditulis sekaligus, dan Print baru bisa ditekan kalau dokumennya memang ada.
 * ───────────────────────────────────────────────────────────────────────────
 */
const memuat = ref(true);
const galatMuat = ref('');

/** Dokumen dianggap siap hanya kalau benar-benar ada isinya. */
const dokumenSiap = computed(() =>
  !memuat.value && !galatMuat.value && !!proposal.value && sections.value.length > 0);

const muatRab = async () => {
  memuat.value = true;
  galatMuat.value = '';
  try {
    const { data } = await api.get(`/estimator/proposals/${proposalId}/rab`);

    // Divalidasi SEBELUM apa pun ditulis — respons parsial tidak boleh
    // meninggalkan campuran data lama dan baru.
    if (!data || !data.proposal || !Array.isArray(data.sections) || !data.summary) {
      throw new Error('Respons RAB tidak lengkap');
    }

    proposal.value = data.proposal;
    sections.value = data.sections;
    summary.value = data.summary;
    grandTotalApi.value = typeof data.grandTotal === 'number' ? data.grandTotal : null;

    expandedSections.value = {};
    sections.value.forEach((_, idx) => { expandedSections.value[idx] = true; });
  } catch (error: any) {
    console.error('Error loading RAB:', error);
    // Jangan tinggalkan sisa data yang bisa terbaca sebagai dokumen sah.
    proposal.value = null;
    sections.value = [];
    summary.value = { directCost: 0, overhead: 0, riskContingency: 0, totalProject: 0 };
    grandTotalApi.value = null;
    galatMuat.value = error?.response?.data?.error
      || (error?.response?.status ? `Gagal memuat RAB (HTTP ${error.response.status}).` : '')
      || error?.message
      || 'Gagal memuat RAB.';
  } finally {
    memuat.value = false;
  }
};

onMounted(muatRab);

const toggleSection = (sectionIdx: number) => {
  expandedSections.value[sectionIdx] = !expandedSections.value[sectionIdx];
};



const formatNumber = (value: number) => {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

const goBack = () => {
  router.push(`/estimator/proposals/${proposalId}`);
};

/**
 * Cetak hanya kalau dokumennya memang ada.
 *
 * Dulu `window.print()` dipanggil tanpa syarat, jadi RAB yang gagal dimuat —
 * identitas kosong, tanpa baris, total Rp0 — tetap bisa dicetak dan diedarkan
 * sebagai penawaran.
 */
const printRAB = () => {
  if (!dokumenSiap.value) {
    alert('Dokumen RAB belum siap dicetak. Muat ulang datanya lebih dulu.');
    return;
  }
  window.print();
};

const exportToExcel = async () => {
  try {
    // Simple Excel export using a library or custom implementation
    let csvContent = 'data:text/csv;charset=utf-8,';
    
    // Headers
    csvContent += 'NO,DISIPLIN,SUB DISIPLIN,PEKERJAAN,AHSP,KODE,VOLUME,HARGA SATUAN,JUMLAH HARGA\n';
    
    // Data
    sections.value.forEach((section) => {
      section.subDisciplines.forEach((subSection: any) => {
        subSection.items.forEach((item: any) => {
          csvContent += `${item.rowNo},${section.name},${subSection.name},"${item.ahspName}",${item.ahspCode},${item.ahspCode},${item.qty} ${item.unit},${item.unitPrice},${item.totalPrice}\n`;
        });
        csvContent += `,,,SUB TOTAL ${subSection.code},,,,${subSection.subtotal}\n`;
      });
      csvContent += `,TOTAL ${section.code} - ${section.name},,,,,,${section.totalAmount}\n\n`;
    });
    
    csvContent += `,JUMLAH BIAYA LANGSUNG,,,,,,,${grandTotal.value}\n`;
    if (summary.value.overhead) csvContent += `,Overhead & Profit,,,,,,,${summary.value.overhead}\n`;
    if (summary.value.riskContingency) csvContent += `,Risiko & Kontinjensi,,,,,,,${summary.value.riskContingency}\n`;
    csvContent += `,TOTAL PROYEK,,,,,,,${summary.value.totalProject}\n`;
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `RAB_${proposal.value?.proposalNumber}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Error exporting to Excel:', error);
  }
};
</script>

<style scoped>
@media print {
  button {
    display: none;
  }
  
  .max-w-7xl {
    max-width: 100%;
  }
}
</style>
