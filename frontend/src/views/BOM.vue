<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div class="px-4 py-6 sm:px-0">
        <!-- Header -->
        <div class="flex justify-between items-center mb-6">
          <div>
            <h2 class="text-2xl font-bold text-gray-900">Bill of Materials</h2>
            <p class="text-xs text-gray-500">User Level: {{ authStore.user?.user_level || 'undefined' }} | Supervisor Approval Debug: {{ bomsByProduct[0]?.approval_status }}</p>
          </div>
          <button
          @click="handleExport"
          class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center gap-2"
        >
          📥 Export
        </button>
        <button @click="openCreateModal" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
            + Create BOM
          </button>
        </div>

        <!-- BOM List Table -->
        <div v-if="store.loading" class="text-center py-8">Loading...</div>
        <div v-else-if="store.error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {{ store.error }}
        </div>

        <div v-else class="bg-white shadow overflow-hidden sm:rounded-md">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Components</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Approval Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Effective Date</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="bom in store.boms" :key="bom.id">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ bom.product_name }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ bom.version || 'V1.0' }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ (bom as any).details?.length || 0 }} items</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <span :class="getApprovalStatusClass(bom.approval_status || 0)" class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full">
                    {{ getApprovalStatusText(bom.approval_status || 0) }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ formatDate(bom.created_at || '') }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <button @click="openEditModal(bom.id)" class="text-blue-600 hover:text-blue-900">View</button>
                  <button 
                    v-if="(bom.approval_status || 0) < 2 && canApprove(bom.approval_status || 0)"
                    @click="approveBOM(bom.id)" 
                    class="text-green-600 hover:text-green-900 font-semibold"
                  >Approve</button>
                  <button 
                    v-if="(bom.approval_status || 0) !== -1 && (bom.approval_status || 0) < 2 && (authStore.user?.user_level ?? 0) >= 2"
                    @click="rejectBOM(bom.id)" 
                    class="text-orange-600 hover:text-orange-900"
                  >Reject</button>
                  <button 
                    v-if="(bom.approval_status || 0) < 2"
                    @click="deleteBOM(bom.id)" 
                    class="text-red-600 hover:text-red-900"
                  >Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- BOM Create/Edit Modal (Full Page) -->
    <div v-if="showModal" class="fixed inset-0 bg-black bg-opacity-50 z-50">
      <div class="bg-white h-screen overflow-y-auto flex flex-col">
        <!-- Header with Close Button -->
        <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <h2 class="text-2xl font-bold text-gray-900">
            {{ isEditing ? 'View BOM' : 'Create New BOM' }}
            <span v-if="isFullyApproved" class="ml-3 inline-block bg-green-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
              ✓ FULLY APPROVED (2/2) - READ ONLY
            </span>
          </h2>
          <button @click="closeModal" class="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div class="px-6 py-4 space-y-6">

        <!-- BOM HEADER FORM -->
        <div class="border-2 border-dashed border-gray-300 rounded-lg p-6 mb-8">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">📋 BOM HEADER</h3>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Product Name -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Product (Finished Good) <span class="text-red-500">*</span></label>
              <input 
                v-model="bomHeader.product_name" 
                type="text"
                placeholder="Enter finished good product name"
                :disabled="isFullyApproved"
                required 
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>

            <!-- Version -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Version <span class="text-red-500">*</span></label>
              <input 
                v-model="bomHeader.version" 
                type="text" 
                placeholder="e.g., V1.0, V2.0"
                :disabled="isFullyApproved"
                required 
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>

            <!-- Effective Date -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Effective Date <span class="text-red-500">*</span></label>
              <input 
                v-model="bomHeader.effective_date" 
                type="date" 
                :disabled="isFullyApproved"
                required 
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>

            <!-- Notes -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea 
                v-model="bomHeader.notes" 
                rows="2"
                placeholder="Any notes about this BOM..."
                :disabled="isFullyApproved"
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              ></textarea>
            </div>
          </div>
        </div>

        <!-- ADD BOM COMPONENT FORM -->
        <div v-if="!isFullyApproved" class="border-2 border-dashed border-gray-300 rounded-lg p-6 mb-8" data-component-form>
          <h3 class="text-lg font-semibold text-gray-900 mb-4">➕ ADD BOM COMPONENT</h3>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <!-- Component Product -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Component Product <span class="text-red-500">*</span></label>
              <select 
                v-model="componentForm.component_id" 
                required 
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- Select Component --</option>
                <option v-for="product in componentProducts" :key="product.id" :value="product.id">
                  {{ product.name }} ({{ product.sku }})
                </option>
              </select>
            </div>

            <!-- Qty Per Batch -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Qty Per Batch <span class="text-red-500">*</span></label>
              <input 
                v-model.number="componentForm.quantity" 
                type="number" 
                step="0.01" 
                placeholder="0.00"
                required 
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <!-- UoM -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">UoM <span class="text-red-500">*</span></label>
              <select 
                v-model="componentForm.unit_id" 
                required 
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- Select UoM --</option>
                <option v-for="unit in units" :key="unit.id" :value="unit.id">
                  {{ unit.code }} - {{ unit.name }}
                </option>
              </select>
            </div>

            <!-- Loss % -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Loss %</label>
              <input 
                v-model.number="componentForm.loss_percent" 
                type="number" 
                step="0.1" 
                min="0" 
                max="100" 
                placeholder="0"
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <!-- Is Sub-BOM -->
            <div class="flex items-end">
              <label class="inline-flex items-center">
                <input 
                  v-model="componentForm.is_sub_bom" 
                  type="checkbox" 
                  class="form-checkbox text-blue-600 h-5 w-5"
                />
                <span class="ml-2 text-sm font-medium text-gray-700">Is Sub-BOM</span>
              </label>
            </div>
          </div>

          <!-- Add Component Button -->
          <button 
            @click="addComponent" 
            type="button"
            class="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 font-medium"
          >
            + Add Component
          </button>
        </div>

        <!-- BOM COMPONENTS LIST -->
        <div v-if="bomComponents.length > 0" class="border-2 border-solid border-gray-300 rounded-lg p-6 mb-8">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">📦 BOM COMPONENTS ({{ bomComponents.length }})</h3>
          
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-100">
                <tr>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-gray-700">Component</th>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-gray-700">Qty</th>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-gray-700">UoM</th>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-gray-700">Loss%</th>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-gray-700">Is Sub</th>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="(comp, idx) in bomComponents" :key="idx" class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ getProductName(comp.component_id) }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{{ comp.quantity }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{{ getUnitLabel(comp.unit_id) }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{{ comp.loss_percent ?? 0 }}%</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    <span v-if="comp.is_sub_bom" class="font-semibold text-green-700">Yes</span>
                    <span v-else class="text-gray-600">No</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                    <button 
                      v-if="!isFullyApproved"
                      @click="editComponent(idx)" 
                      class="text-blue-600 hover:text-blue-900 font-semibold"
                    >
                      Edit
                    </button>
                    <button 
                      v-if="!isFullyApproved"
                      @click="removeComponent(idx)" 
                      class="text-red-600 hover:text-red-900 font-semibold"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        
        <!-- Approval Info Panel (when editing) -->
        <div v-if="isEditing && editingBomId" class="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <h4 class="text-sm font-semibold text-gray-700 mb-3">📋 Approval Status</h4>
          <div class="grid grid-cols-2 gap-4">
            <div class="border rounded-lg p-3" :class="Number(currentBOMApprovalStatus) >= 1 ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'">
              <div class="text-xs text-gray-500">Supervisor (Level 1)</div>
              <div v-if="Number(currentBOMApprovalStatus) >= 1" class="text-sm font-semibold text-green-700">✓ Approved</div>
              <div v-else class="text-sm text-yellow-600">⏳ Pending</div>
            </div>
            <div class="border rounded-lg p-3" :class="Number(currentBOMApprovalStatus) >= 2 ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'">
              <div class="text-xs text-gray-500">Manager / Director (Level 2)</div>
              <div v-if="Number(currentBOMApprovalStatus) >= 2" class="text-sm font-semibold text-green-700">✓ Approved</div>
              <div v-else class="text-sm text-yellow-600">⏳ Pending</div>
            </div>
          </div>
        </div>

        <!-- Action Buttons / Footer -->
        <div class="px-6 py-4 border-t border-gray-200 flex justify-between items-center bg-white mt-auto">
          <div class="flex space-x-2">
            <button 
              v-if="isEditing && editingBomId && (currentBOMApprovalStatus || 0) < 2 && canApprove(currentBOMApprovalStatus || 0)"
              @click="approveBOM(editingBomId)" 
              class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
            >
              ✓ Approve BOM
            </button>
            <button 
              v-if="isEditing && editingBomId && (currentBOMApprovalStatus || 0) !== -1 && (currentBOMApprovalStatus || 0) < 2 && (authStore.user?.user_level ?? 0) >= 2"
              @click="rejectBOM(editingBomId)" 
              class="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 font-medium"
            >
              ✕ Reject
            </button>
          </div>
          <div class="flex space-x-3">
            <button 
              @click="closeModal" 
              class="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 font-medium"
            >
              {{ isFullyApproved ? 'Close' : 'Cancel' }}
            </button>
            <button 
              v-if="!isFullyApproved"
              @click="saveBOM" 
              :disabled="!canSave"
              :class="{
                'bg-blue-600 hover:bg-blue-700 text-white': canSave,
                'bg-gray-400 text-gray-600 cursor-not-allowed': !canSave
              }"
              class="px-6 py-2 rounded-md font-medium"
            >
              {{ isEditing ? 'Update BOM' : 'Save BOM' }}
            </button>
            <div v-else class="text-sm text-green-700 font-semibold self-center px-4 py-2 bg-green-50 rounded-md">
              ✓ This BOM is fully approved and locked from changes
            </div>
          </div>
        </div>
        <!-- End modal content wrapper -->
       </div>
     </div>
   </div>
  </div>
