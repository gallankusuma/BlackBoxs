import { defineStore } from 'pinia';
import { api } from '@/lib/api';

export interface Batch {
  id?: number;
  batch_number: string;
  product_id: number;
  product_name?: string;
  sku?: string;
  work_order_id?: number;
  wo_number?: string;
  quantity: number;
  uom: string;
  mfg_date: string;
  exp_date?: string;
  status: string;
  qc_status: string;
  location_id?: number;
  location?: string;
  rack?: string;
  row?: string;
  bin?: string;
  qc_results?: any[];
  created_at?: string;
  updated_at?: string;
}

export interface QCTest {
  id?: number;
  test_code: string;
  name: string;
  description?: string;
  product_category?: string;
  test_type?: string;
  specification?: string;
  is_active?: boolean;
}

export interface QCResult {
  id?: number;
  batch_id: number;
  test_id: number;
  test_name?: string;
  test_code?: string;
  measured_value?: number;
  result_text?: string;
  status: string;
  tested_at?: string;
  tested_by?: number;
  tested_by_name?: string;
  approved_by?: number;
  approved_by_name?: string;
  approved_at?: string;
  notes?: string;
}

export const useBatchStore = defineStore('batches', {
  state: () => ({
    batches: [] as Batch[],
    currentBatch: null as Batch | null,
    qcTests: [] as QCTest[],
    qcResults: [] as QCResult[],
    expiringBatches: [] as Batch[],
    loading: false,
    error: null as string | null,
  }),

  actions: {
    async fetchBatches(filters?: { status?: string; qc_status?: string; product_id?: number }) {
      this.loading = true;
      this.error = null;
      try {
        const params = new URLSearchParams();
        if (filters?.status) params.append('status', filters.status);
        if (filters?.qc_status) params.append('qc_status', filters.qc_status);
        if (filters?.product_id) params.append('product_id', filters.product_id.toString());
        
        const response = await api.get(`/batches?${params.toString()}`);
        this.batches = response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch batches';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async fetchBatch(id: number) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get(`/batches/${id}`);
        this.currentBatch = response.data.data;
        return response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch batch';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async createBatch(batch: Batch) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.post('/batches', batch);
        await this.fetchBatches();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to create batch';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async updateBatch(id: number, batch: Partial<Batch>) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.put(`/batches/${id}`, batch);
        await this.fetchBatches();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to update batch';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async releaseBatch(id: number) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.post(`/batches/${id}/release`);
        await this.fetchBatches();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to release batch';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async fetchExpiringBatches(days: number = 30) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get(`/batches/expiring/soon?days=${days}`);
        this.expiringBatches = response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch expiring batches';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async fetchQCTests() {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get('/quality/tests');
        this.qcTests = response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch QC tests';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async createQCTest(test: QCTest) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.post('/quality/tests', test);
        await this.fetchQCTests();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to create QC test';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async fetchQCResults(filters?: { batch_id?: number; status?: string }) {
      this.loading = true;
      this.error = null;
      try {
        const params = new URLSearchParams();
        if (filters?.batch_id) params.append('batch_id', filters.batch_id.toString());
        if (filters?.status) params.append('status', filters.status);
        
        const response = await api.get(`/quality/results?${params.toString()}`);
        this.qcResults = response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch QC results';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async recordQCResult(result: QCResult) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.post('/quality/results', result);
        await this.fetchQCResults({ batch_id: result.batch_id });
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to record QC result';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async approveQCResult(id: number, notes?: string) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.put(`/quality/results/${id}/approve`, { notes });
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to approve QC result';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async rejectQCResult(id: number, notes?: string) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.put(`/quality/results/${id}/reject`, { notes });
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to reject QC result';
        throw error;
      } finally {
        this.loading = false;
      }
    },
  },

  getters: {
    openBatches: (state) => state.batches.filter(b => b.status === 'open'),
    releasedBatches: (state) => state.batches.filter(b => b.status === 'released'),
    pendingQCBatches: (state) => state.batches.filter(b => b.qc_status === 'pending'),
    passedQCBatches: (state) => state.batches.filter(b => b.qc_status === 'passed'),
  },
});
