<template>
  <div class="space-y-6">
    <!-- Step 1: Choose Work Type -->
    <div v-if="step === 1">
      <h3 class="text-lg font-semibold text-gray-800 mb-3">Pilih Jenis Pekerjaan</h3>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        <button
          v-for="wt in workTypes" :key="wt.id"
          @click="selectWorkType(wt.id)"
          class="p-4 border-2 rounded-xl text-left transition-all group"
          :class="selectedType === wt.id 
            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' 
            : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'"
        >
          <div class="flex items-start gap-3">
            <span class="text-2xl">{{ wt.icon }}</span>
            <div>
              <h4 class="font-semibold text-gray-800">{{ wt.name }}</h4>
              <p class="text-xs text-gray-500 mt-0.5">{{ wt.desc }}</p>
            </div>
          </div>
        </button>
      </div>
    </div>

    <!-- Step 2: MTO + RAB Tabs -->
    <div v-if="step === 2">
      <button @click="step = 1" class="text-sm text-blue-600 hover:text-blue-800 mb-3 flex items-center gap-1">
        ← Kembali pilih jenis pekerjaan
      </button>

      <h3 class="text-lg font-semibold text-gray-800 mb-1">
        {{ currentWorkType?.icon }} {{ currentWorkType?.name }}
      </h3>
      <p class="text-sm text-gray-500 mb-3">Input data engineering &amp; pilih scope pekerjaan</p>

      <!-- Tab Switcher -->
      <div class="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
        <button @click="activeWizardTab = 'mto'"
          :class="activeWizardTab === 'mto' ? 'bg-white text-blue-600 shadow font-semibold' : 'text-gray-500 hover:text-gray-700'"
          class="px-5 py-1.5 rounded-lg text-sm transition-all">
          📐 MTO
        </button>
        <button @click="activeWizardTab = 'rab'"
          :class="activeWizardTab === 'rab' ? 'bg-white text-blue-600 shadow font-semibold' : 'text-gray-500 hover:text-gray-700'"
          class="px-5 py-1.5 rounded-lg text-sm transition-all">
          📋 RAB
        </button>
      </div>

      <!-- MTO Tab -->
      <div v-show="activeWizardTab === 'mto'">
        <!-- Civil Bangunan: Full Accordion -->
        <div v-if="selectedType === 'civil_building'">
          <MtoAccordion :design="design" @generate="doGenerateRAB" />
          <p v-if="rabGenerated" class="mt-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✅ {{ generatedRabItems.length }} item RAB berhasil di-generate! Pindah ke tab RAB untuk review.</p>
        </div>

        <!-- Civil Struktur -->
        <div v-else-if="selectedType === 'civil_structure'" class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Tipe Struktur</label>
              <select v-model="design.structure_type" class="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="warehouse">Gudang / Warehouse</option><option value="tank_foundation">Pondasi Tank</option><option value="retaining_wall">Retaining Wall</option><option value="pipe_rack">Pipe Rack</option><option value="platform">Platform / Mezzanine</option>
              </select></div>
            <div v-if="design.structure_type !== 'warehouse'"><label class="block text-xs font-medium text-gray-600 mb-1">Luas Area (m²)</label><input v-model.number="design.area" type="number" step="0.1" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="500"></div>
          </div>
          <div v-if="design.structure_type !== 'warehouse'" class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Tinggi (m)</label><input v-model.number="design.height" type="number" step="0.1" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="6"></div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Tipe Pondasi</label>
              <select v-model="design.foundation_type" class="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="footplate">Foot Plate</option><option value="bored_pile">Bored Pile</option><option value="mini_pile">Mini Pile</option><option value="pedestal">Pedestal</option>
              </select></div>
          </div>

          <!-- Warehouse Wizard sub-form -->
          <div v-if="design.structure_type === 'warehouse'" class="space-y-3 border-t pt-3 mt-1">
            <div class="grid grid-cols-4 gap-3">
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Panjang (m)</label><input v-model.number="design.length" type="number" step="0.5" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="60"></div>
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Lebar (m)</label><input v-model.number="design.width" type="number" step="0.5" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="20"></div>
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Tinggi Kolom (m)</label><input v-model.number="design.height" type="number" step="0.1" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="6"></div>
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Jml Lantai</label><input v-model.number="design.floors" type="number" step="1" min="1" class="w-full border rounded-lg px-3 py-2 text-sm"></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Jarak Kolom / Gawang (m) <span class="text-gray-400">standar pasar 6m</span></label>
                <input v-model.number="design.bay_spacing" type="number" step="0.5" min="1" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="6">
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Bagi Lebar Jadi (utk jarak purlin)</label>
                <input v-model.number="design.width_divisions" type="number" step="1" min="2" max="8" class="w-full border rounded-lg px-3 py-2 text-sm" :placeholder="String(warehouseGeometry.suggestedWidthDivisions)">
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Tipe Pondasi</label><FoundationPicker v-model="design.foundation_type" /></div>
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Tipe Kolom</label><ColumnTypePicker v-model="design.col_type" /></div>
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Tipe Atap</label><RoofTypePicker v-model="design.roof_type" /></div>
            </div>

            <!-- Live derived summary -->
            <div class="grid grid-cols-4 gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <div><div class="text-lg font-bold text-blue-700">{{ warehouseGeometry.bayCount }}</div><div class="text-[10px] text-gray-500">Gawang (bay)</div></div>
              <div><div class="text-lg font-bold text-blue-700">{{ warehouseGeometry.totalColumns }}</div><div class="text-[10px] text-gray-500">Total Kolom</div></div>
              <div><div class="text-lg font-bold text-blue-700">{{ warehouseGeometry.tieBeamLength }}m</div><div class="text-[10px] text-gray-500">Tie Beam/Sloof</div></div>
              <div><div class="text-lg font-bold text-blue-700">{{ warehouseGeometry.purlinSpacing }}m</div><div class="text-[10px] text-gray-500">Jarak Purlin</div></div>
            </div>

            <BuildingSketchDiagram
              :design="design"
              :spacing="warehouseGeometry.actualBaySpacing"
              column-mode="portal"
              :width-spacing="warehouseGeometry.purlinSpacing"
            />

            <p class="text-xs text-gray-500">
              Klik <b>✅ Terapkan Template</b> di bawah untuk membuat zona MTO (Pondasi, Kolom, Atap, Plat) otomatis dari perhitungan di atas — sisanya bisa disesuaikan manual di tab MTO proposal.
            </p>
          </div>
        </div>

        <!-- Piping -->
        <div v-else-if="selectedType === 'piping'" class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Tipe Proyek</label>
              <select v-model="design.piping_type" class="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="process">Process Piping</option><option value="utility">Utility Piping</option><option value="firefighting">Fire Fighting</option><option value="plumbing">Plumbing</option>
              </select></div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Material</label>
              <select v-model="design.pipe_material" class="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="cs">Carbon Steel</option><option value="ss">Stainless Steel</option><option value="hdpe">HDPE</option><option value="pvc">PVC</option>
              </select></div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Estimasi Dia.Inch</label><input v-model.number="design.total_dia_inch" type="number" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="500"></div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Total Panjang (m)</label><input v-model.number="design.total_length" type="number" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="200"></div>
          </div>
        </div>

        <!-- Electrical -->
        <div v-else-if="selectedType === 'electrical'" class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Tipe Pekerjaan</label>
              <select v-model="design.electrical_type" class="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="full">Full Electrical</option><option value="power">Power Distribution</option><option value="lighting">Lighting &amp; Receptacle</option><option value="grounding">Grounding &amp; Lightning</option>
              </select></div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Kapasitas (kVA)</label><input v-model.number="design.capacity_kva" type="number" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="200"></div>
          </div>
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Luas Area (m²)</label><input v-model.number="design.area" type="number" step="0.1" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="500"></div>
        </div>

        <!-- Mechanical -->
        <div v-else-if="selectedType === 'mechanical'" class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Tipe Pekerjaan</label>
              <select v-model="design.mechanical_type" class="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="hvac">HVAC / AC</option><option value="pump">Pump &amp; Rotating</option><option value="tank">Tank Fabrication</option><option value="steel_fab">Steel Fabrication</option>
              </select></div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Luas / Kapasitas</label><input v-model.number="design.area" type="number" step="0.1" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="500"></div>
          </div>
        </div>

        <!-- Others -->
        <div v-else-if="selectedType === 'others'">
          <p class="text-sm text-gray-500">Proposal kosong — tambah section manual di editor.</p>
        </div>
      </div><!-- end MTO tab -->



      <!-- RAB Tab -->
      <div v-show="activeWizardTab === 'rab'">
      <!-- Scope Breakdown with Sub-Items -->
      <div class="border rounded-xl overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 bg-gray-50">
          <span class="font-semibold text-gray-700 text-sm">📋 Scope Breakdown RAB</span>
          <div class="flex items-center gap-3">
            <button @click="expandAll" class="text-xs text-blue-600 hover:text-blue-800">Expand All</button>
            <button @click="collapseAll" class="text-xs text-blue-600 hover:text-blue-800">Collapse All</button>
            <span class="text-gray-300">|</span>
            <label class="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
              <input type="checkbox" :checked="allChecked" @change="toggleAll" class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5" />
              <span>{{ allChecked ? 'Uncheck All' : 'Check All' }}</span>
            </label>
          </div>
        </div>
        <div class="divide-y max-h-[45vh] overflow-y-auto">
          <div v-for="section in templateSections" :key="section.code">
            <!-- Section Header -->
            <div class="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 cursor-pointer select-none" @click="toggleExpand(section.code)">
              <input type="checkbox" 
                :checked="isSectionChecked(section.code)" 
                :indeterminate="isSectionIndeterminate(section.code)"
                @click.stop 
                @change="toggleSectionCheck(section.code)" 
                class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4 flex-shrink-0" />
              <svg class="w-4 h-4 text-gray-400 transition-transform flex-shrink-0" :class="expandedSections.has(section.code) ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
              <span class="text-blue-700 font-mono text-xs w-8 text-right flex-shrink-0">{{ section.code }}</span>
              <span class="font-semibold text-gray-800 text-sm">{{ section.name }}</span>
              <span class="ml-auto text-xs text-gray-400">{{ getCheckedSubCount(section.code) }}/{{ section.children.length }}</span>
            </div>
            <!-- Sub-Items -->
            <div v-show="expandedSections.has(section.code)" class="bg-gray-50/50">
              <div v-for="child in section.children" :key="child.key"
                class="ahsp-picker-wrap flex items-center gap-2 pl-14 pr-4 py-1.5 hover:bg-blue-50/50 transition-colors"
                :class="checkedItems.has(child.key) ? 'text-gray-700' : 'text-gray-400'">
                <input type="checkbox"
                  :checked="checkedItems.has(child.key)"
                  @change="toggleItem(child.key)"
                  class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 flex-shrink-0 cursor-pointer" />
                <span class="text-xs font-mono text-gray-400 w-6 flex-shrink-0">{{ child.num }}</span>
                <span class="text-sm flex-1" :class="checkedItems.has(child.key) ? '' : 'line-through'">{{ child.name }}</span>

                <!-- AHSP selector (only when checked) -->
                <div v-if="checkedItems.has(child.key)" class="relative flex items-center gap-1 shrink-0">
                  <!-- Badge if selected -->
                  <template v-if="ahspSelections[child.key]">
                    <span class="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-mono border border-blue-200">{{ ahspSelections[child.key].kode }}</span>
                    <span class="text-xs text-gray-500 hidden lg:inline">{{ formatCurrency(ahspSelections[child.key].harga) }}/{{ ahspSelections[child.key].satuan }}</span>
                    <button @click.stop="clearAhsp(child.key)" class="text-gray-300 hover:text-red-400 text-xs leading-none" title="Hapus AHSP">✕</button>
                    <button @click.stop="openAhspPicker(child.key)" class="text-xs text-blue-400 hover:text-blue-600" title="Ganti AHSP">✏️</button>
                  </template>
                  <!-- Button if not selected -->
                  <button v-else
                    @click.stop="openAhspPicker(child.key)"
                    class="text-xs px-2 py-0.5 border border-dashed border-blue-300 text-blue-400 rounded hover:bg-blue-50 hover:border-blue-400 transition-colors whitespace-nowrap">
                    + AHSP
                  </button>

                  <!-- Mini picker dropdown -->
                  <div v-if="activeAhspKey === child.key"
                    class="absolute right-0 top-7 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 w-96 overflow-hidden">
                    <div class="p-2 border-b bg-gray-50">
                      <input v-model="ahspSearchQuery" @input="searchAHSP"
                        placeholder="🔍 Cari kode atau nama AHSP..."
                        class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                        ref="ahspInputRef" />
                    </div>
                    <div class="max-h-52 overflow-y-auto">
                      <div v-if="isSearchingAhsp" class="p-3 text-xs text-gray-400 text-center">⏳ Mencari...</div>
                      <div v-else-if="ahspSearchQuery.length >= 2 && ahspSearchResults.length === 0" class="p-3 text-xs text-gray-400 text-center">Tidak ditemukan</div>
                      <div v-else-if="ahspSearchQuery.length < 2" class="p-3 text-xs text-gray-400 text-center">Ketik minimal 2 karakter untuk cari</div>
                      <button v-for="ahsp in ahspSearchResults" :key="ahsp.id"
                        @click="selectAhsp(child.key, ahsp)"
                        class="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50 last:border-0">
                        <div class="flex justify-between items-start gap-2">
                          <div class="flex-1 min-w-0">
                            <span class="font-mono text-xs text-blue-600 block">{{ ahsp.kode }}</span>
                            <span class="text-xs text-gray-700 truncate block">{{ ahsp.name }}</span>
                          </div>
                          <div class="text-right shrink-0">
                            <span class="text-xs font-semibold text-gray-900">{{ formatCurrency(ahsp.harga_satuan) }}</span>
                            <span class="text-xs text-gray-400 block">/ {{ ahsp.satuan }}</span>
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="px-4 py-2 bg-gray-50 border-t">
          <p class="text-xs text-gray-400">* Centang section & sub-item yang dibutuhkan. Item terpilih akan menjadi baris RAB di proposal.</p>
        </div>
      </div>
      </div><!-- end RAB tab -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import MtoAccordion from './MtoAccordion.vue';