</template>

<script setup lang="ts">
import { exportToCSV } from '../utils/export';
import { ref, computed, onMounted } from 'vue';
import { useBOMStore } from '../stores/bom';
import { useProductStore } from '../stores/products';
import { useAuthStore } from '../stores/auth';
import { useApprovalWorkflow } from '../composables/useApprovalWorkflow';
import { api } from '../lib/api';

const store = useBOMStore();
const productStore = useProductStore();
const authStore = useAuthStore();
const { getApprovalStatusText, getApprovalStatusClass } = useApprovalWorkflow();

const showModal = ref(false);
const isEditing = ref(false);
const editingBomId = ref<number | null>(null);
const currentBOMApprovalStatus = ref<number | null>(null);
const units = ref<any[]>([]);

// BOM Header Form
const bomHeader = ref({
  product_name: '',
  version: 'V1.0',
  effective_date: new Date().toISOString().split('T')[0],
  notes: ''
});

// Component Form
const componentForm = ref({
  component_id: '',
  quantity: 0,
  unit_id: '',
  loss_percent: 0,
  is_sub_bom: false
});

// BOM Components List
const bomComponents = ref<any[]>([]);

// Computed properties


const componentProducts = computed(() => {
  return productStore.products.filter(p => {
    // Exclude only Finished Good products, include everything else (Raw Material, Packaging, Chemical, etc.)
    if (!p.category) return true; // Include products without category
    const cat = p.category.toLowerCase();
    return !cat.includes('finished');
  });
});

