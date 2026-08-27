<template>
  <div class="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
    <!-- Row 1: Info Bar + User Menu -->
    <div class="bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-700 border-b border-slate-200 dark:border-slate-600 px-4 md:px-6 py-2.5">
      <div class="flex items-center justify-between gap-2">
        <!-- Left: Logo + Company -->
        <div class="flex items-center gap-2 min-w-0">
          <!-- Mobile burger -->
          <button @click="mobileMenuOpen = !mobileMenuOpen" class="md:hidden p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <img src="/blackbox-logo.png" alt="BB" class="w-7 h-7 rounded-lg hidden sm:inline" />
          <span class="font-black text-slate-800 dark:text-slate-100 text-sm md:text-lg tracking-widest truncate">BLACK<span class="text-amber-500">BOX</span></span>
          <span class="text-slate-400 dark:text-slate-500 hidden lg:inline">|</span>
          <span class="text-sm md:text-base font-semibold text-slate-500 dark:text-slate-400 hidden lg:inline truncate">Everything Recorded. Nothing Lost.</span>
        </div>
        <!-- Right: Stats + Toggle + User -->
        <div class="flex items-center gap-3 md:gap-6 text-gray-700 dark:text-gray-300 flex-shrink-0">
          <div class="hidden xl:flex items-center gap-6">
            <div class="flex items-center gap-1.5">
              <span class="text-lg">📋</span>
              <span class="text-xs">Approvals: <strong>{{ headerStats.pendingApprovals }}</strong></span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-lg">📦</span>
              <span class="text-xs">Stock: <strong>{{ headerStats.stockItems }}</strong></span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-lg">🏭</span>
              <span class="text-xs">Active WO: <strong>{{ headerStats.activeWO }}</strong></span>
            </div>
          </div>
          <span class="text-xs text-gray-500 dark:text-gray-400 hidden md:inline">{{ currentDate }}</span>
          <!-- Night Mode Toggle -->
          <button 
            @click="toggleNightMode"
            class="p-1.5 rounded-lg bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
            :title="isDark ? 'Light Mode' : 'Dark Mode'"
          >
            <span v-if="isDark" class="text-lg">☀️</span>
            <span v-else class="text-lg">🌙</span>
          </button>
          <!-- User Menu -->
          <div class="relative" @click.stop>
            <button 
              @click.stop="showUserMenu = !showUserMenu"
              class="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all flex items-center gap-1.5"
            >
              👤 <span class="hidden sm:inline">{{ authStore.user?.name || 'User' }}</span>
            </button>
            <div v-if="showUserMenu" class="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
              <button @click="goToProfile" class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-600">👤 My Profile</button>
              <button @click="goToSettings" class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-600">⚙️ Settings</button>
              <button @click="handleLogout" class="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">🚪 Logout</button>
            </div>
          </div>
        </div>
      </div>
    </div>


    <!-- Main Content Area -->
    <div class="flex flex-1 overflow-hidden relative">
      <!-- Mobile overlay -->
      <div
        v-if="mobileMenuOpen"
        @click="mobileMenuOpen = false"
        class="fixed inset-0 bg-black/30 z-30 md:hidden"
      />

      <!-- Sidebar -->
      <aside
        :class="[
          'bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto transition-all duration-200 flex-shrink-0 z-40',
          // Mobile: slide-in overlay
          mobileMenuOpen ? 'fixed inset-y-0 left-0 w-64 shadow-xl md:relative md:shadow-none' : 'hidden md:block',
          // Desktop: collapse toggle
          sidebarCollapsed ? 'md:w-14' : 'md:w-56'
        ]"
      >
        <div class="p-3">
          <!-- Collapse toggle (desktop only) -->
          <div class="hidden md:flex items-center justify-between mb-3">
            <h2 v-if="!sidebarCollapsed" class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Menu</h2>
            <button
              @click="toggleSidebar"
              class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500"
              :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
            >
              <svg class="w-4 h-4 transition-transform" :class="{ 'rotate-180': sidebarCollapsed }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
              </svg>
            </button>
          </div>
          <!-- Mobile header -->
          <div class="flex items-center justify-between mb-3 md:hidden">
            <h2 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Menu</h2>
            <button @click="mobileMenuOpen = false" class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <nav class="space-y-2">
            <div v-for="menu in filteredMainMenus" :key="menu.id" class="mb-2">
              <button
                @click="toggleMenu(menu.id)"
                class="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                :class="{'text-slate-700 dark:text-slate-300': true, 'px-2 justify-center': sidebarCollapsed}"
              >
                <div class="flex items-center gap-2">
                  <Icon :name="menu.icon" :size="18" :title="sidebarCollapsed ? menu.label : ''" />
                  <span v-if="!sidebarCollapsed">{{ menu.label }}</span>
                </div>
                <svg v-if="!sidebarCollapsed" class="w-4 h-4 transition-transform" :class="{ 'rotate-180': expandedMenus.includes(menu.id) }" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </button>
              
              <!-- Submenus -->
              <div v-show="!sidebarCollapsed && expandedMenus.includes(menu.id)" class="pl-8 pr-2 mt-1 space-y-0.5">
                <router-link
                  v-for="submenu in menu.submenus"
                  :key="submenu.id"
                  :to="submenu.name ? { name: submenu.name } : (submenu.route || '')"
                  @click="selectSubmenu(submenu)"
                  class="w-full text-left px-3 py-2 text-sm rounded transition-colors block"
                  :class="activeSubmenuId === submenu.id ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'"
                >
                  {{ submenu.label }}
                </router-link>
              </div>
            </div>
          </nav>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
        <div class="p-4 md:p-8">
          <!-- Breadcrumbs -->
          <nav v-if="breadcrumbs.length > 1" class="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 mb-4">
            <template v-for="(crumb, idx) in breadcrumbs" :key="idx">
              <router-link
                v-if="crumb.route && idx < breadcrumbs.length - 1"
                :to="crumb.route"
                class="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >{{ crumb.label }}</router-link>
              <span v-else :class="{ 'text-gray-900 dark:text-gray-100 font-medium': idx === breadcrumbs.length - 1 }">{{ crumb.label }}</span>
              <span v-if="idx < breadcrumbs.length - 1" class="text-gray-300 dark:text-gray-600">/</span>
            </template>
          </nav>
          <router-view :key="route.path" />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, reactive } from 'vue';