import BuildingSketchDiagram from './BuildingSketchDiagram.vue';
import FoundationPicker from './projects/mto/FoundationPicker.vue';
import ColumnTypePicker from './projects/mto/ColumnTypePicker.vue';
import RoofTypePicker from './projects/mto/RoofTypePicker.vue';
import { useWarehouseGeometry } from '@/composables/useWarehouseGeometry';
import { api } from '@/lib/api';
import { terapkanPilihanAhsp } from '@/lib/proposalTemplatePayload';
import { formatCurrency } from '@/utils/format';

interface SubItem {
  key: string;
  num: string;
  name: string;
  volume?: number;
  unit?: string;
  ahsp_code?: string;
  unit_price?: number;
  total?: number;
}

interface TemplateSection {
  code: string;
  name: string;
  children: SubItem[];
}

interface AhspSelection {
  id: number;
  kode: string;
  name: string;
  harga: number;
  satuan: string;
}

const emit = defineEmits<{
  (e: 'type-selected', type: string | null): void;
  (e: 'ready', ready: boolean): void;
}>();

const step = ref(1);
const activeWizardTab = ref<'mto' | 'rab'>('mto');
const selectedType = ref<string | null>(null);

const design = ref<Record<string, any>>({
  foundation_type: 'footplate',
  structure_type: 'warehouse',
  piping_type: 'process',
  pipe_material: 'cs',
  electrical_type: 'full',
  mechanical_type: 'hvac',
  floors: 1,
});

