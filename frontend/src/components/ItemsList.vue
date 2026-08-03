<template>
  <div v-if="!items || items.length === 0" class="text-gray-500">-</div>
  <div v-else class="space-y-1">
    <div v-for="(item, idx) in items" :key="idx" class="text-xs py-0.5">
      <span class="font-semibold text-gray-900">{{ getItemName(item) }}</span>
      <span v-if="showQuantity" class="text-gray-600">
        ({{ getQuantity(item) }}{{ getUom(item) ? ' ' + getUom(item) : '' }})
      </span>
      <span v-if="showPrice" class="text-gray-600 ml-1">
        @ {{ formatPrice(getPrice(item)) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Item {
  productName?: string;
  name?: string;
  qty?: number;
  quantity?: number;
  uom?: string;
  unit?: string;
  price?: number;
  unit_price?: number;
  [key: string]: any;
}

interface Props {
  items?: Item[];
  showQuantity?: boolean;
  showPrice?: boolean;
}

withDefaults(defineProps<Props>(), {
  items: () => [],
  showQuantity: true,
  showPrice: false,
});

const getItemName = (item: Item): string => {
  return item.productName || item.name || 'Unknown';
};

const getQuantity = (item: Item): number => {
  return item.qty ?? item.quantity ?? 0;
};

const getUom = (item: Item): string => {
  return item.uom || item.unit || '';
};

const getPrice = (item: Item): number => {
  return item.price ?? item.unit_price ?? 0;
};

const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
};
</script>
