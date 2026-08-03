import { defineStore } from 'pinia';
import { api } from '@/lib/api';

export interface WarehouseLocation {
  id?: number;
  warehouse_id: number;
  location_code: string;
  rack?: string;
  row?: string;
  bin?: string;
  capacity?: number;
  description?: string;
  batch_count?: number;
  total_quantity?: number;
  created_at?: string;
  updated_at?: string;
}

export interface StockAllocation {
  batch_id: number;
  batch_number: string;
  location_id: number;
  location_code: string;
  rack?: string;
  row?: string;
  bin?: string;
  warehouse: string;
  allocated_qty: number;
  available_qty: number;
  uom: string;
  exp_date?: string;
  mfg_date?: string;
}

export interface StockHealth {
  low_stock: any[];
  overstock: any[];
  expiring_batches: any[];
  location_utilization: any[];
}

export const useWarehouseStore = defineStore('warehouse', {
  state: () => ({
    warehouses: [] as any[],
    warehouse_locations: [] as any[],
    stockMovements: [] as any[],
    locations: [] as WarehouseLocation[],
    currentLocation: null as WarehouseLocation | null,
    stockAllocations: [] as StockAllocation[],
    stockHealth: null as StockHealth | null,
    loading: false,
    error: null as string | null,
  }),

  actions: {
    async fetchWarehouses() {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.get('/warehouses');
        this.warehouses = res.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch warehouses';
      } finally {
        this.loading = false;
      }
    },

    async fetchWarehouseLocations() {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.get('/warehouses/locations');
        this.warehouse_locations = res.data.data;
        // Add computed fields for display
        this.warehouse_locations = this.warehouse_locations.map((loc: any) => ({
          ...loc,
          warehouse_name: this.warehouses.find(w => w.id === loc.warehouse_id)?.name || ''
        }));
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch warehouse locations';
      } finally {
        this.loading = false;
      }
    },

    async fetchLocations(warehouseId: number) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get(`/warehouses/${warehouseId}/locations`);
        this.locations = response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch locations';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async fetchLocation(warehouseId: number, locationId: number) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get(`/warehouses/${warehouseId}/locations/${locationId}`);
        this.currentLocation = response.data.data;
        return response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch location';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async createLocation(warehouseId: number, location: WarehouseLocation) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.post(`/warehouses/${warehouseId}/locations`, location);
        await this.fetchLocations(warehouseId);
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to create location';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async updateLocation(warehouseId: number, locationId: number, location: Partial<WarehouseLocation>) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.put(`/warehouses/${warehouseId}/locations/${locationId}`, location);
        await this.fetchLocations(warehouseId);
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to update location';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async deleteLocation(warehouseId: number, locationId: number) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.delete(`/warehouses/${warehouseId}/locations/${locationId}`);
        await this.fetchLocations(warehouseId);
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to delete location';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async allocateStock(
      productId: number,
      quantity: number,
      method: 'FIFO' | 'FEFO' = 'FEFO',
      warehouseId?: number
    ) {
      this.loading = true;
      this.error = null;
      try {
        const params = new URLSearchParams({
          product_id: productId.toString(),
          quantity: quantity.toString(),
          method,
        });
        if (warehouseId) {
          params.append('warehouse_id', warehouseId.toString());
        }

        const response = await api.get(`/warehouses/allocate-stock?${params.toString()}`);
        this.stockAllocations = response.data.data.allocation;
        return response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to allocate stock';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async fetchStockHealth(warehouseId: number) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get(`/warehouses/${warehouseId}/stock-health`);
        this.stockHealth = response.data.data;
        return response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch stock health';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async createWarehouse(payload: { code: string; name: string; address?: string | null; contact_person?: string | null; is_active?: boolean }) {
      const res = await api.post('/warehouses', payload);
      await this.fetchWarehouses();
      return res.data;
    },

    async updateWarehouse(id: number, payload: { code: string; name: string; address?: string | null; contact_person?: string | null; is_active?: boolean }) {
      const res = await api.put(`/warehouses/${id}`, payload);
      await this.fetchWarehouses();
      return res.data;
    },

    async deleteWarehouse(id: number) {
      const res = await api.delete(`/warehouses/${id}`);
      await this.fetchWarehouses();
      return res.data;
    },

    async fetchStockMovements() {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.get('/warehouses/stock-movements');
        this.stockMovements = res.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch stock movements';
      } finally {
        this.loading = false;
      }
    },

    async createStockMovement(payload: {
      product_id: number;
      warehouse_id: number;
      location_id?: number;
      batch_id?: number;
      movement_type: 'IN' | 'OUT' | 'TRANSFER' | string;
      quantity: number;
      uom?: string;
      reference_type?: string;
      reference_id?: number;
      notes?: string;
    }) {
      const res = await api.post('/warehouses/stock-movements', payload);
      await this.fetchStockMovements();
      return res.data;
    },
  },
});