import Icon from './ui/Icon.vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useTheme } from '../composables/useTheme';
import { api } from '../lib/api';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { isDark, toggleTheme, initTheme } = useTheme();

const showUserMenu = ref(false);
const mobileMenuOpen = ref(false);

// Sidebar collapse (persisted)
const sidebarCollapsed = ref(localStorage.getItem('sidebar-collapsed') === 'true');
const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed.value));
};

// Night mode toggle
const toggleNightMode = () => {
  toggleTheme();
};

const currentDate = ref(new Date().toLocaleDateString('id-ID', {
  weekday: 'short',
  year: 'numeric',
  month: 'short',
  day: 'numeric'
}));

// Header stats (live from API)
const headerStats = reactive({
  pendingApprovals: 0,
  stockItems: 0,
  activeWO: 0,
});

const fetchHeaderStats = async () => {
  try {
    const [notifRes, invRes, woRes] = await Promise.allSettled([
      api.get('/notifications/unread-count'),
      api.get('/inventory'),
      api.get('/workorders'),
    ]);
    if (notifRes.status === 'fulfilled') {
      headerStats.pendingApprovals = notifRes.value.data?.unreadCount ?? notifRes.value.data?.count ?? 0;
    }
    if (invRes.status === 'fulfilled') {
      const invData = invRes.value.data;
      headerStats.stockItems = Array.isArray(invData) ? invData.length : (invData?.total ?? invData?.length ?? 0);
    }
    if (woRes.status === 'fulfilled') {
      const woData = woRes.value.data;
      const woList = Array.isArray(woData) ? woData : (woData?.data ?? []);
      headerStats.activeWO = woList.filter((w: any) => w.status !== 'completed' && w.status !== 'cancelled').length;
    }
  } catch {
    // silently keep defaults
  }
};

// Breadcrumbs from route meta
const breadcrumbs = computed(() => {
  const meta = route.meta as Record<string, any>;
  if (meta.breadcrumb && Array.isArray(meta.breadcrumb)) {
    return meta.breadcrumb as Array<{ label: string; route?: string }>;
  }
  // Auto-generate from route path
  const segments = route.path.split('/').filter(Boolean);
  if (segments.length <= 1) return [];
  const crumbs: Array<{ label: string; route?: string }> = [{ label: 'Home', route: '/dashboard' }];
  let path = '';
  for (const seg of segments) {
    path += '/' + seg;
    crumbs.push({
      label: seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' '),
      route: path,
    });
  }
  return crumbs;
});

