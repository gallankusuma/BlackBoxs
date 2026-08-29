<template>
  <!-- Gagal muat dinyatakan. Sebelumnya `v-if="project"` saja: kalau project
       gagal dimuat layarnya kosong tanpa satu pun keterangan — dan sebelum itu
       lagi, diisi project palsu. -->
  <div v-if="!project && galatProject" class="min-h-screen bg-gray-50 flex items-center justify-center p-6">
    <div class="max-w-md w-full rounded-xl border border-red-300 bg-red-50 px-6 py-5 text-center">
      <p class="text-sm text-red-800">{{ galatProject }}</p>
      <div class="mt-4 flex justify-center gap-3">
        <button @click="loadProject" class="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700">
          Coba lagi
        </button>
        <button @click="$router.push('/projects')" class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-white">
          Kembali ke daftar
        </button>
      </div>
    </div>
  </div>

  <div class="min-h-screen bg-gray-50 flex flex-col" v-else-if="project">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 sticky top-0 z-20">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div class="flex justify-between items-start">
          <div>
            <div class="flex items-center gap-2 mb-2 text-sm">
              <button @click="$router.push('/projects')" class="text-gray-500 hover:text-gray-700 font-medium">
                Projects
              </button>
              <span class="text-gray-300">/</span>
              <span class="text-gray-500">{{ project.project_number }}</span>
            </div>
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-bold text-gray-900">{{ project.title }}</h1>
               <span class="px-2.5 py-0.5 rounded-full text-xs font-medium capitalize" :class="getStatusColor(project.status)">
                {{ project.status?.replace('_', ' ') }}
              </span>
            </div>
          </div>
          
          <div class="flex gap-3">
             <button @click="showEditModal = true" class="bg-white border border-gray-300 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <span>⚙️</span> Settings
            </button>
            <div class="relative">
              <button @click="showActionsMenu = !showActionsMenu" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2">
                <span>⚡</span> Actions <span class="text-xs">▾</span>
              </button>
              <div v-if="showActionsMenu" class="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-30">
                <button @click="showEditModal = true; showActionsMenu = false" class="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                  ✏️ Edit Project
                </button>
                <div class="border-t border-gray-100 my-1"></div>
                <div class="px-4 py-1.5 text-xs text-gray-400 uppercase font-semibold">Change Status</div>
                <button v-for="s in ['open','in_progress','completed','hold']" :key="s" 
                  @click="changeStatus(s)" 
                  class="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                  :class="project.status === s ? 'text-blue-600 font-semibold bg-blue-50' : 'text-gray-700'"
                >
                  <span :class="getStatusColor(s)" class="w-2 h-2 rounded-full inline-block"></span>
                  {{ s.replace('_', ' ').replace(/\b\w/g, (l:string) => l.toUpperCase()) }}
                </button>
                <div class="border-t border-gray-100 my-1"></div>
                <button @click="deleteProject(); showActionsMenu = false" class="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                  🗑️ Delete Project
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="mt-8 flex gap-6 overflow-x-auto no-scrollbar border-b border-gray-200">
           <button 
            v-for="tab in tabs" 
            :key="tab.id"
            class="pb-3 text-sm font-medium whitespace-nowrap transition-all border-b-2"
            :class="activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Content -->
    <main :class="['flex-1 mx-auto py-8 w-full', wideTab ? 'px-4' : 'max-w-7xl px-4 sm:px-6 lg:px-8']">
      
      <!-- Overview Tab -->
      <div v-if="activeTab === 'overview'" class="space-y-6">
        <!-- Stats Grid -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <div class="text-sm text-gray-500 mb-1">Time Logged</div>
             <div class="flex items-end justify-between">
              <div class="text-2xl font-bold text-gray-800">120h</div>
               <span class="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">+12h this week</span>
             </div>
             <div class="w-full bg-gray-100 rounded-full h-1.5 mt-3">
                  <div class="bg-blue-500 h-1.5 rounded-full" style="width: 65%"></div>
              </div>
          </div>
           <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <div class="text-sm text-gray-500 mb-1">Tasks Completed</div>
             <div class="flex items-end justify-between">
              <div class="text-2xl font-bold text-gray-800">24/45</div>
               <span class="text-xs text-gray-500">53% Done</span>
             </div>
              <div class="w-full bg-gray-100 rounded-full h-1.5 mt-3">
                  <div class="bg-green-500 h-1.5 rounded-full" style="width: 53%"></div>
              </div>
          </div>
          <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <div class="text-sm text-gray-500 mb-1">Budget Spent</div>
             <div class="flex items-end justify-between">
              <div class="text-2xl font-bold text-gray-800">{{ formatCurrency(12500) }}</div>
               <span class="text-xs text-gray-500">of {{ formatCurrency(project.price) }}</span>
             </div>
             <div class="w-full bg-gray-100 rounded-full h-1.5 mt-3">
                  <div class="bg-yellow-500 h-1.5 rounded-full" style="width: 45%"></div>
              </div>
          </div>
           <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <div class="text-sm text-gray-500 mb-1">Team Members</div>
             <div class="flex -space-x-2 mt-2">
              <div 
                v-for="(member, i) in project.members" 
                :key="i"
                class="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-800 border-2 border-white ring-1 ring-gray-100"
                :title="member.name"
              >
                {{ member.name.charAt(0) }}
              </div>
              <button class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 border-2 border-white">
                +
              </button>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div class="lg:col-span-2 space-y-6">
             <!-- Description -->
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 class="font-bold text-gray-800 mb-4">Project Description</h3>
              <p class="text-gray-600 leading-relaxed">{{ project.description || 'No description provided.' }}</p>
            </div>
            
             <!-- Recent Activity -->
             <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 class="font-bold text-gray-800 mb-4">Recent Activity</h3>
              <!-- Dibaca dari project_activities. Sebelumnya dua aktivitas
                   karangan yang sama ditampilkan untuk SETIAP project. -->
              <div v-if="aktivitas.length" class="space-y-4">
                 <div v-for="a in aktivitas" :key="a.id" class="flex gap-3">
                    <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">
                      {{ inisial(a.user_name || a.username) }}
                    </div>
                    <div>
                      <p class="text-sm text-gray-800">
                        <span class="font-medium">{{ a.user_name || a.username || 'Sistem' }}</span>
                        {{ a.description }}
                      </p>
                      <p class="text-xs text-gray-500 mt-1">{{ waktuRelatif(a.created_at) }}</p>
                    </div>
                 </div>
              </div>
              <p v-else class="text-sm text-gray-500">Belum ada aktivitas tercatat pada project ini.</p>
            </div>
          </div>

          <div class="space-y-6">
            <!-- Details Card -->
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
               <h3 class="font-bold text-gray-800 mb-4">Details</h3>
               <dl class="space-y-4 text-sm">
                <div class="flex justify-between border-b border-gray-100 pb-2">
                  <dt class="text-gray-500">Client</dt>
                  <dd class="font-medium text-blue-600">{{ project.client_name || 'N/A' }}</dd>
                </div>
                <div class="flex justify-between border-b border-gray-100 pb-2">
                  <dt class="text-gray-500">Start Date</dt>
                  <dd class="font-medium">{{ formatDate(project.start_date) }}</dd>
                </div>
                <div class="flex justify-between border-b border-gray-100 pb-2">
                  <dt class="text-gray-500">Deadline</dt>
                  <dd class="font-medium text-red-600">{{ formatDate(project.deadline) }}</dd>
                </div>
                 <div class="flex justify-between border-b border-gray-100 pb-2">
                  <dt class="text-gray-500">Priority</dt>
                  <dd class="font-medium text-orange-600">High</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <!-- Tasks List Tab -->
      <div v-if="galatTugas && (activeTab === 'tasks-list' || activeTab === 'tasks-kanban' || activeTab === 'gantt')"
           class="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
        {{ galatTugas }}
        <button @click="loadTasks" class="ml-3 underline font-semibold">Coba lagi</button>
      </div>

      <div v-if="activeTab === 'tasks-list'">
         <div class="flex justify-between mb-6">
          <h3 class="text-lg font-bold text-gray-800">Tasks</h3>
          <button 
            @click="openTaskModal()"
            class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            + Add Task
          </button>
        </div>
        <ProjectTasksList 
          :tasks="tasks" 
          @editTask="openTaskModal" 
          @deleteTask="deleteTask"
        />
      </div>

      <!-- Tasks Kanban Tab -->
      <div v-if="activeTab === 'tasks-kanban'">
         <div class="flex justify-between mb-6">
          <h3 class="text-lg font-bold text-gray-800">Task Board</h3>
           <button 
            @click="openTaskModal()"
            class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            + Add Task
          </button>
        </div>
        <ProjectKanban 
          :tasks="tasks" 
          @editTask="openTaskModal" 
          @updateTaskStatus="updateTaskStatus"
          @deleteTask="deleteTask"
        />
      </div>

      <!-- Milestones Tab -->
      <div v-if="activeTab === 'milestones'">
        <ProjectMilestones 
          :milestones="milestones" 
          @addMilestone="openMilestoneModal" 
          @editMilestone="openMilestoneModal" 
          @deleteMilestone="deleteMilestone"
        />
      </div>

      <!-- Gantt Tab -->
      <div v-if="activeTab === 'gantt'" class="space-y-4">
        <!-- Baseline jadwal kontrak: apa yang DIJUAL, terkunci.
             Gantt di bawahnya adalah rencana kerja yang boleh bergerak;
             selisih keduanya justru angka yang dicari. -->
        <div v-if="baselineJadwal?.ada_baseline" class="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div class="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 border-b bg-amber-50 rounded-t-xl">
            <div class="text-sm font-semibold text-amber-900">
              🔒 Baseline kontrak — Revisi #{{ baselineJadwal.revision_no }}
            </div>
            <div class="text-sm text-gray-600">
              Mulai <strong>{{ baselineJadwal.start_date || '—' }}</strong>
            </div>
            <div class="text-sm text-gray-600">
              Durasi kontrak <strong>{{ baselineJadwal.total_days }} hari</strong>
            </div>
            <div v-if="baselineJadwal.ringkasan" class="text-sm"
                 :class="baselineJadwal.ringkasan.total_selisih_hari > 0 ? 'text-red-700 font-semibold' : 'text-emerald-700'">
              Selisih rencana
              {{ baselineJadwal.ringkasan.total_selisih_hari > 0 ? '+' : '' }}{{ baselineJadwal.ringkasan.total_selisih_hari }} hari
            </div>
            <div v-if="baselineJadwal.ringkasan?.belum_tertaut" class="text-sm text-gray-500">
              {{ baselineJadwal.ringkasan.belum_tertaut }} baris belum tertaut ke task
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-gray-600">
                <tr>
                  <th class="text-left px-4 py-2 font-medium">Pekerjaan</th>
                  <th class="text-right px-4 py-2 font-medium">Baseline mulai</th>
                  <th class="text-right px-4 py-2 font-medium">Baseline durasi</th>
                  <th class="text-right px-4 py-2 font-medium">Rencana durasi</th>
                  <th class="text-right px-4 py-2 font-medium">Selisih</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="v in baselineJadwal.variance" :key="v.line_no" class="border-t">
                  <td class="px-4 py-2">
                    <span class="text-gray-400 mr-1">{{ v.kode }}</span>{{ v.name }}
                  </td>
                  <td class="px-4 py-2 text-right text-gray-600">{{ v.baseline_start_date || '—' }}</td>
                  <td class="px-4 py-2 text-right">{{ v.baseline_duration_days }} hari</td>
                  <td class="px-4 py-2 text-right">
                    <span v-if="v.task_duration_days !== null">{{ v.task_duration_days }} hari</span>
                    <span v-else class="text-gray-400">belum tertaut</span>
                  </td>
                  <td class="px-4 py-2 text-right"
                      :class="v.selisih_hari === null ? 'text-gray-400'
                              : v.selisih_hari > 0 ? 'text-red-600 font-semibold'
                              : v.selisih_hari < 0 ? 'text-emerald-600 font-semibold' : 'text-gray-600'">
                    <span v-if="v.selisih_hari === null">—</span>
                    <span v-else>{{ v.selisih_hari > 0 ? '+' : '' }}{{ v.selisih_hari }} hari</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Baseline ada tapi rencana kerjanya masih kosong: tawarkan
             membentuknya dari yang dijual, sekali klik dan atas permintaan. -->
        <div v-if="baselineJadwal?.ada_baseline && !tasks.length"
             class="rounded-xl border border-blue-300 bg-blue-50 px-5 py-4 flex flex-wrap items-center gap-4">
          <div class="text-sm text-blue-900">
            Project ini punya baseline jadwal kontrak tapi belum punya satu pun task.
            Rencana kerjanya bisa dibentuk dari jadwal yang dijual.
          </div>
          <button @click="bentukDariBaseline" :disabled="menyemai"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {{ menyemai ? 'Membentuk…' : 'Bentuk rencana kerja dari baseline' }}
          </button>
        </div>

        <div v-if="baselineJadwal && !baselineJadwal.ada_baseline"
             class="rounded-xl border border-gray-200 bg-gray-50 px-5 py-3 text-sm text-gray-600">
          Project ini tidak punya baseline jadwal kontrak. {{ baselineJadwal.sebab }}
        </div>

        <ProjectGantt :tasks="tasks" :milestones="milestones" />
      </div>

      <!-- Notes Tab -->
      <div v-if="activeTab === 'notes'">
        <ProjectNotes />
      </div>

      <div v-if="activeTab === 'files'">
        <ProjectFiles
          :project-id="route.params.id as string"
          :files="files"
          @refresh="loadFiles"
        />
      </div>

       <!-- Comments Tab -->
      <div v-if="activeTab === 'comments'">
        <ProjectComments />
      </div>

      <!-- Timesheets Tab -->
      <div v-if="activeTab === 'timesheets'">
        <ProjectTimesheets :project-id="route.params.id as string" />
      </div>

       <!-- Expenses Tab -->
      <div v-if="activeTab === 'expenses'">
        <ProjectExpenses :project-id="route.params.id as string" />
      </div>

      <!-- Cost Control Tab -->
      <div v-if="activeTab === 'cost-control'">
        <ProjectCostControl :projectId="route.params.id as string" />
      </div>

      <!-- MTO / QTO Tab -->
      <div v-if="activeTab === 'mto'">
        <!-- EST-MTO-R37: project hanya ada setelah deal, jadi yang ditampilkan
             selalu kuantitas kontrak, bukan hitung ulang formula sekarang. -->
        <ProjectMTO :project-id="route.params.id as string" readonly contract-mode />
      </div>

      <!-- Manpower Mobilization Plan Tab -->
      <div v-if="activeTab === 'manpower'">
        <ManpowerPlan :project-id="route.params.id as string" />
      </div>

    </main>

    <!-- Edit Project Modal -->
    <div v-if="showEditModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="showEditModal = false">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div class="px-6 py-4 border-b flex items-center justify-between">
          <h2 class="text-xl font-bold text-gray-900">Edit Project</h2>
          <button @click="showEditModal = false" class="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form @submit.prevent="saveProject" class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">Project Title *</label>
              <input v-model="editForm.title" type="text" required class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Project Number</label>
              <input v-model="editForm.project_number" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-50" readonly />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select v-model="editForm.status" class="w-full border border-gray-300 rounded-lg px-3 py-2">
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="hold">On Hold</option>
              </select>
            </div>
            <!-- Client dan Budget terikat kontrak kalau project ini lahir dari
                 Proposal Deal. Sebelumnya keduanya input biasa yang selalu
                 dikirim, sehingga nilai kontrak yang dibentuk atomik saat Deal
                 kehilangan otoritasnya begitu handoff selesai. -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Client</label>
              <select v-model="editForm.client_id" :disabled="terikatKontrak"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500">
                <option :value="null">— Select Client —</option>
                <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
              <p v-if="terikatKontrak" class="mt-1 text-xs text-gray-500">
                Mengikuti kontrak {{ project?.kontrak?.proposal_number }} — tidak bisa diganti dari sini.
              </p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Budget / Price</label>
              <input v-model.number="editForm.budget" type="number" :disabled="terikatKontrak"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500" />
              <p v-if="terikatKontrak" class="mt-1 text-xs text-gray-500">
                Nilai kontrak {{ project?.kontrak?.proposal_number }}. Mengubahnya adalah change order.
              </p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input v-model="editForm.start_date" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
              <input v-model="editForm.deadline" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div class="col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea v-model="editForm.description" rows="3" class="w-full border border-gray-300 rounded-lg px-3 py-2"></textarea>
            </div>
          </div>
          <div class="flex justify-end gap-3 pt-2">
            <button type="button" @click="showEditModal = false" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
            <button type="submit" :disabled="saving" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
              {{ saving ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </form>
      </div>
    </div>
    
    <!-- Task Modal -->
    <TaskModal 
      v-if="showTaskModal" 
      :task="editingTask" 
      :users="users"
      @close="showTaskModal = false"
      @save="saveTask"
    />

    <!-- Milestone Modal -->
    <MilestoneModal 
      v-if="showMilestoneModal" 
      :milestone="editingMilestone" 
      @close="showMilestoneModal = false"
      @save="saveMilestone"
    />

  </div>
  <div v-else class="min-h-screen flex items-center justify-center bg-gray-50">
     <div class="text-center">
       <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
       <p class="text-gray-500">Loading Project Details...</p>
     </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/lib/api';
import ProjectKanban from '@/components/projects/ProjectKanban.vue';
import ProjectTasksList from '@/components/projects/ProjectTasksList.vue';
import TaskModal from '@/components/projects/TaskModal.vue';
import ProjectMilestones from '@/components/projects/ProjectMilestones.vue';
import MilestoneModal from '@/components/projects/MilestoneModal.vue';
import ProjectFiles from '@/components/projects/ProjectFiles.vue';
// New Components
import ProjectGantt from '@/components/projects/ProjectGantt.vue';
import ProjectNotes from '@/components/projects/ProjectNotes.vue';
import ProjectExpenses from '@/components/projects/ProjectExpenses.vue';
import ProjectTimesheets from '@/components/projects/ProjectTimesheets.vue';
import ProjectComments from '@/components/projects/ProjectComments.vue';
import ProjectCostControl from '@/components/projects/ProjectCostControl.vue';
import ProjectMTO from '@/components/projects/ProjectMTO.vue';
import ManpowerPlan from '@/components/projects/ManpowerPlan.vue';
import { formatCurrency } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const project = ref<any>(null);
const activeTab = ref('overview');
const galatTugas = ref('');
const galatProject = ref('');
const aktivitas = ref<any[]>([]);
const baselineJadwal = ref<any>(null);
const menyemai = ref(false);
const wideTab = computed(() => ['manpower', 'mto', 'gantt', 'cost-control'].includes(activeTab.value));

const tasks = ref<any[]>([]);
const milestones = ref<any[]>([]);
const files = ref<any[]>([]);
const users = ref<any[]>([]);
const loadingTasks = ref(false);
const showTaskModal = ref(false);
const editingTask = ref<any>(null);
const showMilestoneModal = ref(false);
const editingMilestone = ref<any>(null);
const showEditModal = ref(false);
const showActionsMenu = ref(false);
const saving = ref(false);
const clients = ref<any[]>([]);

/** Project yang lahir dari Proposal Deal: nilai & client-nya terikat kontrak. */
const terikatKontrak = computed(() => !!project.value?.proposal_id);

const editForm = ref({
  title: '',
  project_number: '',
  status: 'open',
  client_id: null as number|null,
  budget: 0,
  start_date: '',
  deadline: '',
  description: '',
});

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'cost-control', label: 'Cost Control' },
  { id: 'mto', label: '📐 MTO / QTO' },
  { id: 'manpower', label: '👷 Manpower Plan' },
  { id: 'tasks-list', label: 'Tasks List' },
  { id: 'tasks-kanban', label: 'Tasks Kanban' },
  { id: 'milestones', label: 'Milestones' },
  { id: 'gantt', label: 'Gantt' },
  { id: 'notes', label: 'Notes' },
  { id: 'files', label: 'Files' },
  { id: 'comments', label: 'Comments' },
  { id: 'timesheets', label: 'Timesheets' },
  { id: 'expenses', label: 'Expenses' }
];

