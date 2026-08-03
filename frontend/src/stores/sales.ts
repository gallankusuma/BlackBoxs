import { defineStore } from 'pinia';
import { api } from '../lib/api';

export const useSalesStore = defineStore('sales', {
  state: () => ({
    customers: [] as any[],
    salesOrders: [] as any[],
    deliveries: [] as any[],
    invoices: [] as any[],
    pendingApprovals: [] as any[],
    priceList: [] as any[],
    salesHistory: [] as any[],
    salesStats: {} as any,
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async fetchCustomers() {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.get('/sales/customers');
        this.customers = res.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch customers';
      } finally {
        this.loading = false;
      }
    },
    async fetchSalesOrders() {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.get('/sales/sales-orders');
        this.salesOrders = res.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch sales orders';
      } finally {
        this.loading = false;
      }
    },
    async fetchDeliveries() {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.get('/sales/deliveries');
        this.deliveries = res.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch deliveries';
      } finally {
        this.loading = false;
      }
    },
    async fetchInvoices() {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.get('/sales/invoices');
        this.invoices = res.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch invoices';
      } finally {
        this.loading = false;
      }
    },

    async createCustomer(payload: { code: string; name: string; contact?: string; phone?: string; email?: string; address?: string }) {
      const res = await api.post('/sales/customers', payload);
      await this.fetchCustomers();
      return res.data;
    },

    async createSalesOrder(payload: {
      so_number?: string;
      customer_id: number;
      status?: string;
      expected_ship_date?: string;
      currency?: string;
      notes?: string;
      items: { product_id: number; quantity: number; uom?: string; unit_price?: number; currency?: string; notes?: string }[];
    }) {
      const res = await api.post('/sales/sales-orders', payload);
      await this.fetchSalesOrders();
      return res.data;
    },

    async createDelivery(payload: { do_number?: string; so_id: number; warehouse_id?: number; status?: string; shipped_at?: string; notes?: string }) {
      const res = await api.post('/sales/deliveries', payload);
      await this.fetchDeliveries();
      return res.data;
    },

    async createInvoice(payload: {
      invoice_number?: string;
      so_id: number;
      amount: number;
      currency?: string;
      status?: string;
      issued_at?: string;
      due_at?: string;
      notes?: string;
    }) {
      const res = await api.post('/sales/invoices', payload);
      await this.fetchInvoices();
      return res.data;
    },

    // Approval
    async fetchPendingApprovals() {
      this.loading = true;
      try { this.pendingApprovals = (await api.get('/sales/approval')).data?.data || []; } catch { this.pendingApprovals = []; }
      this.loading = false;
    },
    async approveSO(id: number) {
      await api.put(`/sales/approval/${id}/approve`);
      await this.fetchPendingApprovals();
    },
    async rejectSO(id: number, reason: string) {
      await api.put(`/sales/approval/${id}/reject`, { reason });
      await this.fetchPendingApprovals();
    },

    // Price List
    async fetchPriceList() {
      this.loading = true;
      try { this.priceList = (await api.get('/sales/price-list')).data?.data || []; } catch { this.priceList = []; }
      this.loading = false;
    },
    async updatePrice(id: number, selling_price: number) {
      await api.put(`/sales/price-list/${id}`, { selling_price });
      await this.fetchPriceList();
    },

    // History
    async fetchSalesHistory(params?: any) {
      this.loading = true;
      try { this.salesHistory = (await api.get('/sales/history', { params })).data?.data || []; } catch { this.salesHistory = []; }
      this.loading = false;
    },
    async fetchSalesStats() {
      try { this.salesStats = (await api.get('/sales/history/stats')).data?.data || {}; } catch { this.salesStats = {}; }
    },
  },
});
