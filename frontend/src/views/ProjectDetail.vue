<template>
  <div class="min-h-screen bg-gray-50 flex flex-col" v-if="project">
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
              <div class="space-y-4">
                 <!-- Mock Activities -->
                 <div class="flex gap-3">
                    <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">JD</div>
                    <div>
                      <p class="text-sm text-gray-800"><span class="font-medium">John Doe</span> updated the status to <span class="font-medium">In Progress</span>.</p>
                      <p class="text-xs text-gray-500 mt-1">2 hours ago</p>
                    </div>
                 </div>
                 <div class="flex gap-3">
                    <div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xs font-bold shrink-0">SA</div>
                    <div>
                      <p class="text-sm text-gray-800"><span class="font-medium">Sarah Ann</span> completed task <span class="font-medium">Design Wireframes</span>.</p>
                      <p class="text-xs text-gray-500 mt-1">5 hours ago</p>
                    </div>
                 </div>
              </div>
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
      <div v-if="activeTab === 'gantt'">
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
  } catch {
    project.value = getMockProject(projectId);
    populateEditForm();
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

const getMockProject = (id: any) => {
  const mockProjects: { [key: string]: any } = {
    '1': { 
      id: 1, 
      title: 'Mobile App Development', 
      project_number: 'PRJ-001',
      client_name: 'Tech Startup Inc',
      status: 'in_progress', 
      progress: 65,
      price: 25000,
      budget_spent: 16250,
      start_date: '2026-01-10',
      deadline: '2026-06-30',
      description: 'Develop a cross-platform mobile application with iOS and Android support',
      members: [
        { id: 1, name: 'John Doe', avatar: 'JD' },
        { id: 2, name: 'Jane Smith', avatar: 'JS' },
        { id: 3, name: 'Mike Johnson', avatar: 'MJ' }
      ]
    },
    '2': { 
      id: 2, 
      title: 'Website Redesign', 
      project_number: 'PRJ-002',
      client_name: 'Fashion Boutique Co',
      status: 'in_progress', 
      progress: 45,
      price: 15000,
      budget_spent: 6750,
      start_date: '2026-02-01',
      deadline: '2026-04-15',
      description: 'Complete redesign of e-commerce website with modern UI/UX',
      members: [
        { id: 2, name: 'Jane Smith', avatar: 'JS' },
        { id: 4, name: 'Sarah Wilson', avatar: 'SW' }
      ]
    },
    '3': { 
      id: 3, 
      title: 'Cloud Migration', 
      project_number: 'PRJ-003',
      client_name: 'Enterprise Solutions Ltd',
      status: 'open', 
      progress: 0,
      price: 50000,
      budget_spent: 0,
      start_date: '2026-03-01',
      deadline: '2026-08-31',
      description: 'Migrate on-premise infrastructure to cloud (AWS)',
      members: [
        { id: 1, name: 'John Doe', avatar: 'JD' },
        { id: 3, name: 'Mike Johnson', avatar: 'MJ' }
      ]
    },
    '4': { 
      id: 4, 
      title: 'Data Analytics Dashboard', 
      project_number: 'PRJ-004',
      client_name: 'Analytics Corp',
      status: 'completed', 
      progress: 100,
      price: 18000,
      budget_spent: 18000,
      start_date: '2025-11-15',
      deadline: '2026-01-31',
      description: 'Build real-time analytics dashboard with BI tools',
      members: [
        { id: 1, name: 'John Doe', avatar: 'JD' },
        { id: 4, name: 'Sarah Wilson', avatar: 'SW' }
      ]
    },
    '5': { 
      id: 5, 
      title: 'API Integration', 
      project_number: 'PRJ-005',
      client_name: 'Financial Services Corp',
      status: 'in_progress', 
      progress: 30,
      price: 12000,
      budget_spent: 3600,
      start_date: '2026-01-20',
      deadline: '2026-05-20',
      description: 'Integrate third-party payment APIs and services',
      members: [
        { id: 2, name: 'Jane Smith', avatar: 'JS' },
        { id: 3, name: 'Mike Johnson', avatar: 'MJ' }
      ]
    },
    '6': { 
      id: 6, 
      title: 'Security Audit', 
      project_number: 'PRJ-006',
      client_name: 'HealthCare Systems Inc',
      status: 'open', 
      progress: 15,
      price: 8500,
      budget_spent: 1275,
      start_date: '2026-02-10',
      deadline: '2026-03-31',
      description: 'Comprehensive security assessment and penetration testing',
      members: [
        { id: 4, name: 'Sarah Wilson', avatar: 'SW' }
      ]
    }
  };
  
  return mockProjects[id] || mockProjects['1'];
};

const loadTasks = () => {
  if (!project.value) return;
  loadingTasks.value = true;
  tasks.value = getMockTasks();
  loadingTasks.value = false;
};

const getMockTasks = () => {
  return [
    { id: 1, title: 'Setup project infrastructure', status: 'Done', assigned_to: 'John Doe', due_date: '2026-01-20', priority: 'high' },
    { id: 2, title: 'Design database schema', status: 'In Progress', assigned_to: 'Jane Smith', due_date: '2026-01-25', priority: 'high' },
    { id: 3, title: 'Create API endpoints', status: 'In Progress', assigned_to: 'Mike Johnson', due_date: '2026-02-05', priority: 'high' },
    { id: 4, title: 'Build UI components', status: 'To Do', assigned_to: 'Sarah Wilson', due_date: '2026-02-15', priority: 'medium' },
    { id: 5, title: 'Write unit tests', status: 'To Do', assigned_to: 'John Doe', due_date: '2026-02-20', priority: 'medium' },
    { id: 6, title: 'Integration testing', status: 'To Do', assigned_to: 'Jane Smith', due_date: '2026-03-01', priority: 'medium' }
  ];
};

const loadMilestones = () => {
  if (!project.value) return;
  milestones.value = getMockMilestones();
};

const getMockMilestones = () => {
  return [
    { id: 1, title: 'Project Setup Complete', description: 'All infrastructure and tools configured', due_date: '2026-01-20', status: 'Completed' },
    { id: 2, title: 'Core Features Development', description: 'Complete development of core features', due_date: '2026-02-28', status: 'In Progress' },
    { id: 3, title: 'Testing Phase', description: 'QA and testing of all features', due_date: '2026-03-31', status: 'Pending' },
    { id: 4, title: 'Launch Ready', description: 'Final review and deployment preparation', due_date: '2026-04-15', status: 'Pending' }
  ];
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
  users.value = getMockUsers();
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

const getMockUsers = () => {
  return [
    { id: 1, name: 'John Doe', email: 'john@example.com' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
    { id: 3, name: 'Mike Johnson', email: 'mike@example.com' },
    { id: 4, name: 'Sarah Wilson', email: 'sarah@example.com' }
  ];
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
  }
});
</script>
