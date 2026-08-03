<template>
  <div v-if="visible" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="close">
    <div class="bg-white rounded-xl shadow-2xl w-[800px] max-h-[90vh] flex flex-col">
      <!-- Header -->
      <div class="p-4 border-b bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-t-xl flex items-center justify-between">
        <div>
          <h2 class="text-lg font-bold flex items-center gap-2">🧮 Construction Calculator</h2>
          <p class="text-sm text-indigo-200 mt-0.5">Pilih jenis perhitungan untuk menghitung qty</p>
        </div>
        <button @click="close" class="text-white hover:text-indigo-200 text-xl">✕</button>
      </div>

      <!-- Calculator Selection (when no calculator is active) -->
      <div v-if="!activeCalc" class="flex-1 overflow-y-auto p-6">
        <div class="grid grid-cols-2 gap-3">
          <button 
            v-for="calc in calculators" :key="calc.id"
            @click="activeCalc = calc.id"
            class="p-4 border-2 rounded-xl text-left hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
          >
            <div class="flex items-start gap-3">
              <span class="text-2xl">{{ calc.icon }}</span>
              <div>
                <h3 class="font-semibold text-gray-800 group-hover:text-indigo-700">{{ calc.name }}</h3>
                <p class="text-xs text-gray-500 mt-1">{{ calc.desc }}</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- Active Calculator -->
      <div v-else class="flex-1 overflow-y-auto p-6">
        <button @click="activeCalc = null" class="text-sm text-indigo-600 hover:text-indigo-800 mb-4 flex items-center gap-1">
          ← Kembali ke pilihan kalkulator
        </button>

        <!-- 1. Berat Baja Profil -->
        <div v-if="activeCalc === 'steel_profile'" class="space-y-4">
          <h3 class="text-lg font-bold text-gray-800">⚙️ Berat Baja Profil</h3>
          <p class="text-sm text-gray-500">Hitung berat baja profil berdasarkan tipe, ukuran, dan panjang member</p>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tipe Profil</label>
              <select v-model="steel.type" class="w-full border rounded-lg px-3 py-2">
                <option value="">-- Pilih --</option>
                <option value="siku">Siku (Angle / L)</option>
                <option value="wf">WF / H-Beam</option>
                <option value="unp">UNP / Channel</option>
                <option value="cnp">CNP / C-Channel</option>
                <option value="pipa_bulat">Pipa Bulat (Circular Hollow)</option>
                <option value="pipa_kotak">Pipa Kotak (Rectangular Hollow)</option>
                <option value="plat">Plat / Plate</option>
              </select>
            </div>
            <div v-if="steel.type === 'siku'">
              <label class="block text-sm font-medium text-gray-700 mb-1">Ukuran Siku</label>
              <select v-model="steel.siku_size" class="w-full border rounded-lg px-3 py-2">
                <option value="">-- Pilih --</option>
                <option v-for="s in sikuSizes" :key="s.label" :value="s">{{ s.label }} — {{ s.weight }} kg/m</option>
              </select>
            </div>
            <div v-if="steel.type === 'wf'">
              <label class="block text-sm font-medium text-gray-700 mb-1">Ukuran WF</label>
              <select v-model="steel.wf_size" class="w-full border rounded-lg px-3 py-2">
                <option value="">-- Pilih --</option>
                <option v-for="s in wfSizes" :key="s.label" :value="s">{{ s.label }} — {{ s.weight }} kg/m</option>
              </select>
            </div>
            <div v-if="steel.type === 'unp'">
              <label class="block text-sm font-medium text-gray-700 mb-1">Ukuran UNP</label>
              <select v-model="steel.unp_size" class="w-full border rounded-lg px-3 py-2">
                <option value="">-- Pilih --</option>
                <option v-for="s in unpSizes" :key="s.label" :value="s">{{ s.label }} — {{ s.weight }} kg/m</option>
              </select>
            </div>
            <div v-if="steel.type === 'cnp'">
              <label class="block text-sm font-medium text-gray-700 mb-1">Ukuran CNP</label>
              <select v-model="steel.cnp_size" class="w-full border rounded-lg px-3 py-2">
                <option value="">-- Pilih --</option>
                <option v-for="s in cnpSizes" :key="s.label" :value="s">{{ s.label }} — {{ s.weight }} kg/m</option>
              </select>
            </div>
            <div v-if="steel.type === 'pipa_bulat'">
              <label class="block text-sm font-medium text-gray-700 mb-1">Diameter Luar (mm)</label>
              <input v-model.number="steel.od" type="number" class="w-full border rounded-lg px-3 py-2" placeholder="e.g. 114.3">
            </div>
            <div v-if="steel.type === 'pipa_kotak'">
              <label class="block text-sm font-medium text-gray-700 mb-1">Ukuran (mm)</label>
              <div class="flex gap-2">
                <input v-model.number="steel.box_w" type="number" class="w-full border rounded-lg px-3 py-2" placeholder="Lebar">
                <span class="self-center">×</span>
                <input v-model.number="steel.box_h" type="number" class="w-full border rounded-lg px-3 py-2" placeholder="Tinggi">
              </div>
            </div>
            <div v-if="steel.type === 'pipa_bulat' || steel.type === 'pipa_kotak'">
              <label class="block text-sm font-medium text-gray-700 mb-1">Tebal (mm)</label>
              <input v-model.number="steel.thickness" type="number" step="0.1" class="w-full border rounded-lg px-3 py-2" placeholder="e.g. 3.2">
            </div>
            <div v-if="steel.type === 'plat'">
              <label class="block text-sm font-medium text-gray-700 mb-1">Dimensi Plat</label>
              <div class="flex gap-2">
                <input v-model.number="steel.plat_w" type="number" class="w-full border rounded-lg px-3 py-2" placeholder="Lebar (mm)">
                <span class="self-center">×</span>
                <input v-model.number="steel.plat_t" type="number" step="0.1" class="w-full border rounded-lg px-3 py-2" placeholder="Tebal (mm)">
              </div>
            </div>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Panjang per Batang (m)</label>
              <input v-model.number="steel.length" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2" placeholder="e.g. 6">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Jumlah Batang</label>
              <input v-model.number="steel.qty" type="number" class="w-full border rounded-lg px-3 py-2" placeholder="e.g. 10">
            </div>
          </div>

          <!-- Result -->
          <div v-if="steelResult" class="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <h4 class="font-semibold text-blue-800">Hasil Perhitungan</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <span class="text-gray-600">Berat per meter:</span>
              <span class="font-semibold text-right">{{ steelResult.weightPerM.toFixed(2) }} kg/m</span>
              <span class="text-gray-600">Berat per batang:</span>
              <span class="font-semibold text-right">{{ steelResult.weightPerBar.toFixed(2) }} kg</span>
              <span class="text-gray-600">Total panjang:</span>
              <span class="font-semibold text-right">{{ steelResult.totalLength.toFixed(2) }} m</span>
              <span class="text-gray-600 font-bold">Total berat:</span>
              <span class="font-bold text-right text-blue-700 text-lg">{{ steelResult.totalWeight.toFixed(2) }} kg</span>
            </div>
          </div>
        </div>

        <!-- 2. Volume Beton -->
        <div v-if="activeCalc === 'concrete_volume'" class="space-y-4">
          <h3 class="text-lg font-bold text-gray-800">🏗️ Volume Beton</h3>
          <p class="text-sm text-gray-500">Hitung volume beton untuk berbagai bentuk elemen struktur</p>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tipe Elemen</label>
            <select v-model="concrete.shape" class="w-full border rounded-lg px-3 py-2">
              <option value="">-- Pilih --</option>
              <option value="slab">Pelat / Slab (Persegi Panjang)</option>
              <option value="column_rect">Kolom Persegi</option>
              <option value="column_round">Kolom Bulat</option>
              <option value="beam">Balok / Beam</option>
              <option value="footing">Pondasi Tapak / Footing</option>
              <option value="pile_cap">Pile Cap</option>
              <option value="retaining_wall">Retaining Wall</option>
            </select>
          </div>

          <div v-if="concrete.shape === 'slab'" class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Panjang (m)</label>
              <input v-model.number="concrete.length" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Lebar (m)</label>
              <input v-model.number="concrete.width" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tebal (m)</label>
              <input v-model.number="concrete.thickness" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
          </div>

          <div v-if="concrete.shape === 'column_rect'" class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Lebar (m)</label>
              <input v-model.number="concrete.width" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Dalam (m)</label>
              <input v-model.number="concrete.depth" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tinggi (m)</label>
              <input v-model.number="concrete.height" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
          </div>

          <div v-if="concrete.shape === 'column_round'" class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Diameter (m)</label>
              <input v-model.number="concrete.diameter" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tinggi (m)</label>
              <input v-model.number="concrete.height" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
          </div>

          <div v-if="concrete.shape === 'beam'" class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Lebar (m)</label>
              <input v-model.number="concrete.width" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tinggi (m)</label>
              <input v-model.number="concrete.height" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Panjang (m)</label>
              <input v-model.number="concrete.length" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
          </div>

          <div v-if="concrete.shape === 'footing'" class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Panjang (m)</label>
              <input v-model.number="concrete.length" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Lebar (m)</label>
              <input v-model.number="concrete.width" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tinggi (m)</label>
              <input v-model.number="concrete.height" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2" placeholder="e.g. 0.5">
            </div>
          </div>

          <div v-if="concrete.shape === 'pile_cap'" class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Panjang (m)</label>
              <input v-model.number="concrete.length" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Lebar (m)</label>
              <input v-model.number="concrete.width" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tinggi (m)</label>
              <input v-model.number="concrete.height" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
          </div>

          <div v-if="concrete.shape === 'retaining_wall'" class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Panjang (m)</label>
              <input v-model.number="concrete.length" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tinggi (m)</label>
              <input v-model.number="concrete.height" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tebal (m)</label>
              <input v-model.number="concrete.thickness" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Jumlah Elemen</label>
              <input v-model.number="concrete.qty" type="number" class="w-full border rounded-lg px-3 py-2" placeholder="1">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Waste Factor (%)</label>
              <input v-model.number="concrete.waste" type="number" step="0.5" class="w-full border rounded-lg px-3 py-2" placeholder="5">
            </div>
          </div>

          <div v-if="concreteResult" class="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
            <h4 class="font-semibold text-green-800">Hasil Perhitungan</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <span class="text-gray-600">Volume per elemen:</span>
              <span class="font-semibold text-right">{{ concreteResult.volumePerUnit.toFixed(3) }} m³</span>
              <span class="text-gray-600">Volume total ({{ concrete.qty || 1 }} elemen):</span>
              <span class="font-semibold text-right">{{ concreteResult.volumeTotal.toFixed(3) }} m³</span>
              <span class="text-gray-600">Waste ({{ concrete.waste || 5 }}%):</span>
              <span class="font-semibold text-right">{{ concreteResult.wasteVolume.toFixed(3) }} m³</span>
              <span class="text-gray-600 font-bold">Volume + Waste:</span>
              <span class="font-bold text-right text-green-700 text-lg">{{ concreteResult.totalWithWaste.toFixed(3) }} m³</span>
              <span class="text-gray-600">Estimasi berat:</span>
              <span class="font-semibold text-right">{{ concreteResult.weight.toFixed(0) }} kg ({{ (concreteResult.weight/1000).toFixed(1) }} ton)</span>
            </div>
          </div>
        </div>

        <!-- 3. Kebutuhan Tulangan / Rebar -->
        <div v-if="activeCalc === 'rebar'" class="space-y-4">
          <h3 class="text-lg font-bold text-gray-800">🔩 Kebutuhan Tulangan (Rebar)</h3>
          <p class="text-sm text-gray-500">Hitung berat tulangan besi beton berdasarkan diameter dan panjang</p>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Diameter Tulangan (mm)</label>
              <select v-model="rebar.diameter" class="w-full border rounded-lg px-3 py-2">
                <option value="">-- Pilih --</option>
                <option v-for="r in rebarSizes" :key="r.dia" :value="r">D{{ r.dia }} — {{ r.weight }} kg/m</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Panjang per Batang (m)</label>
              <input v-model.number="rebar.barLength" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2" placeholder="12 (standar)">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Total Panjang Kebutuhan (m)</label>
              <input v-model.number="rebar.totalLength" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2" placeholder="e.g. 500">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Waste / Overlap (%)</label>
              <input v-model.number="rebar.waste" type="number" step="0.5" class="w-full border rounded-lg px-3 py-2" placeholder="10">
            </div>
          </div>

          <div v-if="rebarResult" class="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-2">
            <h4 class="font-semibold text-orange-800">Hasil Perhitungan</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <span class="text-gray-600">Berat per meter:</span>
              <span class="font-semibold text-right">{{ rebarResult.weightPerM.toFixed(3) }} kg/m</span>
              <span class="text-gray-600">Total panjang + waste:</span>
              <span class="font-semibold text-right">{{ rebarResult.totalLengthWithWaste.toFixed(1) }} m</span>
              <span class="text-gray-600">Jumlah batang:</span>
              <span class="font-semibold text-right">{{ rebarResult.barCount }} btg</span>
              <span class="text-gray-600 font-bold">Total berat:</span>
              <span class="font-bold text-right text-orange-700 text-lg">{{ rebarResult.totalWeight.toFixed(2) }} kg</span>
            </div>
          </div>
        </div>

        <!-- 4. Bekisting / Formwork -->
        <div v-if="activeCalc === 'formwork'" class="space-y-4">
          <h3 class="text-lg font-bold text-gray-800">📐 Luas Bekisting (Formwork)</h3>
          <p class="text-sm text-gray-500">Hitung luas bekisting untuk elemen struktur beton</p>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tipe Elemen</label>
            <select v-model="formwork.type" class="w-full border rounded-lg px-3 py-2">
              <option value="">-- Pilih --</option>
              <option value="column_rect">Kolom Persegi</option>
              <option value="column_round">Kolom Bulat</option>
              <option value="beam">Balok</option>
              <option value="slab">Pelat / Slab (bawah saja)</option>
              <option value="footing">Pondasi Tapak</option>
              <option value="wall">Dinding / Wall (2 sisi)</option>
            </select>
          </div>

          <div v-if="formwork.type === 'column_rect'" class="grid grid-cols-3 gap-4">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Lebar (m)</label><input v-model.number="formwork.width" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Dalam (m)</label><input v-model.number="formwork.depth" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Tinggi (m)</label><input v-model.number="formwork.height" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
          </div>
          <div v-if="formwork.type === 'column_round'" class="grid grid-cols-2 gap-4">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Diameter (m)</label><input v-model.number="formwork.diameter" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Tinggi (m)</label><input v-model.number="formwork.height" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
          </div>
          <div v-if="formwork.type === 'beam'" class="grid grid-cols-3 gap-4">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Lebar (m)</label><input v-model.number="formwork.width" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Tinggi (m)</label><input v-model.number="formwork.height" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Panjang (m)</label><input v-model.number="formwork.length" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
          </div>
          <div v-if="formwork.type === 'slab'" class="grid grid-cols-2 gap-4">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Panjang (m)</label><input v-model.number="formwork.length" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Lebar (m)</label><input v-model.number="formwork.width" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
          </div>
          <div v-if="formwork.type === 'footing'" class="grid grid-cols-3 gap-4">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Panjang (m)</label><input v-model.number="formwork.length" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Lebar (m)</label><input v-model.number="formwork.width" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Tinggi (m)</label><input v-model.number="formwork.height" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
          </div>
          <div v-if="formwork.type === 'wall'" class="grid grid-cols-2 gap-4">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Panjang (m)</label><input v-model.number="formwork.length" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Tinggi (m)</label><input v-model.number="formwork.height" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Jumlah Elemen</label>
            <input v-model.number="formwork.qty" type="number" class="w-full border rounded-lg px-3 py-2" placeholder="1">
          </div>

          <div v-if="formworkResult" class="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-2">
            <h4 class="font-semibold text-purple-800">Hasil Perhitungan</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <span class="text-gray-600">Luas per elemen:</span>
              <span class="font-semibold text-right">{{ formworkResult.areaPerUnit.toFixed(2) }} m²</span>
              <span class="text-gray-600 font-bold">Total luas bekisting:</span>
              <span class="font-bold text-right text-purple-700 text-lg">{{ formworkResult.totalArea.toFixed(2) }} m²</span>
            </div>
          </div>
        </div>

        <!-- 5. Galian Tanah / Earthwork -->
        <div v-if="activeCalc === 'earthwork'" class="space-y-4">
          <h3 class="text-lg font-bold text-gray-800">⛏️ Volume Galian Tanah</h3>
          <p class="text-sm text-gray-500">Hitung volume galian tanah untuk pondasi, saluran, dll</p>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tipe Galian</label>
            <select v-model="earthwork.type" class="w-full border rounded-lg px-3 py-2">
              <option value="">-- Pilih --</option>
              <option value="rectangular">Persegi Panjang (Pondasi/Pit)</option>
              <option value="trench">Galian Saluran / Trench</option>
              <option value="sloped">Galian Bermiring (Trapezoid)</option>
            </select>
          </div>

          <div v-if="earthwork.type === 'rectangular'" class="grid grid-cols-3 gap-4">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Panjang (m)</label><input v-model.number="earthwork.length" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Lebar (m)</label><input v-model.number="earthwork.width" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Kedalaman (m)</label><input v-model.number="earthwork.depth" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
          </div>
          <div v-if="earthwork.type === 'trench'" class="grid grid-cols-3 gap-4">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Panjang (m)</label><input v-model.number="earthwork.length" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Lebar (m)</label><input v-model.number="earthwork.width" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Kedalaman (m)</label><input v-model.number="earthwork.depth" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
          </div>
          <div v-if="earthwork.type === 'sloped'" class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div><label class="block text-sm font-medium text-gray-700 mb-1">Panjang (m)</label><input v-model.number="earthwork.length" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
              <div><label class="block text-sm font-medium text-gray-700 mb-1">Kedalaman (m)</label><input v-model.number="earthwork.depth" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div><label class="block text-sm font-medium text-gray-700 mb-1">Lebar Atas (m)</label><input v-model.number="earthwork.widthTop" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
              <div><label class="block text-sm font-medium text-gray-700 mb-1">Lebar Bawah (m)</label><input v-model.number="earthwork.widthBottom" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2"></div>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Jumlah Titik</label>
            <input v-model.number="earthwork.qty" type="number" class="w-full border rounded-lg px-3 py-2" placeholder="1">
          </div>

          <div v-if="earthworkResult" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-2">
            <h4 class="font-semibold text-yellow-800">Hasil Perhitungan</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <span class="text-gray-600">Volume per titik:</span>
              <span class="font-semibold text-right">{{ earthworkResult.volumePerUnit.toFixed(3) }} m³</span>
              <span class="text-gray-600 font-bold">Total volume galian:</span>
              <span class="font-bold text-right text-yellow-700 text-lg">{{ earthworkResult.totalVolume.toFixed(3) }} m³</span>
              <span class="text-gray-600">Soil swell factor (+30%):</span>
              <span class="font-semibold text-right">{{ earthworkResult.swellVolume.toFixed(3) }} m³</span>
            </div>
          </div>
        </div>

        <!-- 6. Cat / Paint -->
        <div v-if="activeCalc === 'paint'" class="space-y-4">
          <h3 class="text-lg font-bold text-gray-800">🎨 Kebutuhan Cat (Paint)</h3>
          <p class="text-sm text-gray-500">Hitung kebutuhan cat berdasarkan luas area</p>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Panjang Area (m)</label>
              <input v-model.number="paint.length" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tinggi/Lebar Area (m)</label>
              <input v-model.number="paint.height" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Daya Sebar (m²/liter)</label>
              <input v-model.number="paint.coverage" type="number" step="0.1" class="w-full border rounded-lg px-3 py-2" placeholder="10-12 (standar)">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Jumlah Lapis (coat)</label>
              <input v-model.number="paint.coats" type="number" class="w-full border rounded-lg px-3 py-2" placeholder="2">
            </div>
          </div>

          <div v-if="paintResult" class="bg-pink-50 border border-pink-200 rounded-lg p-4 space-y-2">
            <h4 class="font-semibold text-pink-800">Hasil Perhitungan</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <span class="text-gray-600">Luas area:</span>
              <span class="font-semibold text-right">{{ paintResult.area.toFixed(2) }} m²</span>
              <span class="text-gray-600">Kebutuhan per lapis:</span>
              <span class="font-semibold text-right">{{ paintResult.litersPerCoat.toFixed(1) }} liter</span>
              <span class="text-gray-600 font-bold">Total kebutuhan:</span>
              <span class="font-bold text-right text-pink-700 text-lg">{{ paintResult.totalLiters.toFixed(1) }} liter</span>
              <span class="text-gray-600">Kaleng (5 kg):</span>
              <span class="font-semibold text-right">{{ paintResult.cans5kg }} kaleng</span>
            </div>
          </div>
        </div>

        <!-- 7. Pipa / Pipe Weight -->
        <div v-if="activeCalc === 'pipe'" class="space-y-4">
          <h3 class="text-lg font-bold text-gray-800">🔧 Berat & Volume Pipa</h3>
          <p class="text-sm text-gray-500">Hitung berat pipa baja berdasarkan ukuran NPS, schedule, dan material</p>
          
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Ukuran Pipa (NPS)</label>
              <select v-model="pipe.nps" class="w-full border rounded-lg px-3 py-2">
                <option value="">-- Pilih --</option>
                <option v-for="size in pipeNpsList" :key="size" :value="size">{{ size }}"</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Schedule</label>
              <select v-model="pipe.schedule" :disabled="!pipe.nps" class="w-full border rounded-lg px-3 py-2">
                <option value="">-- Pilih --</option>
                <option v-for="sch in availablePipeSchedules" :key="sch" :value="sch">{{ sch === 'STD' || sch === 'XS' || sch === 'XXS' ? sch : 'SCH ' + sch }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Material</label>
              <select v-model="pipe.material" class="w-full border rounded-lg px-3 py-2">
                <option value="cs">Carbon Steel (A106/A53)</option>
                <option value="ss304">Stainless Steel 304/304L</option>
                <option value="ss316">Stainless Steel 316/316L</option>
                <option value="galv">Galvanized Steel</option>
              </select>
            </div>
          </div>

          <!-- Pipe Specs Info -->
          <div v-if="selectedPipeSpecs" class="bg-gray-50 border rounded-lg p-3">
            <div class="grid grid-cols-4 gap-3 text-sm">
              <div><span class="text-gray-500">OD:</span> <span class="font-semibold">{{ selectedPipeSpecs.od }} mm</span></div>
              <div><span class="text-gray-500">WT:</span> <span class="font-semibold">{{ selectedPipeSpecs.wt }} mm</span></div>
              <div><span class="text-gray-500">ID:</span> <span class="font-semibold">{{ selectedPipeSpecs.id.toFixed(1) }} mm</span></div>
              <div><span class="text-gray-500">Berat:</span> <span class="font-semibold">{{ selectedPipeSpecs.weightPerM.toFixed(2) }} kg/m</span></div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Panjang per Batang (m)</label>
              <input v-model.number="pipe.length" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2" placeholder="e.g. 6">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Jumlah Batang</label>
              <input v-model.number="pipe.qty" type="number" class="w-full border rounded-lg px-3 py-2" placeholder="1">
            </div>
          </div>

          <div v-if="pipeResult" class="bg-teal-50 border border-teal-200 rounded-lg p-4 space-y-2">
            <h4 class="font-semibold text-teal-800">Hasil Perhitungan</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <span class="text-gray-600">Spesifikasi:</span>
              <span class="font-semibold text-right">{{ pipe.nps }}" {{ pipe.schedule === 'STD' || pipe.schedule === 'XS' || pipe.schedule === 'XXS' ? pipe.schedule : 'SCH ' + pipe.schedule }} {{ pipeMaterialLabel }}</span>
              <span class="text-gray-600">Berat per meter:</span>
              <span class="font-semibold text-right">{{ pipeResult.weightPerM.toFixed(2) }} kg/m</span>
              <span class="text-gray-600">Berat per batang:</span>
              <span class="font-semibold text-right">{{ pipeResult.weightPerBar.toFixed(2) }} kg</span>
              <span class="text-gray-600">Total panjang:</span>
              <span class="font-semibold text-right">{{ pipeResult.totalLength.toFixed(2) }} m</span>
              <span class="text-gray-600">Total berat:</span>
              <span class="font-semibold text-right">{{ pipeResult.totalWeight.toFixed(2) }} kg</span>
              <span class="font-bold text-teal-800">Total Dia.Inch:</span>
              <span class="font-bold text-right text-teal-700 text-lg">{{ pipeResult.totalDiaInch.toFixed(2) }} D.I</span>
              <span class="text-gray-600">Volume internal:</span>
              <span class="font-semibold text-right">{{ pipeResult.internalVolume.toFixed(4) }} m³</span>
            </div>
          </div>
        </div>

        <!-- 8. Bata / Brickwork -->
        <div v-if="activeCalc === 'brickwork'" class="space-y-4">
          <h3 class="text-lg font-bold text-gray-800">🧱 Kebutuhan Bata & Mortar</h3>
          <p class="text-sm text-gray-500">Hitung jumlah bata dan mortar untuk dinding</p>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Panjang Dinding (m)</label>
              <input v-model.number="brick.length" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tinggi Dinding (m)</label>
              <input v-model.number="brick.height" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tipe Bata</label>
              <select v-model="brick.type" class="w-full border rounded-lg px-3 py-2">
                <option value="merah">Bata Merah (25×12×6.5 cm)</option>
                <option value="ringan">Bata Ringan (60×20×10 cm)</option>
                <option value="batako">Batako (40×20×10 cm)</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tebal Spesi (cm)</label>
              <input v-model.number="brick.mortar" type="number" step="0.1" class="w-full border rounded-lg px-3 py-2" placeholder="1.5">
            </div>
          </div>

          <div v-if="brickResult" class="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
            <h4 class="font-semibold text-red-800">Hasil Perhitungan</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <span class="text-gray-600">Luas dinding:</span>
              <span class="font-semibold text-right">{{ brickResult.area.toFixed(2) }} m²</span>
              <span class="text-gray-600 font-bold">Jumlah bata:</span>
              <span class="font-bold text-right text-red-700 text-lg">{{ brickResult.brickCount }} buah</span>
              <span class="text-gray-600">Semen (PC):</span>
              <span class="font-semibold text-right">{{ brickResult.cement.toFixed(1) }} kg</span>
              <span class="text-gray-600">Pasir:</span>
              <span class="font-semibold text-right">{{ brickResult.sand.toFixed(3) }} m³</span>
            </div>
          </div>
        </div>

        <!-- 9. Konversi Satuan -->
        <div v-if="activeCalc === 'unit_convert'" class="space-y-4">
          <h3 class="text-lg font-bold text-gray-800">🔄 Konversi Satuan Konstruksi</h3>
          <p class="text-sm text-gray-500">Konversi antar satuan yang umum di konstruksi</p>
          
          <div class="grid grid-cols-5 gap-2 items-end">
            <div class="col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">Nilai</label>
              <input v-model.number="convert.value" type="number" step="any" class="w-full border rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Dari</label>
              <select v-model="convert.from" class="w-full border rounded-lg px-3 py-2 text-sm">
                <optgroup label="Panjang">
                  <option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="inch">inch</option><option value="ft">feet</option>
                </optgroup>
                <optgroup label="Luas">
                  <option value="m2">m²</option><option value="cm2">cm²</option><option value="ft2">ft²</option>
                </optgroup>
                <optgroup label="Volume">
                  <option value="m3">m³</option><option value="liter">liter</option><option value="ft3">ft³</option><option value="gallon">gallon</option>
                </optgroup>
                <optgroup label="Berat">
                  <option value="kg">kg</option><option value="ton">ton</option><option value="lb">lbs</option>
                </optgroup>
              </select>
            </div>
            <div class="text-center self-center text-gray-400 text-xl">→</div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Ke</label>
              <select v-model="convert.to" class="w-full border rounded-lg px-3 py-2 text-sm">
                <optgroup label="Panjang">
                  <option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="inch">inch</option><option value="ft">feet</option>
                </optgroup>
                <optgroup label="Luas">
                  <option value="m2">m²</option><option value="cm2">cm²</option><option value="ft2">ft²</option>
                </optgroup>
                <optgroup label="Volume">
                  <option value="m3">m³</option><option value="liter">liter</option><option value="ft3">ft³</option><option value="gallon">gallon</option>
                </optgroup>
                <optgroup label="Berat">
                  <option value="kg">kg</option><option value="ton">ton</option><option value="lb">lbs</option>
                </optgroup>
              </select>
            </div>
          </div>
          
          <div v-if="convertResult !== null" class="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-center">
            <span class="text-2xl font-bold text-indigo-700">{{ typeof convertResult === 'number' ? convertResult.toFixed(6) : convertResult }}</span>
            <span class="text-gray-600 ml-2">{{ convert.to }}</span>
          </div>
        </div>

        <!-- 10. Welding -->
        <div v-if="activeCalc === 'welding'" class="space-y-4">
          <h3 class="text-lg font-bold text-gray-800">⚡ Kebutuhan Kawat Las (Welding)</h3>
          <p class="text-sm text-gray-500">Estimasi kebutuhan kawat las/elektroda berdasarkan panjang dan tipe sambungan</p>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tipe Sambungan</label>
              <select v-model="welding.type" class="w-full border rounded-lg px-3 py-2">
                <option value="fillet">Fillet Weld</option>
                <option value="butt">Butt Weld (V-Groove)</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Ukuran Las / Throat (mm)</label>
              <input v-model.number="welding.size" type="number" step="0.5" class="w-full border rounded-lg px-3 py-2" placeholder="e.g. 6">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Panjang Las Total (m)</label>
              <input v-model.number="welding.length" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Waste (%)</label>
              <input v-model.number="welding.waste" type="number" class="w-full border rounded-lg px-3 py-2" placeholder="15">
            </div>
          </div>

          <div v-if="weldingResult" class="bg-gray-50 border border-gray-300 rounded-lg p-4 space-y-2">
            <h4 class="font-semibold text-gray-800">Hasil Perhitungan</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <span class="text-gray-600">Volume weld metal:</span>
              <span class="font-semibold text-right">{{ weldingResult.volumeCm3.toFixed(1) }} cm³</span>
              <span class="text-gray-600">Berat weld metal:</span>
              <span class="font-semibold text-right">{{ weldingResult.metalWeight.toFixed(2) }} kg</span>
              <span class="text-gray-600 font-bold">Kebutuhan elektroda:</span>
              <span class="font-bold text-right text-gray-800 text-lg">{{ weldingResult.electrodeWeight.toFixed(2) }} kg</span>
            </div>
          </div>
        </div>

      </div>

      <!-- Footer with Apply button -->
      <div class="p-4 border-t flex justify-between items-center">
        <div class="text-sm text-gray-500" v-if="currentResultValue !== null">
          Hasil: <strong class="text-gray-800">{{ currentResultValue }}</strong> {{ currentResultUnit }}
        </div>
        <div class="flex gap-2">
          <button @click="close" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Tutup</button>
          <button 
            v-if="currentResultValue !== null"
            @click="applyResult"
            class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            ✓ Terapkan ke Volume ({{ currentResultValue }})
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

defineProps<{
  visible: boolean;
  itemUnit?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'apply', value: number): void;
}>();