const workTypes = [
  { id: 'civil_building', icon: '🏢', name: 'Civil Bangunan', desc: 'Gedung, kantor, pabrik, rumah tinggal, ruko' },
  { id: 'civil_structure', icon: '🏗️', name: 'Civil Struktur', desc: 'Gudang, pipe rack, platform, pondasi tank' },
  { id: 'piping', icon: '🔧', name: 'Piping', desc: 'Process piping, utility, fire fighting, plumbing' },
  { id: 'electrical', icon: '⚡', name: 'Electrical', desc: 'Power, lighting, grounding, instrumentation' },
  { id: 'mechanical', icon: '⚙️', name: 'Mechanical', desc: 'HVAC, pump, tank, conveyor, steel fabrication' },
  { id: 'others', icon: '📋', name: 'Others / Custom', desc: 'Template kosong, atur sendiri breakdown-nya' },
];

const currentWorkType = computed(() => workTypes.find(w => w.id === selectedType.value));

const { geometry: warehouseGeometry } = useWarehouseGeometry(design);

const isWarehouseWizard = computed(() =>
  selectedType.value === 'civil_structure' &&
  design.value.structure_type === 'warehouse' &&
  !!design.value.length && !!design.value.width
);

// Derived engineering_inputs zones for the warehouse wizard — real field names
// matching FoundationInputs/ColumnInputs/RoofInputs/SlabInputs so the backend's
// existing calcMtoQty() computes real quantities with no backend changes needed.
const warehouseMtoZones = computed(() => {
  if (!isWarehouseWizard.value) return [];
  const g = warehouseGeometry.value;
  const d = design.value;
  return [
    {
      element_type: 'foundation',
      element_name: 'Pondasi Gudang',
      parameters: { foundation_type: d.foundation_type || 'footplate', qty: g.totalColumns, tb_length: g.tieBeamLength },
    },
    {
      element_type: 'column',
      element_name: 'Kolom Gudang',
      parameters: { col_type: d.col_type || 'wf', qty_per_floor: g.totalColumns, floors: d.floors || 1, height_per_floor: d.height || 6, sloof_length: g.tieBeamLength },
    },
    {
      element_type: 'roof',
      element_name: 'Atap Gudang',
      parameters: { roof_type: d.roof_type || 'zincalume', floor_area: g.floorArea, perimeter: g.roofPerimeter, purlin_spacing: g.purlinSpacing },
    },
    {
      element_type: 'slab',
      element_name: 'Lantai Gudang',
      parameters: { slab_type: 'concrete', area: g.floorArea },
    },
  ];
});

const selectWorkType = (id: string) => {
  selectedType.value = id;
  step.value = 2;
  emit('type-selected', id);
  emit('ready', true);
};

// ---- Checked state management ----
const checkedItems = ref<Set<string>>(new Set());
const expandedSections = ref<Set<string>>(new Set());

const toggleItem = (key: string) => {
  const s = new Set(checkedItems.value);
  if (s.has(key)) s.delete(key); else s.add(key);
  checkedItems.value = s;
};

const isSectionChecked = (code: string) => {
  const sec = templateSections.value.find(s => s.code === code);
  if (!sec || sec.children.length === 0) return false;
  return sec.children.every(c => checkedItems.value.has(c.key));
};

const isSectionIndeterminate = (code: string) => {
  const sec = templateSections.value.find(s => s.code === code);
  if (!sec) return false;
  const checkedCount = sec.children.filter(c => checkedItems.value.has(c.key)).length;
  return checkedCount > 0 && checkedCount < sec.children.length;
};

const toggleSectionCheck = (code: string) => {
  const sec = templateSections.value.find(s => s.code === code);
  if (!sec) return;
  const s = new Set(checkedItems.value);
  if (isSectionChecked(code)) {
    sec.children.forEach(c => s.delete(c.key));
  } else {
    sec.children.forEach(c => s.add(c.key));
  }
  checkedItems.value = s;
};

const getCheckedSubCount = (code: string) => {
  const sec = templateSections.value.find(s => s.code === code);
  if (!sec) return 0;
  return sec.children.filter(c => checkedItems.value.has(c.key)).length;
};

const allChecked = computed(() => {
  if (templateSections.value.length === 0) return false;
  return templateSections.value.every(s => isSectionChecked(s.code));
});

const toggleAll = () => {
  const s = new Set<string>();
  if (!allChecked.value) {
    templateSections.value.forEach(sec => sec.children.forEach(c => s.add(c.key)));
  }
  checkedItems.value = s;
};

const toggleExpand = (code: string) => {
  const s = new Set(expandedSections.value);
  if (s.has(code)) s.delete(code); else s.add(code);
  expandedSections.value = s;
};

const expandAll = () => {
  expandedSections.value = new Set(templateSections.value.map(s => s.code));
};

const collapseAll = () => {
  expandedSections.value = new Set();
};

// ---- Helpers ----
const mkChildren = (code: string, items: string[]): SubItem[] =>
  items.map((name, i) => ({ key: `${code}.${i + 1}`, num: `${i + 1}.`, name }));

