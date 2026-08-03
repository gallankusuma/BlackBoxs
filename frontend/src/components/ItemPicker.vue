<template>
  <div class="relative" ref="pickerRef">
    <!-- Trigger Button -->
    <button
      type="button"
      @click="openPicker"
      :disabled="disabled"
      class="w-full text-left border rounded-lg px-3 py-2 text-sm flex items-center justify-between transition-all"
      :class="disabled 
        ? 'bg-gray-100 cursor-not-allowed border-gray-200 text-gray-500' 
        : selectedProduct 
          ? 'border-blue-300 bg-blue-50 hover:bg-blue-100' 
          : 'border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400'"
    >
      <div v-if="selectedProduct" class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
            :class="getTypeBadgeClass(selectedProduct.type_name)">
            {{ selectedProduct.type_code || 'N/A' }}
          </span>
          <span class="font-medium text-gray-900 truncate">{{ selectedProduct.name }}</span>
        </div>
        <div class="text-xs text-gray-500 mt-0.5">
          SKU: {{ selectedProduct.sku }} · {{ selectedProduct.category_name || '-' }} · {{ selectedProduct.uom || '-' }}
        </div>
      </div>
      <span v-else class="text-gray-400">— Select Item —</span>
      <svg class="w-4 h-4 text-gray-400 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Picker Dropdown Overlay -->
    <Teleport to="body">
      <div v-if="isOpen" class="fixed inset-0 z-[100]" @click.self="closePicker">
        <!-- Dropdown Panel -->
        <div 
          ref="dropdownRef"
          class="fixed bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          :style="dropdownStyle"
        >
          <!-- Header -->
          <div class="px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
            <div class="flex items-center justify-between mb-2">
              <h4 class="text-sm font-semibold">{{ showAddForm ? '➕ Add New Item' : '🔍 Select Item from Master' }}</h4>
              <div class="flex items-center gap-2">
                <button v-if="!showAddForm" @click="showAddForm = true" class="text-xs bg-white/20 hover:bg-white/30 text-white px-2 py-1 rounded font-medium transition-colors" title="Add new item">
                  + New Item
                </button>
                <button v-else @click="showAddForm = false" class="text-xs bg-white/20 hover:bg-white/30 text-white px-2 py-1 rounded font-medium transition-colors">
                  ← Back to List
                </button>
                <button @click="closePicker" class="text-white/70 hover:text-white">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
            <!-- Search Input (only when listing) -->
            <div v-if="!showAddForm" class="relative">
              <svg class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input
                ref="searchInput"
                v-model="searchQuery"
                type="text"
                placeholder="Search by name, SKU, or description..."
                class="w-full pl-9 pr-3 py-2 text-sm rounded-lg border-0 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-white/30"
              />
            </div>
          </div>

          <!-- Filter Bar (only when listing) -->
          <div v-if="!showAddForm" class="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2 flex-wrap">
            <!-- Type Filter -->
            <select v-model="filterType" class="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:ring-blue-500 focus:border-blue-500">
              <option value="">All Types</option>
              <option v-for="t in availableTypes" :key="t" :value="t">{{ t }}</option>
            </select>
            <!-- Category Filter -->
            <select v-model="filterCategory" class="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:ring-blue-500 focus:border-blue-500">
              <option value="">All Categories</option>
              <option v-for="c in availableCategories" :key="c" :value="c">{{ c }}</option>
            </select>
            <!-- Result Count -->
            <span class="text-xs text-gray-500 ml-auto">
              {{ filteredProducts.length }} of {{ allProducts.length }} items
            </span>
            <!-- Clear Filters -->
            <button 
              v-if="searchQuery || filterType || filterCategory"
              @click="clearFilters" 
              class="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear
            </button>
          </div>

          <!-- Add Item Form -->
          <div v-if="showAddForm" class="overflow-y-auto flex-1 px-4 py-4 space-y-3" style="max-height: 380px;">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">SKU *</label>
                <input v-model="newItem.sku" type="text" placeholder="e.g., SKU001" class="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                <p v-if="newItemErrors.sku" class="text-[10px] text-red-500 mt-0.5">{{ newItemErrors.sku }}</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">Item Name *</label>
                <input v-model="newItem.name" type="text" placeholder="Item name" class="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                <p v-if="newItemErrors.name" class="text-[10px] text-red-500 mt-0.5">{{ newItemErrors.name }}</p>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">Category *</label>
                <select v-model="newItem.category_id" class="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="">-- Select --</option>
                  <option v-for="cat in addFormCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
                </select>
                <p v-if="newItemErrors.category_id" class="text-[10px] text-red-500 mt-0.5">{{ newItemErrors.category_id }}</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">Item Type *</label>
                <select v-model="newItem.product_type_id" class="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="">-- Select --</option>
                  <option v-for="t in addFormItemTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
                </select>
                <p v-if="newItemErrors.product_type_id" class="text-[10px] text-red-500 mt-0.5">{{ newItemErrors.product_type_id }}</p>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">Unit of Measure *</label>
                <select v-model="newItem.unit_id" class="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="">-- Select --</option>
                  <option v-for="u in addFormUnits" :key="u.id" :value="u.id">{{ u.code }} - {{ u.name }}</option>
                </select>
                <p v-if="newItemErrors.unit_id" class="text-[10px] text-red-500 mt-0.5">{{ newItemErrors.unit_id }}</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <input v-model="newItem.description" type="text" placeholder="Optional description" class="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
            <div class="flex gap-2 pt-2 border-t border-gray-200">
              <button @click="showAddForm = false" class="flex-1 px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">Cancel</button>
              <button @click="createNewItem" :disabled="creatingItem" class="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
                {{ creatingItem ? 'Creating...' : '✅ Create & Select' }}
              </button>
            </div>
          </div>

          <!-- Results List (only when not adding) -->
          <div v-if="!showAddForm" class="overflow-y-auto flex-1" style="max-height: 320px;">
            <div v-if="filteredProducts.length === 0" class="px-4 py-8 text-center text-gray-500">
              <svg class="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <p class="text-sm">No items found</p>
              <p class="text-xs mt-1">Try different keywords or clear filters</p>
            </div>
            <div
              v-for="product in paginatedProducts"
              :key="product.id"
              @click="selectProduct(product)"
              class="px-4 py-2.5 flex items-center gap-3 cursor-pointer border-b border-gray-100 transition-colors hover:bg-blue-50 group"
              :class="{ 'bg-blue-50 ring-1 ring-inset ring-blue-200': selectedProduct?.id === product.id }"
            >
              <!-- Type Badge -->
              <span class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[10px] font-bold flex-shrink-0"
                :class="getTypeBadgeClass(product.type_name)">
                {{ getTypeCode(product) }}
              </span>
              <!-- Item Info -->
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 truncate group-hover:text-blue-700">
                  {{ product.name }}
                </p>
                <p class="text-xs text-gray-500">
                  <span class="font-mono">{{ product.sku }}</span>
                  <span v-if="product.category_name" class="mx-1">·</span>
                  <span v-if="product.category_name">{{ product.category_name }}</span>
                  <span v-if="product.uom" class="mx-1">·</span>
                  <span v-if="product.uom" class="font-medium">{{ product.uom }}</span>
                </p>
              </div>
              <!-- Select Indicator -->
              <div v-if="selectedProduct?.id === product.id" class="text-blue-600">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
              </div>
              <span v-else class="text-xs text-blue-600 opacity-0 group-hover:opacity-100 font-medium">Select</span>
            </div>
            <!-- Load More -->
            <div v-if="filteredProducts.length > displayCount" class="px-4 py-3 text-center border-t">
              <button @click="loadMore" class="text-xs text-blue-600 hover:text-blue-800 font-medium">
                Show more ({{ filteredProducts.length - displayCount }} remaining)
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useProductStore } from '../stores/products';
import { api } from '../lib/api';

