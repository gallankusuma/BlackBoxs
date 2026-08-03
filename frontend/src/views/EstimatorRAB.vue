<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <div class="max-w-7xl mx-auto">
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
              class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
            <button
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

            <!-- Grand Total -->
            <tr class="bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-lg">
              <td colspan="8" class="px-4 py-4 text-right">GRAND TOTAL</td>
              <td class="px-4 py-4 text-right">{{ formatCurrency(grandTotal) }}</td>
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

const grandTotal = computed(() => {
  return sections.value.reduce((sum, section) => sum + section.totalAmount, 0);
});

onMounted(async () => {
  try {
    const response = await api.get(`/estimator/proposals/${proposalId}/rab`);
    proposal.value = response.data.proposal;
    sections.value = response.data.sections;
    summary.value = response.data.summary;

    // Expand all sections by default
    sections.value.forEach((_, idx) => {
      expandedSections.value[idx] = true;
    });
  } catch (error) {
    console.error('Error loading RAB:', error);
  }
});

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

const printRAB = () => {
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
    
    csvContent += `,GRAND TOTAL,,,,,,,${grandTotal.value}\n`;
    
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