// ---- Template section definitions per work type ----
const templateSections = computed<TemplateSection[]>(() => {
  switch (selectedType.value) {
    case 'civil_building':
      return [
        { code: 'I', name: 'Pekerjaan Persiapan', children: mkChildren('I', [
          'Mobilisasi & Demobilisasi Alat dan Material',
          'Papan Nama Proyek',
          'Pembuatan Direksi Keet',
          'Pengukuran & Bouwplank (Uitzet)',
          'Pembersihan Lahan (Land Clearing)',
          'Pagar Sementara Proyek (Hoarding)',
          'Gudang Material & Los Kerja',
          'Instalasi Listrik & Air Kerja Sementara',
          'K3 / Safety Equipment',
        ])},
        { code: 'II', name: 'Pekerjaan Tanah', children: mkChildren('II', [
          'Clearing & Grubbing Area',
          'Galian Tanah Pondasi',
          'Galian Tanah Sloof',
          'Urugan Tanah Kembali (Backfill)',
          'Urugan Pasir Bawah Pondasi',
          'Urugan Sirtu / Peninggian',
          'Pemadatan Tanah (Compaction)',
          'Pembuangan Tanah Bekas Galian',
        ])},
        { code: 'III', name: 'Pekerjaan Pondasi', children: mkChildren('III',
          design.value.foundation_type === 'bored_pile' ? [
            'Pengeboran Bored Pile',
            'Pembesian Bored Pile',
            'Pengecoran Bored Pile',
            'Pile Cap — Bekisting',
            'Pile Cap — Pembesian',
            'Pile Cap — Pengecoran',
          ] : design.value.foundation_type === 'mini_pile' ? [
            'Pemancangan Mini Pile',
            'Pile Cap — Bekisting',
            'Pile Cap — Pembesian',
            'Pile Cap — Pengecoran',
          ] : design.value.foundation_type === 'sumuran' ? [
            'Galian Pondasi Sumuran',
            'Pasangan Batu Kali Pondasi',
            'Pengecoran Pondasi Sumuran',
          ] : [
            'Lantai Kerja (Lean Concrete) t=5cm',
            'Foot Plate — Bekisting',
            'Foot Plate — Pembesian',
            'Foot Plate — Pengecoran',
          ]
        )},
        { code: 'IV', name: 'Pekerjaan Struktur Beton', children: mkChildren('IV', [
          'Sloof — Bekisting',
          'Sloof — Pembesian',
          'Sloof — Pengecoran',
          'Kolom — Bekisting',
          'Kolom — Pembesian',
          'Kolom — Pengecoran',
          'Ring Balok — Bekisting',
          'Ring Balok — Pembesian',
          'Ring Balok — Pengecoran',
          'Balok Lantai — Bekisting',
          'Balok Lantai — Pembesian',
          'Balok Lantai — Pengecoran',
          'Plat Lantai — Bekisting',
          'Plat Lantai — Pembesian',
          'Plat Lantai — Pengecoran',
        ])},
        { code: 'V', name: 'Pekerjaan Dinding & Pasangan', children: mkChildren('V', [
          'Pasangan Bata Ringan / Hebel',
          'Plesteran Dinding',
          'Acian Dinding',
          'Benangan / Tali Air',
          'Pasangan Batu Bata (jika ada)',
          'Dinding Partisi (jika ada)',
        ])},
        { code: 'VI', name: 'Pekerjaan Atap & Rangka', children: mkChildren('VI', [
          'Rangka Atap Baja Ringan / Baja',
          'Pemasangan Penutup Atap (Genteng/Spandek/Galvalum)',
          'Bubungan / Ridge',
          'Lisplang & Talang Air',
          'Flashing & Sealant',
          'Insulation Atap (jika ada)',
        ])},
        { code: 'VII', name: 'Pekerjaan Plafond', children: mkChildren('VII', [
          'Rangka Plafond Hollow / Metal Furing',
          'Pemasangan Plafond Gypsum / Kalsiboard',
          'List Plafond / Profil',
        ])},
        { code: 'VIII', name: 'Pekerjaan Lantai', children: mkChildren('VIII', [
          'Urugan Pasir Bawah Lantai',
          'Cor Lantai Kerja',
          'Pemasangan Keramik Lantai',
          'Pemasangan Keramik KM/WC',
          'Pemasangan Keramik Dinding KM/WC',
          'Floor Hardener (jika ada)',
          'Waterproofing KM/WC',
        ])},
        { code: 'IX', name: 'Pekerjaan Pintu & Jendela', children: mkChildren('IX', [
          'Kusen Aluminium / Kayu',
          'Daun Pintu Panel / Hollow',
          'Daun Jendela Kaca',
          'Pintu KM/WC PVC',
          'Hardware (Handle, Engsel, Kunci)',
          'Pintu Rolling Door (jika ada)',
        ])},
        { code: 'X', name: 'Pekerjaan Pengecatan', children: mkChildren('X', [
          'Cat Dinding Dalam (Interior)',
          'Cat Dinding Luar (Exterior)',
          'Cat Plafond',
          'Cat Lisplang & Talang',
          'Cat Besi / Anti Karat',
        ])},
        { code: 'XI', name: 'Pekerjaan Sanitasi & Plumbing', children: mkChildren('XI', [
          'Instalasi Pipa Air Bersih (PVC/PPR)',
          'Instalasi Pipa Air Kotor & Buangan',
          'Instalasi Pipa Vent',
          'Pemasangan Closet Duduk / Jongkok',
          'Pemasangan Wastafel',
          'Pemasangan Floor Drain',
          'Pemasangan Kran Air',
          'Septictank Bio / Konvensional',
          'Bak Kontrol',
          'Saluran Drainase Lingkungan',
        ])},
        { code: 'XII', name: 'Pekerjaan Listrik', children: mkChildren('XII', [
          'Instalasi Panel Listrik (MCB/MCCB)',
          'Instalasi Kabel NYM / NYY',
          'Instalasi Conduit / Pipa PVC',
          'Instalasi Titik Lampu',
          'Instalasi Stop Kontak',
          'Instalasi Saklar',
          'Lampu TL / LED / Downlight',
          'Grounding System',
          'Penangkal Petir',
        ])},
        { code: 'XIII', name: 'Pekerjaan Lain-lain & Finishing', children: mkChildren('XIII', [
          'Pekerjaan Taman & Landscape',
          'Paving Block / Carport',
          'Pagar & Pintu Gerbang',
          'Saluran Keliling Bangunan',
          'Railling Tangga / Balkon',
          'Bak Sampah / Pos Jaga (jika ada)',
          'Pembersihan Akhir (Final Cleaning)',
        ])},
      ];

    case 'civil_structure':
      return [
        { code: 'I', name: 'Pekerjaan Persiapan', children: mkChildren('I', [
          'Mobilisasi & Demobilisasi',
          'Papan Nama Proyek',
          'Pembuatan Direksi Keet',
          'Pengukuran & Uitzet',
          'Pembersihan Lahan',
          'K3 / Safety Equipment',
        ])},
        { code: 'II', name: 'Pekerjaan Tanah & Urugan', children: mkChildren('II', [
          'Clearing & Grubbing',
          'Galian Tanah Pondasi / Pedestal',
          'Urugan Pasir',
          'Urugan Sirtu / Sub-base',
          'Pemadatan Tanah',
          'Pembuangan Tanah Sisa',
        ])},
        { code: 'III', name: 'Pekerjaan Pondasi', children: mkChildren('III', [
          'Lantai Kerja (Lean Concrete)',
          'Pondasi — Bekisting',
          'Pondasi — Pembesian',
          'Pondasi — Pengecoran',
          'Pedestal — Bekisting',
          'Pedestal — Pembesian',
          'Pedestal — Pengecoran',
          'Anchor Bolt Pemasangan',
        ])},
        { code: 'IV', name: 'Pekerjaan Beton (Tie Beam, Slab)', children: mkChildren('IV', [
          'Tie Beam — Bekisting',
          'Tie Beam — Pembesian',
          'Tie Beam — Pengecoran',
          'Slab on Grade — Wiremesh / Pembesian',
          'Slab on Grade — Pengecoran',
          'Retaining Wall — Bekisting (jika ada)',
          'Retaining Wall — Pembesian (jika ada)',
          'Retaining Wall — Pengecoran (jika ada)',
        ])},
        { code: 'V', name: 'Pekerjaan Struktur Baja', children: mkChildren('V', [
          'Fabrikasi Baja Kolom (H-Beam/WF)',
          'Fabrikasi Baja Rafter / Truss',
          'Fabrikasi Bracing & Purlin',
          'Erection Kolom Baja',
          'Erection Rafter & Truss',
          'Erection Bracing, Purlin, Sagrod',
          'Baut Sambungan (High Strength Bolt)',
          'Pengelasan (Welding)',
          'Pengecatan Baja (Primer + Finish)',
        ])},
        { code: 'VI', name: 'Pekerjaan Atap & Cladding', children: mkChildren('VI', [
          'Pemasangan Atap Metal Sheet (Zincalume/Galvalum)',
          'Pemasangan Dinding Cladding',
          'Flashing & Accessories',
          'Talang & Downpipe',
          'Skylight / Ventilator (jika ada)',
        ])},
        { code: 'VII', name: 'Pekerjaan Floor Hardener / Coating', children: mkChildren('VII', [
          'Floor Hardener Application',
          'Epoxy Floor Coating (jika ada)',
          'Joint Sealant / Cutting',
        ])},
        { code: 'VIII', name: 'Pekerjaan Drainage', children: mkChildren('VIII', [
          'Saluran Drainase U-Ditch',
          'Bak Kontrol',
          'Gorong-gorong / Culvert',
          'Pemasangan Grating',
        ])},
        { code: 'IX', name: 'Pekerjaan Lain-lain', children: mkChildren('IX', [
          'Pekerjaan Paving / Jalan Akses',
          'Pagar & Pintu Gerbang',
          'Final Cleaning',
        ])},
      ];

    case 'piping':
      return [
        { code: 'I', name: 'Pekerjaan Persiapan & Mobilisasi', children: mkChildren('I', [
          'Mobilisasi & Demobilisasi',
          'Survey & Pengukuran Rute Pipa',
          'Pembuatan Shop Drawing / Isometric',
          'K3 / Safety Equipment',
        ])},
        { code: 'II', name: 'Material Pipa (Supply)', children: mkChildren('II', [
          'Pipa Carbon Steel (Berbagai Size)',
          'Pipa Stainless Steel (jika ada)',
          'Pipa HDPE / PVC (jika ada)',
          'Pipa Galvanized (jika ada)',
        ])},
        { code: 'III', name: 'Material Fitting & Flange', children: mkChildren('III', [
          'Elbow (45° / 90°)',
          'Tee / Reducer',
          'Flange (WN / SO / Blind)',
          'Gasket & Bolt-Nut Set',
          'Coupling / Union',
        ])},
        { code: 'IV', name: 'Material Valve', children: mkChildren('IV', [
          'Gate Valve',
          'Ball Valve',
          'Check Valve',
          'Butterfly Valve',
          'Globe Valve (jika ada)',
        ])},
        { code: 'V', name: 'Material Support & Hanger', children: mkChildren('V', [
          'Pipe Shoe / Rest',
          'U-Bolt / Clamp',
          'Hanger Rod Assembly',
          'Guide & Anchor',
          'Spring Hanger (jika ada)',
        ])},
        { code: 'VI', name: 'Pekerjaan Fabrikasi Pipa', children: mkChildren('VI', [
          'Cutting & Beveling',
          'Fit-up & Alignment',
          'Fabrikasi Spool Piece',
          'Pre-fabrication Welding',
        ])},
        { code: 'VII', name: 'Pekerjaan Ereksi & Instalasi', children: mkChildren('VII', [
          'Ereksi Pipa (Elevated)',
          'Instalasi Pipa (Underground)',
          'Instalasi Pipa (Aboveground)',
          'Pemasangan Valve & Fitting',
          'Pemasangan Support & Hanger',
        ])},
        { code: 'VIII', name: 'Pekerjaan Pengelasan (Welding)', children: mkChildren('VIII', [
          'Welding Butt Joint (SMAW/GTAW)',
          'Welding Socket Joint',
          'Welding Branch Connection',
          'NDT — Radiography (RT)',
          'NDT — Dye Penetrant (PT)',
        ])},
        { code: 'IX', name: 'Pekerjaan Testing', children: mkChildren('IX', [
          'Hydrotest',
          'Pneumatic Test',
          'Flushing & Cleaning',
          'Service Test / Leak Test',
        ])},
        { code: 'X', name: 'Pekerjaan Insulation & Painting', children: mkChildren('X', [
          'Sandblasting / Surface Preparation',
          'Pengecatan Primer',
          'Pengecatan Intermediate + Top Coat',
          'Insulation Pipa (Rockwool/Calcium Silicate)',
          'Aluminium Cladding Insulation',
          'Color Coding / Labeling',
        ])},
        { code: 'XI', name: 'Pekerjaan Civil (Pipe Support Foundation)', children: mkChildren('XI', [
          'Pondasi Pipe Support',
          'Pedestal Beton',
          'Sleeper Beton',
          'Galian & Urugan Pipa Underground',
        ])},
      ];

    case 'electrical':
      return [
        { code: 'I', name: 'Pekerjaan Persiapan & Mobilisasi', children: mkChildren('I', [
          'Mobilisasi & Demobilisasi',
          'Survey Rute Kabel & Tray',
          'Pembuatan Shop Drawing',
          'K3 / Safety Equipment',
        ])},
        { code: 'II', name: 'Panel & Switchgear', children: mkChildren('II', [
          'Panel MDP (Main Distribution Panel)',
          'Panel SDP (Sub Distribution Panel)',
          'Panel Capacitor Bank',
          'Panel ATS / AMF (jika ada)',
          'MCC Panel (Motor Control Center)',
          'Pemasangan & Wiring Panel',
        ])},
        { code: 'III', name: 'Pekerjaan Kabel Power', children: mkChildren('III', [
          'Kabel Power (NYY / XLPE)',
          'Kabel Feeder Utama',
          'Kabel Distribusi',
          'Kabel Tray Filling & Laying',
          'Terminasi & Jointing Kabel',
          'Cable Gland & Accessories',
        ])},
        { code: 'IV', name: 'Pekerjaan Cable Tray & Conduit', children: mkChildren('IV', [
          'Cable Tray / Ladder Type',
          'Cable Tray Perforated',
          'Conduit (Rigid / Flexible)',
          'Support & Bracket Cable Tray',
          'Fitting & Accessories',
        ])},
        { code: 'V', name: 'Pekerjaan Lighting & Receptacle', children: mkChildren('V', [
          'Lampu LED / TL Industrial',
          'Lampu Emergency',
          'Lampu Explosion Proof (jika ada)',
          'Stop Kontak Industrial',
          'Switch / Saklar',
          'Junction Box & Accessories',
        ])},
        { code: 'VI', name: 'Pekerjaan Grounding & Lightning', children: mkChildren('VI', [
          'Grounding Rod (Copper)',
          'Grounding Cable (BC)',
          'Grounding Bus Bar',
          'Penangkal Petir (Lightning Rod)',
          'Down Conductor',
          'Testing & Pengukuran Tahanan',
        ])},
        { code: 'VII', name: 'Pekerjaan Instrumentasi', children: mkChildren('VII', [
          'Kabel Instrumen (Shielded)',
          'Instrument Cable Tray',
          'Junction Box Instrumen',
          'Pemasangan Instrument (Sensor, Transmitter)',
          'Calibration',
        ])},
        { code: 'VIII', name: 'Pekerjaan Testing & Commissioning', children: mkChildren('VIII', [
          'Megger Test (Insulation Resistance)',
          'Continuity Test',
          'Relay Protection Test',
          'Phasing & Rotation Check',
          'Energizing & Load Test',
          'Commissioning Report',
        ])},
      ];

    case 'mechanical':
      return [
        { code: 'I', name: 'Pekerjaan Persiapan & Mobilisasi', children: mkChildren('I', [
          'Mobilisasi & Demobilisasi',
          'Survey & Layout',
          'Pembuatan Shop Drawing',
          'K3 / Safety Equipment',
        ])},
        { code: 'II', name: 'Material & Equipment Supply', children: mkChildren('II', [
          'Material Plat / Profil Baja',
          'Material Baut, Mur, Washer',
          'Welding Consumable',
          'Equipment / Machinery Supply',
        ])},
        { code: 'III', name: 'Pekerjaan Fabrikasi', children: mkChildren('III', [
          'Cutting & Marking',
          'Drilling & Punching',
          'Rolling & Bending',
          'Pengelasan Fabrikasi',
          'Assembly / Sub-assembly',
          'Trial Assembly (jika ada)',
          'Quality Inspection (QC)',
        ])},
        { code: 'IV', name: 'Pekerjaan Erection & Instalasi', children: mkChildren('IV', [
          'Rigging & Lifting',
          'Setting / Alignment Equipment',
          'Bolting & Tightening',
          'Grouting (Epoxy / Cementitious)',
          'Shaft Alignment (jika rotating)',
          'Piping Connection',
        ])},
        { code: 'V', name: 'Pekerjaan Piping Terkait', children: mkChildren('V', [
          'Piping Inlet / Outlet Equipment',
          'Drain & Vent Piping',
          'Cooling Water Piping',
          'Instrument Piping (Tubing)',
        ])},
        { code: 'VI', name: 'Pekerjaan Electrical Terkait', children: mkChildren('VI', [
          'Kabel Power Motor',
          'Kabel Instrument / Signal',
          'Junction Box / Terminal Box',
          'Local Panel (jika ada)',
        ])},
        { code: 'VII', name: 'Pekerjaan Insulation & Painting', children: mkChildren('VII', [
          'Surface Preparation',
          'Pengecatan Primer + Top Coat',
          'Insulation (jika ada)',
          'Fireproofing (jika ada)',
        ])},
        { code: 'VIII', name: 'Testing & Commissioning', children: mkChildren('VIII', [
          'No-Load Test / Solo Run',
          'Performance Test',
          'Vibration Test',
          'Commissioning & Handover',
        ])},
      ];

    default:
      return [];
  }
});