// Close mobile menu on route change & refresh stats after login
watch(() => route.path, () => {
  mobileMenuOpen.value = false;
  if (localStorage.getItem('token') && headerStats.pendingApprovals === 0 && headerStats.stockItems === 0) {
    fetchHeaderStats();
  }
});

// Close user menu when clicking outside
let closeMenuHandler: ((e: MouseEvent) => void) | null = null;

onMounted(() => {
  initTheme();
  // Only fetch stats if user is authenticated
  if (localStorage.getItem('token')) {
    fetchHeaderStats();
  }

  closeMenuHandler = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const userMenuEl = document.querySelector('.relative');
    if (userMenuEl && !userMenuEl.contains(target)) {
      showUserMenu.value = false;
    }
  };
  document.addEventListener('click', closeMenuHandler);
});

onUnmounted(() => {
  if (closeMenuHandler) {
    document.removeEventListener('click', closeMenuHandler);
  }
});

interface Submenu {
  id: string;
  label: string;
  route?: string;
  name?: string;
  /**
   * Resource permission di backend. WAJIB sama persis dengan `PERMISSION_CATALOG`
   * di `backend/src/config/database.ts` — role produksi dipetakan ke string itu.
   *
   * DR-P2-01: sepuluh key di sini pernah berbeda dari katalog (mis.
   * `estimator.proposals` vs `estimator.estimator-proposals`,
   * `master-data.vendors` vs `master_data.suppliers`). Akibatnya role non-master
   * yang SUDAH punya permissionnya tetap kehilangan menu, sementara router hanya
   * memeriksa keberadaan token sehingga URL langsung tetap terbuka — UI dan API
   * berbeda pendapat.
   *
   * Dijaga oleh `test:rbac`: tiap `permKey` di berkas ini harus ada di tabel
   * `permissions`.
   */
  permKey?: string;
}

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  submenus: Submenu[];
}

const selectedSubmenu = ref('');

// Computed properties that always reflect current route

const activeSubmenuId = computed(() => {
  for (const menu of mainMenus) {
    const sub = menu.submenus.find(s => s.route === route.path);
    if (sub) return sub.id;
  }
  return selectedSubmenu.value;
});

const expandedMenus = ref<string[]>(['projects']);
const toggleMenu = (menuId: string) => {
  if (expandedMenus.value.includes(menuId)) {
    expandedMenus.value = expandedMenus.value.filter(id => id !== menuId);
  } else {
    expandedMenus.value.push(menuId);
  }
};