const activeCalc = ref<string | null>(null);

const calculators = [
  { id: 'steel_profile', icon: '⚙️', name: 'Berat Baja Profil', desc: 'Hitung berat baja siku, WF, UNP, CNP, pipa, plat berdasarkan ukuran dan panjang member' },
  { id: 'concrete_volume', icon: '🏗️', name: 'Volume Beton', desc: 'Hitung volume beton untuk pelat, kolom, balok, pondasi tapak, pile cap, retaining wall' },
  { id: 'rebar', icon: '🔩', name: 'Kebutuhan Tulangan', desc: 'Hitung berat tulangan besi beton (rebar) D10-D32 berdasarkan panjang dan waste factor' },
  { id: 'formwork', icon: '📐', name: 'Luas Bekisting', desc: 'Hitung luas bekisting (formwork) untuk kolom, balok, pelat, pondasi' },
  { id: 'earthwork', icon: '⛏️', name: 'Volume Galian Tanah', desc: 'Hitung volume galian tanah untuk pondasi, saluran, dan cut & fill' },
  { id: 'paint', icon: '🎨', name: 'Kebutuhan Cat', desc: 'Hitung kebutuhan cat berdasarkan luas area, daya sebar, dan jumlah lapis' },
  { id: 'pipe', icon: '🔧', name: 'Berat & Volume Pipa', desc: 'Hitung berat pipa baja carbon/stainless dan volume internal' },
  { id: 'brickwork', icon: '🧱', name: 'Kebutuhan Bata & Mortar', desc: 'Hitung jumlah bata merah/ringan/batako dan kebutuhan semen + pasir' },
  { id: 'unit_convert', icon: '🔄', name: 'Konversi Satuan', desc: 'Konversi panjang, luas, volume, berat (m/ft/inch/kg/ton/lbs dll)' },
  { id: 'welding', icon: '⚡', name: 'Kebutuhan Kawat Las', desc: 'Estimasi kebutuhan elektroda/kawat las berdasarkan tipe dan panjang sambungan' },
];