// When sections change, auto-check all items and expand first 3
watch(templateSections, (sections) => {
  const allKeys = new Set<string>();
  sections.forEach(sec => sec.children.forEach(c => allKeys.add(c.key)));
  checkedItems.value = allKeys;
  expandedSections.value = new Set(sections.slice(0, 3).map(s => s.code));
}, { immediate: true });

// ─── MTO Calculator ──────────────────────────────────────────────────────────
const isCivilType = computed(() => ['civil_building', 'civil_structure'].includes(selectedType.value || ''));

const mtoCalc = computed(() => {
  if (!isCivilType.value) return null;
  const d = design.value;
  const L = d.length || 10, W = d.width || 8, H = d.height || 4, floors = d.floors || 1;
  const floorArea = L * W;
  const perimeter = 2 * (L + W);
  const gridSpacing = 4;
  const nColX = Math.ceil(L / gridSpacing) + 1;
  const nColY = Math.ceil(W / gridSpacing) + 1;
  const nFnd  = nColX * nColY;
  // Pondasi footplat
  const ftL = 1.0, ftW = 1.0, ftH = 0.4, ws = 0.3;
  const volFnd   = +(ftL * ftW * ftH * nFnd).toFixed(2);
  const volGalFnd= +((ftL+2*ws)*(ftW+2*ws)*ftH*nFnd).toFixed(2);
  const volBackFnd= +(Math.max(volGalFnd - volFnd, 0)).toFixed(2);
  const rebarFnd = +(volFnd * 95).toFixed(1);
  const bkFnd    = +(2*(ftL+ftW)*ftH*nFnd).toFixed(2);
  // Sloof
  const sL = (nColX * W + nColY * L);
  const volSloof = +(0.25 * 0.35 * sL).toFixed(2);
  const rebarSloof = +(volSloof * 122).toFixed(1);
  const bkSloof  = +((2*0.35+0.25)*sL).toFixed(2);
  const volGalSloof = +(0.5 * 0.45 * sL).toFixed(2);
  // Kolom
  const volKolom  = +(0.3 * 0.3 * H * nFnd * floors).toFixed(2);
  const rebarKolom= +(volKolom * 160).toFixed(1);
  const bkKolom   = +(2*(0.3+0.3)*H*nFnd*floors).toFixed(2);
  // Balok
  const totalBlkL = (nColX * W + nColY * L) * Math.max(floors - 1, 1);
  const volBalok  = +(0.25 * 0.4 * totalBlkL).toFixed(2);
  const rebarBalok= +(volBalok * 117).toFixed(1);
  const bkBalok   = +((2*0.4+0.25)*totalBlkL).toFixed(2);
  // Ring Balok
  const volRB     = +(0.20 * 0.30 * perimeter * floors).toFixed(2);
  const rebarRB   = +(volRB * 122).toFixed(1);
  const bkRB      = +((2*0.30+0.20)*perimeter*floors).toFixed(2);
  // Plat
  const nPlat     = Math.max(floors - 1, 0);
  const volPlat   = +(floorArea * nPlat * 0.12).toFixed(2);
  const rebarPlat = +(volPlat * 85).toFixed(1);
  const bkPlat    = +(floorArea * nPlat).toFixed(2);
  // Total beton & besi
  const volTotalBeton = +(volFnd + volSloof + volKolom + volBalok + volRB + volPlat).toFixed(2);
  const totalBesi = +(rebarFnd + rebarSloof + rebarKolom + rebarBalok + rebarRB + rebarPlat).toFixed(1);
  // Dinding
  const wallArea  = +(perimeter * H * floors * 0.75).toFixed(2);
  const plesterArea = +(wallArea * 2).toFixed(2);
  // Atap
  const roofArea  = +(floorArea / Math.cos(30 * Math.PI / 180) * 1.1).toFixed(2);
  const rabungLen = +(L * 1.0).toFixed(1);
  const listplankLen = +(perimeter * 1.1).toFixed(1);
  // Plafond
  const plafondArea = +(floorArea * floors).toFixed(2);
  const listPlafondLen = +(perimeter * floors * 1.1).toFixed(1);
  // Lantai
  const keramikArea = +(floorArea * floors).toFixed(2);
  return {
    nFnd, volFnd, volGalFnd, volBackFnd, rebarFnd, bkFnd,
    volSloof, rebarSloof, bkSloof, volGalSloof,
    volKolom, rebarKolom, bkKolom,
    volBalok, rebarBalok, bkBalok,
    volRB, rebarRB, bkRB,
    volPlat, rebarPlat, bkPlat,
    volTotalBeton, totalBesi,
    wallArea, plesterArea,
    roofArea, rabungLen, listplankLen,
    plafondArea, listPlafondLen,
    keramikArea,
  };
});



