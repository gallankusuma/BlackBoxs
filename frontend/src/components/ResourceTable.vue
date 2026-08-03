<template>
  <div>
    <!-- Summary Table -->
    <div class="px-4 pt-4 pb-2 flex items-center justify-between">
      <h3 class="font-semibold text-gray-800">
        {{ type === 'material' ? '🧱 Ringkasan Material' : type === 'labor' ? '👷 Ringkasan Tenaga Kerja' : '🔧 Ringkasan Peralatan' }}
        <span class="text-sm text-gray-500 font-normal ml-2">({{ items.length }} jenis, aggregated)</span>
      </h3>
      <div class="flex gap-2">
        <input v-model="search" type="text" placeholder="Cari resource..." 
          class="border rounded-lg px-3 py-1.5 text-sm w-64 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500">
        <button @click="showDetail = !showDetail" class="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50"
          :class="showDetail ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : ''">
          {{ showDetail ? '📋 Aggregated' : '📄 Detail per AHSP' }}
        </button>
      </div>
    </div>

    <!-- Aggregated View -->
    <div v-if="!showDetail" class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead class="bg-gray-50 sticky top-0">
          <tr>
            <th class="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase w-10">No</th>
            <th class="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Nama Resource</th>
            <th class="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase w-20">Satuan</th>
            <th class="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase w-28">Harga Satuan</th>
            <th class="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase w-28">Total Qty</th>
            <th class="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase w-36">Total Biaya</th>
            <th class="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase w-16">AHSP</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, i) in filteredItems" :key="i" class="border-b hover:bg-gray-50">
            <td class="px-4 py-2 text-gray-500">{{ i + 1 }}</td>
            <td class="px-4 py-2 font-medium text-gray-900">{{ item.resource_name }}</td>
            <td class="px-4 py-2 text-center text-gray-600">{{ item.resource_satuan }}</td>
            <td class="px-4 py-2 text-right text-gray-700 font-mono text-xs">{{ formatNum(item.resource_harga) }}</td>
            <td class="px-4 py-2 text-right font-semibold" :class="typeColor">{{ item.total_qty?.toFixed(4) }}</td>
            <td class="px-4 py-2 text-right font-bold" :class="typeColor">{{ formatNum(item.total_cost) }}</td>
            <td class="px-4 py-2 text-center">
              <span class="text-xs bg-gray-100 px-1.5 py-0.5 rounded" :title="item.sources?.join(', ')">
                {{ item.sources?.length || 0 }}
              </span>
            </td>
          </tr>
          <tr v-if="filteredItems.length === 0">
            <td colspan="7" class="px-4 py-8 text-center text-gray-400">Tidak ada data</td>
          </tr>
        </tbody>
        <tfoot class="bg-gray-50 font-bold">
          <tr>
            <td colspan="5" class="px-4 py-2.5 text-right text-gray-700">GRAND TOTAL:</td>
            <td class="px-4 py-2.5 text-right" :class="typeColor">{{ formatNum(grandTotal) }}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Detail View (per AHSP) -->
    <div v-else class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead class="bg-gray-50 sticky top-0">
          <tr>
            <th class="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase w-10">No</th>
            <th class="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Nama Resource</th>
            <th class="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase w-48">Dari AHSP</th>
            <th class="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase w-16">Satuan</th>
            <th class="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase w-20">Koef</th>
            <th class="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase w-20">Vol AHSP</th>
            <th class="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase w-24">Total Qty</th>
            <th class="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase w-28">Harga</th>
            <th class="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase w-32">Total Biaya</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, i) in filteredDetail" :key="i" class="border-b hover:bg-gray-50">
            <td class="px-4 py-2 text-gray-500">{{ i + 1 }}</td>
            <td class="px-4 py-2 font-medium text-gray-900">{{ item.resource_name }}</td>
            <td class="px-4 py-2 text-xs text-gray-500 truncate max-w-[200px]" :title="item.from_ahsp">{{ item.from_ahsp_code }}</td>
            <td class="px-4 py-2 text-center text-gray-600">{{ item.resource_satuan }}</td>
            <td class="px-4 py-2 text-right font-mono text-xs text-gray-500">{{ item.koefisien?.toFixed(4) }}</td>
            <td class="px-4 py-2 text-right font-mono text-xs text-gray-500">{{ item.item_qty }}</td>
            <td class="px-4 py-2 text-right font-semibold" :class="typeColor">{{ item.total_qty?.toFixed(4) }}</td>
            <td class="px-4 py-2 text-right font-mono text-xs">{{ formatNum(item.resource_harga) }}</td>
            <td class="px-4 py-2 text-right font-bold" :class="typeColor">{{ formatNum(item.total_cost) }}</td>
          </tr>
          <tr v-if="filteredDetail.length === 0">
            <td colspan="9" class="px-4 py-8 text-center text-gray-400">Tidak ada data</td>
          </tr>
        </tbody>
        <tfoot class="bg-gray-50 font-bold">
          <tr>
            <td colspan="8" class="px-4 py-2.5 text-right text-gray-700">GRAND TOTAL:</td>
            <td class="px-4 py-2.5 text-right" :class="typeColor">{{ formatNum(grandTotalDetail) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  items: any[];
  detail: any[];
  type: 'material' | 'labor' | 'equipment';
}>();

const search = ref('');
const showDetail = ref(false);

const typeColor = computed(() => {
  if (props.type === 'material') return 'text-blue-700';
  if (props.type === 'labor') return 'text-orange-700';
  return 'text-purple-700';
});

const filteredItems = computed(() => {
  if (!search.value) return props.items;
  const s = search.value.toLowerCase();
  return props.items.filter(i => i.resource_name.toLowerCase().includes(s));
});

const filteredDetail = computed(() => {
  if (!search.value) return props.detail;
  const s = search.value.toLowerCase();
  return props.detail.filter((i: any) => i.resource_name.toLowerCase().includes(s) || i.from_ahsp?.toLowerCase().includes(s));
});

const grandTotal = computed(() => filteredItems.value.reduce((s: number, i: any) => s + (i.total_cost || 0), 0));
const grandTotalDetail = computed(() => filteredDetail.value.reduce((s: number, i: any) => s + (i.total_cost || 0), 0));

const formatNum = (val: number | undefined) => {
  if (val === undefined || val === null) return '-';
  return val.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};
</script>
