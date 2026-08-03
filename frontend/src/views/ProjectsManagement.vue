<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-6">
      <div>
        <h1 class="text-3xl font-bold text-gray-800">📂 Projects</h1>
        <p class="text-gray-600 mt-1">Manage all your projects, tasks, and teams.</p>
      </div>
      <div>
        <button 
          @click="openCreateModal"
          class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <span>+ New Project</span>
        </button>
      </div>
    </div>

    <!-- View Mode Toggle & Filters -->
    <div class="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap gap-4 items-center justify-between">
      <div class="flex items-center gap-4 flex-1">
        <div class="relative flex-1 min-w-[200px] max-w-md">
          <span class="absolute left-3 top-2.5 text-gray-400">🔍</span>
          <input 
            v-model="searchQuery" 
            type="text" 
            placeholder="Search projects..." 
            class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
        </div>
        
        <select v-model="statusFilter" class="border border-gray-300 rounded-lg px-4 py-2">
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="hold">On Hold</option>
        </select>

        <select v-model="sortOrder" class="border border-gray-300 rounded-lg px-4 py-2">
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="deadline">Deadline</option>
        </select>
      </div>

      <div class="flex bg-gray-100 rounded-lg p-1">
        <button 
          @click="viewMode = 'grid'"
          class="p-2 rounded-md transition-all"
          :class="viewMode === 'grid' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'"
          title="Grid View"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
        </button>
        <button 
          @click="viewMode = 'list'"
          class="p-2 rounded-md transition-all"
          :class="viewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'"
          title="List View"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
        </button>
      </div>
    </div>

    <!-- Projects Content -->
    <div v-if="loading" class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      <p class="mt-4 text-gray-500">Loading projects...</p>
    </div>

    <div v-else-if="filteredProjects.length === 0" class="text-center py-12 bg-white rounded-lg shadow">
      <p class="text-xl text-gray-500">No projects found.</p>
      <button 
        @click="openCreateModal"
        class="mt-4 text-blue-600 hover:text-blue-800 font-medium"
      >
        Create your first project &rarr;
      </button>
    </div>

    <div v-else>
      <!-- Grid View -->
      <div v-if="viewMode === 'grid'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div 
          v-for="project in filteredProjects" 
          :key="project.id" 
          class="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 overflow-hidden cursor-pointer group"
          @click="goToDetail(project.id)"
        >
          <div class="p-5">
            <div class="flex justify-between items-start mb-4">
              <span 
                class="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide"
                :class="getStatusColor(project.status)"
              >
                {{ project.status?.replace('_', ' ') }}
              </span>
              <div class="text-gray-400 group-hover:text-blue-600 transition-colors">
                ➔
              </div>
            </div>
            
            <h3 class="text-xl font-bold text-gray-800 mb-2 group-hover:text-blue-600 transition-colors line-clamp-1">
              {{ project.title }}
            </h3>
            <p class="text-gray-500 text-sm mb-4 line-clamp-2 h-10">
              {{ project.description || 'No description provided.' }}
            </p>

            <div class="flex items-center justify-between text-sm text-gray-600 mb-4">
              <div class="flex items-center gap-1">
                <span>📅</span>
                <span>{{ formatDate(project.deadline) }}</span>
              </div>
              <div class="flex items-center gap-1 font-medium">
                <span>💰</span>
                <span>{{ formatCurrency(project.price) }}</span>
              </div>
            </div>

            <!-- Progress Bar -->
            <div class="w-full bg-gray-100 rounded-full h-2 mb-2">
              <div 
                class="bg-blue-600 h-2 rounded-full transition-all duration-500"
                :style="{ width: `${project.progress || 0}%` }"
              ></div>
            </div>
            <div class="flex justify-between text-xs text-gray-500">
              <span>Progress</span>
              <span>{{ project.progress || 0 }}%</span>
            </div>
          </div>
          
          <div class="bg-gray-50 px-5 py-3 border-t border-gray-100 flex justify-between items-center text-xs text-gray-500">
            <div>
              Client: <span class="font-medium text-gray-700">{{ project.client_name || 'N/A' }}</span>
            </div>
            <div>
              PM: <span class="font-medium text-gray-700">{{ project.manager_name || 'Unassigned' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- List View -->
      <div v-else class="bg-white rounded-lg shadow overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">ID</th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start / Deadline</th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4">Progress</th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th scope="col" class="relative px-6 py-3"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr 
              v-for="project in filteredProjects" 
              :key="project.id" 
              class="hover:bg-gray-50 cursor-pointer transition-colors"
              @click="goToDetail(project.id)"
            >
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">#{{ project.id }}</td>
              <td class="px-6 py-4">
                <div class="text-sm font-bold text-gray-900">{{ project.title }}</div>
                <div class="text-xs text-gray-500 line-clamp-1">{{ project.description }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-blue-600 hover:underline">
                {{ project.client_name || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ formatCurrency(project.price) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                <div>{{ formatDate(project.start_date) }}</div>
                <div class="text-red-500 font-medium">{{ formatDate(project.deadline) }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap align-middle">
                <div class="flex items-center gap-3">
                   <div class="w-full bg-gray-200 rounded-full h-1.5 flex-1">
                    <div 
                      class="bg-blue-600 h-1.5 rounded-full" 
                      :style="{ width: `${project.progress || 0}%` }"
                    ></div>
                  </div>
                  <span class="text-xs font-medium text-gray-700 w-8">{{ project.progress || 0 }}%</span>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span 
                  class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full capitalize"
                  :class="getStatusColor(project.status)"
                >
                  {{ project.status?.replace('_', ' ') }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button class="text-gray-400 hover:text-blue-600 mx-1" title="View Details">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </button>
                <button class="text-gray-400 hover:text-red-600 mx-1" title="Delete Project" @click.stop>
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create Modal -->
    <div v-if="showCreateModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6">
        <h2 class="text-2xl font-bold mb-6">Create New Project</h2>
        
        <form @submit.prevent="createProject" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Project Title</label>
              <input v-model="form.title" type="text" required class="w-full border rounded px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Client</label>
              <select v-model="form.client_id" class="w-full border rounded px-3 py-2">
                <option :value="null">Select Client</option>
                <option v-for="client in clients" :key="client.id" :value="client.id">{{ client.name }}</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea v-model="form.description" rows="3" class="w-full border rounded px-3 py-2"></textarea>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input v-model="form.start_date" type="date" class="w-full border rounded px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
              <input v-model="form.deadline" type="date" class="w-full border rounded px-3 py-2">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Budget</label>
              <input v-model="form.price" type="number" class="w-full border rounded px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Project Manager</label>
              <select v-model="form.assigned_to" class="w-full border rounded px-3 py-2">
                <option :value="null">Select Manager</option>
                <option v-for="user in users" :key="user.id" :value="user.id">{{ user.name }}</option>
              </select>
            </div>
          </div>

          <div class="flex justify-end gap-3 mt-6">
            <button type="button" @click="showCreateModal = false" class="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>
            <button type="submit" class="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create Project</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/lib/api';
import { formatCurrency } from '@/utils/format';

const router = useRouter();
const projects = ref<any[]>([]);
const clients = ref<any[]>([]);
const users = ref<any[]>([]);
const loading = ref(true);
const showCreateModal = ref(false);

const searchQuery = ref('');
const statusFilter = ref('');
const sortOrder = ref('newest');
const viewMode = ref('list'); // Default to list view to match reference

const form = ref({
  title: '',
  client_id: null,
  description: '',
  start_date: '',
  deadline: '',
  price: 0,
  assigned_to: null,
  status: 'open'
});

const loadProjects = async () => {
  loading.value = true;
  try {
    const { data } = await api.get('/projects');
    projects.value = data && data.length > 0 ? data : mockProjects();
  } catch (error) {
    console.error('Failed to load projects:', error);
    projects.value = mockProjects();
  } finally {
    loading.value = false;
  }
};

const mockProjects = () => {
  return [
    { 
      id: 1, 
      title: 'Mobile App Development', 
      client_name: 'Tech Startup Inc', 
      client_id: 1,
      project_number: 'PRJ-001',
      status: 'in_progress', 
      progress: 65,
      price: 25000,
      start_date: '2026-01-10',
      deadline: '2026-06-30',
      created_at: '2026-01-10',
      description: 'Develop a cross-platform mobile application',
      assigned_to: 1,
      manager_name: 'John Doe'
    },
    { 
      id: 2, 
      title: 'Website Redesign', 
      client_name: 'Fashion Boutique Co', 
      client_id: 2,
      project_number: 'PRJ-002',
      status: 'in_progress', 
      progress: 45,
      price: 15000,
      start_date: '2026-02-01',
      deadline: '2026-04-15',
      created_at: '2026-02-01',
      description: 'Complete redesign of e-commerce website',
      assigned_to: 2,
      manager_name: 'Jane Smith'
    },
    { 
      id: 3, 
      title: 'Cloud Migration', 
      client_name: 'Enterprise Solutions Ltd', 
      client_id: 3,
      project_number: 'PRJ-003',
      status: 'open', 
      progress: 0,
      price: 50000,
      start_date: '2026-03-01',
      deadline: '2026-08-31',
      created_at: '2026-02-15',
      description: 'Migrate on-premise infrastructure to cloud',
      assigned_to: 3,
      manager_name: 'Mike Johnson'
    },
    { 
      id: 4, 
      title: 'Data Analytics Dashboard', 
      client_name: 'Analytics Corp', 
      client_id: 4,
      project_number: 'PRJ-004',
      status: 'completed', 
      progress: 100,
      price: 18000,
      start_date: '2025-11-15',
      deadline: '2026-01-31',
      created_at: '2025-11-15',
      description: 'Build real-time analytics dashboard',
      assigned_to: 1,
      manager_name: 'John Doe'
    },
    { 
      id: 5, 
      title: 'API Integration', 
      client_name: 'Financial Services Corp', 
      client_id: 5,
      project_number: 'PRJ-005',
      status: 'in_progress', 
      progress: 30,
      price: 12000,
      start_date: '2026-01-20',
      deadline: '2026-05-20',
      created_at: '2026-01-20',
      description: 'Integrate third-party payment APIs',
      assigned_to: 2,
      manager_name: 'Jane Smith'
    },
    { 
      id: 6, 
      title: 'Security Audit', 
      client_name: 'HealthCare Systems Inc', 
      client_id: 6,
      project_number: 'PRJ-006',
      status: 'open', 
      progress: 15,
      price: 8500,
      start_date: '2026-02-10',
      deadline: '2026-03-31',
      created_at: '2026-02-10',
      description: 'Comprehensive security assessment',
      assigned_to: 4,
      manager_name: 'Sarah Wilson'
    }
  ];
};

const loadMetadata = async () => {
  try {
    const [clientsRes, usersRes] = await Promise.all([
      api.get('/clients'),
      api.get('/users')
    ]);
    clients.value = clientsRes.data && clientsRes.data.length > 0 ? clientsRes.data : mockClients();
    users.value = usersRes.data && usersRes.data.length > 0 ? usersRes.data : mockUsers();
  } catch (error) {
    console.error('Failed to load metadata:', error);
    clients.value = mockClients();
    users.value = mockUsers();
  }
};

const mockClients = () => {
  return [
    { id: 1, name: 'Tech Startup Inc' },
    { id: 2, name: 'Fashion Boutique Co' },
    { id: 3, name: 'Enterprise Solutions Ltd' },
    { id: 4, name: 'Analytics Corp' },
    { id: 5, name: 'Financial Services Corp' },
    { id: 6, name: 'HealthCare Systems Inc' }
  ];
};

const mockUsers = () => {
  return [
    { id: 1, name: 'John Doe' },
    { id: 2, name: 'Jane Smith' },
    { id: 3, name: 'Mike Johnson' },
    { id: 4, name: 'Sarah Wilson' }
  ];
};

const createProject = async () => {
  try {
    const { data } = await api.post('/projects', form.value);
    showCreateModal.value = false;
    await loadProjects();
    router.push(`/projects/${data.id}`);
  } catch (error) {
    console.error('Failed to create project:', error);
    alert('Failed to create project');
  }
};

const openCreateModal = () => {
  form.value = {
    title: '',
    client_id: null,
    description: '',
    start_date: new Date().toISOString().split('T')[0],
    deadline: '',
    price: 0,
    assigned_to: null,
    status: 'open'
  };
  showCreateModal.value = true;
};

const goToDetail = (id: number) => {
  router.push(`/projects/${id}`);
};

const filteredProjects = computed(() => {
  let result = [...projects.value];

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    result = result.filter(p => p.title.toLowerCase().includes(q) || p.client_name?.toLowerCase().includes(q));
  }

  if (statusFilter.value) {
    result = result.filter(p => p.status === statusFilter.value);
  }

  result.sort((a, b) => {
    if (sortOrder.value === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sortOrder.value === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sortOrder.value === 'deadline') return new Date(a.deadline || '9999-12-31').getTime() - new Date(b.deadline || '9999-12-31').getTime();
    return 0;
  });

  return result;
});

const getStatusColor = (status: string) => {
  switch (status) {
    case 'open': return 'bg-blue-100 text-blue-800';
    case 'in_progress': return 'bg-yellow-100 text-yellow-800';
    case 'completed': return 'bg-green-100 text-green-800';
    case 'hold': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const formatDate = (date: string) => {
  if (!date) return 'No Date';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};



onMounted(() => {
  loadProjects();
  loadMetadata();
});
</script>