const canSave = computed(() => {
  return bomHeader.value.product_name && 
         bomHeader.value.version && 
         bomHeader.value.effective_date && 
         bomComponents.value.length > 0 &&
         currentBOMApprovalStatus.value !== 2; // Cannot save if fully approved
});

const isFullyApproved = computed(() => {
  return currentBOMApprovalStatus.value === 2;
});

const bomsByProduct = computed(() => {
  const grouped = new Map();
  store.boms.forEach(bom => {
    if (!grouped.has(bom.product_id)) {
      const status = (bom as any).approval_status ?? 0;
      grouped.set(bom.product_id, {
        product_id: bom.product_id,
        version: bom.version || 'V1.0',
        effective_date: bom.effective_date,
        notes: bom.notes,
        approval_status: status
      });
    }
  });
  return Array.from(grouped.values());
});

const fetchUnits = async () => {
  try {
    const res = await api.get('/units');
    units.value = res.data.data || [];
  } catch (error) {
    console.error('Error fetching units:', error);
  }
};

// Methods
const openCreateModal = () => {
  // Ensure products are loaded
  if (productStore.products.length === 0) {
    productStore.fetchProducts();
  }
  
  isEditing.value = false;
  bomHeader.value = {
    product_name: '',
    version: 'V1.0',
    effective_date: new Date().toISOString().split('T')[0],
    notes: ''
  };
  componentForm.value = {
    component_id: '',
    quantity: 0,
    unit_id: '',
    loss_percent: 0,
    is_sub_bom: false
  };
  bomComponents.value = [];
  showModal.value = true;
};

