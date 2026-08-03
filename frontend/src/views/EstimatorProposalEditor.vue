<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header (Sticky) -->
    <div class="bg-white border-b sticky top-0 z-40 shadow-sm">
      <div class="px-6 py-4">
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-4">
              <button @click="$router.back()" class="text-gray-600 hover:text-gray-800">
                ← Back
              </button>
              <div>
                <h1 class="text-xl font-bold text-gray-800">{{ proposal?.project_name || 'Loading...' }}</h1>
                <p class="text-sm text-gray-600">
                  {{ proposal?.proposal_number }} | {{ proposal?.revision }} 
                  <span :class="statusBadgeClass" class="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold">
                    {{ proposal?.status?.toUpperCase() }}
                  </span>
                </p>
              </div>
            </div>
            <div class="mt-2 flex gap-4 text-sm text-gray-600">
              <span><strong>Client:</strong> {{ proposal?.client || '-' }}</span>
              <span><strong>Lokasi:</strong> {{ proposal?.lokasi || '-' }}</span>
            </div>
            <!-- Status Stepper -->
            <div class="mt-3 flex items-center gap-1 text-xs">
              <span v-for="(step, i) in statusSteps" :key="step.key" class="flex items-center gap-1">
                <span v-if="i > 0" class="text-gray-300 mx-1">→</span>
                <span :class="[
                  'px-2 py-0.5 rounded-full font-medium',
                  proposal?.status === step.key ? step.activeClass : 
                  statusStepIndex(proposal?.status) > i ? 'bg-gray-200 text-gray-500 line-through' :
                  'bg-gray-100 text-gray-400'
                ]">{{ step.label }}</span>
              </span>
            </div>
          </div>
          
          <div class="flex gap-2">
            <button @click="showWizardModal = true" class="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center gap-1.5">
              🧙 Wizard
            </button>
            <button @click="viewRAB" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
              📋 View RAB
            </button>
            <button @click="showResume = true" class="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">
              📊 Resume
            </button>
            <button class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              📥 Export Excel
            </button>
            
            <!-- Status Workflow Buttons -->
            <!-- Draft → Review -->
            <button v-if="proposal?.status === 'draft'" @click="changeStatus('review')" 
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              📤 Submit to Review
            </button>
            <!-- Review → Back to Draft -->
            <button v-if="proposal?.status === 'review'" @click="changeStatus('draft')" 
              class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              ↩ Back to Draft
            </button>
            <!-- Review → Submitted -->
            <button v-if="proposal?.status === 'review'" @click="changeStatus('submitted')" 
              class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
              📨 Submit to Client
            </button>
            <!-- Submitted → Back to Review -->
            <button v-if="proposal?.status === 'submitted'" @click="changeStatus('review')" 
              class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              ↩ Back to Review
            </button>
            <!-- Submitted → Deal -->
            <button v-if="proposal?.status === 'submitted'" @click="changeStatus('deal')" 
              class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
              🤝 Deal (Kontrak)
            </button>
            <!-- Submitted → No Deal -->
            <button v-if="proposal?.status === 'submitted'" @click="changeStatus('no_deal')" 
              class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
              ✗ No Deal
            </button>
            <!-- No Deal → Re-open -->
            <button v-if="proposal?.status === 'no_deal'" @click="changeStatus('draft')" 
              class="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700">
              🔄 Re-open as Draft
            </button>
            <!-- Deal → Go to Project -->
            <router-link v-if="proposal?.status === 'deal' && proposal?.project_id" 
              :to="`/projects/${proposal.project_id}`"
              class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 inline-flex items-center">
              📂 Open Project
            </router-link>
          </div>
        </div>
      </div>
    </div>

    <div class="flex">
      <!-- Main Content Area -->
      <div class="flex-1 p-6">

        <!-- Tab Navigation -->
        <div class="flex gap-1 mb-4 bg-white border rounded-xl p-1 w-fit shadow-sm">
          <button @click="activeProposalTab = 'rab'"
            :class="activeProposalTab === 'rab' ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'"
            class="px-5 py-2 rounded-lg text-sm font-semibold transition-all">
            📋 RAB / Anggaran
          </button>
          <button @click="activeProposalTab = 'mto'"
            :class="activeProposalTab === 'mto' ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'"
            class="px-5 py-2 rounded-lg text-sm font-semibold transition-all">
            📐 MTO / Kalkulasi
          </button>
          <button @click="activeProposalTab = 'schedule'; loadSchedule()"
            :class="activeProposalTab === 'schedule' ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'"
            class="px-5 py-2 rounded-lg text-sm font-semibold transition-all">
            📅 Master Schedule
          </button>
          <button @click="activeProposalTab = 'payment'; loadPaymentSchedule()"
            :class="activeProposalTab === 'payment' ? 'bg-emerald-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'"
            class="px-5 py-2 rounded-lg text-sm font-semibold transition-all">
            💰 Payment Schedule
          </button>
        </div>

        <!-- ═══ RAB TAB ═══ -->
        <div v-show="activeProposalTab === 'rab'">
        <!-- Items Table (Excel-like) -->
        <div class="bg-white rounded-lg shadow overflow-x-auto">
          <!-- Add AHSP Button -->
          <div class="p-4 border-b bg-gray-50">
            <button v-if="isEditable" @click="openAHSPModal" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
              + Tambah Pekerjaan (AHSP)
            </button>
            <span v-else class="text-sm text-gray-500 italic">
              {{ proposal?.status === 'deal' ? '🔒 Proposal terkunci (Deal/Kontrak)' : '📋 Proposal sudah di-submit, tidak bisa diedit' }}
            </span>
          </div>

          <!-- Table -->
          <table class="min-w-full text-sm table-fixed">
            <thead class="bg-blue-600 text-white">
              <tr>
                <th class="px-3 py-2 text-left w-12">No</th>
                <th class="px-3 py-2 text-left min-w-[150px]">Disiplin</th>
                <th class="px-3 py-2 text-left min-w-[150px]">Sub-Disiplin</th>
                <th class="px-3 py-2 text-left min-w-[200px]">Deskripsi</th>
                <th class="px-3 py-2 text-left" style="width:300px; min-width:200px; max-width:300px;">Uraian Pekerjaan</th>
                <th class="px-3 py-2 text-left w-32">Kode</th>
                <th class="px-3 py-2 text-right w-24">Volume</th>
                <th class="px-3 py-2 text-center w-16">Sat</th>
                <th class="px-3 py-2 text-right w-32">Harga Satuan</th>
                <th class="px-3 py-2 text-right w-32">Jumlah Harga</th>
                <th class="px-3 py-2 text-center w-28">Action</th>
              </tr>
            </thead>
            <tbody>
              <!-- Data Rows -->
              <template v-for="(item, index) in items" :key="item.id">
                <!-- Section Header Row -->
                <tr v-if="item.is_section" class="bg-blue-50 border-b-2 border-blue-200">
                  <td class="px-3 py-2 font-bold text-blue-800">{{ item.ahsp_code_snapshot }}</td>
                  <td colspan="9" class="px-3 py-2 font-bold text-blue-800 text-base uppercase">
                    {{ item.ahsp_name_snapshot }}
                  </td>
                  <td class="px-3 py-2 text-center">
                    <button v-if="isEditable" @click="deleteItem(item.id)" class="text-red-400 hover:text-red-600 text-xs" title="Hapus section">
                      🗑️
                    </button>
                  </td>
                </tr>
                <!-- Normal Item Row -->
                <tr v-else class="border-b hover:bg-gray-50">
                  <td class="px-3 py-2 text-center text-gray-600">{{ getItemNumber(index) }}</td>
                <td class="px-3 py-2 font-medium text-gray-900">{{ item.discipline_name || '-' }}</td>
                <td class="px-3 py-2 text-gray-700">{{ item.sub_discipline_name || '-' }}</td>
                <td class="px-3 py-2">
                  <input 
                    v-model="item.description" 
                    @blur="updateItemDescription(item)"
                    type="text" 
                    placeholder="Tambah deskripsi..."
                    :disabled="!isEditable"
                    class="w-full border border-gray-300 rounded px-2 py-1 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
                  >
                </td>
                <td class="px-3 py-2 align-top" style="max-width:300px; word-break:break-word;">
                  <!-- No AHSP assigned yet -->
                  <div v-if="!item.ahsp_id || item.ahsp_id === 0" class="flex items-start gap-1">
                    <span class="text-gray-400 text-xs italic flex-1 whitespace-normal break-words leading-relaxed">{{ item.ahsp_name_snapshot }}</span>
                    <button v-if="isEditable" @click="openAssignAHSP(item)"
                      class="shrink-0 px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded border border-blue-200 hover:bg-blue-100 whitespace-nowrap"
                      title="Cari & assign AHSP">
                      🔗 AHSP
                    </button>
                  </div>

                  <!-- AHSP already assigned -->
                  <div v-else class="flex items-start gap-1.5 group">
                    <button @click="viewAHSPDetail(item.ahsp_id)"
                      class="text-blue-600 hover:underline text-left text-sm flex-1 whitespace-normal break-words leading-relaxed"
                      :title="item.ahsp_name_snapshot">
                      {{ item.ahsp_name_snapshot }}
                    </button>
                    <!-- Change AHSP button — only when editable -->
                    <button v-if="isEditable"
                      @click="openAssignAHSP(item)"
                      class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 px-1.5 py-0.5 text-xs bg-orange-50 text-orange-600 rounded border border-orange-200 hover:bg-orange-100 whitespace-nowrap"
                      title="Ganti AHSP">
                      🔄 Ganti
                    </button>
                  </div>
                </td>
                <td class="px-3 py-2 text-gray-600 font-mono text-xs">{{ item.ahsp_code_snapshot }}</td>
                <td class="px-3 py-2">
                  <div class="flex items-center gap-1">
                    <!-- MTO linked indicator -->
                    <span v-if="item.mto_link" class="shrink-0 px-1 py-0.5 text-[9px] bg-green-100 text-green-700 rounded font-bold cursor-pointer" @click="unlinkMTO(item)" title="Linked ke MTO — klik untuk unlink">🔗MTO</span>
                    <input 
                      v-model.number="item.qty" 
                      @blur="updateItemQty(item)"
                      type="number" 
                      step="0.001"
                      :disabled="!isEditable || !!item.mto_link"
                      class="w-full text-right border border-gray-300 rounded px-2 py-1 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-green-50 disabled:text-green-800 disabled:font-semibold"
                      :class="{ 'border-green-400': item.mto_link }"
                    >
                  </div>
                </td>
                <td class="px-3 py-2 text-center text-gray-600">{{ item.mto_link ? item.mto_link.unit : item.unit_snapshot }}</td>
                <td class="px-3 py-2 text-right font-medium text-gray-900">{{ formatNumber(item.unit_price_snapshot) }}</td>
                <td class="px-3 py-2 text-right font-bold text-gray-900">{{ formatNumber(item.total_price) }}</td>
                <td class="px-3 py-2 text-center flex items-center justify-center gap-1">
                  <button @click="openCalculator(item)" class="w-7 h-7 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-600 flex items-center justify-center" title="Construction Calculator">
                    🧮
                  </button>
                  <!-- MTO Link button -->
                  <button v-if="isEditable" @click="openMTOPicker(item)"
                    class="w-7 h-7 rounded-md flex items-center justify-center text-sm transition-colors"
                    :class="item.mto_link ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-teal-50 text-teal-600 hover:bg-teal-100'"
                    :title="item.mto_link ? 'Linked ke MTO: ' + item.mto_link.element_name : 'Link ke MTO'">
                    🔗
                  </button>
                  <button v-if="isEditable" @click="deleteItem(item.id)" class="text-red-600 hover:text-red-800">
                    🗑️
                  </button>
                </td>
              </tr>
              </template>

              <!-- Empty State -->
              <tr v-if="items.length === 0">
                <td colspan="11" class="px-3 py-8 text-center text-gray-500">
                  <p>Belum ada pekerjaan. Klik "+ Tambah Pekerjaan" untuk mulai menambahkan item</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        </div><!-- end RAB tab -->

        <!-- ═══ MTO TAB ═══ -->
        <div v-show="activeProposalTab === 'mto'">
          <ProjectMTO
            :project-id="proposalId"
            api-base="/estimator/proposals"
          />
        </div><!-- end MTO tab -->

        <!-- ═══ SCHEDULE TAB ═══ -->
        <div v-show="activeProposalTab === 'schedule'" class="space-y-4">

          <!-- Settings Bar -->
          <div class="bg-white rounded-lg shadow p-4 flex flex-wrap gap-4 items-end">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">📅 Tanggal Mulai</label>
              <input v-model="scheduleStartDate" type="date" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">👷 Pekerja/Hari</label>
              <input v-model.number="scheduleWorkers" type="number" min="1" max="100" class="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-center">
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">⏱ Jam/Hari</label>
              <input v-model.number="scheduleHours" type="number" min="4" max="16" class="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-center">
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">📆 Hari Kerja/Minggu</label>
              <input v-model.number="scheduleWorkDaysPerWeek" type="number" min="5" max="7" class="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-center">
            </div>
            <button @click="loadSchedule" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700">
              🔄 Hitung Ulang
            </button>
            <div v-if="scheduleData" class="ml-auto text-sm text-gray-600">
              <span class="font-semibold text-indigo-700">Total: {{ Math.round(scheduleData.total_duration_days) }} hari kerja</span>
              <span class="ml-2">(≈ {{ Math.ceil(scheduleData.total_duration_days / scheduleWorkDaysPerWeek) }} minggu)</span>
            </div>
          </div>

          <!-- Loading -->
          <div v-if="scheduleLoading" class="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            <div class="text-4xl mb-3">⏳</div><p>Menghitung durasi dari koefisien AHSP...</p>
          </div>

          <!-- Unified Table: WBS + Gantt in ONE table (rows always aligned) -->
          <div v-else-if="scheduleData" class="bg-white rounded-lg shadow overflow-hidden">
            <div class="overflow-x-auto" style="max-height: calc(100vh - 320px); overflow-y: auto">
              <table style="border-collapse: collapse; table-layout: fixed; min-width: max-content">
                <colgroup>
                  <col style="width:220px">
                  <col style="width:90px">
                  <col style="width:60px">
                  <col style="width:55px">
                  <col v-for="w in ganttWeeks" :key="'col-'+w.label" :style="`width:${ganttDayWidth*7}px`">
                </colgroup>
                <thead>
                  <tr style="background:#3730a3; color:white; font-size:11px; position:sticky; top:0; z-index:30">
                    <th class="text-left px-3 py-2" style="position:sticky;left:0;z-index:31;background:#3730a3;border-right:1px solid #4338ca">Uraian Pekerjaan</th>
                    <th class="text-right px-2 py-2" style="position:sticky;left:220px;z-index:31;background:#3730a3;border-right:1px solid #4338ca">Qty</th>
                    <th class="text-right px-2 py-2" style="position:sticky;left:310px;z-index:31;background:#3730a3;border-right:1px solid #4338ca">OH</th>
                    <th class="text-right px-2 py-2" style="position:sticky;left:370px;z-index:31;background:#3730a3;border-right:2px solid #6d28d9">Hari</th>
                    <th v-for="w in ganttWeeks" :key="w.label"
                      class="text-center px-1 py-2"
                      style="border-right:1px solid #4338ca;background:#3730a3;font-weight:600">
                      W{{ w.label }}<br><span style="font-size:9px;opacity:0.7">{{ w.date }}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="row in scheduleData.wbs" :key="row.id">

                    <!-- SECTION ROW -->
                    <tr v-if="row.type === 'section'" style="height:28px;background:#eef2ff">
                      <td class="px-3 font-bold text-indigo-800 uppercase tracking-wide"
                        style="font-size:10px;position:sticky;left:0;z-index:10;background:#eef2ff;border-bottom:1px solid #c7d2fe;border-right:1px solid #c7d2fe">
                        {{ row.kode }} — {{ row.name }}
                      </td>
                      <td style="position:sticky;left:220px;z-index:10;background:#eef2ff;border-bottom:1px solid #c7d2fe;border-right:1px solid #c7d2fe"></td>
                      <td style="position:sticky;left:310px;z-index:10;background:#eef2ff;border-bottom:1px solid #c7d2fe;border-right:1px solid #c7d2fe"></td>
                      <td style="position:sticky;left:370px;z-index:10;background:#eef2ff;border-bottom:1px solid #c7d2fe;border-right:2px solid #a5b4fc"></td>
                      <td v-for="w in ganttWeeks" :key="'sg-'+w.label"
                        style="background:#eef2ff;border-bottom:1px solid #c7d2fe;border-right:1px solid #c7d2fe"></td>
                    </tr>

                    <!-- ITEM ROW -->
                    <tr v-else class="item-row"
                      style="height:36px;border-bottom:1px solid #e5e7eb;cursor:pointer"
                      @mouseenter="e => (e.currentTarget as HTMLElement).style.background='#eff6ff'"
                      @mouseleave="e => (e.currentTarget as HTMLElement).style.background=''"
                      @click="row._expanded = !row._expanded">
                      <td class="px-3 font-semibold text-gray-800"
                        style="font-size:11px;position:sticky;left:0;z-index:10;background:inherit;border-right:1px solid #e5e7eb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px"
                        :title="row.name">
                        <span style="color:#9ca3af;font-size:9px;margin-right:3px">{{ row._expanded ? '▾' : '▸' }}</span>
                        {{ row.name }}
                        <!-- Overridden badge -->
                        <span v-if="row.is_overridden" style="font-size:8px;background:#fef3c7;color:#92400e;border:1px solid #fbbf24;border-radius:3px;padding:0 3px;margin-left:3px">✏ Edited</span>
                      </td>
                      <td class="px-2 text-right text-gray-500"
                        style="font-size:10px;position:sticky;left:220px;z-index:10;background:inherit;border-right:1px solid #e5e7eb;white-space:nowrap">
                        {{ row.qty > 0 ? row.qty : '—' }} {{ row.unit }}
                      </td>
                      <!-- Start day: editable -->
                      <td class="px-1"
                        style="font-size:10px;position:sticky;left:310px;z-index:10;background:inherit;border-right:1px solid #e5e7eb;min-width:70px">
                        <div v-if="row._editing" class="flex items-center gap-1">
                          <input type="number" v-model.number="row._edit_start" min="0" step="1"
                            style="width:52px;border:1px solid #93c5fd;border-radius:4px;padding:1px 4px;font-size:10px;text-align:right">
                        </div>
                        <div v-else class="text-right text-gray-600 pr-1" @click.stop="row._editing=true;row._edit_start=row.start_day;row._edit_dur=row.duration_days">
                          <span>Hari ke-{{ Math.round(row.start_day) }}</span>
                          <span v-if="row.start_date" style="display:block;font-size:8px;color:#6b7280">{{ row.start_date }}</span>
                        </div>
                      </td>
                      <!-- Duration: editable -->
                      <td class="px-1"
                        :style="`font-size:11px;position:sticky;left:380px;z-index:10;background:inherit;border-right:2px solid #d1d5db;min-width:70px;color:${row.duration_days > 0 ? '#4338ca' : '#d1d5db'}`">
                        <div v-if="row._editing" class="flex items-center gap-1">
                          <input type="number" v-model.number="row._edit_dur" min="0" step="0.5"
                            style="width:48px;border:1px solid #93c5fd;border-radius:4px;padding:1px 4px;font-size:10px;text-align:right">
                          <span style="font-size:9px;color:#6b7280">d</span>
                        </div>
                        <div v-else class="text-right font-bold pr-1" @click.stop="row._editing=true;row._edit_start=row.start_day;row._edit_dur=row.duration_days">
                          {{ row.duration_days > 0 ? row.duration_days + 'd' : '—' }}
                          <span v-if="row.end_date" style="display:block;font-size:8px;color:#6b7280;font-weight:400">s/d {{ row.end_date }}</span>
                        </div>
                      </td>
                      <!-- Edit action buttons -->
                      <td v-if="row._editing" style="position:sticky;left:450px;z-index:10;background:white;padding:2px 4px;border-right:1px solid #e5e7eb;white-space:nowrap" @click.stop>
                        <button @click.stop="saveScheduleOverride(row)" style="font-size:9px;background:#3b82f6;color:white;border-radius:3px;padding:2px 6px;margin-right:2px">✓ Simpan</button>
                        <button @click.stop="row._editing=false" style="font-size:9px;background:#e5e7eb;color:#374151;border-radius:3px;padding:2px 6px">✗</button>
                        <button v-if="row.is_overridden" @click.stop="resetScheduleOverride(row)" style="font-size:9px;background:#fef3c7;color:#92400e;border-radius:3px;padding:2px 6px;margin-left:2px">↺ Auto</button>
                      </td>
                      <!-- GANTT CELL -->
                      <td :colspan="row._editing ? ganttWeeks.length - 1 : ganttWeeks.length" class="px-0" style="position:relative;height:36px;overflow:visible">
                        <!-- Week grid lines -->
                        <div v-for="(_, wi) in ganttWeeks" :key="'gl'+wi"
                          style="position:absolute;top:0;bottom:0;border-right:1px solid #f3f4f6;pointer-events:none"
                          :style="`left:${wi*ganttDayWidth*7}px;width:${ganttDayWidth*7}px`"></div>
                        <!-- Bar -->
                        <div v-if="row.duration_days > 0"
                          style="position:absolute;top:7px;height:22px;border-radius:4px;display:flex;align-items:center;padding:0 6px;font-size:9px;font-weight:700;color:white;overflow:hidden;white-space:nowrap"
                          :style="`left:${row.start_day*ganttDayWidth+1}px;width:${Math.max(row.duration_days*ganttDayWidth-2,4)}px;background:${row.is_overridden ? 'linear-gradient(90deg,#b45309,#d97706)' : 'linear-gradient(90deg,#4338ca,#7c3aed)'}`"
                          :title="`${row.name}: ${row.duration_days}d\nStart: hari ke-${Math.round(row.start_day)}${row.start_date ? ' ('+row.start_date+')' : ''}\nSelesai: hari ke-${Math.round(row.start_day+row.duration_days)}${row.end_date ? ' ('+row.end_date+')' : ''}`">
                          {{ row.duration_days > 5 ? row.name : '' }}
                        </div>
                        <span v-else style="position:absolute;left:8px;top:10px;font-size:9px;color:#d1d5db">belum ada AHSP</span>
                      </td>
                    </tr>

                    <!-- SUB-ROWS: WBS Level 2 (work sequence activities, sequential) -->
                    <template v-if="row.type !== 'section' && row._expanded">
                      <tr v-for="(lc, lcIdx) in row.labor_components" :key="'lc-'+lc.resource_name+lcIdx"
                        style="height:28px;border-bottom:1px solid #e0e7ff"
                        :style="{ background: lcIdx % 2 === 0 ? '#f5f3ff' : '#ede9fe' }">
                        <!-- Step name -->
                        <td class="pr-2 font-medium"
                          style="font-size:10px;position:sticky;left:0;z-index:10;background:inherit;border-right:1px solid #ddd6fe;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-left:32px;color:#5b21b6"
                          :title="lc.resource_name">
                          <span style="display:inline-block;background:#7c3aed;color:white;border-radius:3px;padding:0 4px;font-size:8px;margin-right:5px;min-width:32px;text-align:center">
                            {{ lc.is_wbs_step ? lc.resource_satuan : (lcIdx+1) }}
                          </span>{{ lc.resource_name }}
                        </td>
                        <td class="px-2 text-right text-violet-500"
                          style="font-size:10px;position:sticky;left:220px;z-index:10;background:inherit;border-right:1px solid #ddd6fe">
                          {{ lc.is_wbs_step ? lc.koefisien + '%' : lc.resource_satuan }}
                        </td>
                        <td class="px-2 text-right text-violet-700 font-medium"
                          style="font-size:10px;position:sticky;left:310px;z-index:10;background:inherit;border-right:1px solid #ddd6fe">
                          {{ lc.total_oh > 0 ? lc.total_oh.toFixed(0) : '—' }}
                        </td>
                        <td class="px-2 text-right font-bold text-violet-700"
                          style="font-size:10px;position:sticky;left:370px;z-index:10;background:inherit;border-right:2px solid #c4b5fd">
                          {{ lc.duration_days > 0 ? lc.duration_days + 'd' : '—' }}
                        </td>
                        <td :colspan="ganttWeeks.length" class="px-0" style="position:relative;height:28px;overflow:visible">
                          <div v-if="lc.duration_days > 0"
                            style="position:absolute;top:5px;height:18px;border-radius:3px;display:flex;align-items:center;padding:0 5px;font-size:9px;font-weight:600;color:white;overflow:hidden;white-space:nowrap"
                            :style="`left:${(row.start_day+(lc.start_offset||0))*ganttDayWidth+1}px;width:${Math.max(lc.duration_days*ganttDayWidth-2,4)}px;background:linear-gradient(90deg,#6d28d9,#a855f7)`"
                            :title="`${lc.resource_name}: ${lc.duration_days}d`">
                            {{ lc.duration_days > 3 ? lc.resource_name : '' }}
                          </div>
                        </td>
                      </tr>
                      <!-- Subtotal row -->
                      <tr style="height:22px;background:#ddd6fe;border-bottom:2px solid #7c3aed">
                        <td colspan="3" style="font-size:9px;font-weight:700;color:#4c1d95;position:sticky;left:0;z-index:10;background:#ddd6fe;padding-left:32px">
                          ∑ {{ row.name }}
                        </td>
                        <td style="font-size:9px;font-weight:700;color:#4c1d95;text-align:right;padding-right:8px;position:sticky;left:310px;z-index:10;background:#ddd6fe">
                          {{ row.labor_total_oh ? Math.round(row.labor_total_oh) + ' OH' : '' }}
                        </td>
                        <td style="font-size:9px;font-weight:700;color:#4c1d95;text-align:right;padding-right:8px;position:sticky;left:370px;z-index:10;background:#ddd6fe;border-right:2px solid #7c3aed">
                          {{ row.duration_days }}d total
                        </td>
                        <td :colspan="ganttWeeks.length" style="background:#ddd6fe"></td>
                      </tr>

                      <!-- PER-UNIT ROWS: if qty is discrete (bh, titik, unit, etc.) -->
                      <template v-if="row.is_qty_breakdown && row.units">
                        <!-- Header: step names as column labels -->
                        <tr style="height:24px;background:#1e1b4b;border-bottom:1px solid #312e81">
                          <td style="font-size:9px;font-weight:700;color:#c4b5fd;position:sticky;left:0;z-index:10;background:#1e1b4b;padding-left:32px">
                            📋 Progress per unit ({{ row.qty }} {{ row.unit }})
                          </td>
                          <td colspan="3" style="font-size:9px;color:#a5b4fc;position:sticky;left:220px;z-index:10;background:#1e1b4b;padding:0 8px">
                            Klik badge untuk update status
                          </td>
                          <td :colspan="ganttWeeks.length" style="background:#1e1b4b;font-size:9px;color:#818cf8;padding:0 8px">
                            ○ Pending  →  In Progress  ✓ Done
                          </td>
                        </tr>
                        <!-- Unit rows -->
                        <tr v-for="unit in row.units" :key="'u-'+unit.unit_number"
                          style="border-bottom:1px solid #e0e7ff"
                          :style="{ background: unit.unit_number % 2 === 0 ? '#f0f9ff' : '#f8faff', height: '30px' }">
                          <!-- Unit label -->
                          <td style="font-size:10px;font-weight:600;color:#1e40af;position:sticky;left:0;z-index:10;background:inherit;border-right:1px solid #bfdbfe;padding-left:40px;white-space:nowrap">
                            {{ row.unit.toUpperCase() }} #{{ unit.unit_number }}
                          </td>
                          <!-- Steps as badges (spans Qty + OH + Hari columns) -->
                          <td colspan="3" style="position:sticky;left:220px;z-index:10;background:inherit;border-right:2px solid #93c5fd;padding:3px 4px">
                            <div style="display:flex;gap:3px;flex-wrap:nowrap;overflow:hidden">
                              <span v-for="step in unit.steps" :key="step.step_code"
                                style="display:inline-flex;align-items:center;gap:2px;border-radius:4px;padding:2px 5px;font-size:9px;font-weight:600;cursor:pointer;transition:all 0.15s;white-space:nowrap;border:1px solid transparent"
                                :style="step.status === 'done' ? 'background:#dcfce7;color:#166534;border-color:#86efac' :
                                        step.status === 'in_progress' ? 'background:#fef3c7;color:#92400e;border-color:#fbbf24' :
                                        'background:#f1f5f9;color:#64748b;border-color:#cbd5e1'"
                                :title="`${step.step_name} — klik untuk ganti status`"
                                @click="cycleProgress(row, unit, step)">
                                <span>{{ step.status === 'done' ? '✓' : step.status === 'in_progress' ? '→' : '○' }}</span>
                                {{ step.step_name.length > 12 ? step.step_name.slice(0,12)+'…' : step.step_name }}
                              </span>
                            </div>
                          </td>
                          <!-- Gantt bar for this unit -->
                          <td :colspan="ganttWeeks.length" class="px-0" style="position:relative;height:30px;overflow:visible">
                            <!-- Unit Gantt bar (colored by completion) -->
                            <div style="position:absolute;top:6px;height:18px;border-radius:3px;overflow:hidden;display:flex"
                              :style="`left:${unit.start_day*ganttDayWidth+1}px;width:${Math.max(unit.duration_days*ganttDayWidth-2,6)}px`">
                              <div v-for="step in unit.steps" :key="'gs-'+step.step_code"
                                :style="`
                                  flex:${step.duration_days};
                                  background:${step.status==='done' ? '#16a34a' : step.status==='in_progress' ? '#d97706' : '#cbd5e1'};
                                  min-width:2px
                                `"
                                :title="`${step.step_name}: ${step.status}`">
                              </div>
                            </div>
                            <!-- % complete text -->
                            <span style="position:absolute;right:6px;top:9px;font-size:9px;color:#64748b">
                              {{ Math.round(unit.steps.filter((s:any)=>s.status==='done').length/unit.steps.length*100) }}%
                            </span>
                          </td>
                        </tr>
                      </template>

                    </template>

                  </template>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Empty state -->
          <div v-else class="bg-white rounded-lg shadow p-12 text-center text-gray-400">
            <div class="text-5xl mb-3">📅</div>
            <p class="text-lg font-medium">Klik "🔄 Hitung Ulang" untuk generate Master Schedule</p>
            <p class="text-sm mt-1">Durasi dihitung otomatis: koefisien tenaga (OH) × qty ÷ jumlah pekerja</p>
          </div>
        </div><!-- end Schedule tab -->


      </div>

      <!-- Right Sidebar (Cost Summary - Sticky) -->
      <div class="w-80 p-6">
        <div class="bg-white rounded-lg shadow sticky top-24">
          <div class="p-4 bg-blue-600 text-white rounded-t-lg">
            <h3 class="font-bold">COST SUMMARY</h3>
          </div>
          <div class="p-4 space-y-3 text-sm">
            <!-- Discipline Totals -->
            <div v-for="disc in disciplineSummary" :key="disc.id" class="flex justify-between">
              <span class="text-gray-600">{{ disc.name }}</span>
              <span class="font-semibold">{{ formatNumber(disc.total) }}</span>
            </div>
            
            <div class="border-t pt-3 space-y-2">
              <div class="flex justify-between font-bold text-gray-900">
                <span>DIRECT COST</span>
                <span>{{ formatNumber(summary.direct_cost) }}</span>
              </div>
              <div class="flex justify-between text-gray-600">
                <span>OVERHEAD</span>
                <span>{{ formatNumber(summary.overhead) }}</span>
              </div>
              <div class="flex justify-between text-gray-600">
                <span>RISK / CONTINGENCY</span>
                <span>{{ formatNumber(summary.risk_contingency) }}</span>
              </div>
            </div>
            
            <div class="border-t-2 pt-3">
              <div class="flex justify-between text-lg font-bold text-blue-900">
                <span>TOTAL PROJECT</span>
                <span>{{ formatNumber(summary.total_project) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ PAYMENT SCHEDULE TAB ═══ -->
    <div v-show="activeProposalTab === 'payment'" class="space-y-5">

      <!-- Controls -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-wrap items-center gap-4">
        <div class="flex items-center gap-2">
          <label class="text-sm font-medium text-gray-600">Tanggal Mulai</label>
          <input v-model="scheduleStartDate" type="date" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
        </div>
        <div class="flex items-center gap-2">
          <label class="text-sm font-medium text-gray-600">Pekerja/hari</label>
          <input v-model.number="scheduleWorkers" type="number" min="1" max="100" class="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-center">
        </div>
        <button @click="loadPaymentSchedule" class="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700">
          🔄 Generate
        </button>
        <div v-if="paymentData" class="ml-auto text-sm text-gray-600">
          Kontrak: <span class="font-bold text-emerald-700">{{ formatNumber(paymentData.total_contract) }}</span>
          · <span class="text-gray-500">{{ paymentData.total_months }} bulan</span>
        </div>
      </div>

      <div v-if="paymentLoading" class="bg-white rounded-xl shadow p-12 text-center text-gray-400">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto mb-3"></div>
        Menghitung schedule pembayaran...
      </div>

      <template v-else-if="paymentData && paymentData.monthly.length > 0">

        <!-- S-Curve Visual -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 class="font-bold text-gray-800 mb-4">📈 S-Curve Progress Rencana</h3>
          <div class="relative" style="height:180px;">
            <!-- Y-axis labels -->
            <div class="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-xs text-gray-400 pr-2" style="width:36px">
              <span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span>
            </div>
            <!-- Chart area -->
            <div class="absolute left-9 right-0 top-0 bottom-0 flex items-end gap-1">
              <div v-for="(m, i) in paymentData.monthly" :key="m.month"
                class="flex-1 flex flex-col items-center gap-0.5 group relative">
                <!-- Bar (monthly bobot) -->
                <div class="w-full rounded-t-sm transition-all"
                  :style="`height:${Math.max(2, m.planned_bobot / maxMonthlyBobot * 120)}px;background:linear-gradient(180deg,#10b981,#059669)`"
                  :title="`${m.label}: ${m.planned_bobot.toFixed(1)}%`">
                </div>
                <!-- S-curve dot -->
                <div class="absolute w-2 h-2 rounded-full bg-blue-600 border-2 border-white shadow"
                  :style="`bottom:${m.cumulative_bobot / 100 * 144}px;left:50%;transform:translateX(-50%)`"
                  :title="`Kumulatif s/d ${m.label}: ${m.cumulative_bobot.toFixed(1)}%`">
                </div>
                <!-- Month label -->
                <div class="text-xs text-gray-400 mt-1 whitespace-nowrap" style="font-size:9px;writing-mode:vertical-lr;transform:rotate(180deg);height:36px">
                  {{ m.label }}
                </div>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-emerald-500"></span> Bobot bulanan</span>
            <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-full bg-blue-600"></span> Kumulatif (S-Curve)</span>
          </div>
        </div>

        <!-- Monthly Table -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table class="min-w-full">
            <thead>
              <tr class="bg-emerald-700 text-white">
                <th class="px-4 py-3 text-left text-xs font-semibold w-8">#</th>
                <th class="px-4 py-3 text-left text-xs font-semibold">Bulan</th>
                <th class="px-4 py-3 text-right text-xs font-semibold">Bobot (%)</th>
                <th class="px-4 py-3 text-right text-xs font-semibold">Kumulatif (%)</th>
                <th class="px-4 py-3 text-right text-xs font-semibold">Tagihan Rencana</th>
                <th class="px-4 py-3 text-right text-xs font-semibold">Kumulatif Tagihan</th>
                <th class="px-4 py-3 text-left text-xs font-semibold">Pekerjaan Utama</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="(m, i) in paymentData.monthly" :key="m.month"
                class="hover:bg-emerald-50 transition-colors"
                :class="i % 2 === 0 ? '' : 'bg-gray-50'">
                <td class="px-4 py-3 text-xs text-gray-400 font-mono">{{ i+1 }}</td>
                <td class="px-4 py-3 text-sm font-semibold text-gray-800">{{ m.label }}</td>
                <td class="px-4 py-3 text-right">
                  <div class="flex items-center justify-end gap-2">
                    <div class="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div class="h-1.5 rounded-full bg-emerald-500"
                        :style="`width:${Math.min(100, m.planned_bobot / maxMonthlyBobot * 100)}%`"></div>
                    </div>
                    <span class="text-sm font-bold text-emerald-700">{{ m.planned_bobot.toFixed(2) }}%</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex items-center justify-end gap-2">
                    <div class="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div class="h-1.5 rounded-full bg-blue-500"
                        :style="`width:${m.cumulative_bobot}%`"></div>
                    </div>
                    <span class="text-sm font-bold text-blue-700">{{ m.cumulative_bobot.toFixed(1) }}%</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-right text-sm font-semibold text-gray-800">
                  {{ formatNumber(m.planned_amount) }}
                </td>
                <td class="px-4 py-3 text-right text-sm font-bold text-emerald-800">
                  {{ formatNumber(m.cumulative_amount) }}
                </td>
                <td class="px-4 py-3 text-xs text-gray-500 max-w-xs">
                  <span v-for="(item, idx) in m.items.slice(0,3)" :key="idx"
                    class="inline-block bg-gray-100 rounded px-1.5 py-0.5 mr-1 mb-1 whitespace-nowrap" style="font-size:10px">
                    {{ item.length > 25 ? item.slice(0,25)+'…' : item }}
                  </span>
                  <span v-if="m.items.length > 3" class="text-gray-400">+{{ m.items.length - 3 }} lagi</span>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="bg-emerald-800 text-white font-bold">
                <td colspan="2" class="px-4 py-3 text-sm">TOTAL</td>
                <td class="px-4 py-3 text-right text-sm">100.00%</td>
                <td class="px-4 py-3 text-right text-sm">100.00%</td>
                <td class="px-4 py-3 text-right text-sm">{{ formatNumber(paymentData.total_contract) }}</td>
                <td class="px-4 py-3 text-right text-sm">{{ formatNumber(paymentData.total_contract) }}</td>
                <td class="px-4 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>

      </template>

      <div v-else-if="!paymentLoading" class="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
        <div class="text-5xl mb-3">💰</div>
        <p class="text-gray-500 font-medium">Klik "Generate" untuk menghitung Payment Schedule</p>
        <p class="text-sm text-gray-400 mt-1">Pastikan Master Schedule sudah di-generate terlebih dahulu</p>
      </div>

    </div>

    <!-- AHSP Selector Modal -->
    <!-- ══ MTO PICKER MODAL ══════════════════════════════════ -->
  <div v-if="showMTOPicker" class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" @click.self="showMTOPicker = false">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
      <!-- Header -->
      <div class="px-6 py-4 border-b flex items-center justify-between bg-teal-600 text-white rounded-t-2xl">
        <div>
          <h3 class="font-bold text-lg">🔗 Link ke MTO</h3>
          <p class="text-sm text-teal-100 mt-0.5">Pilih kuantitas MTO untuk: <strong>{{ mtoPickerItem?.name }}</strong></p>
        </div>
        <button @click="showMTOPicker = false" class="text-white hover:text-teal-200 text-2xl leading-none">×</button>
      </div>

      <!-- Loading -->
      <div v-if="mtoQuantitiesLoading" class="p-8 text-center text-gray-500">
        <div class="text-3xl mb-2">⏳</div><p>Memuat data MTO...</p>
      </div>

      <!-- No MTO data -->
      <div v-else-if="!mtoQuantities.length" class="p-8 text-center text-gray-400">
        <div class="text-4xl mb-3">📐</div>
        <p class="font-medium">Belum ada data MTO</p>
        <p class="text-sm mt-1">Isi data MTO di tab MTO terlebih dahulu</p>
      </div>

      <!-- MTO Elements List -->
      <div v-else class="flex-1 overflow-y-auto p-4 space-y-4">
        <div v-for="el in mtoQuantities" :key="el.element_id"
          class="border rounded-xl overflow-hidden">
          <!-- Element header -->
          <div class="px-4 py-2 flex items-center gap-2"
            :style="`background:${mtoTypeColors[el.element_type] || '#f3f4f6'}`">
            <span class="text-lg">{{ mtoTypeIcons[el.element_type] || '📦' }}</span>
            <div>
              <div class="font-semibold text-sm text-gray-800">{{ el.element_name }}</div>
              <div class="text-xs text-gray-500 capitalize">{{ el.element_type }}</div>
            </div>
          </div>
          <!-- Quantity options -->
          <div class="px-4 py-3 flex flex-wrap gap-2 bg-white">
            <button v-for="q in el.available" :key="q.field"
              @click="applyMTOLink(el, q)"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition-all hover:scale-105"
              :class="isCurrentLink(el, q) ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-teal-300 hover:bg-teal-50'">
              <span>{{ q.label }}</span>
              <span class="font-bold text-teal-700">{{ q.value.toLocaleString('id-ID', {maximumFractionDigits: 2}) }}</span>
              <span class="text-xs text-gray-500">{{ q.unit }}</span>
              <span v-if="isCurrentLink(el, q)" class="text-teal-500">✓</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-3 border-t bg-gray-50 rounded-b-2xl flex justify-between items-center">
        <button v-if="mtoPickerItem?.mto_link" @click="unlinkMTO(mtoPickerItem); showMTOPicker = false"
          class="text-sm text-red-500 hover:text-red-700 font-medium">
          🗑 Hapus Link MTO
        </button>
        <span v-else></span>
        <button @click="showMTOPicker = false" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300">Tutup</button>
      </div>
    </div>
  </div>

  <div v-if="showAHSPModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="showAHSPModal = false">

      <div class="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div class="p-5 border-b">
          <h2 class="text-xl font-bold mb-4">+ Tambah Pekerjaan (AHSP)</h2>

          <div class="grid grid-cols-1 gap-3">
            <!-- Row 1: Kategori + Search -->
            <div class="flex gap-3">
              <!-- Kategori Pekerjaan dropdown -->
              <div class="flex-1">
                <label class="block text-xs font-medium text-gray-600 mb-1">Kategori Pekerjaan</label>
                <select
                  v-model="modalSelectedCategory"
                  @change="onModalCategoryChange"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">— Semua Kategori —</option>
                  <option v-for="cat in ahspCategories" :key="cat.work_category" :value="cat.work_category">
                    {{ cat.work_category }} ({{ cat.jumlah }})
                  </option>
                </select>
              </div>
              <!-- Keyword Search -->
              <div class="flex-1">
                <label class="block text-xs font-medium text-gray-600 mb-1">Cari Pekerjaan</label>
                <input
                  v-model="ahspSearch"
                  @input="debounceAhspSearch"
                  type="text"
                  placeholder="Ketik kode atau nama pekerjaan..."
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
              </div>
            </div>

            <!-- Row 2: Tagging — Disiplin & Sub-Disiplin (optional, for grouping in RAB) -->
            <details class="text-xs">
              <summary class="cursor-pointer text-gray-500 hover:text-gray-700 select-none">
                ▶ Pilih Disiplin &amp; Sub-Disiplin (opsional — untuk pengelompokan di RAB)
              </summary>
              <div class="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Disiplin</label>
                  <select v-model.number="modalSelectedDisciplineId" @change="onModalDisciplineChange"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option :value="null">-- Pilih Disiplin --</option>
                    <option v-for="disc in disciplines" :key="disc.id" :value="disc.id">{{ disc.name }}</option>
                  </select>
                </div>
                <div v-if="modalSelectedDisciplineId">
                  <label class="block text-xs font-medium text-gray-600 mb-1">Sub-Disiplin</label>
                  <select v-model.number="modalSelectedSubDisciplineId"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option :value="null">-- Pilih Sub-Disiplin --</option>
                    <option v-for="subDisc in modalCurrentSubDisciplines" :key="subDisc.id" :value="subDisc.id">{{ subDisc.name }}</option>
                  </select>
                </div>
              </div>
            </details>
          </div>
        </div>

        <!-- AHSP List -->
        <div class="flex-1 overflow-y-auto">
          <div v-if="ahspLoading" class="p-8 text-center text-gray-500">Memuat AHSP...</div>
          <table v-else-if="filteredAHSP.length > 0" class="min-w-full text-sm">
            <thead class="bg-gray-50 sticky top-0 border-b">
              <tr>
                <th class="px-3 py-2 text-left w-32">Kode</th>
                <th class="px-3 py-2 text-left">Uraian Pekerjaan</th>
                <th class="px-3 py-2 text-center w-24">Satuan</th>
                <th class="px-3 py-2 text-right w-36">Harga Satuan</th>
                <th class="px-3 py-2 text-center w-16">✓</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="ahsp in filteredAHSP" :key="ahsp.id" class="border-b hover:bg-blue-50">
                <td class="px-3 py-2 font-mono text-xs text-gray-600">{{ ahsp.kode }}</td>
                <td class="px-3 py-2 text-sm">{{ ahsp.name }}</td>
                <td class="px-3 py-2 text-center text-xs">{{ ahsp.satuan }}</td>
                <td class="px-3 py-2 text-right text-sm font-medium" :class="ahsp.harga_satuan === 0 ? 'text-red-400' : ''">
                  {{ ahsp.harga_satuan === 0 ? '—' : formatNumber(ahsp.harga_satuan) }}
                </td>
                <td class="px-3 py-2 text-center">
                  <button @click="toggleAHSP(ahsp)"
                    class="w-7 h-7 rounded-md border-2 flex items-center justify-center mx-auto transition-all duration-150"
                    :class="isAhspAdded(ahsp.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 text-transparent hover:border-blue-400'">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="p-8 text-center text-gray-500">
            <template v-if="!modalSelectedCategory && ahspSearch.length < 2">
              <p class="text-base">Pilih kategori atau ketik minimal 2 karakter untuk mencari AHSP</p>
            </template>
            <template v-else>
              <p>Tidak ada AHSP ditemukan. Coba ubah kategori atau kata kunci.</p>
            </template>
          </div>
        </div>

        <div class="p-4 border-t flex justify-between items-center">
          <span class="text-xs text-gray-500">{{ filteredAHSP.length }} pekerjaan ditampilkan</span>
          <button @click="showAHSPModal = false" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>

    <!-- Proposal Resume Modal -->
    <ProposalResume
      v-if="showResume"
      :proposal-id="Number(proposalId)"
      :proposal-name="proposal?.project_name || ''"
      @close="showResume = false"
    />

    <!-- Construction Calculator Modal -->
    <ConstructionCalculator 
      :visible="showCalculator" 
      :item-unit="calcItem?.unit_snapshot"
      @close="showCalculator = false"
      @apply="applyCalcResult"
    />

    <!-- AHSP Detail Modal (Read-Only Analysis) -->
    <div v-if="showDetail" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="closeDetail">
      <div class="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[85vh] overflow-auto">
        <div class="p-4 border-b flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold">Analisa Harga Satuan Pekerjaan</h2>
            <p class="text-sm text-gray-600">{{ selectedAhspDetail?.kode }} - {{ selectedAhspDetail?.name }}</p>
          </div>
          <button class="text-gray-500 hover:text-gray-800" @click="closeDetail">✕</button>
        </div>

        <div class="p-4">
          <table class="min-w-full text-sm">
            <thead class="bg-blue-600 text-white">
              <tr>
                <th class="px-3 py-2 text-left w-14">No.</th>
                <th class="px-3 py-2 text-left">Uraian</th>
                <th class="px-3 py-2 text-left w-20">Kode</th>
                <th class="px-3 py-2 text-center w-20">Satuan</th>
                <th class="px-3 py-2 text-right w-20">Koef.</th>
                <th class="px-3 py-2 text-right w-28">Harga</th>
                <th class="px-3 py-2 text-right w-28">Jumlah</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr class="bg-gray-50">
                <td class="px-3 py-2 font-bold">A</td>
                <td class="px-3 py-2 font-bold" colspan="6">Tenaga Kerja</td>
              </tr>
              <tr v-for="(row, idx) in sectionA" :key="`A-${idx}`">
                <td class="px-3 py-2 text-center text-gray-600">{{ idx + 1 }}</td>
                <td class="px-3 py-2">{{ row.resource_name }}</td>
                <td class="px-3 py-2 text-xs font-mono">{{ row.resource_code || '-' }}</td>
                <td class="px-3 py-2 text-center">{{ row.resource_satuan }}</td>
                <td class="px-3 py-2 text-right">{{ formatDecimal(row.koefisien) }}</td>
                <td class="px-3 py-2 text-right">{{ formatNumber(row.resource_harga) }}</td>
                <td class="px-3 py-2 text-right">{{ formatNumber(row.jumlah_harga) }}</td>
              </tr>
              <tr class="bg-gray-50">
                <td class="px-3 py-2 font-bold">B</td>
                <td class="px-3 py-2 font-bold" colspan="6">Bahan</td>
              </tr>
              <tr v-for="(row, idx) in sectionB" :key="`B-${idx}`">
                <td class="px-3 py-2 text-center text-gray-600">{{ idx + 1 }}</td>
                <td class="px-3 py-2">{{ row.resource_name }}</td>
                <td class="px-3 py-2 text-xs font-mono">{{ row.resource_code || '-' }}</td>
                <td class="px-3 py-2 text-center">{{ row.resource_satuan }}</td>
                <td class="px-3 py-2 text-right">{{ formatDecimal(row.koefisien) }}</td>
                <td class="px-3 py-2 text-right">{{ formatNumber(row.resource_harga) }}</td>
                <td class="px-3 py-2 text-right">{{ formatNumber(row.jumlah_harga) }}</td>
              </tr>
              <tr class="bg-gray-50">
                <td class="px-3 py-2 font-bold">C</td>
                <td class="px-3 py-2 font-bold" colspan="6">Peralatan</td>
              </tr>
              <tr v-for="(row, idx) in sectionC" :key="`C-${idx}`">
                <td class="px-3 py-2 text-center text-gray-600">{{ idx + 1 }}</td>
                <td class="px-3 py-2">{{ row.resource_name }}</td>
                <td class="px-3 py-2 text-xs font-mono">{{ row.resource_code || '-' }}</td>
                <td class="px-3 py-2 text-center">{{ row.resource_satuan }}</td>
                <td class="px-3 py-2 text-right">{{ formatDecimal(row.koefisien) }}</td>
                <td class="px-3 py-2 text-right">{{ formatNumber(row.resource_harga) }}</td>
                <td class="px-3 py-2 text-right">{{ formatNumber(row.jumlah_harga) }}</td>
              </tr>
              <tr class="bg-gray-100 font-semibold">
                <td class="px-3 py-2">D</td>
                <td class="px-3 py-2" colspan="5">Jumlah Harga Tenaga, Bahan dan Peralatan (A+B+C)</td>
                <td class="px-3 py-2 text-right">{{ formatNumber(selectedAhspDetail?.harga_langsung || 0) }}</td>
              </tr>
              <tr class="bg-gray-100 font-semibold">
                <td class="px-3 py-2">E</td>
                <td class="px-3 py-2" colspan="5">Overhead + profit (10%)</td>
                <td class="px-3 py-2 text-right">{{ formatNumber(selectedAhspDetail?.overhead_profit || 0) }}</td>
              </tr>
              <tr class="bg-gray-200 font-bold">
                <td class="px-3 py-2">F</td>
                <td class="px-3 py-2" colspan="5">Harga Satuan Pekerjaan (D+E)</td>
                <td class="px-3 py-2 text-right">{{ formatNumber(selectedAhspDetail?.harga_satuan || 0) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="p-4 border-t flex justify-end">
          <button class="px-4 py-2 bg-gray-700 text-white rounded" @click="closeDetail">Tutup</button>
        </div>
      </div>
    </div>

    <!-- AHSP Assign Modal (for wizard-created items) -->
    <div v-if="showAssignModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="showAssignModal = false">
      <div class="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[85vh] flex flex-col">
        <div class="p-4 border-b">
          <div class="flex items-center gap-2 mb-1">
            <h2 class="text-lg font-bold">
              {{ (assignTarget?.ahsp_id && assignTarget.ahsp_id > 0) ? '🔄 Ganti AHSP' : 'Assign AHSP ke Pekerjaan' }}
            </h2>
          </div>
          <p class="text-sm text-gray-500">
            Item: <span class="font-semibold text-gray-700">{{ assignTarget?.ahsp_name_snapshot }}</span>
          </p>
          <!-- Show current AHSP when re-assigning -->
          <div v-if="assignTarget?.ahsp_id && assignTarget.ahsp_id > 0"
            class="mt-2 flex items-center gap-2 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg">
            <span class="text-xs text-orange-600">AHSP saat ini:</span>
            <span class="text-xs font-mono font-semibold text-orange-700">{{ assignTarget?.ahsp_code_snapshot }}</span>
            <span class="text-xs text-orange-800 flex-1 truncate">{{ assignTarget?.ahsp_name_snapshot }}</span>
          </div>
          <div class="mt-3">
            <input 
              v-model="assignSearch" 
              @input="debounceAssignSearch"
              type="text" 
              :placeholder="'Cari AHSP... (cth: ' + (assignTarget?.ahsp_name_snapshot?.split(' ').slice(0,3).join(' ') || 'galian tanah') + ')'"
              class="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              ref="assignSearchInput"
            >
          </div>
        </div>
        <div class="flex-1 overflow-y-auto">
          <div v-if="assignLoading" class="p-8 text-center text-gray-500">Mencari AHSP...</div>
          <table v-else-if="assignResults.length > 0" class="min-w-full text-sm">
            <thead class="bg-gray-50 sticky top-0">
              <tr>
                <th class="px-3 py-2 text-left w-32">Kode</th>
                <th class="px-3 py-2 text-left">Uraian Pekerjaan</th>
                <th class="px-3 py-2 text-center w-20">Satuan</th>
                <th class="px-3 py-2 text-right w-32">Harga Satuan</th>
                <th class="px-3 py-2 text-center w-20">Pilih</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="ahsp in assignResults" :key="ahsp.id"
                class="border-b hover:bg-blue-50 cursor-pointer"
                :class="ahsp.harga_satuan === 0 ? 'opacity-60' : ''"
                @click="confirmAssignAHSP(ahsp)">
                <td class="px-3 py-2 font-mono text-xs text-gray-600">{{ ahsp.kode }}</td>
                <td class="px-3 py-2">
                  {{ ahsp.name }}
                  <span v-if="ahsp.harga_satuan === 0"
                    class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                    ⚠ Harga 0
                  </span>
                </td>
                <td class="px-3 py-2 text-center">{{ ahsp.satuan }}</td>
                <td class="px-3 py-2 text-right font-medium"
                  :class="ahsp.harga_satuan === 0 ? 'text-red-400' : ''">
                  {{ ahsp.harga_satuan === 0 ? '—' : formatNumber(ahsp.harga_satuan) }}
                </td>
                <td class="px-3 py-2 text-center">
                  <button class="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">Pilih</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else-if="assignSearch.length >= 2" class="p-8 text-center text-gray-500">
            Tidak ada AHSP ditemukan untuk "{{ assignSearch }}"
          </div>
          <div v-else class="p-8 text-center text-gray-400">
            Ketik minimal 2 karakter untuk mencari AHSP
          </div>
        </div>
        <div class="p-3 border-t flex justify-end">
          <button @click="showAssignModal = false" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Tutup</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Wizard Modal ── -->
  <div v-if="showWizardModal" class="fixed inset-0 bg-black/70 z-50 flex items-stretch justify-stretch">
    <div class="bg-white w-full flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-amber-500 to-orange-500">
        <div class="flex items-center gap-3">
          <span class="text-2xl">🧙</span>
          <div>
            <h2 class="font-bold text-white text-lg">Template Wizard</h2>
            <p class="text-amber-100 text-xs">Pilih template pekerjaan untuk diterapkan ke proposal ini</p>
          </div>
        </div>
        <button @click="showWizardModal = false" class="text-white/80 hover:text-white text-3xl leading-none">×</button>
      </div>
      <div class="flex-1 overflow-y-auto p-6">
        <ProposalTemplateWizard ref="editorWizardRef" @type-selected="onEditorTypeSelected" />
      </div>
      <div class="border-t bg-gray-50 px-6 py-4 flex items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <span class="text-sm font-medium text-gray-700">Mode:</span>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" v-model="wizardApplyMode" value="append" class="accent-amber-500">
            <span class="text-sm"><b>Tambah</b> — append di bawah item yang ada</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" v-model="wizardApplyMode" value="replace" class="accent-red-500">
            <span class="text-sm text-red-700"><b>Ganti</b> — hapus semua item lama, terapkan template</span>
          </label>
        </div>
        <div class="flex gap-3">
          <button @click="showWizardModal = false" class="px-5 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100">Batal</button>
          <button @click="applyWizardTemplate" :disabled="wizardApplying"
            class="px-6 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 disabled:opacity-50">
            {{ wizardApplying ? 'Menerapkan...' : '✅ Terapkan Template' }}
          </button>
        </div>
      </div>
    </div>
  </div>

</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/lib/api';
import ConstructionCalculator from '@/components/ConstructionCalculator.vue';
import ProposalResume from '@/components/ProposalResume.vue';
import ProjectMTO from '@/components/projects/ProjectMTO.vue';
import ProposalTemplateWizard from '@/components/ProposalTemplateWizard.vue';

const route = useRoute();
const router = useRouter();
const proposalId = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id;
const activeProposalTab = ref<'rab' | 'mto' | 'schedule' | 'payment'>('rab');

// ── Schedule state ──
const scheduleData = ref<any>(null);
const scheduleLoading = ref(false);
const scheduleStartDate = ref(new Date().toISOString().split('T')[0]);
const scheduleWorkers = ref(8);
const scheduleHours = ref(8);
const scheduleWorkDaysPerWeek = ref(6);
const ganttDayWidth = 18; // pixels per day

// ── Payment Schedule state ──
const paymentData    = ref<any>(null);
const paymentLoading = ref(false);
const maxMonthlyBobot = computed(() => {
  if (!paymentData.value?.monthly?.length) return 1;
  return Math.max(...paymentData.value.monthly.map((m: any) => m.planned_bobot)) || 1;
});


interface Proposal {
  id: number;
  proposal_number: string;
  project_name: string;
  client: string;
  lokasi: string;
  revision: string;
  status: string;
  direct_cost: number;
  overhead: number;
  risk_contingency: number;
  total_project: number;
  project_id: number | null;
}

interface Discipline {
  id: number;
  code: string;
  name: string;
  order_no: number;
}

interface SubDiscipline {
  id: number;
  discipline_id: number;
  code: string;
  name: string;
  order_no: number;
}

interface ProposalItem {
  id: number;
  proposal_id: number;
  discipline_id: number;
  sub_discipline_id: number;
  ahsp_id: number;
  ahsp_code_snapshot: string;
  ahsp_name_snapshot: string;
  unit_snapshot: string;
  unit_price_snapshot: number;
  qty: number;
  total_price: number;
  order_no: number;
  description?: string;
  discipline_name?: string;
  sub_discipline_name?: string;
  is_section?: number;
  section_label?: string;
  section_order?: number;
  mto_link?: { element_id: number; element_type: string; element_name: string; field: string; value: number; unit: string } | null;
}

interface AHSP {
  id: number;
  kode: string;
  name: string;
  satuan: string;
  harga_satuan: number;
  harga_langsung?: number;
  overhead_profit?: number;
}

interface AhspDetailItem {
  section: string;
  koefisien: number;
  resource_name: string;
  resource_satuan: string;
  resource_harga: number;
  jumlah_harga: number;
  resource_code?: string;
}

const proposal = ref<Proposal | null>(null);
const disciplines = ref<Discipline[]>([]);
const subDisciplines = ref<SubDiscipline[]>([]);
const items = ref<ProposalItem[]>([]);
const availableAHSP = ref<AHSP[]>([]);
const ahspCategories = ref<{work_category: string; work_category_code: string; jumlah: number}[]>([]);

// Modal states for AHSP selection
const showAHSPModal = ref(false);

// ── MTO Picker state ──────────────────────────────────────────
const showMTOPicker        = ref(false);
const mtoPickerItem        = ref<any>(null);
const mtoQuantities        = ref<any[]>([]);
const mtoQuantitiesLoading = ref(false);

const mtoTypeIcons: Record<string, string> = {
  foundation: '🏗', column: '🏛', beam: '🔗', slab: '🧱', wall: '🪟', roof: '🏠'
};
const mtoTypeColors: Record<string, string> = {
  foundation: '#fef9c3', column: '#dbeafe', beam: '#ede9fe',
  slab: '#d1fae5', wall: '#f3f4f6', roof: '#fee2e2'
};

const openMTOPicker = async (item: any) => {
  mtoPickerItem.value = item;
  showMTOPicker.value = true;
  if (mtoQuantities.value.length) return; // already loaded
  mtoQuantitiesLoading.value = true;
  try {
    const { data } = await api.get(`/estimator/proposals/${proposalId}/mto-quantities`);
    mtoQuantities.value = data.elements || [];
  } catch (e) {
    console.error('Failed to load MTO quantities', e);
  } finally {
    mtoQuantitiesLoading.value = false;
  }
};

const isCurrentLink = (el: any, q: any) => {
  const link = mtoPickerItem.value?.mto_link;
  return link && link.element_id === el.element_id && link.field === q.field;
};

const applyMTOLink = async (el: any, q: any) => {
  const item = mtoPickerItem.value;
  if (!item) return;
  try {
    const payload = {
      element_id: el.element_id,
      element_type: el.element_type,
      element_name: el.element_name,
      field: q.field,
      value: q.value,
      unit: q.unit
    };
    await api.put(`/estimator/proposals/${proposalId}/items/${item.id}/mto-link`, payload);
    // Update item locally
    item.mto_link = payload;
    item.qty = q.value;
    item.total_price = item.qty * (item.unit_price_snapshot || 0);
    showMTOPicker.value = false;
  } catch (e) {
    alert('Gagal menyimpan link MTO');
    console.error(e);
  }
};

const unlinkMTO = async (item: any) => {
  if (!item) return;
  try {
    await api.delete(`/estimator/proposals/${proposalId}/items/${item.id}/mto-link`);
    item.mto_link = null;
  } catch (e) {
    console.error('Unlink MTO failed', e);
  }
};


const modalSelectedDisciplineId = ref<number | null>(null);
const modalSelectedSubDisciplineId = ref<number | null>(null);
const modalSelectedCategory = ref<string>('');
const ahspSearch = ref('');
const ahspLoading = ref(false);
let ahspSearchTimer: ReturnType<typeof setTimeout> | null = null;

// Modal states for Construction Calculator
const showCalculator = ref(false);
const showResume = ref(false);
const calcItem = ref<ProposalItem | null>(null);

// Modal states for AHSP Detail
const showDetail = ref(false);
const selectedAhspDetail = ref<AHSP | null>(null);
const detailItems = ref<AhspDetailItem[]>([]);

// Modal states for AHSP Assign (wizard items)
const showAssignModal = ref(false);
const assignTarget = ref<ProposalItem | null>(null);
const assignSearch = ref('');
const assignResults = ref<AHSP[]>([]);
const assignLoading = ref(false);
let assignSearchTimer: ReturnType<typeof setTimeout> | null = null;

// ── Template Wizard state ──
const showWizardModal  = ref(false);
const wizardApplyMode  = ref<'append' | 'replace'>('append');
const wizardApplying   = ref(false);
const editorWizardRef  = ref<InstanceType<typeof ProposalTemplateWizard> | null>(null);

const onEditorTypeSelected = (_type: string | null) => { /* auto-handled by wizard */ };

const applyWizardTemplate = async () => {
  const wizardData: any = editorWizardRef.value?.getResult?.() || {};
  const sections = wizardData.template_sections || [];
  const warehouseZones = wizardData.warehouse_mto_zones || [];
  if (!sections.length && !warehouseZones.length) {
    alert('Pilih jenis pekerjaan terlebih dahulu di wizard.');
    return;
  }
  if (sections.length && wizardApplyMode.value === 'replace' &&
      !confirm('Semua item RAB yang ada akan DIHAPUS dan diganti dengan template. Lanjutkan?')) return;

  wizardApplying.value = true;
  try {
    if (sections.length) {
      await api.post(`/estimator/proposals/${proposalId}/apply-template`, {
        proposal_type:     wizardData.type || null,
        template_sections: sections,
        mode:              wizardApplyMode.value,
      });
    }
    if (warehouseZones.length) {
      for (const zone of warehouseZones) {
        await api.post(`/estimator/proposals/${proposalId}/mto`, zone);
      }
    }
    showWizardModal.value = false;
    await loadItems();
    await loadSummary();
    const parts = [];
    if (sections.length) parts.push(`${sections.length} seksi RAB`);
    if (warehouseZones.length) parts.push(`${warehouseZones.length} zona MTO`);
    alert(`✅ Berhasil diterapkan! (${parts.join(', ')})`);
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal menerapkan template');
  } finally {
    wizardApplying.value = false;
  }
};

const summary = ref({
  direct_cost: 0,
  overhead: 0,
  risk_contingency: 0,
  total_project: 0
});

const disciplineSummary = ref<any[]>([]);

// Computed
const statusBadgeClass = computed(() => {
  const classes: Record<string, string> = {
    draft: 'bg-yellow-100 text-yellow-800',
    review: 'bg-blue-100 text-blue-800',
    submitted: 'bg-purple-100 text-purple-800',
    deal: 'bg-green-100 text-green-800',
    no_deal: 'bg-red-100 text-red-800',
  };
  return classes[proposal.value?.status || 'draft'];
});

const statusSteps = [
  { key: 'draft', label: 'Draft', activeClass: 'bg-yellow-100 text-yellow-800' },
  { key: 'review', label: 'Review', activeClass: 'bg-blue-100 text-blue-800' },
  { key: 'submitted', label: 'Submitted', activeClass: 'bg-purple-100 text-purple-800' },
  { key: 'deal', label: '🤝 Deal', activeClass: 'bg-green-100 text-green-800' },
];

const statusStepIndex = (status?: string) => {
  if (status === 'no_deal') return 3; // same level as deal
  return statusSteps.findIndex(s => s.key === status);
};

const isEditable = computed(() => {
  const s = proposal.value?.status;
  return s === 'draft' || s === 'review';
});

const modalCurrentSubDisciplines = computed(() => {
  return subDisciplines.value.filter(sd => sd.discipline_id === modalSelectedDisciplineId.value);
});

// ── Gantt computed ──
const ganttWeeks = computed(() => {
  if (!scheduleData.value) return [];
  const totalDays = Math.ceil(scheduleData.value.total_duration_days) + 14; // padding
  const weeks = [];
  const startDate = new Date(scheduleStartDate.value);
  let weekNum = 1;
  for (let d = 0; d < totalDays; d += 7) {
    const weekDate = new Date(startDate);
    weekDate.setDate(weekDate.getDate() + d);
    weeks.push({
      label: weekNum++,
      startDay: d,
      date: weekDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
    });
  }
  return weeks;
});


const filteredAHSP = computed(() => {

  if (!ahspSearch.value) return availableAHSP.value;
  
  const search = ahspSearch.value.toLowerCase();
  return availableAHSP.value.filter(ahsp => 
    ahsp.kode.toLowerCase().includes(search) || 
    ahsp.name.toLowerCase().includes(search)
  );
});

const sectionA = computed(() => detailItems.value.filter(i => i.section === 'A'));
const sectionB = computed(() => detailItems.value.filter(i => i.section === 'B'));
const sectionC = computed(() => detailItems.value.filter(i => i.section === 'C'));

// Get sequential item number (skipping section headers)
const getItemNumber = (index: number) => {
  let count = 0;
  for (let i = 0; i <= index; i++) {
    if (!items.value[i]?.is_section) count++;
  }
  return count;
};

// Methods
const loadProposal = async () => {
  try {
    const { data } = await api.get(`/estimator/proposals/${proposalId}`);
    proposal.value = data;
  } catch (error) {
    console.error('Failed to load proposal:', error);
  }
};

const loadDisciplines = async () => {
  try {
    const { data } = await api.get('/estimator/disciplines');
    disciplines.value = data;
    
    // Load all sub-disciplines
    for (const disc of data) {
      const { data: subs } = await api.get(`/estimator/disciplines/${disc.id}/sub-disciplines`);
      subDisciplines.value.push(...subs);
    }
  } catch (error) {
    console.error('Failed to load disciplines:', error);
  }
};

const loadItems = async () => {
  try {
    const { data } = await api.get(`/estimator/proposals/${proposalId}/items`);
    items.value = data;
  } catch (error) {
    console.error('Failed to load items:', error);
  }
};

const loadSummary = async () => {
  try {
    const { data } = await api.get(`/estimator/proposals/${proposalId}/summary`);
    disciplineSummary.value = data.discipline_totals;
    summary.value = data.proposal_totals;
  } catch (error) {
    console.error('Failed to load summary:', error);
  }
};

// ── Schedule Functions ──
const loadSchedule = async () => {
  if (scheduleLoading.value) return;
  scheduleLoading.value = true;
  try {
    const params = new URLSearchParams({
      workers_per_day: String(scheduleWorkers.value),
      hours_per_day:   String(scheduleHours.value),
      ...(scheduleStartDate.value ? { start_date: scheduleStartDate.value } : {})
    });
    const { data } = await api.get(`/estimator/proposals/${proposalId}/schedule?${params}`);
    data.wbs = data.wbs.map((row: any) => ({ ...row, _expanded: false, _editing: false }));
    scheduleData.value = data;
  } catch (error) {
    console.error('Failed to load schedule:', error);
  } finally {
    scheduleLoading.value = false;
  }
};

// ── Schedule overrides
const saveScheduleOverride = async (row: any) => {
  const itemId = parseInt(row.id.replace('item-', ''), 10);
  try {
    await api.put(`/estimator/proposals/${proposalId}/schedule/overrides`, {
      proposal_item_id:      itemId,
      start_day_override:    row._edit_start != null ? row._edit_start : row.start_day,
      duration_days_override: row._edit_dur  != null ? row._edit_dur  : row.duration_days,
      is_pinned: true,
    });
    row._editing = false;
    await loadSchedule();
  } catch (e) {
    alert('Gagal menyimpan override');
    console.error(e);
  }
};

const resetScheduleOverride = async (row: any) => {
  const itemId = parseInt(row.id.replace('item-', ''), 10);
  try {
    await api.delete(`/estimator/proposals/${proposalId}/schedule/overrides/${itemId}`);
    row._editing = false;
    await loadSchedule();
  } catch (e) { console.error(e); }
};

const loadPaymentSchedule = async () => {
  if (paymentLoading.value) return;
  paymentLoading.value = true;
  try {
    const params = new URLSearchParams({
      workers_per_day: String(scheduleWorkers.value),
      hours_per_day:   String(scheduleHours.value),
      start_date:      scheduleStartDate.value
    });
    const { data } = await api.get(`/estimator/proposals/${proposalId}/payment-schedule?${params}`);
    paymentData.value = data;
  } catch (e) {
    console.error('Payment schedule error:', e);
  } finally {
    paymentLoading.value = false;
  }
};

// Cycle step status: pending → in_progress → done → pending
const cycleProgress = async (row: any, unit: any, step: any) => {
  const next = step.status === 'pending' ? 'in_progress'
              : step.status === 'in_progress' ? 'done' : 'pending';
  // Optimistic update
  step.status = next;
  const propItemId = parseInt(row.id.replace('item-', ''), 10);
  try {
    await api.put(`/estimator/proposals/${proposalId}/schedule-progress`, {
      proposal_item_id: propItemId,
      unit_number: unit.unit_number,
      step_code: step.step_code,
      step_name: step.step_name,
      status: next
    });
  } catch (err) {
    // Revert on error
    step.status = step.status === 'in_progress' ? 'pending'
                : step.status === 'done' ? 'in_progress' : 'done';
    console.error('Progress update failed', err);
  }
};



const openAHSPModal = async () => {

  modalSelectedDisciplineId.value = null;
  modalSelectedSubDisciplineId.value = null;
  modalSelectedCategory.value = '';
  ahspSearch.value = '';
  availableAHSP.value = [];
  showAHSPModal.value = true;
  // Load categories if not already loaded
  if (ahspCategories.value.length === 0) {
    try {
      const { data } = await api.get('/estimator/ahsp-categories');
      ahspCategories.value = data;
    } catch (e) { console.error('Failed to load categories', e); }
  }
};

const onModalDisciplineChange = () => {
  modalSelectedSubDisciplineId.value = null;
};

const onModalCategoryChange = async () => {
  ahspSearch.value = '';
  if (!modalSelectedCategory.value) {
    availableAHSP.value = [];
    return;
  }
  ahspLoading.value = true;
  try {
    const { data } = await api.get(`/estimator/ahsp?work_category=${encodeURIComponent(modalSelectedCategory.value)}`);
    availableAHSP.value = data;
  } catch (e) { console.error('Failed to load AHSP by category', e); }
  finally { ahspLoading.value = false; }
};

const debounceAhspSearch = () => {
  if (ahspSearchTimer) clearTimeout(ahspSearchTimer);
  ahspSearchTimer = setTimeout(async () => {
    if (ahspSearch.value.length >= 2) {
      ahspLoading.value = true;
      try {
        const params = new URLSearchParams({ search: ahspSearch.value });
        if (modalSelectedCategory.value) params.set('work_category', modalSelectedCategory.value);
        const { data } = await api.get(`/estimator/ahsp?${params.toString()}`);
        availableAHSP.value = data;
      } catch (e) { console.error('Failed to search AHSP', e); }
      finally { ahspLoading.value = false; }
    } else if (modalSelectedCategory.value) {
      // Restore category results when search cleared
      onModalCategoryChange();
    } else {
      availableAHSP.value = [];
    }
  }, 300);
};


const isAhspAdded = (ahspId: number) => {
  return items.value.some(item => item.ahsp_id === ahspId);
};

const toggleAHSP = async (ahsp: AHSP) => {
  if (isAhspAdded(ahsp.id)) {
    // Remove item
    const existing = items.value.find(item => item.ahsp_id === ahsp.id);
    if (!existing) return;
    try {
      await api.delete(`/estimator/proposals/${proposalId}/items/${existing.id}`);
      await loadItems();
      await loadSummary();
    } catch (error) {
      console.error('Failed to remove AHSP:', error);
    }
  } else {
    // Add item
    try {
      await api.post(`/estimator/proposals/${proposalId}/items`, {
        ahsp_id: ahsp.id,
        discipline_id: modalSelectedDisciplineId.value,
        sub_discipline_id: modalSelectedSubDisciplineId.value,
        qty: 0
      });
      await loadItems();
      await loadSummary();
    } catch (error) {
      console.error('Failed to add AHSP:', error);
      alert('Failed to add item');
    }
  }
};

const updateItemDescription = async (item: ProposalItem) => {
  try {
    await api.put(`/estimator/proposals/${proposalId}/items/${item.id}`, {
      description: item.description || ''
    });
  } catch (error) {
    console.error('Failed to update description:', error);
  }
};

const updateItemQty = async (item: ProposalItem) => {
  try {
    await api.put(`/estimator/proposals/${proposalId}/items/${item.id}`, {
      qty: item.qty
    });
    
    // Recalculate total_price locally
    item.total_price = item.qty * item.unit_price_snapshot;
    
    await loadSummary();
  } catch (error) {
    console.error('Failed to update item:', error);
  }
};

const openCalculator = (item: ProposalItem) => {
  calcItem.value = item;
  showCalculator.value = true;
};

const applyCalcResult = async (value: number) => {
  if (calcItem.value) {
    calcItem.value.qty = value;
    await updateItemQty(calcItem.value);
  }
};

const deleteItem = async (itemId: number) => {
  if (!confirm('Delete this item?')) return;
  
  try {
    await api.delete(`/estimator/proposals/${proposalId}/items/${itemId}`);
    await loadItems();
    await loadSummary();
  } catch (error) {
    console.error('Failed to delete item:', error);
  }
};

const changeStatus = async (newStatus: string) => {
  const labels: Record<string, string> = {
    review: 'Submit to Review',
    submitted: 'Submit to Client',
    deal: 'Mark as Deal (Kontrak) — this will create a Project automatically',
    no_deal: 'Mark as No Deal',
    draft: 'Revert to Draft'
  };
  
  if (!confirm(`Are you sure you want to: ${labels[newStatus]}?`)) return;
  
  try {
    const { data } = await api.put(`/estimator/proposals/${proposalId}/status`, { status: newStatus });
    
    // Reload proposal to get updated status & project_id
    await loadProposal();
    
    if (newStatus === 'deal' && data.project_id) {
      let msg = `✅ Deal! Project created successfully.`;
      if (data.pr_number) {
        msg += `\n📋 PR ${data.pr_number} auto-created with materials from AHSP.`;
      }
      msg += `\nYou can now manage it from the Projects menu.`;
      alert(msg);
    }
  } catch (error: any) {
    const msg = error.response?.data?.error || 'Failed to update status';
    alert(`Error: ${msg}`);
  }
};

const viewRAB = () => {
  router.push(`/estimator/proposals/${proposalId}/rab`);
};

const viewAHSPDetail = async (ahspId: number) => {
  try {
    const { data } = await api.get(`/estimator/ahsp/${ahspId}`);
    selectedAhspDetail.value = data;
    detailItems.value = (data.items || []).map((row: any) => ({
      ...row,
      jumlah_harga: row.jumlah_harga ?? (Number(row.koefisien) * Number(row.resource_harga))
    }));
    showDetail.value = true;
  } catch (error) {
    console.error('Failed to load AHSP detail:', error);
    alert('Failed to load AHSP detail');
  }
};

const closeDetail = () => {
  showDetail.value = false;
  selectedAhspDetail.value = null;
  detailItems.value = [];
};

// --- AHSP Assign functions ---
const openAssignAHSP = (item: ProposalItem) => {
  assignTarget.value = item;
  assignSearch.value = '';
  assignResults.value = [];
  showAssignModal.value = true;
  // For re-assign: use current AHSP name. For new assign: use item name hint.
  const hint = (item.ahsp_id && item.ahsp_id > 0)
    ? (item.ahsp_name_snapshot?.split(' ').slice(0, 4).join(' ') || '')
    : (item.ahsp_name_snapshot?.split(' ').slice(0, 3).join(' ') || '');
  if (hint.length >= 2) {
    assignSearch.value = hint;
    doAssignSearch(hint);
  }
};

const debounceAssignSearch = () => {
  if (assignSearchTimer) clearTimeout(assignSearchTimer);
  assignSearchTimer = setTimeout(() => {
    if (assignSearch.value.length >= 2) {
      doAssignSearch(assignSearch.value);
    } else {
      assignResults.value = [];
    }
  }, 300);
};

const doAssignSearch = async (keyword: string) => {
  assignLoading.value = true;
  try {
    const { data } = await api.get(`/estimator/ahsp?search=${encodeURIComponent(keyword)}`);
    assignResults.value = data;
  } catch (error) {
    console.error('Failed to search AHSP:', error);
  } finally {
    assignLoading.value = false;
  }
};

const confirmAssignAHSP = async (ahsp: AHSP) => {
  if (!assignTarget.value) return;
  try {
    await api.put(`/estimator/proposals/${proposalId}/items/${assignTarget.value.id}`, {
      ahsp_id: ahsp.id
    });
    showAssignModal.value = false;
    await loadItems();
    await loadSummary();
  } catch (error) {
    console.error('Failed to assign AHSP:', error);
    alert('Gagal assign AHSP');
  }
};

const formatNumber = (value: number) => {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value || 0);
};

const formatDecimal = (value: number) => {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  }).format(value || 0);
};

onMounted(async () => {
  await Promise.all([
    loadProposal(),
    loadDisciplines(),
    loadItems(),
    loadSummary()
  ]);
});
</script>