const mainMenus: MenuItem[] = [
  {
    id: 'assets',
    label: 'Asset Management',
    icon: 'factory',
    submenus: [
      { id: 'assets-all', label: 'Semua Aset', route: '/assets', permKey: 'assets' },
      { id: 'assets-land', label: 'Tanah', route: '/assets?category=LAND', permKey: 'assets' },
      { id: 'assets-buildings', label: 'Bangunan', route: '/assets?category=BLDG', permKey: 'assets' },
      { id: 'assets-other', label: 'Lainnya', route: '/assets?category=OTHER', permKey: 'assets' },
      { id: 'assets-production-lines', label: '⚙️ Line Produksi', route: '/assets/production-lines', permKey: 'assets' },
    ]
  },
  {
    id: 'estimator',
    label: 'Estimator',
    icon: 'calculator',
    submenus: [
      { id: 'estimator-proposals', label: 'Proposal', route: '/estimator', permKey: 'estimator.estimator-proposals' },
      { id: 'estimator-ahsp', label: 'AHSP', route: '/estimator/ahsp', permKey: 'estimator.estimator-ahsp' },
      { id: 'estimator-masters', label: 'Satuan Dasar Harga', route: '/estimator/masters', permKey: 'estimator.estimator-masters' },
    ]
  },
  {
    id: 'projects',
    label: 'Project',
    icon: 'pin',
    submenus: [
      { id: 'dashboard', label: 'Dashboard', route: '/dashboard', permKey: 'projects.dashboard' },
      { id: 'clients', label: 'Clients', route: '/customers', permKey: 'projects.clients' },
      { id: 'projects', label: 'Projects', route: '/projects', permKey: 'projects.projects' },
      // Kontrak adalah dokumen komersial sebuah project, jadi audiensnya sama.
      // Sengaja TIDAK memakai permKey baru: nama permission harus sudah ada di
      // tabel `permissions` (dijaga `test:rbac`), dan mengarang yang baru berarti
      // tidak satu pun role produksi memilikinya — menunya hilang untuk semua
      // orang kecuali master.
      { id: 'contracts', label: 'Contracts', route: '/contracts', permKey: 'projects.projects' },
      { id: 'tasks', label: 'Tasks', route: '/project/tasks', permKey: 'projects.tasks' },
      { id: 'leads', label: 'Leads', route: '/leads', permKey: 'projects.leads' },
      // 'Prospects' (/project/prospects) dan 'Notes' (/project/notes) dicabut dari
      // menu: keduanya tidak punya route di router/index.ts dan tidak punya file
      // view sama sekali, jadi mengkliknya hanya memberi area konten kosong.
      // Backend-nya sudah ada (`/api/prospects`, `/api/notes`) — layarnya yang
      // belum pernah dibuat. Pasang lagi entri ini begitu view-nya ada.
      { id: 'team', label: 'Team', route: '/users', permKey: 'projects.team' },
    ]
  },
  {
    id: 'procurement',
    label: 'Procurement',
    icon: 'cart',
    submenus: [
      { id: 'procurement-dashboard', label: 'Overview', route: '/procurement', name: 'Procurement', permKey: 'procurement.procurement-dashboard' },
      { id: 'purchase-requests', label: 'Purchase Requests', route: '/procurement/pr', name: 'ProcurementPR', permKey: 'procurement.purchase-requests' },
      { id: 'purchase-orders', label: 'Purchase Orders', route: '/procurement/po', name: 'ProcurementPO', permKey: 'procurement.purchase-orders' },
      { id: 'grn', label: 'Goods Receipt (GRN)', route: '/procurement/grn', name: 'ProcurementGRN', permKey: 'procurement.grn' },
      { id: 'vendor-price-list', label: 'Vendor Price List', route: '/procurement/price-list', name: 'ProcurementVendorPriceList', permKey: 'procurement.vendor-price-list' },
      { id: 'material-price-comparison', label: 'Material Price Comparison', route: '/procurement/material-prices', name: 'MaterialPriceComparison', permKey: 'procurement.material-price-comparison' },
      { id: 'procurement-history', label: 'History', route: '/procurement/history', name: 'ProcurementHistory', permKey: 'procurement.procurement-history' },
    ]
  },
  {
    id: 'hr',
    label: 'HR & Payroll',
    icon: 'hardhat',
    submenus: [
      { id: 'hr-employees', label: 'Data Karyawan', route: '/employees', name: 'Employees', permKey: 'hr.employees' },
      { id: 'hr-attendance', label: 'Absensi & Timesheet', route: '/attendance', name: 'AttendanceTracking', permKey: 'hr.attendance' },
      { id: 'hr-position-rates', label: 'Standar Gaji', route: '/position-rates', name: 'PositionRates', permKey: 'hr.position-rates' },
      { id: 'hr-office-locations', label: 'Lokasi Absensi GPS', route: '/hr/office-locations', name: 'OfficeLocations', permKey: 'hr.office-locations' },
    ]
  },
  {
    id: 'master_data',
    label: 'Master Data',
    icon: 'box',
    submenus: [
      { id: 'units', label: 'Units of Measure', route: '/units', name: 'UnitOfMeasure', permKey: 'master-data.units' },
      { id: 'items', label: 'Items', route: '/items', name: 'Items', permKey: 'master-data.items' },
      { id: 'item-types', label: 'Item Types', route: '/item-types', name: 'ItemTypes', permKey: 'master_data.item-types' },
      { id: 'categories', label: 'Item Categories', route: '/categories', name: 'Categories', permKey: 'master-data.categories' },
      { id: 'bom', label: 'Bill of Materials', route: '/bom', name: 'BOM', permKey: 'master-data.bom' },
      { id: 'warehouses', label: 'Warehouses', route: '/warehouses', name: 'Warehouses', permKey: 'master-data.warehouses' },
      { id: 'warehouse-locations', label: 'Warehouse Locations', route: '/warehouse-locations', name: 'WarehouseLocations', permKey: 'master_data.warehouse-locations' },
      { id: 'suppliers', label: 'Vendors', route: '/suppliers', name: 'Suppliers', permKey: 'master_data.suppliers' },
      { id: 'customers', label: 'Customers', route: '/customers', name: 'Customers', permKey: 'master-data.customers' },
      { id: 'departments', label: 'Departments', route: '/departments', name: 'Departments', permKey: 'master-data.departments' },
    ]
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: 'card',
    submenus: [
      { id: 'finance-ap', label: 'Accounts Payable', route: '/finance/ap', name: 'FinanceAPPage', permKey: 'finance.accounts-payable' },
      { id: 'finance-ar', label: 'Accounts Receivable', route: '/finance/ar', name: 'FinanceARPage', permKey: 'finance.accounts-receivable' },
      { id: 'finance-schedule', label: '📅 Payment Schedule', route: '/finance/payment-schedule', name: 'FinancePaymentSchedule', permKey: 'finance.payment-schedule' },
      { id: 'finance-kasbon', label: '💵 Pengajuan Kasbon', route: '/finance/kasbon-requests', name: 'FinanceKasbonRequests', permKey: 'finance.kasbon' },
      { id: 'finance-fund', label: 'Fund Requests', route: '/finance/fund-requests', name: 'FinanceFundRequestsPage', permKey: 'finance.fund-requests' },
      { id: 'finance-summary', label: 'Financial Summary', route: '/finance', name: 'Finance', permKey: 'finance.financial-summary' },
    ]
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: 'settings',
    submenus: [
      { id: 'users', label: 'Users', route: '/users', permKey: 'admin.users' },
      { id: 'roles', label: 'Roles & Permissions', route: '/roles', permKey: 'admin.roles' },
      { id: 'system-settings', label: 'System Settings', route: '/admin/settings', permKey: 'admin.system-settings' },
      { id: 'approval-config', label: 'Approval Config', route: '/admin/approval-config', permKey: 'admin.approval-config' },
      { id: 'audit-log', label: 'Audit Log', route: '/admin/audit-log', permKey: 'admin.audit-log' },
      { id: 'notifications', label: 'Notification Settings', route: '/admin/notifications', permKey: 'admin.notifications' },
      { id: 'integration', label: 'Integration Settings', route: '/admin/integration', permKey: 'admin.integration' },
      { id: 'backup', label: 'Backup & Restore', route: '/admin/backup', permKey: 'admin.backup' },
    ]
  },
];