const openEditModal = async (bomId: string | number) => {
  try {
    const response = await api.get(`/bom/${bomId}`);
    const bomData = response.data.data;
    
    bomHeader.value = {
      product_name: bomData.product_name,
      version: bomData.version || 'V1.0',
      effective_date: bomData.effective_date || new Date().toISOString().split('T')[0],
      notes: bomData.notes || ''
    };
    
    bomComponents.value = (bomData.details || []).map((d: any) => ({
      component_id: d.raw_material_id,
      quantity: d.quantity,
      unit_id: d.unit_of_measure_id || '',
      loss_percent: 0,
      is_sub_bom: false
    }));
    
    editingBomId.value = Number(bomId);
    currentBOMApprovalStatus.value = bomData.approval_status || 0;
    isEditing.value = true;
    showModal.value = true;
  } catch (error) {
    console.error('Error loading BOM:', error);
    alert('Failed to load BOM');
  }
};

const closeModal = () => {
  showModal.value = false;
  currentBOMApprovalStatus.value = null;
  editingBomId.value = null;
  isEditing.value = false;
};

const canApprove = (approvalStatus: number) => {
  const level = authStore.user?.user_level || 1;
  if (level >= 4) return approvalStatus < 2; // Director/Master can always approve
  if (level === 2 && approvalStatus === 0) return true; // Supervisor: 0->1
  if (level === 3 && approvalStatus === 1) return true; // Manager: 1->2
  return false;
};

const approveBOM = async (bomId: number | string) => {
  if (!confirm('Approve this BOM?')) return;
  try {
    const res = await api.post(`/bom/${bomId}/approve`);
    alert(res.data.message);
    await store.fetchBOMs();
    if (showModal.value && editingBomId.value) {
      currentBOMApprovalStatus.value = res.data.approval_status;
    }
  } catch (error: any) {
    alert(error.response?.data?.error || 'Failed to approve BOM');
  }
};

const rejectBOM = async (bomId: number | string) => {
  if (!confirm('Reject this BOM? This will reset approval progress.')) return;
  try {
    const res = await api.post(`/bom/${bomId}/reject`);
    alert(res.data.message);
    await store.fetchBOMs();
    if (showModal.value && editingBomId.value) {
      currentBOMApprovalStatus.value = res.data.approval_status;
    }
  } catch (error: any) {
    alert(error.response?.data?.error || 'Failed to reject BOM');
  }
};

