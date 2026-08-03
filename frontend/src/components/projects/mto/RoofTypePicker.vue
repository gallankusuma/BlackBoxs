<template>
  <div class="tp-wrap">
    <div class="tp-label">Pilih Tipe Penutup Atap</div>
    <div class="tp-grid">
      <button v-for="opt in OPTIONS" :key="opt.id"
        @click="$emit('update:modelValue', opt.id)"
        class="tp-card" :class="{ active: modelValue === opt.id }">
        <div class="tp-svg-area">
          <!-- Zincalume / Spandek -->
          <svg v-if="opt.id==='zincalume'" viewBox="0 0 100 70" class="tp-svg">
            <polygon points="50,8 5,40 95,40" fill="#94a3b8" stroke="#64748b" stroke-width="1"/>
            <line x1="5" y1="40" x2="95" y2="40" stroke="#475569" stroke-width="2"/>
            <rect x="5" y="40" width="90" height="6" fill="#64748b"/>
            <!-- corrugated lines -->
            <path d="M10,40 Q15,36 20,40 Q25,36 30,40 Q35,36 40,40 Q45,36 50,40 Q55,36 60,40 Q65,36 70,40 Q75,36 80,40 Q85,36 90,40" fill="none" stroke="#e2e8f0" stroke-width="1.5"/>
            <text x="50" y="62" text-anchor="middle" font-size="7" fill="#475569">Zincalume/Spandek</text>
          </svg>
          <!-- PVC Double Layer -->
          <svg v-else-if="opt.id==='pvc_double'" viewBox="0 0 100 70" class="tp-svg">
            <polygon points="50,8 5,38 95,38" fill="#e0f2fe" stroke="#7dd3fc" stroke-width="1.5"/>
            <polygon points="50,13 8,41 92,41" fill="#bae6fd" stroke="#38bdf8" stroke-width="1"/>
            <line x1="5" y1="38" x2="95" y2="38" stroke="#0ea5e9" stroke-width="2"/>
            <rect x="5" y="41" width="90" height="5" fill="#7dd3fc"/>
            <text x="50" y="58" text-anchor="middle" font-size="7" fill="#475569">PVC Double Layer</text>
            <text x="50" y="67" text-anchor="middle" font-size="6" fill="#0369a1">Insulasi Termal</text>
          </svg>
          <!-- Sandwich Panel -->
          <svg v-else-if="opt.id==='sandwich'" viewBox="0 0 100 70" class="tp-svg">
            <polygon points="50,8 5,38 95,38" fill="#475569" stroke="#374151" stroke-width="1"/>
            <polygon points="50,11 7,39 93,39" fill="#f1f5f9" stroke="#e2e8f0" stroke-width="0.5"/>
            <polygon points="50,15 9,40 91,40" fill="#475569" stroke="#374151" stroke-width="1"/>
            <line x1="5" y1="38" x2="95" y2="38" stroke="#1e293b" stroke-width="2"/>
            <text x="50" y="58" text-anchor="middle" font-size="7" fill="#475569">Sandwich Panel</text>
            <text x="50" y="67" text-anchor="middle" font-size="6" fill="#475569">EPS/PU Core</text>
          </svg>
          <!-- Genteng Keramik -->
          <svg v-else-if="opt.id==='genteng_keramik'" viewBox="0 0 100 70" class="tp-svg">
            <polygon points="50,5 5,40 95,40" fill="#fde8d8" stroke="#dc6b3a" stroke-width="1"/>
            <path d="M10,40 Q18,30 26,40" fill="#dc6b3a" opacity="0.7"/>
            <path d="M26,40 Q34,30 42,40" fill="#c2572a" opacity="0.7"/>
            <path d="M42,40 Q50,30 58,40" fill="#dc6b3a" opacity="0.7"/>
            <path d="M58,40 Q66,30 74,40" fill="#c2572a" opacity="0.7"/>
            <path d="M74,40 Q82,30 90,40" fill="#dc6b3a" opacity="0.7"/>
            <line x1="5" y1="40" x2="95" y2="40" stroke="#92400e" stroke-width="2"/>
            <text x="50" y="58" text-anchor="middle" font-size="7" fill="#475569">Genteng Keramik</text>
            <text x="50" y="67" text-anchor="middle" font-size="6" fill="#475569">Glazed / Natural</text>
          </svg>
          <!-- Genteng Metal -->
          <svg v-else-if="opt.id==='genteng_metal'" viewBox="0 0 100 70" class="tp-svg">
            <polygon points="50,5 5,40 95,40" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1"/>
            <path d="M10,40 Q18,33 26,40" fill="#94a3b8" opacity="0.8"/>
            <path d="M26,40 Q34,33 42,40" fill="#64748b" opacity="0.8"/>
            <path d="M42,40 Q50,33 58,40" fill="#94a3b8" opacity="0.8"/>
            <path d="M58,40 Q66,33 74,40" fill="#64748b" opacity="0.8"/>
            <path d="M74,40 Q82,33 90,40" fill="#94a3b8" opacity="0.8"/>
            <text x="50" y="58" text-anchor="middle" font-size="7" fill="#475569">Genteng Metal</text>
            <text x="50" y="67" text-anchor="middle" font-size="6" fill="#475569">Berpasir / Colorsteel</text>
          </svg>
          <!-- Atap Beton Dak -->
          <svg v-else viewBox="0 0 100 70" class="tp-svg">
            <rect x="5" y="30" width="90" height="18" fill="#94a3b8" rx="2"/>
            <rect x="8" y="33" width="84" height="12" fill="#cbd5e1" rx="1"/>
            <line x1="12" y1="33" x2="12" y2="45" stroke="#475569" stroke-width="1"/>
            <line x1="25" y1="33" x2="25" y2="45" stroke="#475569" stroke-width="1"/>
            <line x1="50" y1="33" x2="50" y2="45" stroke="#475569" stroke-width="1"/>
            <line x1="75" y1="33" x2="75" y2="45" stroke="#475569" stroke-width="1"/>
            <line x1="88" y1="33" x2="88" y2="45" stroke="#475569" stroke-width="1"/>
            <rect x="5" y="48" width="90" height="5" fill="#64748b" opacity="0.5"/>
            <text x="50" y="62" text-anchor="middle" font-size="7" fill="#475569">Atap Beton Dak</text>
          </svg>
        </div>
        <div class="tp-name">{{ opt.label }}</div>
        <div class="tp-desc">{{ opt.desc }}</div>
        <div class="tp-tags"><span v-for="t in opt.tags" :key="t" class="tp-tag">{{ t }}</span></div>
        <div v-if="modelValue===opt.id" class="tp-check">✓</div>
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
defineProps<{ modelValue: string }>();
defineEmits<{ (e:'update:modelValue', v:string):void }>();
const OPTIONS = [
  { id:'zincalume',       label:'Zincalume / Spandek', desc:'Atap baja lapis zinc-aluminium, ringan & tahan karat', tags:['Gudang','Ekonomis'] },
  { id:'pvc_double',      label:'PVC Double Layer',    desc:'Panel PVC 2 lapis dengan rongga udara, insulasi termal baik', tags:['Insulasi','Modern'] },
  { id:'sandwich',        label:'Sandwich Panel',      desc:'Panel komposit logam-EPS/PU, insulasi premium', tags:['Premium','Cold Room'] },
  { id:'genteng_keramik', label:'Genteng Keramik',     desc:'Genteng tanah liat glasir, untuk bangunan residensial-komersial', tags:['Residensial','Klasik'] },
  { id:'genteng_metal',   label:'Genteng Metal',       desc:'Metal tile berpasir atau colorsteel, ringan & modern', tags:['Ringan','Modern'] },
  { id:'beton_dak',       label:'Atap Beton Dak',      desc:'Pelat beton cor, untuk atap datar / rooftop', tags:['Dak','Rooftop'] },
];
</script>
<style scoped>
.tp-wrap{margin-bottom:14px;}
.tp-label{font-size:.72rem;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;}
.tp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
@media(max-width:600px){.tp-grid{grid-template-columns:repeat(2,1fr);}}
.tp-card{position:relative;border:2px solid #e5e7eb;border-radius:10px;padding:8px;background:white;cursor:pointer;text-align:center;transition:all .2s;}
.tp-card:hover{border-color:#ef4444;transform:translateY(-2px);box-shadow:0 4px 12px rgba(239,68,68,.12);}
.tp-card.active{border-color:#dc2626;background:#fff1f2;}
.tp-svg-area{height:70px;display:flex;align-items:center;justify-content:center;margin-bottom:6px;}
.tp-svg{width:100%;height:70px;}
.tp-name{font-size:.64rem;font-weight:700;color:#1e293b;margin-bottom:2px;line-height:1.2;}
.tp-desc{font-size:.57rem;color:#64748b;margin-bottom:4px;line-height:1.3;}
.tp-tags{display:flex;flex-wrap:wrap;gap:2px;justify-content:center;}
.tp-tag{font-size:.54rem;background:#fff1f2;color:#be123c;border:1px solid #fecdd3;border-radius:4px;padding:1px 4px;font-weight:600;}
.tp-card.active .tp-tag{background:#ffe4e6;color:#9f1239;}
.tp-check{position:absolute;top:5px;right:6px;color:#dc2626;font-size:.8rem;font-weight:900;}
</style>
