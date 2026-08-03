import { defineStore } from 'pinia';
import { api } from '../lib/api';

interface WorkOrder {
  id: number;
  product_id: number;
  product_name?: string;
  sku?: string;
  quantity: number;
  status: string;
  priority: string;
  scheduled_start?: string;
  scheduled_end?: string;
  actual_start?: string;
  actual_end?: string;
  created_at: string;
}

interface WorkOrderState {
  workOrders: WorkOrder[];
  loading: boolean;
  error: string | null;
}

export const useWorkOrderStore = defineStore('workOrders', {
  state: (): WorkOrderState => ({
    workOrders: [],
    loading: false,
    error: null,
  }),

  actions: {
    async fetchWorkOrders() {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get(`/workorders`);
        this.workOrders = response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch work orders';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async createWorkOrder(workOrderData: any) {
      try {
        const response = await api.post(`/workorders`, workOrderData);
        await this.fetchWorkOrders();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to create work order';
        throw error;
      }
    },

    async updateWorkOrder(id: number, workOrderData: any) {
      try {
        await api.put(`/workorders/${id}`, workOrderData);
        await this.fetchWorkOrders();
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to update work order';
        throw error;
      }
    },

    async deleteWorkOrder(id: number) {
      try {
        await api.delete(`/workorders/${id}`);
        await this.fetchWorkOrders();
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to delete work order';
        throw error;
      }
    },
  },
});