// --- Steel Profile Data ---
const sikuSizes = [
  { label: '20×20×3', weight: 0.88 }, { label: '25×25×3', weight: 1.12 },
  { label: '30×30×3', weight: 1.36 }, { label: '40×40×3', weight: 1.83 },
  { label: '40×40×4', weight: 2.41 }, { label: '40×40×5', weight: 2.97 },
  { label: '50×50×4', weight: 3.06 }, { label: '50×50×5', weight: 3.77 },
  { label: '50×50×6', weight: 4.47 }, { label: '60×60×5', weight: 4.57 },
  { label: '60×60×6', weight: 5.42 }, { label: '65×65×6', weight: 5.91 },
  { label: '70×70×6', weight: 6.38 }, { label: '70×70×7', weight: 7.38 },
  { label: '75×75×6', weight: 6.85 }, { label: '75×75×8', weight: 8.96 },
  { label: '75×75×9', weight: 9.96 }, { label: '80×80×6', weight: 7.34 },
  { label: '80×80×8', weight: 9.63 }, { label: '90×90×7', weight: 9.61 },
  { label: '90×90×8', weight: 10.90 }, { label: '90×90×10', weight: 13.40 },
  { label: '100×100×8', weight: 12.20 }, { label: '100×100×10', weight: 15.00 },
  { label: '100×100×12', weight: 17.80 }, { label: '120×120×10', weight: 18.20 },
  { label: '120×120×12', weight: 21.60 }, { label: '130×130×9', weight: 17.70 },
  { label: '130×130×12', weight: 23.40 }, { label: '150×150×12', weight: 27.30 },
  { label: '150×150×15', weight: 33.70 }, { label: '200×200×15', weight: 45.30 },
  { label: '200×200×20', weight: 59.40 }, { label: '250×250×25', weight: 93.00 },
];
const wfSizes = [
  { label: '100×50', weight: 9.30 }, { label: '100×100', weight: 17.20 },
  { label: '125×60', weight: 13.30 }, { label: '125×125', weight: 23.80 },
  { label: '148×100', weight: 21.40 }, { label: '150×75', weight: 14.00 },
  { label: '150×150', weight: 31.50 }, { label: '175×90', weight: 18.20 },
  { label: '198×99', weight: 18.20 }, { label: '200×100', weight: 21.30 },
  { label: '200×200', weight: 49.90 }, { label: '248×124', weight: 29.60 },
  { label: '250×125', weight: 29.60 }, { label: '250×250', weight: 72.40 },
  { label: '298×149', weight: 32.00 }, { label: '300×150', weight: 36.70 },
  { label: '300×200', weight: 56.80 }, { label: '300×300', weight: 94.00 },
  { label: '346×174', weight: 52.70 }, { label: '350×175', weight: 49.60 },
  { label: '350×350', weight: 137.00 }, { label: '396×199', weight: 56.60 },
  { label: '400×200', weight: 66.00 }, { label: '400×400', weight: 172.00 },
  { label: '446×199', weight: 66.20 }, { label: '450×200', weight: 76.00 },
  { label: '500×200', weight: 89.70 }, { label: '588×300', weight: 151.00 },
  { label: '600×200', weight: 106.00 }, { label: '600×300', weight: 151.00 },
  { label: '700×300', weight: 185.00 }, { label: '800×300', weight: 210.00 },
  { label: '900×300', weight: 243.00 },
];
const unpSizes = [
  { label: 'UNP 50', weight: 5.59 }, { label: 'UNP 65', weight: 7.09 },
  { label: 'UNP 80', weight: 8.64 }, { label: 'UNP 100', weight: 10.60 },
  { label: 'UNP 120', weight: 13.40 }, { label: 'UNP 140', weight: 16.00 },
  { label: 'UNP 150', weight: 18.00 }, { label: 'UNP 160', weight: 18.80 },
  { label: 'UNP 180', weight: 22.00 }, { label: 'UNP 200', weight: 25.30 },
  { label: 'UNP 220', weight: 29.40 }, { label: 'UNP 240', weight: 33.20 },
  { label: 'UNP 260', weight: 37.90 }, { label: 'UNP 280', weight: 41.80 },
  { label: 'UNP 300', weight: 46.20 }, { label: 'UNP 350', weight: 60.60 },
  { label: 'UNP 380', weight: 63.10 }, { label: 'UNP 400', weight: 71.80 },
];
const cnpSizes = [
  { label: 'CNP 60×30×10×1.6', weight: 1.62 }, { label: 'CNP 75×35×15×1.6', weight: 2.18 },
  { label: 'CNP 75×45×15×2.3', weight: 3.29 }, { label: 'CNP 100×50×20×2.3', weight: 4.07 },
  { label: 'CNP 100×50×20×3.2', weight: 5.57 }, { label: 'CNP 125×50×20×2.3', weight: 4.64 },
  { label: 'CNP 125×50×20×3.2', weight: 6.36 }, { label: 'CNP 150×50×20×2.3', weight: 5.21 },
  { label: 'CNP 150×50×20×3.2', weight: 7.15 }, { label: 'CNP 150×65×20×2.3', weight: 5.92 },
  { label: 'CNP 150×65×20×3.2', weight: 8.12 }, { label: 'CNP 200×75×20×2.3', weight: 7.33 },
  { label: 'CNP 200×75×20×3.2', weight: 10.10 },
];
const rebarSizes = [
  { dia: 6, weight: 0.222 }, { dia: 8, weight: 0.395 },
  { dia: 10, weight: 0.617 }, { dia: 12, weight: 0.888 },
  { dia: 13, weight: 1.042 }, { dia: 14, weight: 1.208 },
  { dia: 16, weight: 1.578 }, { dia: 19, weight: 2.226 },
  { dia: 22, weight: 2.984 }, { dia: 25, weight: 3.853 },
  { dia: 28, weight: 4.834 }, { dia: 29, weight: 5.185 },
  { dia: 32, weight: 6.313 }, { dia: 36, weight: 7.990 },
  { dia: 40, weight: 9.865 },
];

