<template>
  <div class="inp-wrap">
    <SlabTypePicker :modelValue="slabType" @update:modelValue="v => { p.slab_type = v; emit('change') }" />
    <div class="inp-grid">
      <!-- CONCRETE -->
      <template v-if="slabType==='concrete'">
        <div class="inp-section">
          <div class="sub-title">A · Dimensi Lantai Beton</div>
          <div class="fields">
            <label>Luas Area (m²)</label><input type="number" v-model.number="p.area" @change="emit('change')" step="10">
            <label>Tebal Plat (m)</label><input type="number" v-model.number="p.thickness" @change="emit('change')" step="0.01">
            <label>Tebal Subbase (m)</label><input type="number" v-model.number="p.subbase_t" @change="emit('change')" step="0.01">
            <label>Tebal Lean Conc. (m)</label><input type="number" v-model.number="p.lean_t" @change="emit('change')" step="0.01">
            <label>Kedalaman Total (m)</label><input type="number" v-model.number="p.cut_depth" @change="emit('change')" step="0.05">
          </div>
        </div>
        <div class="inp-section">
          <div class="sub-title">B · Tulangan & Finishing</div>
          <div class="fields">
            <label>Tipe Tulangan</label>
            <select v-model="p.rebar_type" @change="emit('change')">
              <option value="wiremesh">Wiremesh M8</option>
              <option value="wiremesh_m6">Wiremesh M6</option>
              <option value="rebar">Besi Polos/Ulir</option>
            </select>
            <label>Dia. Tul. (mm)</label><input type="number" v-model.number="p.rebar_dia_x" @change="emit('change')" step="2">
            <label>Jarak (m)</label><input type="number" v-model.number="p.spacing_x" @change="emit('change')" step="0.025">
            <label>Finishing</label>
            <select v-model="p.finishing" @change="emit('change')">
              <option value="floor_hardener">Floor Hardener</option>
              <option value="epoxy">Epoxy Coating</option>
              <option value="polished">Polished Concrete</option>
              <option value="screed">Screed Halus</option>
            </select>
          </div>
        </div>
      </template>
      <!-- KERAMIK / GRANIT -->
      <template v-else-if="slabType==='keramik'">
        <div class="inp-section">
          <div class="sub-title">A · Screed & Keramik</div>
          <div class="fields">
            <label>Luas Area (m²)</label><input type="number" v-model.number="p.area" @change="emit('change')" step="5">
            <label>Ukuran Tile (cm)</label>
            <select v-model="p.tile_size" @change="emit('change')">
              <option value="30x30">30×30 cm</option>
              <option value="40x40">40×40 cm</option>
              <option value="60x60">60×60 cm</option>
              <option value="80x80">80×80 cm</option>
              <option value="60x120">60×120 cm</option>
            </select>
            <label>Tebal Screed (cm)</label><input type="number" v-model.number="p.screed_t" @change="emit('change')" step="0.5">
            <label>Tebal Subbase (m)</label><input type="number" v-model.number="p.subbase_t" @change="emit('change')" step="0.01">
            <label>Nat (mm)</label><input type="number" v-model.number="p.grout_mm" @change="emit('change')" step="0.5">
          </div>
        </div>
        <div class="inp-section">
          <div class="sub-title">B · Material Keramik</div>
          <div class="fields">
            <label>Tipe Material</label>
            <select v-model="p.tile_type" @change="emit('change')">
              <option value="keramik_biasa">Keramik Biasa</option>
              <option value="granit_polished">Granit Polished</option>
              <option value="homogeneous">Homogeneous Tile</option>
              <option value="marmer">Marmer</option>
            </select>
            <label>Waste Factor (%)</label><input type="number" v-model.number="p.waste_pct" @change="emit('change')" min="5" max="20">
          </div>
        </div>
      </template>
      <!-- PLATE BORDES -->
      <template v-else-if="slabType==='plate_bordes'">
        <div class="inp-section">
          <div class="sub-title">A · Plate Bordes Baja</div>
          <div class="fields">
            <label>Luas Area (m²)</label><input type="number" v-model.number="p.area" @change="emit('change')" step="5">
            <label>Tebal Plate (mm)</label>
            <select v-model="p.plate_thick" @change="emit('change')">
              <option value="4">4 mm (31.4 kg/m²)</option>
              <option value="5">5 mm (39.3 kg/m²)</option>
              <option value="6">6 mm (47.1 kg/m²)</option>
              <option value="8">8 mm (62.8 kg/m²)</option>
            </select>
            <label>Tipe Bordes</label>
            <select v-model="p.bordes_type" @change="emit('change')">
              <option value="diamond">Diamond Pattern</option>
              <option value="bar_grating">Bar Grating</option>
              <option value="perforated">Perforated Plate</option>
            </select>
            <label>Las Fillet (m')</label><input type="number" v-model.number="p.weld_length" @change="emit('change')" step="1">
          </div>
        </div>
        <div class="inp-section">
          <div class="sub-title">B · Struktur Pendukung</div>
          <div class="fields">
            <label>Profil Rangka</label>
            <select v-model="p.frame_profile" @change="emit('change')">
              <option value="siku50">Siku 50×50×5</option>
              <option value="siku65">Siku 65×65×6</option>
              <option value="kanal100">Kanal C 100</option>
            </select>
            <label>Total Panjang Rangka (m)</label><input type="number" v-model.number="p.frame_length" @change="emit('change')" step="1">
          </div>
        </div>
      </template>
      <!-- PARQUET / VINYL -->
      <template v-else>
        <div class="inp-section">
          <div class="sub-title">A · Parquet / Vinyl</div>
          <div class="fields">
            <label>Luas Area (m²)</label><input type="number" v-model.number="p.area" @change="emit('change')" step="5">
            <label>Tipe Material</label>
            <select v-model="p.parquet_type" @change="emit('change')">
              <option value="solid_wood">Parquet Kayu Solid</option>
              <option value="engineered">Engineered Wood</option>
              <option value="vinyl_click">Vinyl Click LVT</option>
              <option value="vinyl_glue">Vinyl Glue-down</option>
              <option value="carpet">Karpet Tile</option>
            </select>
            <label>Tebal Screed Leveling (cm)</label><input type="number" v-model.number="p.screed_t" @change="emit('change')" step="0.5">
            <label>Waste Factor (%)</label><input type="number" v-model.number="p.waste_pct" @change="emit('change')" min="5" max="20">
          </div>
        </div>
      </template>
    </div>
    <div class="output-bar">
      <div class="out-title">E · Output MTO</div>
      <div class="out-grid">
        <div class="out-item" v-for="r in results" :key="r.l">
          <div class="out-icon">{{ r.icon }}</div><div class="out-val">{{ r.v }}</div>
          <div class="out-u">{{ r.u }}</div><div class="out-l">{{ r.l }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import SlabTypePicker from './SlabTypePicker.vue';
const props = defineProps<{ modelValue: Record<string,any> }>();
const emit = defineEmits<{ (e:'change'):void }>();
const p = props.modelValue;
if(!p.slab_type) p.slab_type='concrete';
// Reactive computed for type switching
const slabType = ref<string>(p.slab_type || 'concrete');
watch(() => p.slab_type, v => { if(v) slabType.value = v; }, { immediate: true });
if(!p.area) p.area=1000; if(!p.thickness) p.thickness=0.15; if(!p.subbase_t) p.subbase_t=0.15;
if(!p.lean_t) p.lean_t=0.05; if(!p.cut_depth) p.cut_depth=0.35; if(!p.rebar_type) p.rebar_type='wiremesh';
if(!p.rebar_dia_x) p.rebar_dia_x=8; if(!p.spacing_x) p.spacing_x=0.15; if(!p.finishing) p.finishing='floor_hardener';
if(!p.tile_size) p.tile_size='60x60'; if(!p.screed_t) p.screed_t=3; if(!p.grout_mm) p.grout_mm=2;
if(!p.tile_type) p.tile_type='keramik_biasa'; if(!p.waste_pct) p.waste_pct=10;
if(!p.plate_thick) p.plate_thick='5'; if(!p.bordes_type) p.bordes_type='diamond'; if(!p.weld_length) p.weld_length=50;
if(!p.frame_profile) p.frame_profile='siku50'; if(!p.frame_length) p.frame_length=100;
if(!p.parquet_type) p.parquet_type='vinyl_click';
const PLATE_WEIGHT: Record<string,number> = {'4':31.4,'5':39.3,'6':47.1,'8':62.8};
const fmt = (v:number) => v.toLocaleString('id-ID',{maximumFractionDigits:2});
const results = computed(()=>{
  const A=p.area||1000, type=slabType.value||'concrete';
  if(type==='keramik'){
    const tiles_m2=+(A*(1+(p.waste_pct||10)/100)).toFixed(1);
    const screed=+(A*(p.screed_t||3)/100).toFixed(2);
    return [{icon:'🏗',l:'Keramik',v:fmt(tiles_m2),u:'m²'},{icon:'🪨',l:'Screed Beton',v:fmt(screed),u:'m³'},{icon:'🪨',l:'Subbase',v:fmt(+(A*p.subbase_t).toFixed(2)),u:'m³'}];
  }
  if(type==='plate_bordes'){
    const w=+(PLATE_WEIGHT[p.plate_thick]||39.3*A*1.05).toFixed(0);
    return [{icon:'⚙',l:'Plate Bordes',v:fmt(w),u:'kg'},{icon:'🔩',l:'Las',v:fmt(p.weld_length),u:"m'"},{icon:'⚙',l:'Rangka',v:fmt(p.frame_length),u:'m'}];
  }
  if(type==='parquet'){
    const mat=+(A*(1+(p.waste_pct||10)/100)).toFixed(1);
    return [{icon:'🪵',l:'Material',v:fmt(mat),u:'m²'}];
  }
  // concrete default
  const vol_sub=+(A*p.subbase_t).toFixed(2), vol_lk=+(A*p.lean_t).toFixed(2);
  const vol_beton=+(A*p.thickness*1.05).toFixed(2);
  return [{icon:'⛏',l:'Vol. Galian',v:fmt(+(A*p.cut_depth*1.2).toFixed(1)),u:'m³'},{icon:'🪨',l:'Subbase',v:fmt(vol_sub),u:'m³'},{icon:'🪨',l:'Lean Conc.',v:fmt(vol_lk),u:'m³'},{icon:'🏗',l:'Beton Plat',v:fmt(vol_beton),u:'m³'},{icon:'🔩',l:'Wiremesh/Besi',v:fmt(+(vol_beton*85).toFixed(0)),u:'kg'},{icon:'🎨',l:'Finishing',v:fmt(A),u:'m²'}];
});
</script>
<style scoped>
.inp-wrap{display:flex;flex-direction:column;gap:12px;}
.inp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
@media(max-width:640px){.inp-grid{grid-template-columns:1fr;}}
.inp-section{background:#f8fafc;border-radius:10px;padding:12px;border:1px solid #e2e8f0;}
.sub-title{font-size:.68rem;font-weight:700;color:#10b981;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em;}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;align-items:center;}
.fields label{font-size:.68rem;color:#475569;font-weight:500;}
.fields input,.fields select{border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;font-size:.78rem;width:100%;background:white;}
.output-bar{background:#0f172a;border-radius:12px;padding:12px;}
.out-title{font-size:.68rem;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;}
.out-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;}
@media(max-width:640px){.out-grid{grid-template-columns:repeat(3,1fr);}}
.out-item{background:rgba(255,255,255,.06);border-radius:8px;padding:8px;text-align:center;}
.out-icon{font-size:1rem;}.out-val{font-size:.85rem;font-weight:800;color:#38bdf8;margin:2px 0;}.out-u{font-size:.58rem;color:#64748b;}.out-l{font-size:.6rem;color:#94a3b8;margin-top:1px;}
</style>
