import { defineStore } from 'pinia';
import { api } from '../lib/api';

interface CogsItem {
  id: number; batch_number: string; product_name: string; sku: string;
  raw_material_cost: number; labor_cost: number; overhead_cost: number;
  total_cost: number; quantity_produced: number; cost_per_unit: number; notes: string;
}
interface ApItem {
  id: number; po_number: string; vendor_name: string; invoice_number: string;
  invoice_date: string; due_date: string; amount: number; paid_amount: number; status: string;
}
interface ArItem {
  id: number; invoice_number: string; customer_name: string;
  due_date: string; amount: number; paid_amount: number; status: string;
}
interface ProfitItem {
  id: number; product_name: string; sku: string; period: string;
  total_revenue: number; total_cogs: number; gross_profit: number; gross_margin_pct: number;
}
interface CostAnalysis {
  product_id: number; product_name: string; sku: string; batch_count: number;
  avg_material_cost: number; avg_labor_cost: number; avg_overhead_cost: number;
  avg_total_cost: number; avg_cost_per_unit: number; min_cost_per_unit: number;
  max_cost_per_unit: number; total_cost_sum: number; total_qty_produced: number;
}
interface MarginItem {
  id: number; product_name: string; sku: string; period: string;
  total_revenue: number; total_cogs: number; gross_profit: number; gross_margin_pct: number;
}
export interface FundRequestItem {
  id?: number; fund_request_id?: number;
  po_id?: number | null; po_schedule_id?: number | null; po_number?: string;
  vendor_id?: number | null; vendor_name?: string;
  schedule_no?: number; schedule_label?: string; trigger_type?: string;
  description?: string | null; amount: number;
  status?: string; approved_by?: number | null; approved_at?: string | null;
  rejection_reason?: string | null;
}
interface FundRequest {
  id: number; request_number: string; po_id?: number; po_schedule_id?: number; po_number?: string;
  vendor_id?: number; vendor_name?: string; amount: number; needed_date: string; purpose: string;
  notes?: string; status: string; submitter_id?: number; submitter_name?: string;
  approver_id?: number; approver_name?: string; rejection_reason?: string;
  cash_account?: string | null; cash_account_note?: string | null;
  item_count?: number; pending_count?: number; approved_count?: number; rejected_count?: number;
  items?: FundRequestItem[];
  created_at: string; submitted_at?: string; approved_at?: string;
}

const extract = (res: any) => res.data?.data || res.data || [];

export const useFinanceStore = defineStore('finance', {
  state: () => ({
    cogs: [] as CogsItem[],
    ap: [] as ApItem[],
    ar: [] as ArItem[],
    profitability: [] as ProfitItem[],
    costAnalysis: [] as CostAnalysis[],
    costTrends: [] as any[],
    margins: [] as MarginItem[],
    marginSummary: { periods: [] as any[], topProducts: [] as any[] },
    financialSummary: [] as any[],
    fundRequests: [] as FundRequest[],
    loading: false,
  }),
  actions: {
    async fetchCOGS() {
      this.loading = true;
      try { this.cogs = extract(await api.get('/finance/cogs')); } catch { this.cogs = []; }
      this.loading = false;
    },
    async createCOGS(data: any) {
      await api.post('/finance/cogs', data);
      await this.fetchCOGS();
    },
    async fetchAP() {
      this.loading = true;
      try { this.ap = extract(await api.get('/finance/accounts-payable')); } catch { this.ap = []; }
      this.loading = false;
    },
    async createAP(data: any) {
      await api.post('/finance/accounts-payable', data);
      await this.fetchAP();
    },
    async payAP(id: number, amount: number) {
      await api.put(`/finance/accounts-payable/${id}/pay`, { amount });
      await this.fetchAP();
    },
    async fetchAR() {
      this.loading = true;
      try { this.ar = extract(await api.get('/finance/accounts-receivable')); } catch { this.ar = []; }
      this.loading = false;
    },
    async createAR(data: any) {
      await api.post('/finance/accounts-receivable', data);
      await this.fetchAR();
    },
    async payAR(id: number, amount: number) {
      await api.put(`/finance/accounts-receivable/${id}/pay`, { amount });
      await this.fetchAR();
    },
    async fetchProfitability() {
      this.loading = true;
      try { this.profitability = extract(await api.get('/finance/profitability')); } catch { this.profitability = []; }
      this.loading = false;
    },
    async createProfitability(data: any) {
      await api.post('/finance/profitability', data);
      await this.fetchProfitability();
    },
    async fetchCostAnalysis() {
      this.loading = true;
      try { this.costAnalysis = extract(await api.get('/finance/cost-analysis')); } catch { this.costAnalysis = []; }
      this.loading = false;
    },
    async fetchCostTrends() {
      try { this.costTrends = extract(await api.get('/finance/cost-analysis/trends')); } catch { this.costTrends = []; }
    },
    async fetchMargins() {
      this.loading = true;
      try { this.margins = extract(await api.get('/finance/margin-analysis')); } catch { this.margins = []; }
      this.loading = false;
    },
    async fetchMarginSummary() {
      try {
        const res = await api.get('/finance/margin-analysis/summary');
        this.marginSummary = res.data?.data || { periods: [], topProducts: [] };
      } catch { this.marginSummary = { periods: [], topProducts: [] }; }
    },
    async fetchFinancialSummary() {
      this.loading = true;
      try { this.financialSummary = extract(await api.get('/finance/financial-summary')); } catch { this.financialSummary = []; }
      this.loading = false;
    },
    async fetchFundRequests(status?: string) {
      this.loading = true;
      try {
        const params = status ? { status } : {};
        this.fundRequests = extract(await api.get('/finance/fund-requests', { params }));
      } catch { this.fundRequests = []; }
      this.loading = false;
    },
    async getFundRequest(id: number) {
      try { return (await api.get(`/finance/fund-requests/${id}`)).data?.data; } catch { return null; }
    },
    async createFundRequest(data: any) {
      const res = await api.post('/finance/fund-requests', data);
      await this.fetchFundRequests();
      return res.data?.data;
    },
    async submitFundRequest(id: number) {
      await api.put(`/finance/fund-requests/${id}/submit`, {});
      await this.fetchFundRequests();
    },
    async approveFundRequest(id: number) {
      await api.put(`/finance/fund-requests/${id}/approve`, {});
      await this.fetchFundRequests();
    },
    async rejectFundRequest(id: number, reason: string) {
      await api.put(`/finance/fund-requests/${id}/reject`, { reason });
      await this.fetchFundRequests();
    },
    async approveFundRequestItem(id: number, itemId: number) {
      await api.put(`/finance/fund-requests/${id}/items/${itemId}/approve`, {});
      await this.fetchFundRequests();
    },
    async rejectFundRequestItem(id: number, itemId: number, reason: string) {
      await api.put(`/finance/fund-requests/${id}/items/${itemId}/reject`, { reason });
      await this.fetchFundRequests();
    },
  },
});