// AHSP mapping — harga satuan berdasarkan analisis Excel
const AHSP: Record<string, { name: string; unit: string; code: string; price: number }> = {
  lantai_kerja:   { name: 'Lantai Kerja 1:3:5 t=5cm', unit: 'M3', code: 'AHSP PU A.4.1.1.1', price: 950000 },
  galian_tanah:   { name: 'Galian Tanah Pondasi', unit: 'M3', code: 'AHSP PU A.2.3.1.1', price: 35000 },
  galian_sloof:   { name: 'Galian Tanah Sloof', unit: 'M3', code: 'AHSP PU A.2.3.1.1', price: 35000 },
  urugan_kembali: { name: 'Urugan Tanah Kembali', unit: 'M3', code: 'AHSP PU A.2.3.2.1', price: 25000 },
  beton_k250:     { name: 'Beton K-250', unit: 'M3', code: 'AHSP PU A.4.1.1.8', price: 1095477 },
  besi_tulangan:  { name: 'Besi Tulangan', unit: 'Kg', code: 'AHSP PU A.4.1.1.17', price: 19414 },
  bekisting_sloof:{ name: 'Bekisting Sloof', unit: 'M2', code: 'AHSP PU A.4.1.1.22', price: 571043 },
  bekisting_kolom:{ name: 'Bekisting Kolom', unit: 'M2', code: 'AHSP PU A.4.1.1.22', price: 571043 },
  bekisting_balok:{ name: 'Bekisting Balok', unit: 'M2', code: 'AHSP PU A.4.1.1.23', price: 583748 },
  bekisting_plat: { name: 'Bekisting Plat Lantai', unit: 'M2', code: 'AHSP PU A.4.1.1.24', price: 571043 },
  bekisting_fnd:  { name: 'Bekisting Pondasi', unit: 'M2', code: 'AHSP PU A.4.1.1.22', price: 571043 },
  pasang_bata:    { name: 'Pasangan Bata 1PC:4PP', unit: 'M2', code: 'AHSP PU A.4.4.1.9', price: 141892 },
  plesteran:      { name: 'Plesteran 1PC:4PP', unit: 'M2', code: 'AHSP PU A.4.4.2.4', price: 68112 },
  acian:          { name: 'Acian Dinding', unit: 'M2', code: 'AHSP PU A.4.4.2.7', price: 45000 },
  rangka_atap:    { name: 'Rangka Kuda-kuda Baja Ringan C-75', unit: 'M2', code: 'TAKSIR', price: 300000 },
  genteng_metal:  { name: 'Penutup Atap Genteng Metal 0.35', unit: 'M2', code: 'AHSP PU A.4.5.2.32', price: 119873 },
  rabung:         { name: 'Rabung Genteng Metal', unit: 'M1', code: 'AHSP PU A.4.5.2.39.a', price: 33787 },
  listplank:      { name: 'Papan Listplank 2.5/25cm', unit: 'M1', code: 'AHSP PU A.4.6.1.21', price: 125098 },
  rangka_plafond: { name: 'Rangka Plafond Kayu Kelas II', unit: 'M2', code: 'AHSP PU A.4.6.1.20', price: 128453 },
  plafond_triplek:{ name: 'Plafon Triplek 6mm', unit: 'M2', code: 'AHSP PU A.4.5.1.7', price: 56265 },
  list_plafond:   { name: 'List Plafond Kayu', unit: 'M1', code: 'AHSP PU A.4.5.1.9', price: 22143 },
  keramik_4040:   { name: 'Pas. Keramik Lantai 40/40', unit: 'M2', code: 'AHSP PU A.4.4.3.34.a', price: 262746 },
  cat_dinding:    { name: 'Cat Dinding Luar & Dalam', unit: 'M2', code: 'AHSP PU A.4.7.1.10', price: 32600 },
  cat_plafond:    { name: 'Cat Plafond', unit: 'M2', code: 'AHSP PU A.4.7.1.4', price: 32600 },
};

