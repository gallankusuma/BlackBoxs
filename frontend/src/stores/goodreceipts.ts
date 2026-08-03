import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../lib/api';

export interface GoodReceipt {
  id: number;
  gr_number: string;
  po_id: number;
  po_number?: string;
  warehouse_id: number;
  warehouse_name?: string;
  received_by: number;
  received_by_name?: string;
  status: 'draft' | 'received' | 'approved';
  approval_status?: number; // 0=pending,1=supervisor,2=manager/director full
  approved_by_supervisor_id?: number | null;
  approved_by_manager_id?: number | null;
  received_date?: string;
  received_at?: string;
  notes: string;
  items?: GRItem[];
}

export interface GRItem {
  id?: number;
  gr_id?: number;
  po_item_id?: number;
  product_id: number;
  product_name: string;
  po_quantity: number;
  received_quantity: number;
  unit_of_measure: string;
  remarks?: string;
}

export const useGoodReceiptStore = defineStore('goodreceipts', () => {
  const goodReceipts = ref<GoodReceipt[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const fetchGoodReceipts = async () => {
    loading.value = true;
    error.value = null;
    try {
      const response = await api.get('/procurement/goods-receipts');
      goodReceipts.value = response.data.data || [];
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Failed to fetch goods receipts';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const fetchGoodReceiptById = async (id: number) => {
    try {
      const response = await api.get(`/procurement/goods-receipts/${id}`);
      return response.data.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Failed to fetch goods receipt';
      throw err;
    }
  };

  const createGoodReceipt = async (payload: Partial<GoodReceipt>) => {
    try {
      const response = await api.post('/procurement/goods-receipts', payload);
      goodReceipts.value.push(response.data.data);
      return response.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Failed to create goods receipt';
      throw err;
    }
  };

  const updateGoodReceipt = async (id: number, payload: Partial<GoodReceipt>) => {
    try {
      const response = await api.put(`/procurement/goods-receipts/${id}`, payload);
      const idx = goodReceipts.value.findIndex(gr => gr.id === id);
      if (idx >= 0) goodReceipts.value[idx] = response.data.data;
      return response.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Failed to update goods receipt';
      throw err;
    }
  };

  const approveGoodReceipt = async (id: number) => {
    try {
      const response = await api.post(`/procurement/goods-receipts/${id}/approve`);
      const updated = response.data.data;
      const idx = goodReceipts.value.findIndex(gr => gr.id === id);
      if (idx >= 0) goodReceipts.value[idx] = updated;
      return response.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Failed to approve goods receipt';
      throw err;
    }
  };

  const rejectGoodReceipt = async (id: number) => {
    try {
      const response = await api.post(`/procurement/goods-receipts/${id}/reject`);
      const updated = response.data.data;
      const idx = goodReceipts.value.findIndex(gr => gr.id === id);
      if (idx >= 0) goodReceipts.value[idx] = updated;
      return response.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Failed to reject goods receipt';
      throw err;
    }
  };

  return {
    goodReceipts,
    loading,
    error,
    fetchGoodReceipts,
    fetchGoodReceiptById,
    createGoodReceipt,
    updateGoodReceipt,
    approveGoodReceipt,
    rejectGoodReceipt
  };
});
