<template>
  <nav class="sticky top-0 z-30 bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 shadow-lg border-b border-white/10">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="flex items-center space-x-1">
          <img src="/blackbox-logo.png" alt="BB" class="w-8 h-8 rounded-lg" />
        </div>
        <div class="hidden sm:block">
          <p class="text-white font-black text-lg leading-tight tracking-widest">BLACK<span class="text-amber-400">BOX</span></p>
          <p class="text-xs text-amber-400/90">Everything Recorded. Nothing Lost.</p>
        </div>
      </div>
      
      <div class="flex items-center space-x-1 text-sm">
        <!-- Menu Items with Dropdowns -->
        <div
          v-for="menu in menus"
          :key="menu.label"
          class="relative"
        >
          <button
            @click.stop="toggleMenu(menu.label)"
            class="px-3 py-2 rounded-lg transition hover:bg-white/10"
            :class="isMenuActive(menu) ? 'bg-white/15 text-amber-400 font-semibold' : 'text-white/90'"
          >
            {{ menu.label }}
            <span v-if="menu.submenus.length > 0" class="ml-1 text-white/50">▾</span>
          </button>
          
          <!-- Dropdown Submenu -->
          <div
            v-if="menu.submenus.length > 0 && activeMenu === menu.label"
            class="absolute left-0 mt-0 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50"
          >
            <router-link
              v-for="submenu in menu.submenus"
              :key="submenu.to"
              :to="submenu.to"
              class="block px-4 py-2 text-sm hover:bg-amber-50 transition"
              :class="route.path === submenu.to ? 'bg-amber-100 text-amber-700 font-semibold' : 'text-gray-700'"
              @click="activeMenu = null"
            >
              {{ submenu.label }}
            </router-link>
          </div>
        </div>
        
        <button
          @click="handleLogout"
          class="ml-2 px-3 py-2 rounded-lg bg-rose-500/90 text-white font-semibold hover:bg-rose-600 transition"
        >
          Logout
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const activeMenu = ref<string | null>(null);

// Toggle menu on click
const toggleMenu = (menuLabel: string) => {
  activeMenu.value = activeMenu.value === menuLabel ? null : menuLabel;
};

// Close menu when clicking outside
const closeMenuOnClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  if (!target.closest('nav')) {
    activeMenu.value = null;
  }
};

onMounted(() => {
  document.addEventListener('click', closeMenuOnClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', closeMenuOnClickOutside);
});

// Black Box — 4 core module menus
const menus = [
  {
    label: 'Project',
    submenus: [
      { to: '/dashboard', label: '📊 Dashboard' },
      { to: '/leads', label: '🎯 Leads' },
      { to: '/clients-management', label: '👥 Clients' },
      { to: '/projects', label: '📂 Projects' },
      { to: '/project/events', label: '📅 Calendar' },
      { to: '/project/tasks', label: '✅ Tasks' },
      { to: '/notifications', label: '🔔 Notifications' },
    ]
  },
  {
    label: 'Master Data',
    submenus: [
      { to: '/items', label: 'Items' },
      { to: '/item-types', label: 'Item Types' },
      { to: '/categories', label: 'Item Categories' },
      { to: '/units', label: 'Units of Measure' },
      { to: '/suppliers', label: 'Vendors' },
      { to: '/warehouses', label: 'Warehouses' },
      { to: '/warehouse-locations', label: 'Warehouse Locations' },
      { to: '/departments', label: 'Departments' },
    ]
  },
  {
    label: 'Procurement',
    submenus: [
      { to: '/procurement', label: 'Dashboard' },
      { to: '/procurement/pr', label: 'Purchase Request' },
      { to: '/procurement/pr-approval', label: 'PR Approval' },
      { to: '/procurement/po', label: 'Purchase Order' },
      { to: '/procurement/po-approval', label: 'PO Approval' },
      { to: '/procurement/grn', label: 'Goods Receipt' },
      { to: '/procurement/price-list', label: 'Vendor Price List' },
      { to: '/procurement/material-prices', label: 'Material Price Comparison' },
      { to: '/procurement/history', label: 'Procurement History' },
    ]
  },
  {
    label: '📚 Docs',
    submenus: [
      { to: '/document-centre', label: '📚 Document Centre' },
    ]
  },
  {
    label: 'Admin',
    submenus: [
      { to: '/users', label: 'Users' },
      { to: '/roles', label: 'Roles & Permissions' },
      { to: '/system-settings', label: 'System Settings' },
      { to: '/audit-log', label: 'Audit Log' },
    ]
  },
];

const isMenuActive = (menu: any) => {
  return menu.submenus.some((sub: any) => route.path === sub.to || route.path.startsWith(sub.to + '/'));
};

const handleLogout = () => {
  authStore.logout();
  router.push('/login');
};
</script>
