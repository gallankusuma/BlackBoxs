import { defineStore } from 'pinia';
import { api } from '../lib/api';

export const useProcurementStore = defineStore('procurement', {
  state: () => ({
    vendors: [] as any[],
    purchaseRequests: [] as any[],
    purchaseOrders: [] as any[],
    goodsReceipts: [] as any[],
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async fetchVendors() {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.get('/procurement/vendors');
        this.vendors = res.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch vendors';
      } finally {
        this.loading = false;
      }
    },
    async fetchPurchaseRequests() {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.get('/procurement/purchase-requests');
        this.purchaseRequests = res.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch purchase requests';
      } finally {
        this.loading = false;
      }
    },
    async fetchPurchaseOrders() {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.get('/procurement/purchase-orders');
        this.purchaseOrders = res.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch purchase orders';
      } finally {
        this.loading = false;
      }
    },
    async fetchGoodsReceipts() {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.get('/procurement/goods-receipts');
        this.goodsReceipts = res.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch goods receipts';
      } finally {
        this.loading = false;
      }
    },

    async createVendor(payload: { code: string; name: string; contact?: string; phone?: string; email?: string; address?: string }) {
      const res = await api.post('/procurement/vendors', payload);
      await this.fetchVendors();
      return res.data;
    },

    async createPurchaseRequest(payload: {
      pr_number?: string;
      requester_id?: number;
      project_id?: number;
      status?: string;
      notes?: string;
      department?: string;
      request_date?: string;
      needed_by?: string;
      reason?: string;
    }) {
      const res = await api.post('/procurement/purchase-requests', payload);
      await this.fetchPurchaseRequests();
      return res.data;
    },

    async updatePurchaseRequest(id: number, payload: {
      status?: string;
      project_id?: number;
      request_date?: string;
      department?: string;
      needed_by?: string;
      reason?: string;
      notes?: string;
    }) {
      const res = await api.put(`/procurement/purchase-requests/${id}`, payload);
      await this.fetchPurchaseRequests();
      return res.data;
    },

    async approvePurchaseRequest(id: number) {
      const res = await api.post(`/procurement/purchase-requests/${id}/approve`);
      await this.fetchPurchaseRequests();
      return res.data;
    },

    async rejectPurchaseRequest(id: number) {
      const res = await api.post(`/procurement/purchase-requests/${id}/reject`);
      await this.fetchPurchaseRequests();
      return res.data;
    },

    async deletePurchaseRequest(id: number) {
      const res = await api.delete(`/procurement/purchase-requests/${id}`);
      await this.fetchPurchaseRequests();
      return res.data;
    },

    async createPurchaseOrder(payload: {
      po_number?: string;
      vendor_id: number;
      pr_id?: number;
      status?: string;
      expected_date?: string;
      currency?: string;
      notes?: string;
      items: { product_id: number; quantity: number; uom?: string; unit_price?: number; currency?: string; notes?: string }[];
    }) {
      const res = await api.post('/procurement/purchase-orders', payload);
      await this.fetchPurchaseOrders();
      return res.data;
    },

    async approvePurchaseOrder(id: number) {
      const res = await api.post(`/procurement/purchase-orders/${id}/approve`);
      await this.fetchPurchaseOrders();
      return res.data;
    },

    async rejectPurchaseOrder(id: number) {
      const res = await api.post(`/procurement/purchase-orders/${id}/reject`);
      await this.fetchPurchaseOrders();
      return res.data;
    },

    async deletePurchaseOrder(id: number) {
      const res = await api.delete(`/procurement/purchase-orders/${id}`);
      await this.fetchPurchaseOrders();
      return res.data;
    },

    async createGoodsReceipt(payload: {
      gr_number?: string;
      po_id: number;
      warehouse_id?: number;
      status?: string;
      received_date?: string;
      notes?: string;
      received_by?: number;
    }) {
      const res = await api.post('/procurement/goods-receipts', payload);
      await this.fetchGoodsReceipts();
      return res.data;
    },
  },
});
