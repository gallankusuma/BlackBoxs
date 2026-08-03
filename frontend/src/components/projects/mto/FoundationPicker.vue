<template>
  <div class="fp-wrapper">
    <div class="fp-label">Pilih Tipe Pondasi</div>
    <div class="fp-grid">
      <button
        v-for="opt in OPTIONS" :key="opt.id"
        @click="$emit('update:modelValue', opt.id)"
        class="fp-card"
        :class="{ 'fp-active': modelValue === opt.id }"
      >
        <!-- SVG Diagram -->
        <div class="fp-svg-area">
          <!-- Footplate -->
          <svg v-if="opt.id==='footplate'" viewBox="0 0 120 90" class="fp-svg">
            <rect x="30" y="5" width="60" height="10" fill="#64748b" rx="1"/>
            <rect x="20" y="55" width="80" height="25" fill="#94a3b8" rx="2"/>
            <rect x="48" y="15" width="24" height="40" fill="#78716c" rx="1"/>
            <line x1="20" y1="80" x2="100" y2="80" stroke="#475569" stroke-width="3"/>
            <text x="60" y="48" text-anchor="middle" font-size="7" fill="#1e293b" font-weight="bold">Footplat</text>
            <text x="60" y="74" text-anchor="middle" font-size="6" fill="#475569">Tie Beam</text>
            <!-- dim lines -->
            <line x1="20" y1="86" x2="100" y2="86" stroke="#3b82f6" stroke-width="0.8"/>
            <text x="60" y="90" text-anchor="middle" font-size="6" fill="#3b82f6">P × L</text>
          </svg>
          <!-- Bored Pile -->
          <svg v-else-if="opt.id==='bored_pile'" viewBox="0 0 120 90" class="fp-svg">
            <rect x="45" y="5" width="30" height="12" fill="#64748b" rx="1"/>
            <rect x="48" y="17" width="24" height="20" fill="#78716c" rx="1"/>
            <rect x="38" y="37" width="44" height="14" fill="#94a3b8" rx="2"/>
            <circle cx="48" cy="62" r="8" fill="#6b7280" stroke="#475569" stroke-width="1"/>
            <circle cx="60" cy="62" r="8" fill="#6b7280" stroke="#475569" stroke-width="1"/>
            <circle cx="72" cy="62" r="8" fill="#6b7280" stroke="#475569" stroke-width="1"/>
            <line x1="40" y1="70" x2="42" y2="82" stroke="#475569" stroke-width="1.5"/>
            <line x1="60" y1="70" x2="60" y2="82" stroke="#475569" stroke-width="1.5"/>
            <line x1="80" y1="70" x2="78" y2="82" stroke="#475569" stroke-width="1.5"/>
            <line x1="10" y1="82" x2="110" y2="82" stroke="#475569" stroke-width="2.5"/>
            <text x="60" y="44" text-anchor="middle" font-size="6" fill="#1e293b">Pile Cap</text>
            <text x="60" y="78" text-anchor="middle" font-size="6" fill="#475569">Bored Pile</text>
          </svg>
          <!-- Precast Pile -->
          <svg v-else-if="opt.id==='precast_pile'" viewBox="0 0 120 90" class="fp-svg">
            <rect x="45" y="5" width="30" height="12" fill="#64748b" rx="1"/>
            <rect x="48" y="17" width="24" height="18" fill="#78716c" rx="1"/>
            <rect x="36" y="35" width="48" height="14" fill="#94a3b8" rx="2"/>
            <rect x="46" y="49" width="8" height="30" fill="#374151" rx="1"/>
            <rect x="56" y="49" width="8" height="28" fill="#374151" rx="1"/>
            <rect x="66" y="49" width="8" height="30" fill="#374151" rx="1"/>
            <line x1="10" y1="82" x2="110" y2="82" stroke="#475569" stroke-width="2.5"/>
            <text x="60" y="43" text-anchor="middle" font-size="6" fill="#1e293b">Pile Cap</text>
            <text x="60" y="78" text-anchor="middle" font-size="6" fill="#475569">Precast Pile</text>
          </svg>
          <!-- Mini Pile / Strauss -->
          <svg v-else viewBox="0 0 120 90" class="fp-svg">
            <rect x="45" y="5" width="30" height="12" fill="#64748b" rx="1"/>
            <rect x="48" y="17" width="24" height="16" fill="#78716c" rx="1"/>
            <rect x="42" y="33" width="36" height="12" fill="#94a3b8" rx="2"/>
            <rect x="53" y="45" width="6" height="34" fill="#6b7280" rx="3"/>
            <rect x="61" y="45" width="6" height="34" fill="#6b7280" rx="3"/>
            <ellipse cx="56" cy="79" rx="4" ry="2" fill="#4b5563"/>
            <ellipse cx="64" cy="79" rx="4" ry="2" fill="#4b5563"/>
            <line x1="10" y1="82" x2="110" y2="82" stroke="#475569" stroke-width="2.5"/>
            <text x="60" y="41" text-anchor="middle" font-size="6" fill="#1e293b">Pile Cap</text>
            <text x="60" y="78" text-anchor="middle" font-size="6" fill="#475569">Mini Pile</text>
          </svg>
        </div>

        <!-- Info -->
        <div class="fp-info">
          <div class="fp-name">{{ opt.label }}</div>
          <div class="fp-desc">{{ opt.desc }}</div>
          <div class="fp-tags">
            <span v-for="t in opt.tags" :key="t" class="fp-tag">{{ t }}</span>
          </div>
        </div>
        <div v-if="modelValue===opt.id" class="fp-check">✓</div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>();
