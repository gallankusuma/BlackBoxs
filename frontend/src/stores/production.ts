import { defineStore } from 'pinia';
import { api } from '../lib/api';

// ---- Interfaces ----
export interface PlanningWO {
  id: number;
  wo_number: string;
  product_name: string;
  sku: string;
  quantity: number;
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface MRPItem {
  wo_id: number;
  wo_number: string;
  wo_qty: number;
  wo_status: string;
  scheduled_start: string | null;
  product_name: string;
  sku: string;
  raw_material_id: number;
  material_name: string;
  material_sku: string;
  bom_qty_per_unit: number;
  total_required: number;
  stock_available: number;
  shortage: number;
}

export interface MaterialIssue {
  id: number;
  wo_id: number;
  wo_number: string;
  material_name: string;
  material_sku: string;
  quantity_required: number;
  quantity_issued: number;
  pending_qty: number;
  batch_number: string | null;
  issued_at: string | null;
  issued_by_name: string | null;
  warehouse_name: string | null;
  product_id?: number;
  warehouse_id?: number;
  stock_available?: number;
}

export interface ExecutionWO {
  id: number;
  wo_number: string;
  product_name: string;
  sku: string;
  quantity: number;
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  process_count: number;
  materials_ready: number;
  materials_total: number;
}

export interface ProcessLog {
  id: number;
  wo_id: number;
  process_name: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  status: string;
  notes: string | null;
  recorded_by_name: string | null;
}

export interface YieldResult {
  id: number;
  wo_id: number;
  wo_number: string;
  product_name: string;
  sku: string;
  output_quantity: number;
  loss_quantity: number;
  loss_percentage: number;
  batch_number: string | null;
  qc_status: string;
  completed_at: string | null;
  completed_by_name: string | null;
  planned_quantity: number;
  notes: string | null;
}

export interface FGReceipt {
  wo_id: number;
  wo_number: string;
  planned_qty: number;
  status: string;
  product_id: number;
  product_name: string;
  sku: string;
  output_quantity: number | null;
  batch_number: string | null;
  qc_status: string | null;
  completed_at: string | null;
  received_into_stock: number;
}

export interface HistoryWO {
  id: number;
  wo_number: string;
  product_name: string;
  sku: string;
  quantity: number;
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  notes: string | null;
  created_at: string;
  created_by_name: string | null;
  output_quantity: number | null;
  loss_quantity: number | null;
  loss_percentage: number | null;
}

export const useProductionStore = defineStore('production', {
  state: () => ({
    // Planning
    planningOrders: [] as PlanningWO[],
    planningSummary: null as any,
    // MRP
    mrpItems: [] as MRPItem[],
    mrpShortages: [] as any[],
    // Issue Material
    materialIssues: [] as MaterialIssue[],
    woMaterials: [] as MaterialIssue[],
    // Execution
    executionOrders: [] as ExecutionWO[],
    processLogs: [] as ProcessLog[],
    // Yield
    yieldResults: [] as YieldResult[],
    // FG Receipt
    fgReceipts: [] as FGReceipt[],
    // History
    historyOrders: [] as HistoryWO[],
    historyStats: null as any,
    // General
    loading: false,
    error: null as string | null,
  }),

  actions: {
    // ---- Planning ----
    async fetchPlanning() {
      this.loading = true;
      try {
        const res = await api.get('/production/planning');
        this.planningOrders = res.data.data;
      } catch (e: any) {
        this.error = e.response?.data?.error || 'Failed to fetch planning';
      } finally {
        this.loading = false;
      }
    },
    async fetchPlanningSummary() {
      try {
        const res = await api.get('/production/planning/summary');
        this.planningSummary = res.data.data;
      } catch (e: any) {
        this.error = e.response?.data?.error || 'Failed to fetch planning summary';
      }
    },

    // ---- MRP ----
    async fetchMRP() {
      this.loading = true;
      try {
        const res = await api.get('/production/mrp');
        this.mrpItems = res.data.data;
      } catch (e: any) {
        this.error = e.response?.data?.error || 'Failed to fetch MRP';
      } finally {
        this.loading = false;
      }
    },
    async fetchMRPShortages() {
      try {
        const res = await api.get('/production/mrp/shortage');
        this.mrpShortages = res.data.data;
      } catch (e: any) {
        this.error = e.response?.data?.error || 'Failed to fetch shortages';
      }
    },

    // ---- Issue Material ----
    async fetchMaterialIssues() {
      this.loading = true;
      try {
        const res = await api.get('/production/issue-material');
        this.materialIssues = res.data.data;
      } catch (e: any) {
        this.error = e.response?.data?.error || 'Failed to fetch material issues';
      } finally {
        this.loading = false;
      }
    },
    async fetchWOMaterials(woId: number) {
      try {
        const res = await api.get(`/production/issue-material/wo/${woId}`);
        this.woMaterials = res.data.data;
      } catch (e: any) {
        this.error = e.response?.data?.error || 'Failed to fetch WO materials';
      }
    },
    async issueMaterial(data: { wo_material_id: number; quantity: number; warehouse_id?: number; batch_number?: string }) {
      const res = await api.post('/production/issue-material', data);
      return res.data;
    },
    async generateWOMaterials(woId: number) {
      const res = await api.post(`/production/issue-material/generate/${woId}`);
      return res.data;
    },

    // ---- Execution ----
    async fetchExecution() {
      this.loading = true;
      try {
        const res = await api.get('/production/execution');
        this.executionOrders = res.data.data;
      } catch (e: any) {
        this.error = e.response?.data?.error || 'Failed to fetch execution';
      } finally {
        this.loading = false;
      }
    },
    async startWO(woId: number) {
      const res = await api.post(`/production/execution/${woId}/start`);
      return res.data;
    },
    async pauseWO(woId: number) {
      const res = await api.post(`/production/execution/${woId}/pause`);
      return res.data;
    },
    async resumeWO(woId: number) {
      const res = await api.post(`/production/execution/${woId}/resume`);
      return res.data;
    },
    async completeWO(woId: number) {
      const res = await api.post(`/production/execution/${woId}/complete`);
      return res.data;
    },
    async fetchProcessLogs(woId: number) {
      const res = await api.get(`/production/execution/${woId}/logs`);
      this.processLogs = res.data.data;
    },
    async addProcessLog(woId: number, data: any) {
      const res = await api.post(`/production/execution/${woId}/logs`, data);
      return res.data;
    },

    // ---- Yield & Scrap ----
    async fetchYield() {
      this.loading = true;
      try {
        const res = await api.get('/production/yield');
        this.yieldResults = res.data.data;
      } catch (e: any) {
        this.error = e.response?.data?.error || 'Failed to fetch yield';
      } finally {
        this.loading = false;
      }
    },
    async recordYield(data: any) {
      const res = await api.post('/production/yield', data);
      return res.data;
    },
    async updateYield(id: number, data: any) {
      const res = await api.put(`/production/yield/${id}`, data);
      return res.data;
    },

    // ---- FG Receipt ----
    async fetchFGReceipts() {
      this.loading = true;
      try {
        const res = await api.get('/production/fg-receipt');
        this.fgReceipts = res.data.data;
      } catch (e: any) {
        this.error = e.response?.data?.error || 'Failed to fetch FG receipts';
      } finally {
        this.loading = false;
      }
    },
    async receiveFG(data: { wo_id: number; warehouse_id: number; quantity: number; batch_number?: string }) {
      const res = await api.post('/production/fg-receipt', data);
      return res.data;
    },

    // ---- History ----
    async fetchHistory(filters?: { status?: string; from_date?: string; to_date?: string; search?: string }) {
      this.loading = true;
      try {
        const res = await api.get('/production/history', { params: filters });
        this.historyOrders = res.data.data;
      } catch (e: any) {
        this.error = e.response?.data?.error || 'Failed to fetch history';
      } finally {
        this.loading = false;
      }
    },
    async fetchHistoryStats() {
      try {
        const res = await api.get('/production/history/stats');
        this.historyStats = res.data.data;
      } catch (e: any) {
        this.error = e.response?.data?.error || 'Failed to fetch history stats';
      }
    },
  },
});
