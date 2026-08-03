<template>
  <div class="tp-wrap">
    <div class="tp-label">Pilih Tipe Lantai</div>
    <div class="tp-grid">
      <button v-for="opt in OPTIONS" :key="opt.id"
        @click="$emit('update:modelValue', opt.id)"
        class="tp-card" :class="{ active: modelValue === opt.id }">
        <div class="tp-svg-area">
          <svg v-if="opt.id==='concrete'" viewBox="0 0 100 70" class="tp-svg">
            <rect x="5" y="10" width="90" height="40" fill="#e2e8f0" rx="1"/>
            <rect x="5" y="10" width="90" height="8" fill="#94a3b8" rx="1"/>
            <line x1="15" y1="10" x2="15" y2="50" stroke="#64748b" stroke-width="1"/>
            <line x1="30" y1="10" x2="30" y2="50" stroke="#64748b" stroke-width="1"/>
            <line x1="50" y1="10" x2="50" y2="50" stroke="#64748b" stroke-width="1"/>
            <line x1="70" y1="10" x2="70" y2="50" stroke="#64748b" stroke-width="1"/>
            <line x1="85" y1="10" x2="85" y2="50" stroke="#64748b" stroke-width="1"/>
            <line x1="5" y1="30" x2="95" y2="30" stroke="#64748b" stroke-width="1"/>
            <text x="50" y="62" text-anchor="middle" font-size="7" fill="#475569">Beton Cor</text>
            <text x="50" y="69" text-anchor="middle" font-size="6" fill="#475569">Floor Hardener/Epoxy</text>
          </svg>
          <svg v-else-if="opt.id==='keramik'" viewBox="0 0 100 70" class="tp-svg">
            <rect x="5" y="8" width="90" height="50" fill="#f8fafc" rx="1" stroke="#e2e8f0" stroke-width="1"/>
            <rect x="7" y="10" width="26" height="22" fill="#e0f2fe" rx="0.5" stroke="#bae6fd" stroke-width="0.8"/>
            <rect x="35" y="10" width="26" height="22" fill="#dbeafe" rx="0.5" stroke="#bfdbfe" stroke-width="0.8"/>
            <rect x="63" y="10" width="26" height="22" fill="#e0f2fe" rx="0.5" stroke="#bae6fd" stroke-width="0.8"/>
            <rect x="7" y="34" width="26" height="22" fill="#dbeafe" rx="0.5" stroke="#bfdbfe" stroke-width="0.8"/>
            <rect x="35" y="34" width="26" height="22" fill="#e0f2fe" rx="0.5" stroke="#bae6fd" stroke-width="0.8"/>
            <rect x="63" y="34" width="26" height="22" fill="#dbeafe" rx="0.5" stroke="#bfdbfe" stroke-width="0.8"/>
            <text x="50" y="66" text-anchor="middle" font-size="7" fill="#475569">Keramik / Granit</text>
          </svg>
          <svg v-else-if="opt.id==='plate_bordes'" viewBox="0 0 100 70" class="tp-svg">
            <rect x="5" y="8" width="90" height="48" fill="#94a3b8" rx="1"/>
            <rect x="5" y="8" width="90" height="6" fill="#64748b" rx="1"/>
            <!-- diamond pattern for bordes plate -->
            <path d="M15,20 L20,15 L25,20 L20,25 Z" fill="#cbd5e1" stroke="#475569" stroke-width="0.5"/>
            <path d="M30,20 L35,15 L40,20 L35,25 Z" fill="#cbd5e1" stroke="#475569" stroke-width="0.5"/>
            <path d="M45,20 L50,15 L55,20 L50,25 Z" fill="#cbd5e1" stroke="#475569" stroke-width="0.5"/>
            <path d="M60,20 L65,15 L70,20 L65,25 Z" fill="#cbd5e1" stroke="#475569" stroke-width="0.5"/>
            <path d="M75,20 L80,15 L85,20 L80,25 Z" fill="#cbd5e1" stroke="#475569" stroke-width="0.5"/>
            <path d="M22,33 L27,28 L32,33 L27,38 Z" fill="#cbd5e1" stroke="#475569" stroke-width="0.5"/>
            <path d="M37,33 L42,28 L47,33 L42,38 Z" fill="#cbd5e1" stroke="#475569" stroke-width="0.5"/>
            <path d="M52,33 L57,28 L62,33 L57,38 Z" fill="#cbd5e1" stroke="#475569" stroke-width="0.5"/>
            <path d="M67,33 L72,28 L77,33 L72,38 Z" fill="#cbd5e1" stroke="#475569" stroke-width="0.5"/>
            <text x="50" y="64" text-anchor="middle" font-size="7" fill="#475569">Plate Bordes</text>
            <text x="50" y="70" text-anchor="middle" font-size="6" fill="#475569">Anti-slip Steel</text>
          </svg>
          <svg v-else-if="opt.id==='parquet'" viewBox="0 0 100 70" class="tp-svg">
            <rect x="5" y="8" width="90" height="48" fill="#fef3c7" rx="1"/>
            <rect x="7" y="10" width="42" height="14" fill="#a16207" rx="0.5"/>
            <rect x="51" y="10" width="42" height="14" fill="#92400e" rx="0.5"/>
            <rect x="7" y="26" width="42" height="14" fill="#92400e" rx="0.5"/>
            <rect x="51" y="26" width="42" height="14" fill="#a16207" rx="0.5"/>
            <rect x="7" y="42" width="42" height="12" fill="#a16207" rx="0.5"/>
            <rect x="51" y="42" width="42" height="12" fill="#92400e" rx="0.5"/>
            <text x="50" y="64" text-anchor="middle" font-size="7" fill="#475569">Parquet / Vinyl</text>
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
  { id:'concrete',     label:'Beton Cor',          desc:'Lantai beton + floor hardener, epoxy, atau polished concrete', tags:['Gudang','Industrial'] },
  { id:'keramik',      label:'Keramik / Granit',   desc:'Pemasangan keramik atau granit di atas screed beton', tags:['Komersial','Residensial'] },
  { id:'plate_bordes', label:'Plate Bordes',        desc:'Pelat baja anti-slip, untuk area industri/mezzanine', tags:['Industrial','Anti-slip'] },
  { id:'parquet',      label:'Parquet / Vinyl',     desc:'Lantai kayu parquet atau vinyl untuk area kantor/hunian', tags:['Interior','Premium'] },
];
</script>
<style scoped>
.tp-wrap{margin-bottom:14px;}
.tp-label{font-size:.72rem;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;}
.tp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
@media(max-width:700px){.tp-grid{grid-template-columns:repeat(2,1fr);}}
.tp-card{position:relative;border:2px solid #e5e7eb;border-radius:10px;padding:8px;background:white;cursor:pointer;text-align:center;transition:all .2s;}
.tp-card:hover{border-color:#10b981;transform:translateY(-2px);box-shadow:0 4px 12px rgba(16,185,129,.12);}
.tp-card.active{border-color:#059669;background:#f0fdf4;}
.tp-svg-area{height:72px;display:flex;align-items:center;justify-content:center;margin-bottom:6px;}
.tp-svg{width:100%;height:72px;}
.tp-name{font-size:.65rem;font-weight:700;color:#1e293b;margin-bottom:2px;line-height:1.2;}
.tp-desc{font-size:.57rem;color:#64748b;margin-bottom:4px;line-height:1.3;}
.tp-tags{display:flex;flex-wrap:wrap;gap:2px;justify-content:center;}
.tp-tag{font-size:.54rem;background:#f0fdf4;color:#065f46;border:1px solid #a7f3d0;border-radius:4px;padding:1px 4px;font-weight:600;}
.tp-card.active .tp-tag{background:#dcfce7;color:#14532d;}
.tp-check{position:absolute;top:5px;right:6px;color:#059669;font-size:.8rem;font-weight:900;}
</style>