// --- Reactive state for each calculator ---
const steel = ref<any>({ type: '', length: 6, qty: 1 });
const concrete = ref<any>({ shape: '', qty: 1, waste: 5 });
const rebar = ref<any>({ diameter: null, barLength: 12, totalLength: 0, waste: 10 });
const formwork = ref<any>({ type: '', qty: 1 });
const earthwork = ref<any>({ type: '', qty: 1 });
const paint = ref<any>({ coverage: 11, coats: 2 });
const pipe = ref<any>({ nps: '', schedule: '', material: 'cs', qty: 1 });

// --- Pipe Schedule Database (ASME B36.10M) ---
const pipeScheduleData: Record<string, { od: number, nps: number, sch: Record<string, number> }> = {
  '1/2': { od: 21.3, nps: 0.5, sch: { '5': 1.65, '10': 2.11, 'STD': 2.77, '40': 2.77, 'XS': 3.73, '80': 3.73, '160': 4.78, 'XXS': 7.47 } },
  '3/4': { od: 26.7, nps: 0.75, sch: { '5': 1.65, '10': 2.11, 'STD': 2.87, '40': 2.87, 'XS': 3.91, '80': 3.91, '160': 5.56, 'XXS': 7.82 } },
  '1': { od: 33.4, nps: 1, sch: { '5': 1.65, '10': 2.77, 'STD': 3.38, '40': 3.38, 'XS': 4.55, '80': 4.55, '160': 6.35, 'XXS': 9.09 } },
  '1-1/4': { od: 42.2, nps: 1.25, sch: { '5': 1.65, '10': 2.77, 'STD': 3.56, '40': 3.56, 'XS': 4.85, '80': 4.85, '160': 6.35, 'XXS': 9.70 } },
  '1-1/2': { od: 48.3, nps: 1.5, sch: { '5': 1.65, '10': 2.77, 'STD': 3.68, '40': 3.68, 'XS': 5.08, '80': 5.08, '160': 7.14, 'XXS': 10.15 } },
  '2': { od: 60.3, nps: 2, sch: { '5': 1.65, '10': 2.77, 'STD': 3.91, '40': 3.91, 'XS': 5.54, '80': 5.54, '160': 8.74, 'XXS': 11.07 } },
  '2-1/2': { od: 73.0, nps: 2.5, sch: { '5': 2.11, '10': 3.05, 'STD': 5.16, '40': 5.16, 'XS': 7.01, '80': 7.01, '160': 9.53, 'XXS': 14.02 } },
  '3': { od: 88.9, nps: 3, sch: { '5': 2.11, '10': 3.05, 'STD': 5.49, '40': 5.49, 'XS': 7.62, '80': 7.62, '160': 11.13, 'XXS': 15.24 } },
  '3-1/2': { od: 101.6, nps: 3.5, sch: { '5': 2.11, '10': 3.05, 'STD': 5.74, '40': 5.74, 'XS': 8.08, '80': 8.08 } },
  '4': { od: 114.3, nps: 4, sch: { '5': 2.11, '10': 3.05, 'STD': 6.02, '40': 6.02, 'XS': 8.56, '80': 8.56, '120': 11.13, '160': 13.49, 'XXS': 17.12 } },
  '5': { od: 141.3, nps: 5, sch: { '5': 2.77, '10': 3.40, 'STD': 6.55, '40': 6.55, 'XS': 9.53, '80': 9.53, '120': 12.70, '160': 15.88, 'XXS': 19.05 } },
  '6': { od: 168.3, nps: 6, sch: { '5': 2.77, '10': 3.40, 'STD': 7.11, '40': 7.11, 'XS': 10.97, '80': 10.97, '120': 14.27, '160': 18.26, 'XXS': 21.95 } },
  '8': { od: 219.1, nps: 8, sch: { '5': 2.77, '10': 3.76, '20': 6.35, '30': 7.04, 'STD': 8.18, '40': 8.18, '60': 10.31, 'XS': 12.70, '80': 12.70, '100': 15.09, '120': 18.26, '140': 20.62, '160': 23.01, 'XXS': 22.23 } },
  '10': { od: 273.1, nps: 10, sch: { '5': 3.40, '10': 4.19, '20': 6.35, '30': 7.80, 'STD': 9.27, '40': 9.27, '60': 12.70, 'XS': 12.70, '80': 15.09, '100': 18.26, '120': 21.44, '140': 25.40, '160': 28.58 } },
  '12': { od: 323.9, nps: 12, sch: { '5': 3.96, '10': 4.57, '20': 6.35, '30': 8.38, 'STD': 9.53, '40': 10.31, '60': 14.27, 'XS': 12.70, '80': 17.48, '100': 21.44, '120': 25.40, '140': 28.58, '160': 33.32 } },
  '14': { od: 355.6, nps: 14, sch: { '5': 3.96, '10': 4.78, '20': 7.92, '30': 9.53, 'STD': 9.53, '40': 11.13, '60': 15.09, 'XS': 12.70, '80': 19.05, '100': 23.83, '120': 27.79, '140': 31.75, '160': 35.71 } },
  '16': { od: 406.4, nps: 16, sch: { '5': 4.19, '10': 4.78, '20': 7.92, '30': 9.53, 'STD': 9.53, '40': 12.70, '60': 16.66, 'XS': 12.70, '80': 21.44, '100': 26.19, '120': 30.96, '140': 36.53, '160': 40.49 } },
  '18': { od: 457.2, nps: 18, sch: { '5': 4.19, '10': 4.78, '20': 7.92, '30': 11.13, 'STD': 9.53, '40': 14.27, '60': 19.05, 'XS': 12.70, '80': 23.83, '100': 29.36, '120': 34.93, '140': 39.67, '160': 45.24 } },
  '20': { od: 508.0, nps: 20, sch: { '5': 4.78, '10': 5.54, '20': 9.53, '30': 12.70, 'STD': 9.53, '40': 15.09, '60': 20.62, 'XS': 12.70, '80': 26.19, '100': 32.54, '120': 38.10, '140': 44.45, '160': 50.01 } },
  '24': { od: 609.6, nps: 24, sch: { '5': 5.54, '10': 6.35, '20': 9.53, '30': 14.27, 'STD': 9.53, '40': 17.48, '60': 24.61, 'XS': 12.70, '80': 30.96, '100': 38.89, '120': 46.02, '140': 52.37, '160': 59.54 } },
};

