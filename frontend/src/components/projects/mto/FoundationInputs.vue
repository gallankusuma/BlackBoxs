<template>
  <div class="fi-wrap">
    <FoundationPicker v-model="p.foundation_type" @update:modelValue="emit('change')" />
    <div class="fi-grid">
      <div class="fi-section">
        <div class="fi-sec-title">A · Data Umum Pondasi</div>
        <div class="fi-fields">
          <label>Jumlah Titik (bh)</label>
          <input type="number" v-model.number="p.qty" @change="emit('change')" min="1" step="1">
          <label>Panjang Footplat (m)</label>
          <input type="number" v-model.number="p.L" @change="emit('change')" min="0.1" step="0.05">
          <label>Lebar Footplat (m)</label>
          <input type="number" v-model.number="p.W" @change="emit('change')" min="0.1" step="0.05">
          <label>Tebal Footplat (m)</label>
          <input type="number" v-model.number="p.H" @change="emit('change')" min="0.1" step="0.05">
          <label>Kedalaman Galian (m)</label>
          <input type="number" v-model.number="p.depth" @change="emit('change')" min="0.5" step="0.1">
          <label>Ruang Kerja (m)</label>
          <input type="number" v-model.number="p.working_space" @change="emit('change')" min="0" step="0.05">
        </div>
      </div>
      <div class="fi-section">
        <div class="fi-sec-title">B · Tie Beam</div>
        <div class="fi-fields">
          <label>Total Panjang TB (m)</label>
          <input type="number" v-model.number="p.tb_length" @change="emit('change')" min="0" step="1">
          <label>Lebar TB (m)</label>
          <input type="number" v-model.number="p.tb_w" @change="emit('change')" min="0.1" step="0.05">
          <label>Tinggi TB (m)</label>
          <input type="number" v-model.number="p.tb_h" @change="emit('change')" min="0.1" step="0.05">
        </div>
        <div class="fi-sec-title" style="margin-top:12px">C · Pembesian</div>
        <div class="fi-fields">
          <label>Dia. Besi Footplat (mm)</label>
          <input type="number" v-model.number="p.rebar_main" @change="emit('change')" min="10" step="2">
          <label>Dia. Besi TB Utama (mm)</label>
          <input type="number" v-model.number="p.tb_rebar_main" @change="emit('change')" min="10" step="2">
          <label>Dia. Sengkang TB (mm)</label>
          <input type="number" v-model.number="p.tb_stirrup" @change="emit('change')" min="6" step="2">
          <label>Jarak Sengkang (m)</label>
          <input type="number" v-model.number="p.stirrup_spacing" @change="emit('change')" min="0.05" step="0.025">
        </div>
      </div>
    </div>

    <!-- Output E -->
    <div class="fi-output">
      <div class="fi-out-title">E · Output MTO Otomatis</div>
      <div class="fi-out-grid">
        <div class="fi-out-item" v-for="r in results" :key="r.l">
          <div class="fi-out-icon">{{ r.icon }}</div>
          <div class="fi-out-val">{{ r.v }}</div>
          <div class="fi-out-u">{{ r.u }}</div>
          <div class="fi-out-l">{{ r.l }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useMtoPreview, toDisplay } from '@/composables/useMtoPreview';
import FoundationPicker from './FoundationPicker.vue';

const props = defineProps<{ modelValue: Record<string,any> }>();
const emit  = defineEmits<{ (e:'change'):void }>();
const p     = props.modelValue;

// Ensure defaults — typical warehouse single-storey
if(!p.foundation_type) p.foundation_type='footplate';
if(!p.qty)            p.qty=12;
if(!p.L)              p.L=1.0;   // footplate 1m
if(!p.W)              p.W=1.0;   // footplate 1m
if(!p.H)              p.H=0.35;  // tebal 35cm
if(!p.depth)          p.depth=1.2;          // galian 1.2m
if(!p.working_space)  p.working_space=0.3;
if(!p.tb_length)      p.tb_length=200;      // 200m total tie beam
if(!p.tb_w)           p.tb_w=0.20;          // lebar TB 20cm
if(!p.tb_h)           p.tb_h=0.40;          // tinggi TB 40cm
if(!p.rebar_main)     p.rebar_main=13;
if(!p.tb_rebar_main)  p.tb_rebar_main=16;
if(!p.tb_stirrup)     p.tb_stirrup=10;
if(!p.stirrup_spacing) p.stirrup_spacing=0.15;


// EST-MTO-001: kuantitas tidak lagi dihitung di sini. Komponen ini hanya
// mengirim parameter; angkanya datang dari kalkulator backend yang sama
// dengan yang dipakai RAB dan penawaran.
const { lines, notes, loading } = useMtoPreview('foundation', () => p);
const results = computed(() => toDisplay(lines.value));
</script>

<style scoped>
.fi-wrap{display:flex;flex-direction:column;gap:14px;}
.fi-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
@media(max-width:640px){.fi-grid{grid-template-columns:1fr;}}
.fi-section{background:#f8fafc;border-radius:10px;padding:12px;border:1px solid #e2e8f0;}
.fi-sec-title{font-size:.7rem;font-weight:700;text-transform:uppercase;color:#3b82f6;letter-spacing:.06em;margin-bottom:8px;}
.fi-fields{display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;align-items:center;}
.fi-fields label{font-size:.7rem;color:#475569;font-weight:500;}
.fi-fields input{border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;font-size:.8rem;width:100%;background:white;}
.fi-fields input:focus{outline:none;border-color:#3b82f6;ring:2px solid #bfdbfe;}
.fi-output{background:#0f172a;border-radius:12px;padding:14px;}
.fi-out-title{font-size:.7rem;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;}
.fi-out-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
@media(max-width:640px){.fi-out-grid{grid-template-columns:repeat(2,1fr);}}
.fi-out-item{background:rgba(255,255,255,.06);border-radius:8px;padding:8px;text-align:center;}
.fi-out-icon{font-size:1.1rem;}
.fi-out-val{font-size:.9rem;font-weight:800;color:#38bdf8;margin:2px 0;}
.fi-out-u{font-size:.6rem;color:#64748b;}
.fi-out-l{font-size:.62rem;color:#94a3b8;margin-top:2px;}
</style>