const props = defineProps<{
  modelValue: number | null;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | null): void;
  (e: 'select', product: any): void;
}>();

const productStore = useProductStore();
const pickerRef = ref<HTMLElement | null>(null);
const dropdownRef = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);

const isOpen = ref(false);
const searchQuery = ref('');
const filterType = ref('');
const filterCategory = ref('');
const displayCount = ref(50);
const dropdownStyle = ref<Record<string, string>>({});
const showAddForm = ref(false);
const creatingItem = ref(false);
const addFormCategories = ref<any[]>([]);
const addFormUnits = ref<any[]>([]);
const addFormItemTypes = ref<any[]>([]);
const newItem = ref({ sku: '', name: '', category_id: '', product_type_id: '', unit_id: '', description: '' });
const newItemErrors = ref<Record<string, string>>({});

// All products from store
const allProducts = computed(() => productStore.products || []);

// Extract unique types and categories for filter dropdowns
const availableTypes = computed(() => {
  const types = new Set<string>();
  allProducts.value.forEach(p => { if (p.type_name) types.add(p.type_name); });
  return Array.from(types).sort();
});

const availableCategories = computed(() => {
  const cats = new Set<string>();
  allProducts.value.forEach(p => { if ((p as any).category_name) cats.add((p as any).category_name); });
  return Array.from(cats).sort();
});

// Filtered products based on search + filters
const filteredProducts = computed(() => {
  let result = allProducts.value;
  
  // Type filter
  if (filterType.value) {
    result = result.filter(p => p.type_name === filterType.value);
  }
  
  // Category filter
  if (filterCategory.value) {
    result = result.filter(p => (p as any).category_name === filterCategory.value);
  }
  
  // Search query
  if (searchQuery.value.trim()) {
    const terms = searchQuery.value.toLowerCase().split(/\s+/);
    result = result.filter(p => {
      const haystack = `${p.sku || ''} ${p.name || ''} ${p.description || ''} ${(p as any).category_name || ''} ${p.type_name || ''}`.toLowerCase();
      return terms.every(term => haystack.includes(term));
    });
  }
  
  return result;
});

