<template>
  <div class="space-y-3">
    <!-- Global Params Bar -->
    <div class="bg-slate-800 text-white rounded-xl p-4">
      <div class="flex items-center justify-between mb-3">
        <span class="font-bold text-sm">🏗 Data Umum Bangunan</span>
        <div class="text-xs text-slate-300 flex gap-3">
          <span>Luas: <b class="text-white">{{ floorArea }} m²</b></span>
          <span>Keliling: <b class="text-white">{{ perimeter }} m</b></span>
          <span>Total H: <b class="text-white">{{ totalH }} m</b></span>
        </div>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div v-for="f in globalFields" :key="f.key">
          <label class="block text-xs text-slate-400 mb-1">{{ f.label }}</label>
          <input v-if="!f.opts" v-model.number="d[f.key]" type="number" :step="f.step||1" :placeholder="String(f.def)"
            class="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-blue-400">
          <select v-else v-model="d[f.key]" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white">
            <option v-for="o in f.opts" :key="o.v" :value="o.v">{{ o.l }}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Element Accordions -->
    <div v-for="sec in sections" :key="sec.id" class="border border-gray-200 rounded-xl overflow-hidden">
      <button @click="toggle(sec.id)" class="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
        <div class="flex items-center gap-3">
          <span class="text-lg">{{ sec.icon }}</span>
          <span class="font-semibold text-gray-800 text-sm">{{ sec.title }}</span>
          <span class="text-xs text-gray-400">{{ sec.sub }}</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-mono">{{ sec.badge() }}</span>
          <svg class="w-4 h-4 text-gray-400 transition-transform" :class="open.has(sec.id)?'rotate-180':''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </button>

      <div v-show="open.has(sec.id)" class="border-t">
        <div class="grid grid-cols-1 md:grid-cols-2">
          <!-- Diagram -->
          <div class="bg-slate-50 p-4 flex items-center justify-center border-r border-gray-100">
            <component :is="sec.diag" :params="sec.diagParams()" class="w-full max-w-xs"/>
          </div>
          <!-- Inputs + Results -->
          <div class="p-4 space-y-3">
            <div class="grid grid-cols-2 gap-2">
              <div v-for="f in sec.fields" :key="f.key">
                <label class="block text-xs font-medium text-gray-600 mb-1">{{ f.label }}</label>
                <input v-if="!f.opts" v-model.number="d[f.key]" type="number" :step="f.step||0.01" :placeholder="String(f.def||0)"
                  class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300">
                <select v-else v-model="d[f.key]" class="w-full border rounded-lg px-3 py-2 text-sm">
                  <option v-for="o in f.opts" :key="o.v" :value="o.v">{{ o.l }}</option>
                </select>
              </div>
            </div>
            <!-- Results -->
            <div class="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <div class="text-xs font-semibold text-blue-700 mb-2">📊 Hasil Kalkulasi</div>
              <div class="grid grid-cols-2 gap-1.5">
                <div v-for="r in sec.results()" :key="r.l" class="bg-white rounded-lg px-2 py-1.5 border border-blue-100">
                  <div class="text-xs text-gray-400">{{ r.l }}</div>
                  <div class="font-bold text-blue-700 text-sm">{{ r.v }} <span class="font-normal text-gray-400 text-xs">{{ r.u }}</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Generate Bar -->
    <div class="flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl px-5 py-3">
      <div class="text-white">
        <div class="font-bold text-sm">Total Beton: {{ sumBeton }} m³ · Besi: {{ sumBesi }} kg</div>
        <div class="text-xs text-blue-200">~30 line item RAB dengan harga AHSP</div>
      </div>
      <button @click="emit('generate')" class="flex items-center gap-2 bg-white text-blue-700 font-bold px-5 py-2 rounded-lg text-sm hover:bg-blue-50 shadow">
        ⚡ Generate RAB →
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, markRaw } from 'vue';
import FoundationDiagram from './projects/mto/FoundationDiagram.vue';
import ColumnDiagram    from './projects/mto/ColumnDiagram.vue';
import BeamDiagram      from './projects/mto/BeamDiagram.vue';
import SlabDiagram      from './projects/mto/SlabDiagram.vue';
import WallDiagram      from './projects/mto/WallDiagram.vue';
import RoofDiagram      from './projects/mto/RoofDiagram.vue';

