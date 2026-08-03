<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <div class="max-w-6xl mx-auto flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-gray-500">Inventory</p>
          <h2 class="text-2xl font-bold text-gray-900">Stock Opname</h2>
          <p class="text-sm text-gray-600">Cocokkan stok sistem vs fisik, otomatis membuat penyesuaian.</p>
        </div>
        <button @click="save" class="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Submit for Approval</button>
      </div>

      <div class="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Product</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">System Qty</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Physical Qty</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Difference</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Notes</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-if="rows.length === 0">
              <td colspan="5" class="px-4 py-6 text-center text-gray-500">No inventory data</td>
            </tr>
            <tr v-for="row in rows" :key="row.id">
              <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ row.product_name }}</td>
              <td class="px-4 py-3 text-sm text-gray-700">{{ row.systemQty }}</td>
              <td class="px-4 py-3 text-sm text-gray-700">
                <input
                  type="number"
                  step="0.0001"
                  class="w-28 rounded-md border border-gray-300 px-2 py-1"
                  v-model.number="row.physicalQty"
                />
              </td>
              <td class="px-4 py-3 text-sm font-semibold" :class="diffClassValue(row)">{{ diffLabel(row) }}</td>
              <td class="px-4 py-3 text-sm text-gray-700">
                <input
                  type="text"
                  placeholder="Spill / count / expired"
                  class="w-full rounded-md border border-gray-300 px-2 py-1"
                  v-model="row.notes"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex items-center justify-between text-sm text-gray-600">
        <div>Rows: {{ rows.length }}</div>
        <div>Pending adjustments: {{ pendingAdjustments.length }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue';
import { useInventoryStore } from '@/stores/inventory';
import { useProductStore } from '@/stores/products';

const inventoryStore = useInventoryStore();
const productStore = useProductStore();

interface OpnameRow {
  id: number;
  product_id: number;
  product_name?: string;
  systemQty: number;
  physicalQty: number;
  notes: string;
}

const state = reactive({ rows: [] as OpnameRow[] });

onMounted(async () => {
  await Promise.all([
    inventoryStore.fetchInventory(),
    productStore.fetchProducts(),
  ]);
  state.rows = inventoryStore.inventory.map((inv) => ({
    id: inv.id,
    product_id: inv.product_id,
    product_name: inv.product_name,
    systemQty: inv.quantity_on_hand || 0,
    physicalQty: inv.quantity_on_hand || 0,
    notes: '',
  }));
});

const rows = computed(() => state.rows);

const pendingAdjustments = computed(() =>
  rows.value.filter((r) => (r.physicalQty ?? 0) !== (r.systemQty ?? 0))
);

const diffLabel = (row: OpnameRow) => {
  const diff = (row.physicalQty || 0) - (row.systemQty || 0);
  if (diff === 0) return 'OK';
  return `${diff > 0 ? '+' : ''}${diff}`;
};

const diffClass = (diff: number) => {
  if (diff === 0) return 'text-emerald-600';
  if (diff > 0) return 'text-blue-600';
  return 'text-red-600';
};

const diffClassValue = (row: OpnameRow) => diffClass((row.physicalQty || 0) - (row.systemQty || 0));

const save = async () => {
  for (const row of pendingAdjustments.value) {
    const diff = (row.physicalQty || 0) - (row.systemQty || 0);
    const movementType = diff >= 0 ? 'in' : 'out';
    const qty = Math.abs(diff);

    try {
      await inventoryStore.recordTransaction(row.id, {
        transaction_type: movementType,
        quantity: qty,
        notes: row.notes || 'Stock opname',
      });

      const inv = inventoryStore.inventory.find((i) => i.id === row.id);
      if (inv) {
        const updatedOnHand = movementType === 'in' ? inv.quantity_on_hand + qty : inv.quantity_on_hand - qty;
        await inventoryStore.updateInventory(row.id, {
          quantity_on_hand: updatedOnHand,
          quantity_reserved: inv.quantity_reserved,
          location: inv.location,
        });
      }
    } catch (error) {
      console.error('Failed to post opname adjustment', error);
    }
  }

  await inventoryStore.fetchInventory();
};

</script>
