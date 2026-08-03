import { defineStore } from 'pinia';
import { api } from '../lib/api';

const extract = (res: any) => res.data?.data || res.data || {};

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    production: null as any,
    inventory: null as any,
    sales: null as any,
    approvals: null as any,
    alerts: [] as any[],
    loading: false,
  }),

  actions: {
    async fetchProductionKPI() {
      this.loading = true;
      try { this.production = extract(await api.get('/reports/production')); } catch { this.production = null; }
      this.loading = false;
    },
    async fetchInventoryKPI() {
      this.loading = true;
      try { this.inventory = extract(await api.get('/reports/inventory')); } catch { this.inventory = null; }
      this.loading = false;
    },
    async fetchSalesKPI() {
      this.loading = true;
      try { this.sales = extract(await api.get('/reports/sales')); } catch { this.sales = null; }
      this.loading = false;
    },
    async fetchApprovalKPI() {
      this.loading = true;
      try {
        const [inbox, stats] = await Promise.all([
          api.get('/approval/inbox'),
          api.get('/approval/history/stats'),
        ]);
        this.approvals = {
          pending: (inbox.data?.data || inbox.data || []),
          stats: stats.data?.data || stats.data || {},
        };
      } catch { this.approvals = null; }
      this.loading = false;
    },
    async fetchAlerts() {
      this.loading = true;
      try {
        const alerts: any[] = [];
        // Low stock alerts from inventory report
        const inv = extract(await api.get('/reports/inventory'));
        if (inv.lowStock) {
          inv.lowStock.forEach((item: any) => {
            alerts.push({ type: 'warning', module: 'Inventory', message: `Low stock: ${item.name} (${item.quantity}/${item.minimum_stock})` });
          });
        }
        // Pending approvals
        const inbox = (await api.get('/approval/inbox')).data?.data || [];
        if (inbox.length > 0) {
          alerts.push({ type: 'info', module: 'Approval', message: `${inbox.length} pending approval(s)` });
        }
        this.alerts = alerts;
      } catch { this.alerts = []; }
      this.loading = false;
    },
  },
});
