// Placeholder for approval workflow composable
import { useAuthStore } from '../stores/auth';

/**
 * Composable untuk mengelola approval workflow yang reusable
 * Digunakan untuk BOM, Inventory Transactions, dan Procurement
 * 
 * Approval Levels:
 * 0/2 = Pending
 * 1/2 = Supervisor Approved
 * 2/2 = Manager Approved (Final)
 */
export function useApprovalWorkflow() {
  const authStore = useAuthStore();

  /**
   * Check jika user bisa approve BOM/Document berdasarkan status saat ini
   * Supervisor (Level 2): Hanya bisa approve status 0 → 1
   * Manager (Level 3): Hanya bisa approve status 1 → 2
   * Director/Master (Level 4+): Bisa approve langsung 0 → 2 atau 1 → 2 (DIRECT APPROVAL)
   */
  const canApprove = (currentStatus: number) => {
    const userLevel = authStore.user?.user_level || 1;
    
    // Director & Master Admin (Level 4+): DIRECT APPROVAL - bisa approve dari status apapun yang belum 2/2
    if (userLevel >= 4) {
      return currentStatus < 2; // Bisa approve status 0 atau 1
    }
    
    // Supervisor (Level 2): Hanya 0/2 → 1/2
    if (userLevel === 2) {
      return currentStatus === 0;
    }
    
    // Manager (Level 3): Hanya 1/2 → 2/2
    if (userLevel === 3) {
      return currentStatus === 1;
    }
    
    return false;
  };

  /**
   * Check jika user bisa reject/reset approval
   * Supervisor+ (Level 2): Bisa reject status 1 atau 2
   * Director/Master (Level 4+): Bisa reject status 1 atau 2 untuk reset ke 0/2
   * Status 0/2 (Pending): Tidak perlu reject, cukup delete
   */
  const canReject = (currentStatus: number) => {
    const userLevel = authStore.user?.user_level || 1;
    
    // Jangan tampilkan reject untuk status 0 - gunakan delete saja
    if (currentStatus === 0) {
      return false;
    }
    
    // Director & Master Admin (Level 4+): Bisa reject status 1 atau 2
    if (userLevel >= 4) {
      return currentStatus === 1 || currentStatus === 2;
    }
    
    // Supervisor & Manager (Level 2-3): Hanya bisa reject status 1
    return userLevel >= 2 && currentStatus === 1;
  };

  /**
   * Check jika document fully approved dan locked for editing
   */
  const isFullyApproved = (status: number) => {
    return status === 2;
  };

  /**
   * Get approval status text untuk display di UI
   */
  const getApprovalStatusText = (status: number) => {
    switch(status) {
      case 0: return 'Pending (0/2)';
      case 1: return 'Approved 1/2';
      case 2: return 'Approved 2/2';
      default: return 'Pending (0/2)';
    }
  };

  /**
   * Get CSS class untuk status badge
   */
  const getApprovalStatusClass = (status: number) => {
    switch(status) {
      case 0: return 'bg-yellow-100 text-yellow-800';
      case 1: return 'bg-blue-100 text-blue-800';
      case 2: return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  /**
   * Get warning message jika manager coba approve sebelum supervisor
   * Director & Master Admin tidak dapat warning karena punya DIRECT APPROVAL
   */
  const getApprovalMessage = (currentStatus: number) => {
    const userLevel = authStore.user?.user_level || 1;
    
    // Director & Master Admin (Level 4+) tidak dapat warning - mereka bisa DIRECT APPROVAL
    if (userLevel >= 4) {
      return '';
    }
    
    // Manager (Level 3) harus tunggu supervisor approve dulu
    if (userLevel === 3 && currentStatus === 0) {
      return 'Approval 1/2 (Supervisor) must be completed first';
    }
    
    return '';
  };

  /**
   * Get approval level name berdasarkan user level
   */
  const getApprovalLevelName = () => {
    const userLevel = authStore.user?.user_level || 1;
    if (userLevel >= 10) return 'Master Admin';
    if (userLevel >= 4) return 'Director';
    if (userLevel === 3) return 'Manager';
    if (userLevel === 2) return 'Supervisor';
    return 'User';
  };

  /**
   * Get next approval level text
   */
  const getNextApprovalLevel = (currentStatus: number) => {
    const userLevel = authStore.user?.user_level || 1;
    
    // Director & Master Admin (Level 4+): DIRECT FULL APPROVAL
    if (userLevel >= 4 && currentStatus < 2) {
      return 'DIRECT FULL APPROVAL (2/2 - FINAL)';
    }
    
    // Supervisor (Level 2)
    if (userLevel === 2 && currentStatus === 0) {
      return '1/2 (Supervisor Approval)';
    }
    
    // Manager (Level 3)
    if (userLevel >= 3 && currentStatus === 1) {
      return '2/2 (Manager Approval - Final)';
    }
    
    return '';
  };

  return {
    canApprove,
    canReject,
    isFullyApproved,
    getApprovalStatusText,
    getApprovalStatusClass,
    getApprovalMessage,
    getApprovalLevelName,
    getNextApprovalLevel
  };
}
