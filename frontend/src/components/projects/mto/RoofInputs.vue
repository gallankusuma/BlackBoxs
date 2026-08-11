<template>
  <div class="inp-wrap">
    <RoofTypePicker :modelValue="roofType" @update:modelValue="v => { p.roof_type = v; emit('change') }" />
    <div class="inp-grid">
      <div class="inp-section">
        <div class="sub-title">A · Dimensi Atap</div>
        <div class="fields">
          <label>Luas Bangunan (m²)</label><input type="number" v-model.number="p.floor_area" @change="emit('change')" step="10">
          <label>Keliling Bangunan (m)</label><input type="number" v-model.number="p.perimeter" @change="emit('change')" step="1">
          <label>Kemiringan (°)</label><input type="number" v-model.number="p.slope_deg" @change="emit('change')" min="5" max="45" step="5">
          <label>Overstek/Overhang (m)</label><input type="number" v-model.number="p.overhang" @change="emit('change')" step="0.1">
          <template v-if="roofType==='zincalume'||roofType==='pvc_double'||roofType==='sandwich'">
            <label>Lebar Efektif Sheet (m)</label><input type="number" v-model.number="p.sheet_eff_w" @change="emit('change')" step="0.01">
          </template>
          <template v-if="roofType==='genteng_keramik'">
            <label>Jenis Genteng</label>
            <select v-model="p.genteng_type" @change="emit('change')">
              <option value="morando">Morando (14 bh/m²)</option>
              <option value="beton">Genteng Beton (10 bh/m²)</option>
              <option value="flat">Genteng Flat (10 bh/m²)</option>
            </select>
          </template>
          <template v-if="roofType==='beton_dak'">
            <label>Tebal Dak (m)</label><input type="number" v-model.number="p.dak_thick" @change="emit('change')" step="0.01">
          </template>
        </div>
      </div>
      <div class="inp-section">
        <div class="sub-title">B · Cladding & Aksesori</div>
        <div class="fields">
          <label>Tinggi Cladding (m)</label><input type="number" v-model.number="p.cladding_h" @change="emit('change')" step="0.5">
          <label>Tipe Cladding</label>
          <select v-model="p.cladding_type" @change="emit('change')">
            <option value="zincalume">Cladding Zincalume</option>
            <option value="sandwich">Sandwich Panel</option>
            <option value="none">Tanpa Cladding</option>
          </select>
          <label>Panjang Nok (m)</label><input type="number" v-model.number="p.ridge_length" @change="emit('change')" step="1">
          <label>Panjang Talang (m)</label><input type="number" v-model.number="p.gutter_length" @change="emit('change')" step="1">
          <label>Downspout (bh)</label><input type="number" v-model.number="p.downspout_qty" @change="emit('change')" step="1">
          <label>Jarak Purlin (m)</label><input type="number" v-model.number="p.purlin_spacing" @change="emit('change')" step="0.1">
        </div>
      </div>
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
import { useMtoPreview, toDisplay } from '@/composables/useMtoPreview';
import RoofTypePicker from './RoofTypePicker.vue';
const props = defineProps<{ modelValue: Record<string,any> }>();
const emit = defineEmits<{ (e:'change'):void }>();
const p = props.modelValue;
const roofType = ref<string>(p.roof_type || 'zincalume');
watch(() => p.roof_type, v => { if(v) roofType.value = v; }, { immediate: true });
if(!p.roof_type) p.roof_type='zincalume';
if(!p.floor_area) p.floor_area=1000; if(!p.perimeter) p.perimeter=160;
if(!p.slope_deg) p.slope_deg=10; if(!p.overhang) p.overhang=0.8;
if(!p.sheet_eff_w) p.sheet_eff_w=0.85; if(!p.genteng_type) p.genteng_type='morando';
if(!p.dak_thick) p.dak_thick=0.12; if(!p.cladding_h) p.cladding_h=6;
if(!p.cladding_type) p.cladding_type='zincalume'; if(!p.ridge_length) p.ridge_length=50;
if(!p.gutter_length) p.gutter_length=100; if(!p.downspout_qty) p.downspout_qty=4; if(!p.purlin_spacing) p.purlin_spacing=1.5;
const GENTENG_PER_M2: Record<string,number> = {morando:14,beton:10,flat:10};
// EST-MTO-001: kuantitas tidak lagi dihitung di sini. Komponen ini hanya
// mengirim parameter; angkanya datang dari kalkulator backend yang sama
// dengan yang dipakai RAB dan penawaran.
const { lines, notes, loading } = useMtoPreview('roof', () => p);
const results = computed(() => toDisplay(lines.value));
</script>
<style scoped>
.inp-wrap{display:flex;flex-direction:column;gap:12px;}
.inp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
@media(max-width:640px){.inp-grid{grid-template-columns:1fr;}}
.inp-section{background:#f8fafc;border-radius:10px;padding:12px;border:1px solid #e2e8f0;}
.sub-title{font-size:.68rem;font-weight:700;color:#ef4444;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em;}
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