const loadProject = async () => {
  const projectId = route.params.id;
  try {
    const res = await api.get(`/projects/${projectId}`);
    const p = res.data;
    project.value = {
      ...p,
      title: p.title || p.project_name,
      price: p.price || p.budget,
      deadline: p.deadline || p.end_date,
      members: p.members || []
    };
    // Populate edit form
    populateEditForm();
  } catch (e: any) {
    // Dulu jatuh ke `getMockProject()` — project gagal muat ditampilkan sebagai
    // "Mobile App Development" lengkap dengan nilai dan tenggatnya. Layar yang
    // memalsukan data tidak bisa dibedakan dari layar yang benar, dan itu jauh
    // lebih berbahaya daripada pesan error.
    project.value = null;
    galatProject.value = e?.response?.status === 404
      ? 'Project ini tidak ditemukan.'
      : (e?.response?.data?.error || 'Gagal memuat project.');
    console.error('Gagal memuat project:', e);
  }
};

const populateEditForm = () => {
  if (!project.value) return;
  const p = project.value;
  editForm.value = {
    title: p.title || p.project_name || '',
    project_number: p.project_number || '',
    status: p.status || 'open',
    client_id: p.client_id || null,
    budget: p.price || p.budget || 0,
    start_date: p.start_date ? p.start_date.slice(0, 10) : '',
    deadline: (p.deadline || p.end_date || '') ? (p.deadline || p.end_date || '').slice(0, 10) : '',
    description: p.description || '',
  };
};


