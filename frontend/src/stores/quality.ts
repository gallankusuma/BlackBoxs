import { defineStore } from 'pinia';
import { api } from '../lib/api';

export const useQualityStore = defineStore('quality', {
  state: () => ({
    batches: [] as any[],
    qcTests: [] as any[],
    qcResults: [] as any[],
    samplingPlans: [] as any[],
    batchRelease: [] as any[],
    ncrs: [] as any[],
    reworkOrders: [] as any[],
    reportSummary: null as any,
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async fetchBatches() {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.get('/quality/batches');
        this.batches = res.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch batches';
      } finally {
        this.loading = false;
      }
    },
    async fetchQcTests() {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.get('/quality/qc-tests');
        this.qcTests = res.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch QC tests';
      } finally {
        this.loading = false;
      }
    },
    async fetchQcResults(batchId?: number) {
      this.loading = true;
      this.error = null;
      try {
        const url = batchId ? `/quality/qc-results?batch_id=${batchId}` : '/quality/qc-results';
        const res = await api.get(url);
        this.qcResults = res.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch QC results';
      } finally {
        this.loading = false;
      }
    },

    async createBatch(payload: {
      batch_number?: string;
      product_id: number;
      work_order_id?: number;
      mfg_date?: string;
      exp_date?: string;
      status?: string;
    }) {
      const res = await api.post('/quality/batches', payload);
      await this.fetchBatches();
      return res.data;
    },

    async createQcTest(payload: { name: string; description?: string }) {
      const res = await api.post('/quality/qc-tests', payload);
      await this.fetchQcTests();
      return res.data;
    },

    async createQcResult(payload: {
      batch_id: number;
      test_id: number;
      result?: string;
      status?: string;
      tested_at?: string;
      tester_id?: number;
      notes?: string;
    }) {
      const res = await api.post('/quality/qc-results', payload);
      await this.fetchQcResults();
      return res.data;
    },

    // ---- Sampling Plans ----
    async fetchSamplingPlans() {
      this.loading = true;
      try {
        const res = await api.get('/quality/sampling');
        this.samplingPlans = res.data.data;
      } catch (e: any) {
        this.error = e.response?.data?.error || 'Failed to fetch sampling plans';
      } finally { this.loading = false; }
    },
    async createSamplingPlan(data: any) {
      const res = await api.post('/quality/sampling', data);
      await this.fetchSamplingPlans();
      return res.data;
    },
    async deleteSamplingPlan(id: number) {
      await api.delete(`/quality/sampling/${id}`);
      await this.fetchSamplingPlans();
    },

    // ---- Batch Release ----
    async fetchBatchRelease() {
      this.loading = true;
      try {
        const res = await api.get('/quality/batch-release');
        this.batchRelease = res.data.data;
      } catch (e: any) {
        this.error = e.response?.data?.error || 'Failed to fetch batch release data';
      } finally { this.loading = false; }
    },
    async releaseBatch(batchId: number) {
      return (await api.post(`/quality/batch-release/${batchId}/release`)).data;
    },
    async rejectBatch(batchId: number) {
      return (await api.post(`/quality/batch-release/${batchId}/reject`)).data;
    },
    async holdBatch(batchId: number) {
      return (await api.post(`/quality/batch-release/${batchId}/hold`)).data;
    },

    // ---- NCR ----
    async fetchNCRs() {
      this.loading = true;
      try {
        const res = await api.get('/quality/ncr');
        this.ncrs = res.data.data;
      } catch (e: any) {
        this.error = e.response?.data?.error || 'Failed to fetch NCRs';
      } finally { this.loading = false; }
    },
    async createNCR(data: any) {
      const res = await api.post('/quality/ncr', data);
      await this.fetchNCRs();
      return res.data;
    },
    async updateNCR(id: number, data: any) {
      const res = await api.put(`/quality/ncr/${id}`, data);
      await this.fetchNCRs();
      return res.data;
    },
    async addNCRAction(ncrId: number, data: any) {
      return (await api.post(`/quality/ncr/${ncrId}/actions`, data)).data;
    },

    // ---- Rework ----
    async fetchRework() {
      this.loading = true;
      try {
        const res = await api.get('/quality/rework');
        this.reworkOrders = res.data.data;
      } catch (e: any) {
        this.error = e.response?.data?.error || 'Failed to fetch rework orders';
      } finally { this.loading = false; }
    },
    async createRework(data: any) {
      const res = await api.post('/quality/rework', data);
      await this.fetchRework();
      return res.data;
    },
    async updateReworkStatus(id: number, status: string) {
      return (await api.put(`/quality/rework/${id}/status`, { status })).data;
    },

    // ---- Reports ----
    async fetchQCReportSummary() {
      try {
        const res = await api.get('/quality/reports/summary');
        this.reportSummary = res.data.data;
      } catch (e: any) {
        this.error = e.response?.data?.error || 'Failed to fetch QC report';
      }
    },
  },
});