const generatedRabItems = ref<any[]>([]);
const rabGenerated = ref(false);

// ─── AHSP Selector per item ───────────────────────────────────────────────────
const ahspSelections = ref<Record<string, AhspSelection>>({});
const activeAhspKey = ref<string | null>(null);
const ahspSearchQuery = ref('');
const ahspSearchResults = ref<any[]>([]);
const isSearchingAhsp = ref(false);
const ahspInputRef = ref<HTMLInputElement | null>(null);
let ahspTimer: ReturnType<typeof setTimeout> | null = null;

const openAhspPicker = (key: string) => {
  if (activeAhspKey.value === key) { activeAhspKey.value = null; return; }
  activeAhspKey.value = key;
  ahspSearchQuery.value = '';
  ahspSearchResults.value = [];
  setTimeout(() => ahspInputRef.value?.focus(), 80);
};

const clearAhsp = (key: string) => {
  const copy = { ...ahspSelections.value };
  delete copy[key];
  ahspSelections.value = copy;
};

const searchAHSP = () => {
  if (ahspTimer) clearTimeout(ahspTimer);
  if (ahspSearchQuery.value.length < 2) { ahspSearchResults.value = []; return; }
  isSearchingAhsp.value = true;
  ahspTimer = setTimeout(async () => {
    try {
      const { data } = await api.get('/estimator/ahsp', { params: { search: ahspSearchQuery.value } });
      ahspSearchResults.value = (data || []).slice(0, 12);
    } catch { ahspSearchResults.value = []; }
    isSearchingAhsp.value = false;
  }, 350);
};