const pipeNpsList = Object.keys(pipeScheduleData);

const pipeMaterialDensity: Record<string, number> = { cs: 7850, ss304: 8000, ss316: 8027, galv: 7850 };
const pipeMaterialLabels: Record<string, string> = { cs: 'CS', ss304: 'SS304', ss316: 'SS316', galv: 'GALV' };

const pipeMaterialLabel = computed(() => pipeMaterialLabels[pipe.value.material] || 'CS');

const availablePipeSchedules = computed(() => {
  if (!pipe.value.nps) return [];
  const data = pipeScheduleData[pipe.value.nps];
  if (!data) return [];
  const order = ['5', '10', '20', '30', 'STD', '40', '60', 'XS', '80', '100', '120', '140', '160', 'XXS'];
  return order.filter(s => data.sch[s] !== undefined);
});

const selectedPipeSpecs = computed(() => {
  const p = pipe.value;
  if (!p.nps || !p.schedule) return null;
  const data = pipeScheduleData[p.nps];
  if (!data) return null;
  const wt = data.sch[p.schedule];
  if (!wt) return null;
  const od = data.od;
  const id = od - 2 * wt;
  const density = pipeMaterialDensity[p.material] || 7850;
  const factor = Math.PI * density / 1000000;
  const weightPerM = (od - wt) * wt * factor;
  return { od, wt, id, weightPerM };
});