/** Filter menus: show top-level only if at least one sub-menu is visible */
const filteredMainMenus = computed(() => {
  return mainMenus
    .map(menu => {
      const visibleSubs = menu.submenus.filter(sub => {
        // If no permKey defined, show if user has module-level access
        if (!sub.permKey) return authStore.hasModuleAccess(menu.id);
        // Check specific permission: resource.view
        return authStore.hasPermission(sub.permKey + '.view');
      });
      return { ...menu, submenus: visibleSubs };
    })
    .filter(menu => menu.submenus.length > 0);
});

const selectSubmenu = async (submenu: Submenu) => {
  selectedSubmenu.value = submenu.id;
  mobileMenuOpen.value = false;
};

// Watch route changes to update menu highlights
watch(() => route.path, (newPath) => {
  for (const menu of mainMenus) {
    const submenu = menu.submenus.find(s => s.route === newPath);
    if (submenu) {
      if (!expandedMenus.value.includes(menu.id)) {
        expandedMenus.value.push(menu.id);
      }
      break;
    }
  }
}, { immediate: true });

// User menu functions
const handleLogout = () => {
  authStore.logout();
  showUserMenu.value = false;
  router.push('/login');
};

const goToProfile = () => {
  showUserMenu.value = false;
  router.push('/users');
};

const goToSettings = () => {
  showUserMenu.value = false;
  router.push('/admin/settings');
};

</script>

<style scoped>
/* Custom scrollbar for sidebar */
aside::-webkit-scrollbar {
  width: 6px;
}
aside::-webkit-scrollbar-track {
  background: transparent;
}
aside::-webkit-scrollbar-thumb {
  background: #c0c0c0;
  border-radius: 3px;
}
aside::-webkit-scrollbar-thumb:hover {
  background: #999;
}
.dark aside::-webkit-scrollbar-thumb {
  background: #555;
}

/* Thin scrollbar for horizontal tab menu */
.scrollbar-thin::-webkit-scrollbar {
  height: 3px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 2px;
}
</style>