const props = defineProps<{ design: Record<string, any> }>();
const emit  = defineEmits<{ (e: 'generate'): void }>();
const d     = props.design;
const open  = ref(new Set(['pondasi']));
const toggle = (k: string) => { const s = new Set(open.value); s.has(k)?s.delete(k):s.add(k); open.value = s; };

// Initialize defaults so inputs show values not placeholders
onMounted(() => {
  const def: Record<string,any> = {
    length:4, width:8, height:4, floors:1, foundation_type:'footplate',
    fnd_L:1.0, fnd_W:1.0, fnd_H:0.4, fnd_rebar:16, fnd_qty:12,
    col_B:0.30, col_H:0.30, col_rebar:16, col_stirrup:10, col_stirrup_spac:0.15,
    sloof_B:0.25, sloof_H:0.35,
    beam_B:0.25, beam_H:0.40, rb_B:0.15, rb_H:0.25,
    slab_t:0.12, slab_rebar:10, slab_spac:0.15,
    wall_type:'bata_ringan', wall_openings:25,
    roof_type:'genteng_metal', roof_slope:30, roof_overhang:0.6,
    door_qty:4, window_qty:8, door_W:0.9, door_H_dim:2.1, window_W:1.2, window_H_dim:1.2,
  };
  for (const [k,v] of Object.entries(def)) { if (d[k] === undefined) d[k] = v; }
});

// Globals
const L  = computed(() => d.length  || 10);
const W  = computed(() => d.width   || 8);
const H  = computed(() => d.height  || 4);
const FL = computed(() => d.floors  || 1);
const floorArea = computed(() => +(L.value * W.value).toFixed(1));
const perimeter  = computed(() => +(2*(L.value+W.value)).toFixed(1));
const totalH     = computed(() => +(H.value * FL.value).toFixed(1));
const gs = 4;
const nColX = computed(() => Math.ceil(L.value/gs)+1);
const nColY = computed(() => Math.ceil(W.value/gs)+1);
const nFnd  = computed(() => nColX.value * nColY.value);

type Field = { key: string; label: string; step?: number; def?: any; opts?: {v:string;l:string}[] };

const globalFields: Field[] = [
  { key:'length', label:'📏 Panjang (m)', step:0.5, def:10 },
  { key:'width',  label:'📐 Lebar (m)',   step:0.5, def:8  },
  { key:'height', label:'🏗 Tinggi/Lantai', step:0.1, def:4 },
  { key:'floors', label:'🏢 Jml Lantai',  step:1,   def:1  },
  { key:'foundation_type', label:'🔩 Pondasi', opts:[
    {v:'footplate',l:'Foot Plate'},{v:'bored_pile',l:'Bored Pile'},{v:'mini_pile',l:'Mini Pile'},{v:'sumuran',l:'Sumuran'}
  ], def:'footplate' },
];