defineEmits<{ (e:'update:modelValue', v:string):void }>();

const OPTIONS = [
  { id:'footplate',    label:'Footplat + Tie Beam',    desc:'Tanah cukup baik, beban ringan–menengah', tags:['Ekonomis','Dangkal'] },
  { id:'bored_pile',   label:'Bore Pile + Pile Cap',   desc:'Tanah lunak / beban besar, getaran rendah', tags:['Kuat','In-situ'] },
  { id:'precast_pile', label:'Precast Pile + Pile Cap', desc:'Kapasitas tinggi, pekerjaan cepat',         tags:['Cepat','Presisi'] },
  { id:'mini_pile',    label:'Strauss / Mini Pile',     desc:'Akses terbatas, beban sedang',              tags:['Sempit','Fleksibel'] },
];
</script>

<style scoped>
.fp-wrapper { margin-bottom: 16px; }
.fp-label { font-size: 0.75rem; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing:.05em; margin-bottom: 10px; }
.fp-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; }
@media(max-width:900px){ .fp-grid{ grid-template-columns:repeat(2,1fr); } }
.fp-card {
  position:relative; border:2px solid #e5e7eb; border-radius:12px; padding:10px;
  background:white; cursor:pointer; text-align:center; transition:all .2s;
}
.fp-card:hover { border-color:#3b82f6; transform:translateY(-2px); box-shadow:0 6px 16px rgba(59,130,246,.15); }
.fp-active { border-color:#1d4ed8; background:#eff6ff; box-shadow:0 4px 14px rgba(29,78,216,.2); }
.fp-svg-area { height:80px; display:flex; align-items:center; justify-content:center; margin-bottom:8px; }
.fp-svg { width:100%; height:80px; }
.fp-name { font-size:.72rem; font-weight:700; color:#1e293b; margin-bottom:3px; line-height:1.2; }
.fp-desc { font-size:.63rem; color:#64748b; margin-bottom:6px; line-height:1.3; }
.fp-tags { display:flex; flex-wrap:wrap; gap:3px; justify-content:center; }
.fp-tag { font-size:.58rem; background:#f0f9ff; color:#0369a1; border:1px solid #bae6fd; border-radius:4px; padding:1px 5px; font-weight:600; }
.fp-active .fp-tag { background:#dbeafe; color:#1d4ed8; border-color:#93c5fd; }
.fp-check { position:absolute; top:6px; right:8px; color:#1d4ed8; font-size:.85rem; font-weight:900; }
</style>