watch(() => pipe.value.nps, () => { pipe.value.schedule = ''; });
const brick = ref<any>({ type: 'merah', mortar: 1.5 });
const convert = ref<any>({ value: 0, from: 'm', to: 'ft' });
const welding = ref<any>({ type: 'fillet', size: 6, waste: 15 });

// --- Computed Results ---
const steelResult = computed(() => {
  const s = steel.value;
  let wpm = 0;
  if (s.type === 'siku' && s.siku_size) wpm = s.siku_size.weight;
  else if (s.type === 'wf' && s.wf_size) wpm = s.wf_size.weight;
  else if (s.type === 'unp' && s.unp_size) wpm = s.unp_size.weight;
  else if (s.type === 'cnp' && s.cnp_size) wpm = s.cnp_size.weight;
  else if (s.type === 'pipa_bulat' && s.od && s.thickness) {
    wpm = (s.od - s.thickness) * s.thickness * 0.02466;
  } else if (s.type === 'pipa_kotak' && s.box_w && s.box_h && s.thickness) {
    const perimeter = 2 * ((s.box_w - 2 * s.thickness) + (s.box_h - 2 * s.thickness)) + 4 * Math.PI * s.thickness / 2;
    wpm = perimeter * s.thickness * 7.85 / 1000;
  } else if (s.type === 'plat' && s.plat_w && s.plat_t) {
    wpm = s.plat_w * s.plat_t * 7.85 / 1000;
  } else return null;
  if (!wpm || !s.length || !s.qty) return null;
  return {
    weightPerM: wpm,
    weightPerBar: wpm * s.length,
    totalLength: s.length * s.qty,
    totalWeight: wpm * s.length * s.qty,
  };
});