const sections: { id:string; icon:string; title:string; sub:string; diag:any; diagParams:()=>any; fields:Field[]; results:()=>{l:string;v:any;u:string}[]; badge:()=>string }[] = [
  // PONDASI
  {
    id:'pondasi', icon:'🏗', title:'Pondasi', sub:'Tapak · Bored Pile · Sumuran',
    diag: markRaw(FoundationDiagram),
    diagParams: () => ({ L: d.fnd_L||1, W: d.fnd_W||1, H: d.fnd_H||0.4, qty: d.fnd_qty||nFnd.value, type: d.foundation_type||'footplate', working_space:0.3 }),
    fields:[
      { key:'fnd_qty',   label:'Jml Pondasi (titik)', step:1,    def:12  },
      { key:'fnd_L',     label:'Panjang Tapak (m)',   step:0.05, def:1.0 },
      { key:'fnd_W',     label:'Lebar Tapak (m)',     step:0.05, def:1.0 },
      { key:'fnd_H',     label:'Tebal Tapak (m)',     step:0.05, def:0.4 },
      { key:'fnd_rebar', label:'Dia. Besi (mm)',      step:2,    def:16  },
    ],
    results(){ const n=d.fnd_qty||nFnd.value, ftL=d.fnd_L||1, ftW=d.fnd_W||1, ftH=d.fnd_H||0.4, ws=0.3;
      const vol=+(ftL*ftW*ftH*n).toFixed(2), gal=+((ftL+2*ws)*(ftW+2*ws)*ftH*n).toFixed(2);
      return [{l:'Jml Titik',v:n,u:'bh'},{l:'Vol. Beton',v:vol,u:'m³'},{l:'Vol. Galian',v:gal,u:'m³'},{l:'Besi Tul.',v:+(vol*95).toFixed(0),u:'kg'}];
    },
    badge(){ return `${d.fnd_qty||nFnd.value} titik · ${+((d.fnd_L||1)*(d.fnd_W||1)*(d.fnd_H||0.4)*(d.fnd_qty||nFnd.value)).toFixed(1)} m³`; }
  },
  // KOLOM & SLOOF
  {
    id:'kolom', icon:'🏛', title:'Kolom & Sloof', sub:'Dimensi kolom + tie beam',
    diag: markRaw(ColumnDiagram),
    diagParams: () => ({ B: d.col_B||0.3, height_per_floor: d.height||4, floors: d.floors||1, stirrup_spacing: d.col_stirrup_spac||0.15, qty_per_floor: d.fnd_qty||nFnd.value }),
    fields:[
      { key:'col_B',           label:'Kolom B (m)',         step:0.05, def:0.30 },
      { key:'col_H',           label:'Kolom H (m)',         step:0.05, def:0.30 },
      { key:'col_rebar',       label:'Dia. Tul. Pokok (mm)',step:2,    def:16   },
      { key:'col_stirrup',     label:'Dia. Sengkang (mm)',  step:2,    def:10   },
      { key:'col_stirrup_spac',label:'Jarak Sengkang (m)', step:0.025,def:0.15 },
      { key:'sloof_B',         label:'Sloof B (m)',         step:0.05, def:0.25 },
      { key:'sloof_H',         label:'Sloof H (m)',         step:0.05, def:0.35 },
    ],
    results(){
      const n=d.fnd_qty||nFnd.value;
      const vKol=+((d.col_B||0.3)*(d.col_H||0.3)*(d.height||4)*n*(d.floors||1)).toFixed(2);
      const sL=nColX.value*W.value+nColY.value*L.value;
      const vSloof=+((d.sloof_B||0.25)*(d.sloof_H||0.35)*sL).toFixed(2);
      return [{l:'Vol. Kolom',v:vKol,u:'m³'},{l:'Besi Kolom',v:+(vKol*160).toFixed(0),u:'kg'},{l:'Vol. Sloof',v:vSloof,u:'m³'},{l:'Besi Sloof',v:+(vSloof*122).toFixed(0),u:'kg'}];
    },
    badge(){ const n=d.fnd_qty||nFnd.value; return `${((d.col_B||0.3)*1000).toFixed(0)}×${((d.col_H||0.3)*1000).toFixed(0)}mm · ${n} kolom`; }
  },
  // BALOK
  {
    id:'balok', icon:'🔗', title:'Balok & Ring Balok', sub:'Balok induk + keliling',
    diag: markRaw(BeamDiagram),
    diagParams: () => ({ B: d.beam_B||0.25, H: d.beam_H||0.40, total_length: +(nColX.value*W.value+nColY.value*L.value).toFixed(1) }),
    fields:[
      { key:'beam_B', label:'Balok B (m)',      step:0.05, def:0.25 },
      { key:'beam_H', label:'Balok H (m)',      step:0.05, def:0.40 },
      { key:'rb_B',   label:'Ring Balok B (m)', step:0.05, def:0.15 },
      { key:'rb_H',   label:'Ring Balok H (m)', step:0.05, def:0.25 },
    ],
    results(){
      const tL=(nColX.value*W.value+nColY.value*L.value)*Math.max(FL.value-1,1);
      const vBlk=+((d.beam_B||0.25)*(d.beam_H||0.40)*tL).toFixed(2);
      const vRB=+((d.rb_B||0.15)*(d.rb_H||0.25)*perimeter.value*FL.value).toFixed(2);
      return [{l:'Vol. Balok',v:vBlk,u:'m³'},{l:'Besi Balok',v:+(vBlk*117).toFixed(0),u:'kg'},{l:'Vol. Ring Bal.',v:vRB,u:'m³'},{l:'Besi Ring Bal.',v:+(vRB*122).toFixed(0),u:'kg'}];
    },
    badge(){ return `${((d.beam_B||0.25)*1000).toFixed(0)}×${((d.beam_H||0.40)*1000).toFixed(0)}mm`; }
  },
  // PLAT
  {
    id:'plat', icon:'🧱', title:'Plat Lantai', sub:'Pelat beton bertulang',
    diag: markRaw(SlabDiagram),
    diagParams: () => ({ B: d.slab_t||0.12, H: d.slab_t||0.12, span_x: L.value, span_y: W.value }),
    fields:[
      { key:'slab_t',     label:'Tebal Plat (m)',     step:0.01, def:0.12 },
      { key:'slab_rebar', label:'Dia. Tulangan (mm)', step:2,    def:10   },
      { key:'slab_spac',  label:'Jarak Tul. (m)',     step:0.025,def:0.15 },
    ],
    results(){
      const nP=Math.max(FL.value-1,0), t=d.slab_t||0.12;
      const vol=+(floorArea.value*nP*t).toFixed(2);
      return [{l:'Jml Plat',v:nP,u:'buah'},{l:'Vol. Beton',v:vol,u:'m³'},{l:'Besi Tul.',v:+(vol*85).toFixed(0),u:'kg'},{l:'Bekisting',v:+(floorArea.value*nP).toFixed(1),u:'m²'}];
    },
    badge(){ return `t=${((d.slab_t||0.12)*100).toFixed(0)}cm · ${Math.max(FL.value-1,0)} plat`; }
  },
  // DINDING
  {
    id:'dinding', icon:'🪟', title:'Dinding', sub:'Bata ringan / merah / partisi',
    diag: markRaw(WallDiagram),
    diagParams: () => ({ height: H.value, floors: FL.value, openings: d.wall_openings||25 }),
    fields:[
      { key:'wall_type', label:'Tipe Dinding', opts:[{v:'bata_ringan',l:'Bata Ringan/Hebel'},{v:'bata_merah',l:'Bata Merah'},{v:'partisi',l:'Partisi GRC'}], def:'bata_ringan' },
      { key:'wall_openings', label:'% Bukaan Pintu+Jendela', step:5, def:25 },
    ],
    results(){
      const gross=+(perimeter.value*H.value*FL.value).toFixed(1), net=+(gross*(1-(d.wall_openings||25)/100)).toFixed(1);
      return [{l:'Luas Bruto',v:gross,u:'m²'},{l:'Luas Netto',v:net,u:'m²'},{l:'Plesteran',v:+(net*2).toFixed(1),u:'m²'},{l:'Acian',v:+(net*2).toFixed(1),u:'m²'}];
    },
    badge(){ return `${+(perimeter.value*H.value*FL.value*(1-(d.wall_openings||25)/100)).toFixed(0)} m² netto`; }
  },
  // ATAP
  {
    id:'atap', icon:'🏠', title:'Atap', sub:'Rangka + penutup',
    diag: markRaw(RoofDiagram),
    diagParams: () => ({ slope: d.roof_slope||30, span: L.value, overhang: d.roof_overhang||0.6 }),
    fields:[
      { key:'roof_type',    label:'Tipe Atap', opts:[{v:'genteng_metal',l:'Genteng Metal'},{v:'spandek',l:'Spandek/Galvalum'},{v:'beton',l:'Atap Beton Dak'}], def:'genteng_metal' },
      { key:'roof_slope',   label:'Kemiringan (°)', step:5,   def:30  },
      { key:'roof_overhang',label:'Overstek (m)',   step:0.1, def:0.6 },
    ],
    results(){
      const sl=(d.roof_slope||30)*Math.PI/180, ov=d.roof_overhang||0.6;
      const ra=+((floorArea.value+perimeter.value*ov)/Math.cos(sl)).toFixed(1);
      return [{l:'Luas Atap',v:ra,u:'m²'},{l:'Rabung',v:+(L.value).toFixed(1),u:"m'"},{l:'Listplank',v:+(perimeter.value*1.1).toFixed(1),u:"m'"}];
    },
    badge(){ const sl=(d.roof_slope||30)*Math.PI/180, ov=d.roof_overhang||0.6; return `${+((floorArea.value+perimeter.value*ov)/Math.cos(sl)).toFixed(0)} m²`; }
  },
  // ARSITEKTUR
  {
    id:'arsitektur', icon:'🚪', title:'Arsitektur', sub:'Pintu, jendela, keramik, cat',
    diag: markRaw(SlabDiagram),
    diagParams: () => ({ span_x: L.value, span_y: W.value, B: 0.12, H: 0.12 }),
    fields:[
      { key:'door_qty',     label:'Jml Pintu (bh)',    step:1,   def:4   },
      { key:'window_qty',   label:'Jml Jendela (bh)', step:1,   def:8   },
      { key:'door_W',       label:'Lebar Pintu (m)',   step:0.1, def:0.9 },
      { key:'door_H_dim',   label:'Tinggi Pintu (m)',  step:0.1, def:2.1 },
      { key:'window_W',     label:'Lebar Jendela (m)', step:0.1, def:1.2 },
      { key:'window_H_dim', label:'Tinggi Jendela (m)',step:0.1, def:1.2 },
    ],
    results(){
      const dA=+((d.door_qty||4)*(d.door_W||0.9)*(d.door_H_dim||2.1)).toFixed(1);
      const wA=+((d.window_qty||8)*(d.window_W||1.2)*(d.window_H_dim||1.2)).toFixed(1);
      const kr=+(floorArea.value*(d.floors||1)).toFixed(0);
      const wa=+(perimeter.value*(d.height||4)*(d.floors||1)*(1-(d.wall_openings||25)/100)).toFixed(0);
      return [{l:'Daun Pintu',v:dA,u:'m²'},{l:'Daun Jendela',v:wA,u:'m²'},{l:'Keramik Lantai',v:kr,u:'m²'},{l:'Cat Dinding',v:wa,u:'m²'}];
    },
    badge(){ return `${d.door_qty||4} pintu · ${d.window_qty||8} jendela`; }
  },
];

// Summary totals
const sumBeton = computed(() => {
  const n=d.fnd_qty||nFnd.value, sL=nColX.value*W.value+nColY.value*L.value;
  const tBlkL=sL*Math.max(FL.value-1,1), nP=Math.max(FL.value-1,0);
  return +(
    (d.fnd_L||1)*(d.fnd_W||1)*(d.fnd_H||0.4)*n +
    (d.sloof_B||0.25)*(d.sloof_H||0.35)*sL +
    (d.col_B||0.3)*(d.col_H||0.3)*(d.height||4)*n*(d.floors||1) +
    (d.beam_B||0.25)*(d.beam_H||0.40)*tBlkL +
    (d.rb_B||0.15)*(d.rb_H||0.25)*perimeter.value*FL.value +
    floorArea.value*nP*(d.slab_t||0.12)
  ).toFixed(1);
});
const sumBesi = computed(() => +(Number(sumBeton.value)*120).toFixed(0));
</script>