const addComponent = () => {
  if (!componentForm.value.component_id || !componentForm.value.unit_id || componentForm.value.quantity <= 0) {
    alert('Please fill all required component fields');
    return;
  }

  bomComponents.value.push({
    component_id: componentForm.value.component_id,
    quantity: componentForm.value.quantity,
    unit_id: componentForm.value.unit_id,
    loss_percent: componentForm.value.loss_percent || 0,
    is_sub_bom: componentForm.value.is_sub_bom
  });

  componentForm.value = {
    component_id: '',
    quantity: 0,
    unit_id: '',
    loss_percent: 0,
    is_sub_bom: false
  };
};

const removeComponent = (index: number) => {
  bomComponents.value.splice(index, 1);
};

const editComponent = (index: number) => {
  const comp = bomComponents.value[index];
  componentForm.value = {
    component_id: comp.component_id,
    quantity: comp.quantity,
    unit_id: comp.unit_id,
    loss_percent: comp.loss_percent,
    is_sub_bom: comp.is_sub_bom
  };
  // Scroll ke form
  const formSection = document.querySelector('[data-component-form]');
  if (formSection) {
    formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  bomComponents.value.splice(index, 1);
};

const saveBOM = async () => {
  try {
    // Validate required fields
    if (!bomHeader.value.product_name) {
      alert('Please enter a product name');
      return;
    }

    // Duplicate BOM Check (only when creating new, not editing)
    if (!isEditing.value) {
      const normalizeStr = (str: string) => (str || '').toLowerCase().replace(/\s+/g, '');
      const normalizedNew = normalizeStr(bomHeader.value.product_name);
      const isDuplicate = store.boms.some((bom: any) => normalizeStr(bom.product_name) === normalizedNew);
      if (isDuplicate) {
        const proceed = confirm('⚠️ Warning: BOM dengan nama produk "' + bomHeader.value.product_name + '" sudah ada!\n\nApakah anda tetap ingin membuat BOM baru?');
        if (!proceed) return;
      }
    }

    if (bomComponents.value.length === 0) {
      alert('Please add at least one component');
      return;
    }

    // Prepare details array
    const details = bomComponents.value.map(component => ({
      raw_material_id: Number(component.component_id),
      quantity: Number(component.quantity),
      unit_of_measure_id: component.unit_id ? Number(component.unit_id) : null,
    }));

    // Create BOM with new structure
    const bomData = {
      product_name: bomHeader.value.product_name,
      notes: bomHeader.value.notes,
      details: details
    };

    console.log('📤 Sending BOM payload:', JSON.stringify(bomData, null, 2));

    const response = await api.post('/bom', bomData);
    
    console.log('✅ BOM created:', response.data);

    closeModal();
    await store.fetchBOMs();
  } catch (error: any) {
    console.error('❌ Error saving BOM:', error.response?.data || error.message);
    const errorMsg = error.response?.data?.error || error.message || 'Failed to save BOM';
    alert(errorMsg);
  }
};

const deleteBOM = async (bomId: string | number) => {
  if (confirm('Delete this BOM?')) {
    try {
      await api.delete(`/bom/${bomId}`);
      await store.fetchBOMs();
    } catch (error) {
      console.error('Error deleting BOM:', error);
      alert('Failed to delete BOM');
    }
  }
};







const getProductName = (productId: any) => {
  const product = productStore.products.find(p => p.id == productId);
  return product ? `${product.name} (${product.sku})` : '-';
};

const getUnitLabel = (unitId: any) => {
  const unit = units.value.find(u => u.id == unitId);
  return unit ? unit.code : '-';
};

const formatDate = (dateStr: string) => {
  return dateStr ? new Date(dateStr).toLocaleDateString('id-ID') : '-';
};

onMounted(() => {
  store.fetchBOMs();
  productStore.fetchProducts();
  fetchUnits();
});

function handleExport() {
  exportToCSV(store.boms, 'BOM_Export');
}

</script>

<style scoped>
/* Custom scrollbar for modal */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