// Paginated (lazy load)
const paginatedProducts = computed(() => filteredProducts.value.slice(0, displayCount.value));

// Currently selected product
const selectedProduct = computed(() => {
  if (!props.modelValue) return null;
  return allProducts.value.find(p => p.id === props.modelValue) || null;
});

const getTypeCode = (product: any) => {
  if (product.type_name) {
    const words = product.type_name.split(' ');
    return words.map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  }
  return '??';
};

const getTypeBadgeClass = (typeName: string | undefined) => {
  const name = (typeName || '').toLowerCase();
  if (name.includes('raw')) return 'bg-amber-100 text-amber-800';
  if (name.includes('packaging')) return 'bg-purple-100 text-purple-800';
  if (name.includes('finished')) return 'bg-green-100 text-green-800';
  if (name.includes('spare')) return 'bg-gray-100 text-gray-800';
  if (name.includes('service')) return 'bg-sky-100 text-sky-800';
  return 'bg-gray-100 text-gray-700';
};

const openPicker = async () => {
  if (props.disabled) return;
  
  // Ensure products are loaded
  if (!productStore.products.length) {
    await productStore.fetchProducts();
  }
  
  isOpen.value = true;
  displayCount.value = 50;
  searchQuery.value = '';
  showAddForm.value = false;
  
  await nextTick();
  
  // Position the dropdown
  if (pickerRef.value) {
    const rect = pickerRef.value.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 480; // approximate
    
    // Decide: show below or above
    const spaceBelow = viewportHeight - rect.bottom;
    const showAbove = spaceBelow < dropdownHeight && rect.top > spaceBelow;
    
    dropdownStyle.value = {
      left: `${rect.left}px`,
      width: `${Math.max(rect.width, 480)}px`,
      ...(showAbove
        ? { bottom: `${viewportHeight - rect.top + 4}px` }
        : { top: `${rect.bottom + 4}px` }
      ),
    };
  }
  
  // Auto-focus search input
  await nextTick();
  searchInput.value?.focus();
};

const closePicker = () => {
  isOpen.value = false;
};

const selectProduct = (product: any) => {
  emit('update:modelValue', product.id);
  emit('select', product);
  closePicker();
};

const clearFilters = () => {
  searchQuery.value = '';
  filterType.value = '';
  filterCategory.value = '';
};

const loadMore = () => {
  displayCount.value += 50;
};

// Reset display count when filters change
watch([searchQuery, filterType, filterCategory], () => {
  displayCount.value = 50;
});

// Close on Escape
const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && isOpen.value) {
    closePicker();
  }
};

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
});

// --- Add Item Logic ---
const loadAddFormData = async () => {
  try {
    const [catRes, unitRes, typeRes] = await Promise.all([
      api.get('/categories'),
      api.get('/units'),
      api.get('/item-types'),
    ]);
    addFormCategories.value = catRes.data.data || [];
    addFormUnits.value = unitRes.data.data || [];
    addFormItemTypes.value = typeRes.data.data || [];
  } catch (err) {
    console.error('Failed to load form data:', err);
  }
};

watch(showAddForm, async (val) => {
  if (val) {
    newItem.value = { sku: '', name: '', category_id: '', product_type_id: '', unit_id: '', description: '' };
    newItemErrors.value = {};
    if (!addFormCategories.value.length) {
      await loadAddFormData();
    }
  }
});

const createNewItem = async () => {
  newItemErrors.value = {};
  if (!newItem.value.sku) newItemErrors.value.sku = 'SKU is required';
  if (!newItem.value.name) newItemErrors.value.name = 'Name is required';
  if (!newItem.value.category_id) newItemErrors.value.category_id = 'Required';
  if (!newItem.value.product_type_id) newItemErrors.value.product_type_id = 'Required';
  if (!newItem.value.unit_id) newItemErrors.value.unit_id = 'Required';
  if (Object.keys(newItemErrors.value).length > 0) return;

  creatingItem.value = true;
  try {
    const payload = {
      sku: newItem.value.sku,
      name: newItem.value.name,
      category_id: newItem.value.category_id,
      product_type_id: newItem.value.product_type_id,
      unit_id: newItem.value.unit_id,
      description: newItem.value.description,
      is_active: true,
      standard_cost: 0,
      reorder_point: 0,
    };
    const res = await api.post('/products', payload);
    // Refresh product store
    await productStore.fetchProducts();
    // Auto-select the newly created item
    const newId = res.data?.data?.id || res.data?.id;
    if (newId) {
      const created = allProducts.value.find(p => p.id === newId);
      if (created) {
        selectProduct(created);
        return;
      }
    }
    showAddForm.value = false;
    alert('✅ Item created successfully!');
  } catch (err: any) {
    const msg = err.response?.data?.error || err.message || 'Failed to create item';
    alert('Error: ' + msg);
  } finally {
    creatingItem.value = false;
  }
};
</script>