const selectAhsp = (key: string, ahsp: any) => {
  ahspSelections.value = {
    ...ahspSelections.value,
    [key]: { id: ahsp.id, kode: ahsp.kode, name: ahsp.name, harga: ahsp.harga_satuan, satuan: ahsp.satuan }
  };
  activeAhspKey.value = null;
  ahspSearchQuery.value = '';
};

const handleOutsideClick = (e: MouseEvent) => {
  if (!(e.target as HTMLElement).closest('.ahsp-picker-wrap')) activeAhspKey.value = null;
};
onMounted(() => document.addEventListener('click', handleOutsideClick));
onBeforeUnmount(() => document.removeEventListener('click', handleOutsideClick));

function doGenerateRAB() {
  const c = mtoCalc.value;
  if (!c) return;
  const mk = (sectionCode: string, sectionName: string, items: Array<{ key: string; vol: number; ahsp: string }>) => ({
    code: sectionCode, name: sectionName,
    children: items.map((it, i) => {
      const a = AHSP[it.ahsp];
      // `key` mempertahankan hubungan ke pilihan AHSP pengguna. Tanpanya,
      // generated RAB tidak bisa menggabungkan `ahspSelections` saat disimpan.
      return { key: it.key, num: `${i+1}.`, name: a.name, volume: it.vol, unit: a.unit, ahsp_code: a.code, unit_price: a.price, total: +(it.vol * a.price).toFixed(0) };
    })
  });
  generatedRabItems.value = [
    mk('I',   'Pekerjaan Persiapan', []),
    mk('II',  'Pekerjaan Tanah', [
      { key: 'galian_fnd', vol: c.volGalFnd,   ahsp: 'galian_tanah' },
      { key: 'galian_sloof', vol: c.volGalSloof, ahsp: 'galian_sloof' },
      { key: 'urugan', vol: c.volBackFnd,  ahsp: 'urugan_kembali' },
    ]),
    mk('III', 'Pekerjaan Pondasi', [
      { key: 'lk',    vol: +(1.0*1.0*0.05*c.nFnd).toFixed(2), ahsp: 'lantai_kerja' },
      { key: 'fnd_beton', vol: c.volFnd,   ahsp: 'beton_k250' },
      { key: 'fnd_besi',  vol: c.rebarFnd, ahsp: 'besi_tulangan' },
      { key: 'fnd_bk',    vol: c.bkFnd,    ahsp: 'bekisting_fnd' },
    ]),
    mk('IV',  'Pekerjaan Struktur Beton', [
      { key: 'sl_bt', vol: c.volSloof,   ahsp: 'beton_k250' },
      { key: 'sl_bs', vol: c.rebarSloof, ahsp: 'besi_tulangan' },
      { key: 'sl_bk', vol: c.bkSloof,   ahsp: 'bekisting_sloof' },
      { key: 'kl_bt', vol: c.volKolom,   ahsp: 'beton_k250' },
      { key: 'kl_bs', vol: c.rebarKolom, ahsp: 'besi_tulangan' },
      { key: 'kl_bk', vol: c.bkKolom,   ahsp: 'bekisting_kolom' },
      { key: 'bl_bt', vol: c.volBalok,   ahsp: 'beton_k250' },
      { key: 'bl_bs', vol: c.rebarBalok, ahsp: 'besi_tulangan' },
      { key: 'bl_bk', vol: c.bkBalok,   ahsp: 'bekisting_balok' },
      { key: 'rb_bt', vol: c.volRB,      ahsp: 'beton_k250' },
      { key: 'rb_bs', vol: c.rebarRB,    ahsp: 'besi_tulangan' },
      { key: 'rb_bk', vol: c.bkRB,      ahsp: 'bekisting_balok' },
      { key: 'pl_bt', vol: c.volPlat,    ahsp: 'beton_k250' },
      { key: 'pl_bs', vol: c.rebarPlat,  ahsp: 'besi_tulangan' },
      { key: 'pl_bk', vol: c.bkPlat,    ahsp: 'bekisting_plat' },
    ]),
    mk('V',   'Pekerjaan Pasangan & Plesteran', [
      { key: 'bata',    vol: c.wallArea,    ahsp: 'pasang_bata' },
      { key: 'plester', vol: c.plesterArea, ahsp: 'plesteran' },
      { key: 'acian',   vol: c.plesterArea, ahsp: 'acian' },
    ]),
    mk('VI',  'Pekerjaan Atap & Plafond', [
      { key: 'rangka_atap',    vol: c.roofArea,        ahsp: 'rangka_atap' },
      { key: 'genteng',        vol: c.roofArea,        ahsp: 'genteng_metal' },
      { key: 'rabung',         vol: c.rabungLen,       ahsp: 'rabung' },
      { key: 'listplank',      vol: c.listplankLen,    ahsp: 'listplank' },
      { key: 'rangka_plafond', vol: c.plafondArea,     ahsp: 'rangka_plafond' },
      { key: 'plafond',        vol: c.plafondArea,     ahsp: 'plafond_triplek' },
      { key: 'list_plafond',   vol: c.listPlafondLen,  ahsp: 'list_plafond' },
    ]),
    mk('VII', 'Pekerjaan Lantai', [
      { key: 'keramik', vol: c.keramikArea, ahsp: 'keramik_4040' },
    ]),
    mk('VIII','Pekerjaan Pengecatan', [
      { key: 'cat_din', vol: c.wallArea,    ahsp: 'cat_dinding' },
      { key: 'cat_pla', vol: c.plafondArea, ahsp: 'cat_plafond' },
    ]),
  ];
  rabGenerated.value = true;
  // Auto-switch to RAB tab
  setTimeout(() => { activeWizardTab.value = 'rab'; }, 600);
}

// Public API
const getResult = () => {
  const sumber = generatedRabItems.value.length
    ? generatedRabItems.value
    : templateSections.value
      .filter(sec => sec.children.some((c: any) => checkedItems.value.has(c.key)))
      .map((sec: any) => ({
        ...sec,
        children: (sec.children || []).filter((c: any) => !c.key || checkedItems.value.has(c.key)),
      }));
  const sections = terapkanPilihanAhsp(sumber, ahspSelections.value);

  return {
    type: selectedType.value,
    design_params: { ...design.value },
    mto_quantities: mtoCalc.value || {},
    mto_rab_items: sections,
    warehouse_mto_zones: warehouseMtoZones.value,
    ahsp_selections: ahspSelections.value,
    template_sections: sections,
  };
};

defineExpose({ getResult, templateSections, selectedType });
</script>
