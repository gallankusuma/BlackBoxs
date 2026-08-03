import { defineStore } from 'pinia';
import { api } from '../lib/api';

interface Inventory {
  id: number;
  product_id: number;
  product_name?: string;
  sku?: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  location?: string;
  created_at: string;
}

interface InventoryState {
  inventory: Inventory[];
  transactions: any[];
  batches: any[];
  loading: boolean;
  error: string | null;
}

export const useInventoryStore = defineStore('inventory', {
  state: (): InventoryState => ({
    inventory: [],
    transactions: [],
    batches: [],
    loading: false,
    error: null,
  }),

  actions: {
    async fetchBatches() {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get(`/batches`);
        this.batches = response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch batches';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async fetchInventory() {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get(`/inventory`);
        this.inventory = response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch inventory';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async createInventory(inventoryData: any) {
      try {
        const response = await api.post(`/inventory`, inventoryData);
        await this.fetchInventory();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to create inventory';
        throw error;
      }
    },

    async updateInventory(id: number, inventoryData: any) {
      try {
        await api.put(`/inventory/${id}`, inventoryData);
        await this.fetchInventory();
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to update inventory';
        throw error;
      }
    },

    async fetchTransactions(productId: number) {
      try {
        const response = await api.get(`/inventory/transactions/${productId}`);
        this.transactions = response.data.data || [];
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch transactions';
        this.transactions = [];
      }
    },

    async recordTransaction(inventoryId: number, transactionData: any) {
      try {
        await api.post(`/inventory/${inventoryId}/transaction`, transactionData);
        await this.fetchInventory();
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to record transaction';
        throw error;
      }
    },

    async fetchExpiringBatches(days = 30) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get(`/batches/expiring/soon`, { params: { days } });
        this.batches = response.data.data;
        return response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch expiring batches';
        throw error;
      } finally {
        this.loading = false;
      }
    },
  },
});