/**
 * Task dan milestone dibaca dari database, bukan dikarang di layar.
 *
 * Versi lama mengisi keduanya dengan daftar hardcode ("John Doe", "Setup
 * project infrastructure") padahal `GET /projects/:id/tasks` dan
 * `/milestones` sudah ada dan bekerja. Akibatnya SETIAP project menampilkan
 * enam task palsu yang sama, dan — ini yang paling merugikan — `saveTask`
 * menyimpan task betulan ke database lalu memanggil `loadTasks()` yang
 * langsung menimpanya kembali dengan data palsu. Task yang baru dibuat
 * pengguna hilang dari layar seketika, padahal tersimpan.
 */
const loadTasks = async () => {
  if (!project.value) return;
  loadingTasks.value = true;
  try {
    const { data } = await api.get(`/projects/${project.value.id}/tasks`);
    tasks.value = Array.isArray(data) ? data : [];
    galatTugas.value = '';
  } catch (e: any) {
    // Daftar kosong karena gagal muat tidak boleh terbaca sama dengan
    // "project ini memang belum punya task".
    tasks.value = [];
    galatTugas.value = e?.response?.data?.error || 'Gagal memuat task project.';
    console.error('Gagal memuat task:', e);
  } finally {
    loadingTasks.value = false;
  }
};