const concreteResult = computed(() => {
  const c = concrete.value;
  let vol = 0;
  if (c.shape === 'slab' && c.length && c.width && c.thickness) vol = c.length * c.width * c.thickness;
  else if (c.shape === 'column_rect' && c.width && c.depth && c.height) vol = c.width * c.depth * c.height;
  else if (c.shape === 'column_round' && c.diameter && c.height) vol = Math.PI * (c.diameter / 2) ** 2 * c.height;
  else if (c.shape === 'beam' && c.width && c.height && c.length) vol = c.width * c.height * c.length;
  else if (c.shape === 'footing' && c.length && c.width && c.height) vol = c.length * c.width * c.height;
  else if (c.shape === 'pile_cap' && c.length && c.width && c.height) vol = c.length * c.width * c.height;
  else if (c.shape === 'retaining_wall' && c.length && c.height && c.thickness) vol = c.length * c.height * c.thickness;
  else return null;
  const qty = c.qty || 1;
  const waste = c.waste || 5;
  const totalVol = vol * qty;
  const wasteVol = totalVol * waste / 100;
  return {
    volumePerUnit: vol,
    volumeTotal: totalVol,
    wasteVolume: wasteVol,
    totalWithWaste: totalVol + wasteVol,
    weight: (totalVol + wasteVol) * 2400,
  };
});

const rebarResult = computed(() => {
  const r = rebar.value;
  if (!r.diameter || !r.totalLength) return null;
  const wpm = r.diameter.weight;
  const waste = r.waste || 10;
  const totalLen = r.totalLength * (1 + waste / 100);
  const barLen = r.barLength || 12;
  return {
    weightPerM: wpm,
    totalLengthWithWaste: totalLen,
    barCount: Math.ceil(totalLen / barLen),
    totalWeight: totalLen * wpm,
  };
});

const formworkResult = computed(() => {
  const f = formwork.value;
  let area = 0;
  if (f.type === 'column_rect' && f.width && f.depth && f.height) area = 2 * (f.width + f.depth) * f.height;
  else if (f.type === 'column_round' && f.diameter && f.height) area = Math.PI * f.diameter * f.height;
  else if (f.type === 'beam' && f.width && f.height && f.length) area = (f.width + 2 * f.height) * f.length;
  else if (f.type === 'slab' && f.length && f.width) area = f.length * f.width;
  else if (f.type === 'footing' && f.length && f.width && f.height) area = 2 * (f.length + f.width) * f.height;
  else if (f.type === 'wall' && f.length && f.height) area = 2 * f.length * f.height;
  else return null;
  const qty = f.qty || 1;
  return { areaPerUnit: area, totalArea: area * qty };
});

