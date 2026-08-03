import { defineStore } from 'pinia';
import { api } from '../lib/api';

interface BOM {
  id: number;
  product_id?: number;
  product_name?: string;
  component_product_id?: number;
  component_name?: string;
  component_sku?: string;
  quantity?: number;
  unit?: string;
  notes?: string;
  version?: string;
  effective_date?: string;
  approval_status?: number;
  created_at: string;
}

interface BOMState {
  boms: BOM[];
  loading: boolean;
  error: string | null;
}

export const useBOMStore = defineStore('bom', {
  state: (): BOMState => ({
    boms: [],
    loading: false,
    error: null,
  }),

  actions: {
    async fetchBOMs(productId?: number) {
      this.loading = true;
      this.error = null;
      try {
        const url = productId ? `/bom?product_id=${productId}` : `/bom`;
        const response = await api.get(url);
        this.boms = response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch BOMs';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async createBOM(bomData: any) {
      try {
        const payload = {
          product_name: bomData.product_name,
          notes: bomData.notes || null,
          details: bomData.details || [],
        };
        const response = await api.post(`/bom`, payload);
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to create BOM';
        throw error;
      }
    },

    async updateBOM(id: number, bomData: any) {
      try {
        const payload = {
          product_id: parseInt(bomData.product_id),
          component_product_id: parseInt(bomData.component_product_id),
          quantity: parseFloat(bomData.quantity),
          unit: bomData.unit || null,
          notes: bomData.notes || null,
          loss_percent: bomData.loss_percent || 0,
          is_sub_bom: bomData.is_sub_bom ? 1 : 0,
        };
        const response = await api.put(`/bom/${id}`, payload);
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to update BOM';
        throw error;
      }
    },

    async deleteBOM(id: number) {
      try {
        await api.delete(`/bom/${id}`);
        await this.fetchBOMs();
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to delete BOM';
        throw error;
      }
    },

    async approveBOM(productId: number) {
      try {
        const response = await api.post(`/bom/${productId}/approve`);
        await this.fetchBOMs();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to approve BOM';
        throw error;
      }
    },

    async rejectBOM(productId: number) {
      try {
        const response = await api.post(`/bom/${productId}/reject`);
        await this.fetchBOMs();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to reject BOM';
        throw error;
      }
    },
  },
});