const inisial = (nama?: string) => (nama || '?')
  .split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '?';

const waktuRelatif = (iso?: string) => {
  if (!iso) return '';
  const detik = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (detik < 60) return 'baru saja';
  if (detik < 3600) return `${Math.floor(detik / 60)} menit lalu`;
  if (detik < 86400) return `${Math.floor(detik / 3600)} jam lalu`;
  if (detik < 2592000) return `${Math.floor(detik / 86400)} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

const loadAktivitas = async () => {
  if (!project.value) return;
  try {
    const { data } = await api.get(`/projects/${project.value.id}/activities`);
    aktivitas.value = data?.data || [];
  } catch (e) {
    aktivitas.value = [];
    console.error('Gagal memuat aktivitas project:', e);
  }
};

/** Baseline jadwal kontrak — apa yang dijual, untuk dibandingkan dengan rencana. */
const loadBaselineJadwal = async () => {
  if (!project.value) return;
  try {
    const { data } = await api.get(`/projects/${project.value.id}/schedule-baseline`);
    baselineJadwal.value = data;
  } catch (e) {
    baselineJadwal.value = null;
    console.error('Gagal memuat baseline jadwal:', e);
  }
};

const bentukDariBaseline = async () => {
  if (!project.value || menyemai.value) return;
  menyemai.value = true;
  try {
    const { data } = await api.post(`/projects/${project.value.id}/schedule/seed-from-baseline`);
    await loadTasks();
    await loadBaselineJadwal();
    alert(data?.message || 'Rencana kerja dibentuk dari baseline.');
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal membentuk rencana kerja dari baseline.');
  } finally {
    menyemai.value = false;
  }
};

const loadMilestones = async () => {
  if (!project.value) return;
  try {
    const { data } = await api.get(`/projects/${project.value.id}/milestones`);
    milestones.value = Array.isArray(data) ? data : [];
  } catch (e) {
    milestones.value = [];
    console.error('Gagal memuat milestone:', e);
  }
};


const loadFiles = async () => {
  if (!project.value) return;
  try {
    const res = await api.get(`/projects/${project.value.id}/files`);
    files.value = res.data;
  } catch {
    files.value = [];
  }
};


const loadMetadata = async () => {
  // Dulu diisi daftar hardcode (John Doe, Jane Smith). Penugasan task karena
  // itu menunjuk id user yang tidak ada di database ini.
  try {
    const res = await api.get('/users');
    const daftar = res.data?.data || res.data || [];
    users.value = (Array.isArray(daftar) ? daftar : []).map((u: any) => ({
      ...u, name: u.full_name || u.name || u.username,
    }));
  } catch (e) {
    users.value = [];
    console.error('Gagal memuat daftar user:', e);
  }
  try {
    const res = await api.get('/clients');
    clients.value = res.data?.data || res.data || [];
  } catch { clients.value = []; }
};

const saveProject = async () => {
  saving.value = true;
  try {
    await api.put(`/projects/${project.value.id}`, {
      title: editForm.value.title,
      project_name: editForm.value.title,
      status: editForm.value.status,
      client_id: editForm.value.client_id,
      budget: editForm.value.budget,
      start_date: editForm.value.start_date || null,
      end_date: editForm.value.deadline || null,
      deadline: editForm.value.deadline || null,
      description: editForm.value.description,
    });
    showEditModal.value = false;
    await loadProject();
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Failed to save project');
  } finally {
    saving.value = false;
  }
};

const changeStatus = async (newStatus: string) => {
  showActionsMenu.value = false;
  try {
    await api.put(`/projects/${project.value.id}`, {
      ...project.value,
      title: project.value.title || project.value.project_name,
      project_name: project.value.title || project.value.project_name,
      status: newStatus,
    });
    project.value.status = newStatus;
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Failed to change status');
  }
};

const deleteProject = async () => {
  if (!confirm('Are you sure you want to DELETE this project? This cannot be undone.')) return;
  try {
    await api.delete(`/projects/${project.value.id}`);
    router.push('/projects');
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Failed to delete project');
  }
};


const openTaskModal = (task: any = null) => {
  editingTask.value = task;
  showTaskModal.value = true;
};

const saveTask = async (taskData: any) => {
  try {
    if (editingTask.value) {
      await api.put(`/projects/tasks/${editingTask.value.id}`, taskData);
    } else {
      await api.post(`/projects/${project.value.id}/tasks`, taskData);
    }
    showTaskModal.value = false;
    loadTasks();
    if (activeTab.value === 'milestones') loadMilestones();
  } catch (error) {
    console.error('Failed to save task:', error);
    alert('Failed to save task');
  }
};

const updateTaskStatus = async (taskId: number, newStatus: string) => {
  try {
    const task = tasks.value.find(t => t.id === taskId);
    if (task) {
      task.status = newStatus;
      await api.put(`/projects/tasks/${taskId}`, { ...task, status: newStatus });
    }
    if (activeTab.value === 'milestones') loadMilestones();
  } catch (error) {
    console.error('Failed to update task status:', error);
    loadTasks();
  }
};

const deleteTask = async (taskId: number) => {
  if (!confirm('Are you sure you want to delete this task?')) return;
  try {
    await api.delete(`/projects/tasks/${taskId}`);
    loadTasks();
    if (activeTab.value === 'milestones') loadMilestones();
  } catch (error) {
    console.error('Failed to delete task:', error);
  }
};

const openMilestoneModal = (milestone: any = null) => {
  editingMilestone.value = milestone;
  showMilestoneModal.value = true;
};

const saveMilestone = async (milestoneData: any) => {
  try {
    if (editingMilestone.value) {
      await api.put(`/projects/milestones/${editingMilestone.value.id}`, milestoneData);
    } else {
      await api.post(`/projects/${project.value.id}/milestones`, milestoneData);
    }
    showMilestoneModal.value = false;
    loadMilestones();
  } catch (error) {
    console.error('Failed to save milestone:', error);
    alert('Failed to save milestone');
  }
};

const deleteMilestone = async (milestoneId: number) => {
  if (!confirm('Are you sure you want to delete this milestone?')) return;
  try {
    await api.delete(`/projects/milestones/${milestoneId}`);
    loadMilestones();
  } catch (error) {
    console.error('Failed to delete milestone:', error);
  }
};

const uploadFile = async (file: File) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    await api.post(`/projects/${project.value.id}/files`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    loadFiles();
  } catch (error) {
    console.error('Failed to upload file:', error);
    alert('Failed to upload file');
  }
};

const deleteFile = async (fileId: number) => {
  if (!confirm('Are you sure you want to delete this file?')) return;
  try {
    await api.delete(`/projects/files/${fileId}`);
    loadFiles();
  } catch (error) {
    console.error('Failed to delete file:', error);
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'open': return 'bg-blue-100 text-blue-800';
    case 'in_progress': return 'bg-yellow-100 text-yellow-800';
    case 'completed': return 'bg-green-100 text-green-800';
    default: return 'bg-gray-100 text-gray-600';
  }
};

const formatDate = (date: string) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};



// Simplified watch logic
watch(activeTab, (newTab) => {
  if (newTab === 'tasks-list' || newTab === 'tasks-kanban') {
    loadTasks();
  } else if (newTab === 'gantt') {
    // Tab Gantt membandingkan rencana kerja dengan baseline kontrak, jadi
    // keduanya harus segar saat dibuka.
    loadTasks();
    loadBaselineJadwal();
  } else if (newTab === 'milestones') {
    loadMilestones();
  } else if (newTab === 'files') {
    loadFiles();
  }
});

onMounted(() => {
  loadProject();
  loadMetadata();
});

watch(project, (newProject) => {
  if (newProject) {
    loadTasks();
    loadMilestones();
    loadFiles();
    loadBaselineJadwal();
    loadAktivitas();
  }
});
</script>
