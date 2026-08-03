/**
 * INVENTORY APPROVAL WORKFLOW STRUCTURE
 * 
 * Modul Inventory memiliki 3 jenis transaksi yang memerlukan approval:
 * 
 * 1. PENERIMAAN BARANG (GRN - Goods Receipt Note) - From External Supplier
 *    - Status 0/2: Pending receipt verification
 *    - Supervisor: Verify received quantity vs PO, check kondisi barang
 *    - Manager: Approve untuk masuk ke inventory
 *    - Fully Approved: Stok update, GRN locked
 * 
 * 2. PENGELUARAN BARANG (Stock Outbound)
 *    - Status 0/2: Pending warehouse confirmation
 *    - Supervisor: Verify item availability, check kondisi
 *    - Manager: Approve pengeluaran, confirm stok update
 *    - Fully Approved: Barang keluar, locked dari perubahan
 * 
 * 3. PERPINDAHAN BARANG (Internal Transfer)
 *    - Status 0/2: Pending warehouse approval
 *    - Supervisor: Verify quantities at source location
 *    - Manager: Approve transfer ke destination
 *    - Fully Approved: Stok transfer selesai, locked
 * 
 * DATABASE SCHEMA CHANGES NEEDED:
 * 
 * ALTER TABLE inventory_transactions ADD COLUMN (
 *   approval_status INTEGER DEFAULT 0,
 *   approved_by_supervisor_id INTEGER,
 *   approved_by_manager_id INTEGER,
 *   approved_at_supervisor DATETIME,
 *   approved_at_manager DATETIME,
 *   FOREIGN KEY (approved_by_supervisor_id) REFERENCES users(id),
 *   FOREIGN KEY (approved_by_manager_id) REFERENCES users(id)
 * );
 * 
 * API ENDPOINTS TO CREATE:
 * 
 * POST /api/inventory/:transactionId/approve
 *   - Check user level
 *   - Update approval_status based on level
 *   - Record supervisor/manager approval
 *   - If 2/2: Update inventory stok automatically
 * 
 * POST /api/inventory/:transactionId/reject
 *   - Reset approval_status to 0
 *   - Allow supervisor to make corrections
 * 
 * FRONTEND COMPONENTS:
 * - InventoryTransactions.vue with approval workflow
 * - Reuse useApprovalWorkflow composable
 * - Display approval status badges
 * - Conditional approval buttons based on user level
 * - Read-only view when fully approved (2/2)
 */

export const inventoryApprovalConfig = {
  transactionTypes: {
    GRN: {
      name: 'Goods Receipt Note (Penerimaan)',
      supervisorRole: 'Verify received items',
      managerRole: 'Approve stok masuk'
    },
    OUTBOUND: {
      name: 'Stock Outbound (Pengeluaran)',
      supervisorRole: 'Verify availability',
      managerRole: 'Approve pengeluaran'
    },
    TRANSFER: {
      name: 'Internal Transfer (Perpindahan)',
      supervisorRole: 'Verify source location',
      managerRole: 'Approve transfer'
    }
  },

  approvalSteps: [
    {
      status: 0,
      label: 'Pending (0/2)',
      badge: 'bg-yellow-100 text-yellow-800',
      nextAction: 'Supervisor must verify items'
    },
    {
      status: 1,
      label: 'Approved 1/2',
      badge: 'bg-blue-100 text-blue-800',
      nextAction: 'Manager must approve final'
    },
    {
      status: 2,
      label: 'Approved 2/2',
      badge: 'bg-green-100 text-green-800',
      nextAction: 'Complete & Locked'
    }
  ]
};