const earthworkResult = computed(() => {
  const e = earthwork.value;
  let vol = 0;
  if (e.type === 'rectangular' && e.length && e.width && e.depth) vol = e.length * e.width * e.depth;
  else if (e.type === 'trench' && e.length && e.width && e.depth) vol = e.length * e.width * e.depth;
  else if (e.type === 'sloped' && e.length && e.depth && e.widthTop && e.widthBottom) vol = e.length * e.depth * (e.widthTop + e.widthBottom) / 2;
  else return null;
  const qty = e.qty || 1;
  const total = vol * qty;
  return { volumePerUnit: vol, totalVolume: total, swellVolume: total * 1.3 };
});

const paintResult = computed(() => {
  const p = paint.value;
  if (!p.length || !p.height) return null;
  const area = p.length * p.height;
  const coverage = p.coverage || 11;
  const coats = p.coats || 2;
  const litersPerCoat = area / coverage;
  const total = litersPerCoat * coats;
  return { area, litersPerCoat, totalLiters: total, cans5kg: Math.ceil(total / 5) };
});

const pipeResult = computed(() => {
  const specs = selectedPipeSpecs.value;
  const p = pipe.value;
  if (!specs || !p.length) return null;
  const qty = p.qty || 1;
  const totalLength = p.length * qty;
  const npsInch = pipeScheduleData[p.nps]?.nps || 0;
  const intVol = Math.PI * (specs.id / 2000) ** 2 * p.length * qty;
  return {
    weightPerM: specs.weightPerM,
    weightPerBar: specs.weightPerM * p.length,
    totalLength,
    totalWeight: specs.weightPerM * totalLength,
    totalDiaInch: npsInch * totalLength,
    internalVolume: intVol,
  };
});

const brickResult = computed(() => {
  const b = brick.value;
  if (!b.length || !b.height) return null;
  const area = b.length * b.height;
  let bricksPerM2 = 0;
  let mortarPerM2 = 0;
  if (b.type === 'merah') { bricksPerM2 = 70; mortarPerM2 = 0.032; }
  else if (b.type === 'ringan') { bricksPerM2 = 8.33; mortarPerM2 = 0.012; }
  else if (b.type === 'batako') { bricksPerM2 = 12.5; mortarPerM2 = 0.02; }
  const count = Math.ceil(area * bricksPerM2 * 1.05);
  const mortarVol = area * mortarPerM2;
  return {
    area,
    brickCount: count,
    cement: mortarVol * 400,
    sand: mortarVol * 1.2,
  };
});

const conversionFactors: Record<string, Record<string, number>> = {
  mm: { mm: 1, cm: 0.1, m: 0.001, inch: 0.03937, ft: 0.003281 },
  cm: { mm: 10, cm: 1, m: 0.01, inch: 0.3937, ft: 0.03281 },
  m: { mm: 1000, cm: 100, m: 1, inch: 39.3701, ft: 3.28084 },
  inch: { mm: 25.4, cm: 2.54, m: 0.0254, inch: 1, ft: 0.08333 },
  ft: { mm: 304.8, cm: 30.48, m: 0.3048, inch: 12, ft: 1 },
  m2: { m2: 1, cm2: 10000, ft2: 10.7639 },
  cm2: { m2: 0.0001, cm2: 1, ft2: 0.00107639 },
  ft2: { m2: 0.092903, cm2: 929.03, ft2: 1 },
  m3: { m3: 1, liter: 1000, ft3: 35.3147, gallon: 264.172 },
  liter: { m3: 0.001, liter: 1, ft3: 0.03531, gallon: 0.26417 },
  ft3: { m3: 0.02832, liter: 28.3168, ft3: 1, gallon: 7.48052 },
  gallon: { m3: 0.003785, liter: 3.78541, ft3: 0.13368, gallon: 1 },
  kg: { kg: 1, ton: 0.001, lb: 2.20462 },
  ton: { kg: 1000, ton: 1, lb: 2204.62 },
  lb: { kg: 0.45359, ton: 0.000454, lb: 1 },
};

const convertResult = computed(() => {
  const c = convert.value;
  if (!c.value || !c.from || !c.to) return null;
  const group = conversionFactors[c.from];
  if (!group || group[c.to] === undefined) return 'Konversi tidak tersedia';
  return c.value * group[c.to];
});

const weldingResult = computed(() => {
  const w = welding.value;
  if (!w.size || !w.length) return null;
  const sizeMm = w.size;
  const lengthMm = w.length * 1000;
  let crossSection = 0;
  if (w.type === 'fillet') crossSection = 0.5 * sizeMm * sizeMm;
  else crossSection = 0.5 * sizeMm * sizeMm * 0.7;
  const volumeMm3 = crossSection * lengthMm;
  const volumeCm3 = volumeMm3 / 1000;
  const metalWeight = volumeCm3 * 7.85 / 1000;
  const waste = w.waste || 15;
  return {
    volumeCm3,
    metalWeight,
    electrodeWeight: metalWeight * (1 + waste / 100) / 0.65,
  };
});

// Current result for "Apply" button
const currentResultValue = computed(() => {
  if (activeCalc.value === 'steel_profile' && steelResult.value) return Math.round(steelResult.value.totalWeight * 100) / 100;
  if (activeCalc.value === 'concrete_volume' && concreteResult.value) return Math.round(concreteResult.value.totalWithWaste * 1000) / 1000;
  if (activeCalc.value === 'rebar' && rebarResult.value) return Math.round(rebarResult.value.totalWeight * 100) / 100;
  if (activeCalc.value === 'formwork' && formworkResult.value) return Math.round(formworkResult.value.totalArea * 100) / 100;
  if (activeCalc.value === 'earthwork' && earthworkResult.value) return Math.round(earthworkResult.value.totalVolume * 1000) / 1000;
  if (activeCalc.value === 'paint' && paintResult.value) return Math.round(paintResult.value.totalLiters * 10) / 10;
  if (activeCalc.value === 'pipe' && pipeResult.value) return Math.round(pipeResult.value.totalDiaInch * 100) / 100;
  if (activeCalc.value === 'brickwork' && brickResult.value) return brickResult.value.brickCount;
  if (activeCalc.value === 'welding' && weldingResult.value) return Math.round(weldingResult.value.electrodeWeight * 100) / 100;
  return null;
});

const currentResultUnit = computed(() => {
  if (activeCalc.value === 'steel_profile') return 'kg';
  if (activeCalc.value === 'concrete_volume') return 'm³';
  if (activeCalc.value === 'rebar') return 'kg';
  if (activeCalc.value === 'formwork') return 'm²';
  if (activeCalc.value === 'earthwork') return 'm³';
  if (activeCalc.value === 'paint') return 'liter';
  if (activeCalc.value === 'pipe') return 'D.I';
  if (activeCalc.value === 'brickwork') return 'buah';
  if (activeCalc.value === 'welding') return 'kg';
  return '';
});

const close = () => {
  activeCalc.value = null;
  emit('close');
};

const applyResult = () => {
  if (currentResultValue.value !== null) {
    emit('apply', currentResultValue.value);
    close();
  }
};
</script>
