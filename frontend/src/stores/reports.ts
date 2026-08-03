import { defineStore } from 'pinia';
import { api } from '../lib/api';

const extract = (res: any) => res.data?.data || res.data || {};

export const useReportsStore = defineStore('reports', {
  state: () => ({
    production: null as any,
    inventory: null as any,
    procurement: null as any,
    qc: null as any,
    sales: null as any,
    finance: null as any,
    loading: false,
  }),

  actions: {
    async fetchProductionReport(params?: Record<string, any>) {
      this.loading = true;
      try { this.production = extract(await api.get('/reports/production', { params })); } catch { this.production = null; }
      this.loading = false;
    },
    async fetchInventoryReport() {
      this.loading = true;
      try { this.inventory = extract(await api.get('/reports/inventory')); } catch { this.inventory = null; }
      this.loading = false;
    },
    async fetchProcurementReport() {
      this.loading = true;
      try { this.procurement = extract(await api.get('/reports/procurement')); } catch { this.procurement = null; }
      this.loading = false;
    },
    async fetchQCReport() {
      this.loading = true;
      try { this.qc = extract(await api.get('/reports/qc')); } catch { this.qc = null; }
      this.loading = false;
    },
    async fetchSalesReport() {
      this.loading = true;
      try { this.sales = extract(await api.get('/reports/sales')); } catch { this.sales = null; }
      this.loading = false;
    },
    async fetchFinanceReport() {
      this.loading = true;
      try { this.finance = extract(await api.get('/reports/finance')); } catch { this.finance = null; }
      this.loading = false;
    },
  },
});
