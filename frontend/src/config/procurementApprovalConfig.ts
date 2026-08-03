/**
 * PROCUREMENT APPROVAL WORKFLOW STRUCTURE
 * 
 * Modul Procurement memiliki 3 jenis dokumen yang memerlukan approval:
 * 
 * 1. PURCHASE REQUEST (PR) - Permintaan pembelian
 *    - Status 0/2: Pending departemen review
 *    - Supervisor: Verify kebutuhan barang, qty, budget
 *    - Manager: Approve untuk proceed ke PO
 *    - Fully Approved: PR locked, siap convert ke PO
 * 
 * 2. PURCHASE ORDER (PO) - Order pembelian ke supplier
 *    - Status 0/2: Pending procurement review
 *    - Supervisor: Verify supplier, price, terms
 *    - Manager: Approve untuk dikirim ke supplier
 *    - Fully Approved: PO locked, terkirim ke supplier
 * 
 * 3. RETURN SLIP (RS) - Return barang ke supplier
 *    - Status 0/2: Pending warehouse confirmation
 *    - Supervisor: Verify returned items, kondisi barang
 *    - Manager: Approve return, process credit memo
 *    - Fully Approved: RS locked, stok updated
 * 
 * DATABASE SCHEMA CHANGES NEEDED:
 * 
 * ALTER TABLE purchase_requests ADD COLUMN (
 *   approval_status INTEGER DEFAULT 0,
 *   approved_by_supervisor_id INTEGER,
 *   approved_by_manager_id INTEGER,
 *   approved_at_supervisor DATETIME,
 *   approved_at_manager DATETIME,
 *   FOREIGN KEY (approved_by_supervisor_id) REFERENCES users(id),
 *   FOREIGN KEY (approved_by_manager_id) REFERENCES users(id)
 * );
 * 
 * ALTER TABLE purchase_orders ADD COLUMN (
 *   approval_status INTEGER DEFAULT 0,
 *   approved_by_supervisor_id INTEGER,
 *   approved_by_manager_id INTEGER,
 *   approved_at_supervisor DATETIME,
 *   approved_at_manager DATETIME,
 *   FOREIGN KEY (approved_by_supervisor_id) REFERENCES users(id),
 *   FOREIGN KEY (approved_by_manager_id) REFERENCES users(id)
 * );
 * 
 * ALTER TABLE return_slips ADD COLUMN (
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
 * POST /api/procurement/pr/:prId/approve
 * POST /api/procurement/pr/:prId/reject
 * POST /api/procurement/po/:poId/approve
 * POST /api/procurement/po/:poId/reject
 * POST /api/procurement/rs/:rsId/approve
 * POST /api/procurement/rs/:rsId/reject
 *   - All follow same user level hierarchy
 *   - Supervisor (Level 2): approve 0→1
 *   - Manager (Level 3+): approve 1→2
 * 
 * FRONTEND COMPONENTS:
 * - ProcurementRequests.vue with approval workflow
 * - PurchaseOrders.vue with approval workflow
 * - ReturnSlips.vue with approval workflow
 * - Reuse useApprovalWorkflow composable for all
 */

export const procurementApprovalConfig = {
  documentTypes: {
    PR: {
      name: 'Purchase Request (PR)',
      supervisorRole: 'Verify budget & kebutuhan',
      managerRole: 'Approve untuk convert ke PO'
    },
    PO: {
      name: 'Purchase Order (PO)',
      supervisorRole: 'Verify supplier & harga',
      managerRole: 'Approve untuk kirim ke supplier'
    },
    RS: {
      name: 'Return Slip (RS)',
      supervisorRole: 'Verify returned barang',
      managerRole: 'Approve return & credit memo'
    }
  },

  approvalSteps: [
    {
      status: 0,
      label: 'Pending (0/2)',
      badge: 'bg-yellow-100 text-yellow-800',
      nextAction: 'Supervisor harus review'
    },
    {
      status: 1,
      label: 'Approved 1/2',
      badge: 'bg-blue-100 text-blue-800',
      nextAction: 'Manager harus approve final'
    },
    {
      status: 2,
      label: 'Approved 2/2',
      badge: 'bg-green-100 text-green-800',
      nextAction: 'Complete & Locked'
    }
  ]
};
