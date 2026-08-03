<template>
  <div class="mto-wrap">

    <!-- Module Tab Navigation -->
    <div class="mto-tabs">
    <button v-for="mod in MODULES" :key="mod.id"
        @click="activeTab = mod.id; activeZoneIdx = 0"
        class="mto-tab" :class="{ active: activeTab === mod.id }"
        :style="`--clr:${mod.color}`">
        <span>{{ mod.icon }}</span>
        <span class="tab-label">{{ mod.label }}</span>
        <span v-if="zones[mod.id]?.length" class="tab-badge">{{ zones[mod.id].length }}</span>
      </button>
      <!-- Rekap tab -->
      <button @click="activeTab='rekap'; activeZoneIdx=0"
        class="mto-tab" :class="{active:activeTab==='rekap'}" style="--clr:#0ea5e9">
        <span>📊</span>
        <span class="tab-label">Rekap MTO</span>
      </button>
    </div>

    <div class="mto-content">
      <div v-if="loading" class="mto-loading">⏳ Memuat data...</div>
      <template v-else>
        <!-- Zone input UI — only when NOT in Rekap tab -->
        <template v-if="activeTab !== 'rekap' && activeModule">

          <!-- Header row -->
          <div class="mod-header">
            <div class="mod-title">
              <span style="font-size:1.4rem">{{ activeModule.icon }}</span>
              <div>
                <div class="mod-name">{{ activeModule.label }}</div>
                <div class="mod-sub">Input dimensi per zona → kalkulasi MTO otomatis</div>
              </div>
            </div>
            <button v-if="!readonly" @click="addZone" class="add-zone-btn">＋ Tambah Zona</button>
          </div>

          <!-- Zone tabs (horizontal pills) -->
          <div class="zone-bar" v-if="currentZones.length">
            <button v-for="(z, i) in currentZones" :key="z.zid"
              class="zone-pill" :class="{ active: activeZoneIdx === i }"
              @click="activeZoneIdx = i">
              {{ z.name || (activeModule.label + ' ' + (i+1)) }}
              <span v-if="!readonly" @click.stop="removeZone(i)" class="zone-del" title="Hapus zona">×</span>
            </button>
          </div>
          <div v-else class="zone-empty">
            <span>Belum ada zona. Klik <strong>＋ Tambah Zona</strong> untuk mulai.</span>
          </div>

          <!-- Active zone: name + component -->
          <template v-if="activeZone">
            <div class="zone-name-row">
              <input v-if="!readonly" class="zone-name-input" v-model="activeZone.name"
                :placeholder="activeModule.label + ' ' + (activeZoneIdx+1)"
                @change="markDirty" />
              <span v-else class="zone-name-input" style="background:#f8fafc;border-color:#e2e8f0;color:#0f172a">{{ activeZone.name || activeModule.label + ' ' + (activeZoneIdx+1) }}</span>
              <span class="zone-hint">{{ activeModule.label }} — Zona {{ activeZoneIdx + 1 }}</span>
            </div>

            <div class="mod-body">
              <component :is="activeModule.component"
                :key="activeZone.zid"
                v-model="activeZone.params"
                :disabled="readonly"
                @change="markDirty" />
            </div>
          </template>

          <!-- Save bar -->
          <template v-if="!readonly">
            <div class="dirty-bar" :style="isDirty ? 'background:#fef3c7;border-color:#fcd34d' : 'background:#f0fdf4;border-color:#d1fae5'">
              <span v-if="isDirty" style="color:#92400e">⚠️ Ada perubahan belum disimpan</span>
              <span v-else style="color:#065f46">✓ {{ zones[activeTab]?.length || 0 }} zona {{ activeModule?.label }} tersimpan</span>
              <button @click="saveModule" :disabled="saving" class="save-btn-sm"
                :style="isDirty ? 'background:#d97706' : 'background:#059669'">
                {{ saving ? 'Menyimpan...' : '💾 Simpan' }}
              </button>
            </div>
          </template>
          <div v-else-if="readonly && zones[activeTab]?.length" class="saved-bar" style="background:#eff6ff;border-color:#bfdbfe;color:#1e40af">
            🔒 {{ zones[activeTab].length }} zona {{ activeModule?.label }} — Read-only (edit di Proposal)
          </div>

        </template><!-- zone input -->

        <!-- ── REKAP MTO VIEW ── -->
        <template v-if="activeTab==='rekap'">
        <div class="rekap-wrap">
          <div class="mod-header">
            <div class="mod-title">
              <span style="font-size:1.4rem">📊</span>
              <div>
                <div class="mod-name">Rekapitulasi MTO Proyek</div>
                <div class="mod-sub">Kebutuhan material detail per bagian, hasil kalkulasi dari semua zona yang tersimpan</div>
              </div>
            </div>
          </div>

          <!-- KPI summary cards -->
          <div class="rekap-kpi">
            <div class="rk-card" v-for="s in grandSummary" :key="s.l">
              <div class="rk-icon">{{ s.icon }}</div>
              <div class="rk-val">{{ s.v }}</div>
              <div class="rk-u">{{ s.u }}</div>
              <div class="rk-l">{{ s.l }}</div>
            </div>
          </div>

          <!-- Empty state -->
          <div v-if="!hasSaved" class="rekap-empty">
            📝 Belum ada data MTO. Isi dimensi di tab Pondasi, Kolom, Balok, dll terlebih dahulu lalu simpan.
          </div>

          <template v-else>
            <!-- Detail per section -->
            <div v-for="sec in detailedMTO" :key="sec.id" class="rekap-section">
              <div class="rs-head" @click="sec.open=!sec.open">
                <span style="font-size:1.1rem">{{ sec.icon }}</span>
                <span style="font-weight:700;flex:1">{{ sec.label }}</span>
                <span class="rs-badge">{{ sec.zones.length }} zona</span>
                <span class="rs-toggle">{{ sec.open ? '▲' : '▼' }}</span>
              </div>
              <div v-show="sec.open">
                <div v-for="(z, zi) in sec.zones" :key="zi" class="rs-zone">
                  <div class="rs-zone-name">📌 {{ z.name }}</div>
                  <table class="rs-tbl">
                    <thead><tr><th>Material / Pekerjaan</th><th class="tc">Qty</th><th class="tc">Satuan</th></tr></thead>
                    <tbody>
                      <tr v-for="(row, ri) in z.rows" :key="ri" :class="ri%2?'rs-odd':''">
                        <td>{{ row.label }}</td>
                        <td class="tc rs-num">{{ row.qty }}</td>
                        <td class="tc rs-unit">{{ row.unit }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <!-- Section subtotal -->
                <table class="rs-tbl rs-subtotal">
                  <thead><tr><th colspan="2" style="color:#1d4ed8">∑ Subtotal — {{ sec.label }}</th><th class="tc">Total</th><th class="tc">Satuan</th></tr></thead>
                  <tbody>
                    <tr v-for="(row, ri) in sec.subtotal" :key="ri">
                      <td colspan="2" style="font-weight:600">{{ row.label }}</td>
                      <td class="tc" style="font-weight:800;color:#0f172a">{{ row.qty }}</td>
                      <td class="tc rs-unit">{{ row.unit }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Grand Total -->
            <div class="rekap-total">
              <div class="rt-title">📦 Grand Total Kebutuhan Material</div>
              <table class="rs-tbl">
                <thead><tr><th>Material</th><th class="tc">Total Qty</th><th class="tc">Satuan</th><th>Keterangan</th></tr></thead>
                <tbody>
                  <tr v-for="(r, i) in mtoGrandTotal" :key="i" :class="i%2?'rs-odd':''">
                    <td style="font-weight:600">{{ r.icon }} {{ r.label }}</td>
                    <td class="tc" style="font-weight:800;font-size:.95rem;color:#1d4ed8">{{ r.qty }}</td>
                    <td class="tc rs-unit">{{ r.unit }}</td>
                     <td style="color:#94a3b8;font-size:.72rem">{{ r.note }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div><!-- rekap-wrap -->
      </template><!-- rekap tab -->

    </template><!-- v-else (not loading) -->
    </div><!-- mto-content -->

  </div><!-- mto-wrap -->
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { api } from '../../lib/api';
import FoundationInputs from './mto/FoundationInputs.vue';
import ColumnInputs from './mto/ColumnInputs.vue';
import BeamInputs from './mto/BeamInputs.vue';
import SlabInputs from './mto/SlabInputs.vue';
import WallInputs from './mto/WallInputs.vue';
import RoofInputs from './mto/RoofInputs.vue';

const props = defineProps<{
  projectId: number | string;
  apiBase?: string;           // default '/projects'
  readonly?: boolean;         // when true, hide all editing controls
}>();

const baseUrl = computed(() => `${props.apiBase || '/projects'}/${props.projectId}`);

const MODULES = [
  { id:'foundation', label:'Pondasi',     icon:'🏗', color:'#f59e0b', component: FoundationInputs },
  { id:'column',     label:'Kolom',       icon:'🏛', color:'#3b82f6', component: ColumnInputs },
  { id:'beam',       label:'Balok',       icon:'🔗', color:'#8b5cf6', component: BeamInputs },
  { id:'slab',       label:'Plat Lantai', icon:'🧱', color:'#10b981', component: SlabInputs },
  { id:'wall',       label:'Dinding',     icon:'🪟', color:'#6b7280', component: WallInputs },
  { id:'roof',       label:'Atap',        icon:'🏠', color:'#ef4444', component: RoofInputs },
];

// Default params per module type
const DEFAULTS: Record<string, () => Record<string,any>> = {
  foundation: () => ({ foundation_type:'footplate', qty:12, L:1.0, W:1.0, H:0.35, depth:1.2, working_space:0.3, tb_length:200, tb_w:0.20, tb_h:0.40, rebar_main:13, tb_rebar_main:16, tb_stirrup:10, stirrup_spacing:0.15 }),
  column:     () => ({ col_type:'beton', qty_per_floor:12, floors:1, height_per_floor:4, B:0.3, H:0.3, rebar_dia:16, rebar_count:8, stirrup_dia:10, stirrup_spacing:0.15, cover:0.04, sloof_length:200, sloof_w:0.3, sloof_h:0.5, sloof_rebar_dia:16 }),
  beam:       () => ({ beam_type:'beton', total_length:300, B:0.25, H:0.5, rebar_count:4, rebar_dia:16, stirrup_dia:10, rb_length:200, rb_B:0.15, rb_H:0.25, rb_rebar_dia:13 }),
  slab:       () => ({ slab_type:'concrete', area:1000, thickness:0.15, subbase_t:0.15, lean_t:0.05, cut_depth:0.35, rebar_type:'wiremesh', rebar_dia_x:8, spacing_x:0.15, finishing:'floor_hardener' }),
  wall:       () => ({ wall_type:'bata_ringan', area:500, height:4, opening_pct:20, thickness_cm:10, door_qty:4, door_w:0.9, door_h:2.1, window_qty:8, window_w:1.2, window_h:1.2 }),
  roof:       () => ({ roof_type:'zincalume', floor_area:1000, perimeter:160, slope_deg:10, overhang:0.8, sheet_eff_w:0.85, cladding_h:6, cladding_type:'zincalume', ridge_length:50, gutter_length:100, downspout_qty:4, purlin_spacing:1.5 }),
};

interface Zone { zid: string; name: string; element_id?: number; params: Record<string,any>; }

const activeTab     = ref('foundation');
const activeZoneIdx = ref(0);
const loading       = ref(false);
const saving        = ref(false);
const isDirty       = ref(false);

// zones[moduleId] = Zone[]
const zones = ref<Record<string, Zone[]>>({
  foundation:[], column:[], beam:[], slab:[], wall:[], roof:[]
});

const activeModule  = computed(() => MODULES.find(m => m.id === activeTab.value)!);
const currentZones  = computed(() => zones.value[activeTab.value] || []);
const activeZone    = computed(() => currentZones.value[activeZoneIdx.value] || null);
const hasSaved      = computed(() => MODULES.some(m => zones.value[m.id]?.length > 0));

// Auto-save debounce timer
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

watch(activeTab, async (newTab, oldTab) => {
  // Auto-save previous tab data before switching
  if (isDirty.value && oldTab) {
    await autoSave(oldTab);
  }
  activeZoneIdx.value = 0;
  nextTick(() => {
    if (!zones.value[newTab]?.length) addDefaultZone();
  });
});

// Deep watch zones params — catches v-model changes that don't emit @change
let skipWatch = true; // skip initial hydration
watch(() => zones.value, () => {
  if (skipWatch || props.readonly) return;
  markDirty();
}, { deep: true });
// Enable deep watch after initial load settles
watch(loading, (v) => { if (!v) nextTick(() => { skipWatch = false; }); });

function uid() { return Math.random().toString(36).slice(2,9); }

// Add zone without marking dirty (silent, for auto-create)
function addDefaultZone() {
  const mod = activeTab.value;
  if (zones.value[mod]?.length) return; // already has zones
  const name = `${activeModule.value.label} 1`;
  zones.value[mod].push({ zid: uid(), name, params: DEFAULTS[mod]() });
  activeZoneIdx.value = 0;
  // not marking dirty — user must explicitly save
}

function addZone() {
  const mod = activeTab.value;
  const name = `${activeModule.value.label} ${(zones.value[mod]?.length || 0) + 1}`;
  zones.value[mod].push({ zid: uid(), name, params: DEFAULTS[mod]() });
  activeZoneIdx.value = zones.value[mod].length - 1;
  markDirty();
}

async function removeZone(i: number) {
  if (!confirm('Hapus zona ini?')) return;
  const mod = activeTab.value;
  const zone = zones.value[mod][i];
  // Delete from backend if it was previously saved
  if (zone.element_id) {
    try {
      await api.delete(`${baseUrl.value}/mto/${zone.element_id}`);
    } catch (e) { console.error('Failed to delete zone from backend:', e); }
  }
  zones.value[mod].splice(i, 1);
  if (activeZoneIdx.value >= zones.value[mod].length)
    activeZoneIdx.value = Math.max(0, zones.value[mod].length - 1);
  // Don't just markDirty — the deletion is already persisted
}

function markDirty() {
  if (props.readonly) return; // readonly mode — no edits allowed
  isDirty.value = true;
  // Debounced auto-save — 3 seconds after last change
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    if (isDirty.value) autoSave(activeTab.value);
  }, 3000);
}

// Silent auto-save for a given module tab
async function autoSave(mod: string) {
  if (!zones.value[mod]?.length) return;
  try {
    for (const z of zones.value[mod]) {
      const activeModInfo = MODULES.find(m => m.id === mod);
      const payload = {
        element_type: mod,
        element_name: z.name || activeModInfo?.label || mod,
        parameters: { ...z.params, _zone_name: z.name }
      };
      if (z.element_id) {
        await api.put(`${baseUrl.value}/mto/${z.element_id}`, payload);
      } else {
        const res = await api.post(`${baseUrl.value}/mto`, payload);
        z.element_id = res.data.id;
      }
    }
    isDirty.value = false;
  } catch { /* silent fail — manual save bar still shows */ }
}

async function saveModule() {
  saving.value = true;
  try {
    const mod = activeTab.value;
    const zoneList = zones.value[mod];
    for (const z of zoneList) {
      const payload = { element_type: mod, element_name: z.name || `${activeModule.value.label}`, parameters: { ...z.params, _zone_name: z.name } };
      if (z.element_id) {
        await api.put(`${baseUrl.value}/mto/${z.element_id}`, payload);
      } else {
        const res = await api.post(`${baseUrl.value}/mto`, payload);
        z.element_id = res.data.id;
      }
    }
    isDirty.value = false;
  } catch(e) {
    alert('Gagal menyimpan. Coba lagi.');
  } finally { saving.value = false; }
}

async function fetchAll() {
  loading.value = true;
  // Reset all zones before loading — prevents duplication on re-mount
  for (const mod of MODULES) zones.value[mod.id] = [];
  try {
    const res = await api.get(`${baseUrl.value}/mto`);
    const elements: any[] = res.data.elements || [];
    for (const el of elements) {
      const t = el.element_type;
      if (!zones.value[t]) zones.value[t] = [];
      const params = el.parameters || {};
      zones.value[t].push({ zid: uid(), name: params._zone_name || el.element_name || t, element_id: el.id, params: { ...DEFAULTS[t]?.(), ...params } });
    }
  } catch(e) { console.error('MTO fetch:', e); }
  finally {
    loading.value = false;
    nextTick(() => addDefaultZone());
  }
}

// Grand summary: aggregate all saved zones
const fmt = (v:number) => v.toLocaleString('id-ID',{maximumFractionDigits:1});
const grandSummary = computed(() => {
  let vol_beton=0, besi_kg=0, galian=0, luas_atap=0, luas_dinding=0, luas_lantai=0;
  for (const z of zones.value.foundation||[]) {
    const p=z.params; if(!p.qty) continue;
    const v=p.L*p.W*p.H*p.qty*1.05; vol_beton+=v; besi_kg+=v*95;
    galian+=(p.L+0.6)*(p.W+0.6)*(p.depth||1.5)*p.qty;
  }
  for (const z of zones.value.column||[]) {
    const p=z.params; if(!p.qty_per_floor) continue;
    const v=p.B*p.H*(p.height_per_floor||4)*(p.qty_per_floor||1)*(p.floors||1)*1.05;
    vol_beton+=v; besi_kg+=v*160;
  }
  for (const z of zones.value.beam||[]) {
    const p=z.params; if(!p.total_length) continue;
    const v=p.B*p.H*p.total_length*1.05; vol_beton+=v; besi_kg+=v*117;
  }
  for (const z of zones.value.slab||[]) {
    const p=z.params; if(!p.area) continue;
    luas_lantai+=p.area;
    if(p.slab_type==='concrete'||!p.slab_type){ const v=p.area*p.thickness*1.05; vol_beton+=v; besi_kg+=v*85; }
  }
  for (const z of zones.value.wall||[]) {
    const p=z.params; if(!p.area) continue;
    luas_dinding+=+(p.area*(1-(p.opening_pct||20)/100)).toFixed(0);
  }
  for (const z of zones.value.roof||[]) {
    const p=z.params; if(!p.floor_area) continue;
    const sl=(p.slope_deg||10)*Math.PI/180;
    luas_atap+=+((p.floor_area+(p.perimeter||160)*(p.overhang||0.8))/Math.cos(sl)).toFixed(0);
  }
  return [
    {icon:'🏗',l:'Total Beton',v:fmt(vol_beton),u:'m³'},
    {icon:'🔩',l:'Total Besi',v:fmt(besi_kg),u:'kg'},
    {icon:'⛏',l:'Total Galian',v:fmt(galian),u:'m³'},
    {icon:'🧱',l:'Luas Lantai',v:fmt(luas_lantai),u:'m²'},
    {icon:'🏠',l:'Luas Atap',v:fmt(luas_atap),u:'m²'},
    {icon:'🪟',l:'Luas Dinding',v:fmt(luas_dinding),u:'m²'},
  ];
});

onMounted(fetchAll);

// ── Detailed MTO computed for Rekap tab ──────────────────────────────────────
const f2 = (v:number) => v.toLocaleString('id-ID',{maximumFractionDigits:2});
const f0 = (v:number) => v.toLocaleString('id-ID',{maximumFractionDigits:0});

function calcFoundation(p:any) {
  const n=p.qty||1, L=p.L||2, W=p.W||2, H=p.H||0.45, d=p.depth||1.5, ws=(p.working_space||0.3)*2;
  const tbL=p.tb_length||0, tbW=p.tb_w||0.3, tbH=p.tb_h||0.5;
  return [
    {label:'Galian Tanah',         qty:f2((L+ws)*(W+ws)*d*n),       unit:'m³'},
    {label:'Lantai Kerja',         qty:f2(L*W*0.05*n),               unit:'m³'},
    {label:'Beton Footplat (1.05)',qty:f2(L*W*H*n*1.05),             unit:'m³'},
    {label:'Bekisting Footplat',   qty:f2(2*(L+W)*H*n),              unit:'m²'},
    {label:'Besi Footplat',        qty:f0(L*W*H*n*1.05*95),          unit:'kg'},
    {label:'Beton Tie Beam',       qty:f2(tbL*tbW*tbH*1.05),         unit:'m³'},
    {label:'Bekisting Tie Beam',   qty:f2(2*(tbW+tbH)*tbL),          unit:'m²'},
    {label:'Besi Tie Beam',        qty:f0(tbL*tbW*tbH*1.05*122),     unit:'kg'},
  ];
}
function calcColumn(p:any) {
  const qty=p.qty_per_floor||1, fl=p.floors||1, h=p.height_per_floor||4, B=p.B||0.3, H=p.H||0.3;
  const vol=B*H*h*qty*fl*1.05;
  const sloofVol=(p.sloof_length||0)*(p.sloof_w||0.3)*(p.sloof_h||0.5)*1.05;
  return [
    {label:'Beton Kolom (1.05)',   qty:f2(vol),                unit:'m³'},
    {label:'Bekisting Kolom',      qty:f2(2*(B+H)*h*qty*fl),   unit:'m²'},
    {label:'Besi Utama Kolom',     qty:f0(vol*160),             unit:'kg'},
    {label:'Beton Sloof',          qty:f2(sloofVol),            unit:'m³'},
    {label:'Besi Sloof',           qty:f0(sloofVol*122),        unit:'kg'},
  ];
}
function calcBeam(p:any) {
  const L=p.total_length||0, B=p.B||0.25, H=p.H||0.5;
  const vol=B*H*L*1.05;
  const rbVol=(p.rb_length||0)*(p.rb_B||0.15)*(p.rb_H||0.25)*1.05;
  return [
    {label:'Beton Balok Induk',    qty:f2(vol),                 unit:'m³'},
    {label:'Bekisting Balok',      qty:f2((B+2*H)*L),           unit:'m²'},
    {label:'Besi Balok Induk',     qty:f0(vol*117),             unit:'kg'},
    {label:'Beton Balok Anak',     qty:f2(rbVol),               unit:'m³'},
    {label:'Besi Balok Anak',      qty:f0(rbVol*100),           unit:'kg'},
  ];
}
function calcSlab(p:any) {
  const area=p.area||0, t=p.thickness||0.15;
  const volBeton=area*t*1.05;
  const rows:any[] = [
    {label:'Luas Plat Lantai',     qty:f0(area),                unit:'m²'},
  ];
  if(p.slab_type==='concrete'||!p.slab_type) {
    rows.push({label:'Beton Plat',     qty:f2(volBeton),    unit:'m³'});
    rows.push({label:'Besi/Wiremesh',  qty:f0(area*5.6),    unit:'kg'});
    if(p.subbase_t) rows.push({label:'Subbase',         qty:f2(area*p.subbase_t), unit:'m³'});
  } else {
    rows.push({label:'Bondek/Decking', qty:f0(area*1.05),  unit:'m²'});
  }
  return rows;
}
function calcWall(p:any) {
  const net=+(p.area*(1-(p.opening_pct||20)/100)).toFixed(1);
  return [
    {label:'Luas Dinding Bruto',   qty:f0(p.area||0),           unit:'m²'},
    {label:'Luas Dinding Netto',   qty:f0(net),                 unit:'m²'},
    {label:'Plesteran',            qty:f0(net*2),               unit:'m²'},
    {label:'Acian',                qty:f0(net*2),               unit:'m²'},
    {label:'Cat Dinding',          qty:f0(net*2),               unit:'m²'},
    {label:'Kusen Pintu',          qty:String(p.door_qty||0),   unit:'bh'},
    {label:'Kusen Jendela',        qty:String(p.window_qty||0), unit:'bh'},
  ];
}
function calcRoof(p:any) {
  const sl=(p.slope_deg||10)*Math.PI/180;
  const luas=+((p.floor_area||0+(p.perimeter||0)*(p.overhang||0.8))/Math.cos(sl)).toFixed(1);
  return [
    {label:'Luas Atap (kemiringan)',qty:f0(luas),                unit:'m²'},
    {label:'Penutup Atap (1.1)',    qty:f0(luas*1.1),            unit:'m²'},
    {label:'Panjang Gording',       qty:f0((p.floor_area||0)/( p.purlin_spacing||1.5)), unit:'m'},
    {label:'Nok / Ridge',          qty:f0(p.ridge_length||0),   unit:'m'},
    {label:'Talang Horizontal',    qty:f0(p.gutter_length||0),  unit:'m'},
    {label:'Downspout',            qty:String(p.downspout_qty||0), unit:'bh'},
    {label:'Cladding Dinding',     qty:f0((p.cladding_h||0)*(p.perimeter||0)*1.05), unit:'m²'},
  ];
}

const CALC_MAP: Record<string,(p:any)=>any[]> = {
  foundation: calcFoundation, column: calcColumn, beam: calcBeam,
  slab: calcSlab, wall: calcWall, roof: calcRoof,
};

const detailedMTO = computed(() =>
  MODULES.map(mod => {
    const zoneList = zones.value[mod.id] || [];
    const zonesData = zoneList.map(z => ({
      name: z.name || mod.label,
      rows: CALC_MAP[mod.id]?.(z.params) || [],
    }));
    // Subtotal: sum numeric rows across zones per label
    const subMap = new Map<string, {qty:number; unit:string}>();
    for (const z of zonesData) {
      for (const r of z.rows) {
        const n = parseFloat((r.qty as string).replace(/\./g,'').replace(',','.')) || 0;
        const ex = subMap.get(r.label);
        if (ex) ex.qty += n; else subMap.set(r.label, {qty:n, unit:r.unit});
      }
    }
    const subtotal = Array.from(subMap.entries()).map(([label, v]) => ({
      label, qty: f2(v.qty), unit: v.unit,
    }));
    return { id: mod.id, icon: mod.icon, label: mod.label, zones: zonesData, subtotal, open: true };
  }).filter(s => s.zones.length > 0)
);

const mtoGrandTotal = computed(() => {
  let vol_beton=0, besi_kg=0, galian=0, bekisting=0, luas_atap=0, luas_dinding=0, luas_lantai=0;
  for (const z of zones.value.foundation||[]) {
    const p=z.params; const n=p.qty||1, L=p.L||2, W=p.W||2, H=p.H||0.45, d=p.depth||1.5, ws=(p.working_space||0.3)*2;
    galian+=(L+ws)*(W+ws)*d*n;
    vol_beton+=L*W*H*n*1.05+(p.tb_length||0)*(p.tb_w||0.3)*(p.tb_h||0.5)*1.05;
    besi_kg+=L*W*H*n*1.05*95+(p.tb_length||0)*(p.tb_w||0.3)*(p.tb_h||0.5)*1.05*122;
    bekisting+=2*(L+W)*H*n+2*((p.tb_w||0.3)+(p.tb_h||0.5))*(p.tb_length||0);
  }
  for (const z of zones.value.column||[]) {
    const p=z.params; const vol=p.B*p.H*(p.height_per_floor||4)*(p.qty_per_floor||1)*(p.floors||1)*1.05;
    const sloofVol=(p.sloof_length||0)*(p.sloof_w||0.3)*(p.sloof_h||0.5)*1.05;
    vol_beton+=vol+sloofVol; besi_kg+=vol*160+sloofVol*122;
    bekisting+=2*(p.B+p.H)*(p.height_per_floor||4)*(p.qty_per_floor||1)*(p.floors||1);
  }
  for (const z of zones.value.beam||[]) {
    const p=z.params; const vol=p.B*p.H*(p.total_length||0)*1.05;
    const rbVol=(p.rb_length||0)*(p.rb_B||0.15)*(p.rb_H||0.25)*1.05;
    vol_beton+=vol+rbVol; besi_kg+=vol*117+rbVol*100;
    bekisting+=(p.B+2*p.H)*(p.total_length||0);
  }
  for (const z of zones.value.slab||[]) {
    const p=z.params; luas_lantai+=p.area||0;
    if(p.slab_type==='concrete'||!p.slab_type) { const v=(p.area||0)*p.thickness*1.05; vol_beton+=v; besi_kg+=v*85; }
  }
  for (const z of zones.value.wall||[]) {
    const p=z.params; luas_dinding+=+(p.area*(1-(p.opening_pct||20)/100)).toFixed(1);
  }
  for (const z of zones.value.roof||[]) {
    const p=z.params; const sl=(p.slope_deg||10)*Math.PI/180;
    luas_atap+=+((p.floor_area||0+(p.perimeter||0)*(p.overhang||0.8))/Math.cos(sl)).toFixed(1);
  }
  return [
    {icon:'🏗',label:'Total Beton K-250',    qty:f2(vol_beton),    unit:'m³', note:'Pondasi + Kolom + Balok + Plat'},
    {icon:'🔩',label:'Total Besi Tulangan',  qty:f0(besi_kg),      unit:'kg', note:'Estimasi berdasarkan rasio besi per m³'},
    {icon:'🪵',label:'Total Bekisting',      qty:f2(bekisting),    unit:'m²', note:'Pondasi + Kolom + Balok'},
    {icon:'⛏',label:'Galian Tanah',          qty:f2(galian),       unit:'m³', note:'Termasuk ruang kerja'},
    {icon:'🧱',label:'Luas Lantai',           qty:f0(luas_lantai),  unit:'m²', note:'Total area plat lantai'},
    {icon:'🏠',label:'Luas Atap',            qty:f0(luas_atap),    unit:'m²', note:'Sudah termasuk kemiringan'},
    {icon:'🪟',label:'Luas Dinding Netto',   qty:f0(luas_dinding), unit:'m²', note:'Setelah dikurangi bukaan'},
  ];
});

</script>

<style scoped>
.mto-wrap{display:flex;flex-direction:column;gap:14px;}

/* Module tabs */
.mto-tabs{display:flex;flex-wrap:wrap;gap:4px;background:#f1f5f9;padding:8px;border-radius:14px;}
.mto-tab{display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:10px;border:none;background:transparent;cursor:pointer;font-size:.82rem;font-weight:600;color:#64748b;transition:all .2s;position:relative;}
.mto-tab:hover{background:white;color:#0f172a;}
.mto-tab.active{background:white;color:var(--clr);box-shadow:0 2px 8px rgba(0,0,0,.08);}
.tab-label{margin-left:2px;}
.tab-badge{position:absolute;top:-4px;right:-4px;background:#1d4ed8;color:white;font-size:.55rem;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;}

/* Content */
.mto-content{background:white;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;}
.mto-loading{padding:60px;text-align:center;color:#94a3b8;}

/* Header */
.mod-header{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;}
.mod-title{display:flex;align-items:center;gap:10px;}
.mod-name{font-size:.92rem;font-weight:800;color:#0f172a;}
.mod-sub{font-size:.68rem;color:#64748b;margin-top:1px;}
.add-zone-btn{padding:7px 16px;background:#1d4ed8;color:white;border:none;border-radius:8px;font-size:.8rem;font-weight:700;cursor:pointer;transition:background .2s;}
.add-zone-btn:hover{background:#1e40af;}

/* Zone pills */
.zone-bar{display:flex;gap:6px;flex-wrap:wrap;padding:10px 18px;border-bottom:1px solid #e2e8f0;background:#fafafa;}
.zone-pill{display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;border:2px solid #e2e8f0;background:white;cursor:pointer;font-size:.78rem;font-weight:600;color:#475569;transition:all .2s;}
.zone-pill:hover{border-color:#3b82f6;}
.zone-pill.active{border-color:#1d4ed8;background:#eff6ff;color:#1d4ed8;}
.zone-del{font-size:.9rem;color:#94a3b8;line-height:1;cursor:pointer;margin-left:2px;}
.zone-del:hover{color:#ef4444;}
.zone-empty{padding:32px;text-align:center;color:#94a3b8;font-size:.84rem;border-bottom:1px solid #e2e8f0;}

/* Zone name row */
.zone-name-row{display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid #f1f5f9;}
.zone-name-input{flex:0 0 220px;border:1px solid #d1d5db;border-radius:8px;padding:5px 10px;font-size:.82rem;font-weight:600;color:#0f172a;}
.zone-hint{font-size:.7rem;color:#94a3b8;}

/* Body */
.mod-body{padding:18px;}

/* Dirty / saved bar */
.dirty-bar{display:flex;justify-content:space-between;align-items:center;padding:10px 18px;background:#fef3c7;border-top:1px solid #fcd34d;font-size:.78rem;color:#92400e;font-weight:500;}
.save-btn-sm{padding:5px 14px;background:#d97706;color:white;border:none;border-radius:6px;font-size:.75rem;font-weight:700;cursor:pointer;}
.saved-bar{padding:8px 18px;background:#f0fdf4;border-top:1px solid #d1fae5;font-size:.74rem;color:#065f46;font-weight:600;}

/* Grand Summary */
.grand-summary{background:#0f172a;border-radius:16px;padding:18px;}
.gs-title{font-size:.8rem;font-weight:700;color:#38bdf8;margin-bottom:12px;}
.gs-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;}
@media(max-width:900px){.gs-grid{grid-template-columns:repeat(3,1fr);}}
.gs-card{background:rgba(255,255,255,.06);border-radius:10px;padding:12px;text-align:center;}
.gs-icon{font-size:1.2rem;}.gs-val{font-size:1.1rem;font-weight:800;color:#38bdf8;margin:4px 0;}.gs-u{font-size:.6rem;color:#64748b;}.gs-l{font-size:.64rem;color:#94a3b8;margin-top:2px;}

/* ── Rekap MTO ── */
.rekap-wrap{display:flex;flex-direction:column;gap:0;}
.rekap-kpi{display:grid;grid-template-columns:repeat(7,1fr);gap:10px;padding:14px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;}
@media(max-width:900px){.rekap-kpi{grid-template-columns:repeat(3,1fr);}}
.rk-card{background:white;border:1px solid #e2e8f0;border-radius:10px;padding:10px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.05);}
.rk-icon{font-size:1.2rem;}.rk-val{font-size:1rem;font-weight:800;color:#1d4ed8;margin:3px 0;}.rk-u{font-size:.58rem;color:#64748b;}.rk-l{font-size:.62rem;color:#94a3b8;margin-top:2px;}
.rekap-empty{padding:40px;text-align:center;color:#94a3b8;font-size:.84rem;}
.rekap-section{border-bottom:1px solid #f1f5f9;}
.rs-head{display:flex;align-items:center;gap:10px;padding:12px 18px;cursor:pointer;background:#fafafa;user-select:none;transition:background .15s;}
.rs-head:hover{background:#f1f5f9;}
.rs-badge{background:#e0e7ff;color:#3730a3;border-radius:20px;padding:2px 8px;font-size:.65rem;font-weight:700;}
.rs-toggle{color:#94a3b8;font-size:.8rem;margin-left:4px;}
.rs-zone{padding:12px 18px;border-top:1px solid #f8fafc;}
.rs-zone-name{font-size:.75rem;font-weight:700;color:#475569;margin-bottom:6px;}
.rs-tbl{width:100%;border-collapse:collapse;font-size:.78rem;}
.rs-tbl th{background:#f1f5f9;padding:6px 10px;text-align:left;font-size:.68rem;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;}
.rs-tbl td{padding:5px 10px;border-bottom:1px solid #f8fafc;color:#374151;}
.rs-odd td{background:#f8fafc;}
.rs-num{font-weight:700;color:#1d4ed8!important;font-family:monospace;}
.rs-unit{color:#94a3b8!important;font-size:.7rem;}
.rs-subtotal{margin:0;background:#eff6ff;}
.rs-subtotal th{background:#dbeafe;color:#1e40af;}
.rekap-total{padding:16px 18px;background:#0f172a;}
.rt-title{font-size:.8rem;font-weight:700;color:#38bdf8;margin-bottom:10px;}
.rekap-total .rs-tbl th{background:#1e293b;color:#94a3b8;border-bottom:1px solid #334155;}
.rekap-total .rs-tbl td{border-bottom:1px solid #1e293b;color:#e2e8f0;}
.rekap-total .rs-odd td{background:#1e293b;}
.tc{text-align:center;}
.small{font-size:.72rem;}
</style>
