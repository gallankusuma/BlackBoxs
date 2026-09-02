import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import Dashboard from '../views/Dashboard.vue';
import Login from '../views/Login.vue';

const placeholderComponent = () => import('../views/PlaceholderPage.vue');

const placeholderMeta: Array<{path: string; name: string; title: string}> = [
  // Dashboard — all moved to real routes below

  // Master Data removed from placeholder, now active routes below

  // Procurement — all moved to real routes below

  // Inventory — real routes exist, so exclude placeholders for these paths

  // Production — all moved to real routes below

  // Quality — all moved to real routes below

  // Sales — all moved to real routes below

  // Finance — all moved to real routes below

  // Approval — all moved to real routes below

  // Reports — all moved to real routes below

  // Admin — all moved to real routes below
];

const placeholderRoutes: RouteRecordRaw[] = placeholderMeta.map((item) => ({
  path: item.path,
  name: item.name,
  component: placeholderComponent,
  meta: {
    requiresAuth: true,
    title: item.title,
    description: 'Placeholder page — coming soon',
  },
}));

const routes: RouteRecordRaw[] = [
  // ===== MOBILE PWA ROUTES (no auth required) =====
  {
    path: '/mobile',
    name: 'MobileLogin',
    component: () => import('../views/mobile/MobileLogin.vue'),
    meta: { mobileOnly: true },
  },
  {
    path: '/mobile/home',
    name: 'MobileHome',
    component: () => import('../views/mobile/MobileHome.vue'),
    meta: { mobileOnly: true },
  },
  {
    path: '/mobile/setup',
    name: 'MobileOnboarding',
    component: () => import('../views/mobile/MobileOnboarding.vue'),
    meta: { mobileOnly: true },
  },
  {
    path: '/mobile/attend',
    name: 'MobileAttend',
    component: () => import('../views/mobile/MobileAttendance.vue'),
    meta: { mobileOnly: true },
  },
  {
    path: '/mobile/payslip',
    name: 'MobilePayslip',
    component: () => import('../views/mobile/MobilePayslip.vue'),
    meta: { mobileOnly: true },
  },
  {
    path: '/mobile/settings',
    name: 'MobileSettings',
    component: () => import('../views/mobile/MobileSettings.vue'),
    meta: { mobileOnly: true },
  },
  {
    path: '/mobile/material-request',
    name: 'MobileMaterialRequest',
    component: () => import('../views/mobile/MobileMaterialRequest.vue'),
    meta: { mobileOnly: true },
  },
  // ===== ADMIN ROUTES =====
  {
    path: '/',
    redirect: '/projects',
  },
  {
    path: '/dashboard',
    name: 'DashboardHome',
    component: Dashboard,
    meta: { requiresAuth: true },
  },
  {
    path: '/projects',
    name: 'ProjectsManagement',
    component: () => import('../views/ProjectsManagement.vue'),
    meta: { requiresAuth: true, title: 'Projects' },
  },
  {
    path: '/projects/:id',
    name: 'ProjectDetail',
    component: () => import('../views/ProjectDetail.vue'),
    meta: { requiresAuth: true, title: 'Project Details', breadcrumb: [{ label: 'Projects', route: '/projects' }, { label: 'Detail' }] },
  },
  {
    path: '/leads',
    name: 'Leads',
    component: () => import('../views/Leads.vue'),
    meta: { requiresAuth: true, title: 'Leads' },
  },
  {
    path: '/budget',
    name: 'AnnualBudget',
    component: () => import('../views/AnnualBudget.vue'),
    meta: { requiresAuth: true, title: 'Anggaran Tahunan' },
  },
  {
    path: '/opportunities',
    name: 'Opportunities',
    component: () => import('../views/OpportunityRegister.vue'),
    meta: { requiresAuth: true, title: 'Opportunity Register' },
  },
  {
    path: '/leads/:id',
    name: 'LeadDetail',
    component: () => import('../views/LeadDetail.vue'),
    meta: { requiresAuth: true, title: 'Lead Details' },
  },
  {
    path: '/login',
    name: 'Login',
    component: Login,
  },
  {
    path: '/products',
    name: 'Products',
    component: () => import('../views/Products.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/bom',
    name: 'BOM',
    component: () => import('../views/BOM.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/batches',
    name: 'Batches',
    component: () => import('../views/Batches.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/workorders',
    name: 'WorkOrders',
    component: () => import('../views/WorkOrders.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/inventory',
    name: 'Inventory',
    component: () => import('../views/Inventory.vue'),
    meta: { requiresAuth: true },
  },
  // Inventory detail routes (override placeholders)
  {
    path: '/inventory/stock-card',
    name: 'InventoryStockCardReal',
    component: () => import('../views/StockCard.vue'),
    meta: { requiresAuth: true, breadcrumb: [{ label: 'Inventory', route: '/inventory' }, { label: 'Stock Card' }] },
  },
  {
    path: '/inventory/opname',
    name: 'InventoryOpnameReal',
    component: () => import('../views/StockOpname.vue'),
    meta: { requiresAuth: true, breadcrumb: [{ label: 'Inventory', route: '/inventory' }, { label: 'Stock Opname' }] },
  },
  {
    path: '/inventory/batch-tracking',
    name: 'InventoryBatchTrackingReal',
    component: () => import('../views/BatchTracking.vue'),
    meta: { requiresAuth: true, breadcrumb: [{ label: 'Inventory', route: '/inventory' }, { label: 'Batch Tracking' }] },
  },
  {
    path: '/inventory/expiry',
    name: 'InventoryExpiryReal',
    component: () => import('../views/ExpiryMonitoring.vue'),
    meta: { requiresAuth: true, breadcrumb: [{ label: 'Inventory', route: '/inventory' }, { label: 'Expiry Monitoring' }] },
  },
  {
    path: '/procurement',
    name: 'Procurement',
    component: () => import('../views/Procurement.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/procurement/pr',
    name: 'ProcurementPR',
    component: () => import('../views/PurchaseRequests.vue'),
    meta: { requiresAuth: true, breadcrumb: [{ label: 'Procurement', route: '/procurement' }, { label: 'Purchase Requests' }] },
  },
  {
    path: '/procurement/po',
    name: 'ProcurementPO',
    component: () => import('../views/PurchaseOrders.vue'),
    meta: { requiresAuth: true, breadcrumb: [{ label: 'Procurement', route: '/procurement' }, { label: 'Purchase Orders' }] },
  },
  {
    path: '/procurement/grn',
    name: 'ProcurementGRN',
    component: () => import('../views/GoodReceipt.vue'),
    meta: { requiresAuth: true, breadcrumb: [{ label: 'Procurement', route: '/procurement' }, { label: 'Goods Receipt' }] },
  },
  {
    path: '/procurement/price-list',
    name: 'ProcurementVendorPriceList',
    component: () => import('../views/VendorPriceList.vue'),
    meta: { requiresAuth: true, breadcrumb: [{ label: 'Procurement', route: '/procurement' }, { label: 'Vendor Price List' }] },
  },
  {
    path: '/procurement/material-prices',
    name: 'MaterialPriceComparison',
    component: () => import('../views/MaterialPriceComparison.vue'),
    meta: { requiresAuth: true, breadcrumb: [{ label: 'Procurement', route: '/procurement' }, { label: 'Material Price Comparison' }] },
  },
  {
    path: '/procurement/history',
    name: 'ProcurementHistory',
    component: () => import('../views/ProcurementHistory.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/procurement/pr-approval',
    name: 'ProcurementPRApprovalPage',
    component: () => import('../views/ProcurementPRApproval.vue'),
    meta: { requiresAuth: true, title: 'PR Approval', breadcrumb: [{ label: 'Procurement', route: '/procurement' }, { label: 'PR Approval' }] },
  },
  {
    path: '/procurement/po-approval',
    name: 'ProcurementPOApprovalPage',
    component: () => import('../views/ProcurementPOApproval.vue'),
    meta: { requiresAuth: true, title: 'PO Approval', breadcrumb: [{ label: 'Procurement', route: '/procurement' }, { label: 'PO Approval' }] },
  },
  {
    path: '/sales',
    name: 'Sales',
    component: () => import('../views/Sales.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/warehouses',
    name: 'Warehouses',
    component: () => import('../views/Warehouses.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/warehouse-locations',
    name: 'WarehouseLocations',
    component: () => import('../views/WarehouseLocations.vue'),
    meta: { requiresAuth: true, title: 'Warehouse Locations' },
  },
  {
    path: '/quality',
    name: 'Quality',
    component: () => import('../views/Quality.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/categories',
    name: 'Categories',
    component: () => import('../views/Categories.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/item-types',
    name: 'ItemTypes',
    component: () => import('../views/ItemTypes.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/units',
    name: 'UnitOfMeasure',
    component: () => import('../views/UnitOfMeasure.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/items',
    name: 'Items',
    component: () => import('../views/Items.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/suppliers',
    name: 'Suppliers',
    component: () => import('../views/Suppliers.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/customers',
    name: 'Customers',
    component: () => import('../views/ClientsManagement.vue'),
    meta: { requiresAuth: true, title: 'Clients Management' },
  },
  {
    path: '/product-types',
    name: 'ProductTypes',
    component: () => import('../views/ProductTypes.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/departments',
    name: 'Departments',
    component: () => import('../views/Departments.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/roles',
    name: 'Roles',
    component: () => import('../views/Roles.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/users',
    name: 'Users',
    component: () => import('../views/Users.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/transactions',
    name: 'Transactions',
    component: () => import('../views/Transactions.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/employees',
    name: 'Employees',
    component: () => import('../views/Employees.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/attendance',
    name: 'AttendanceTracking',
    component: () => import('../views/AttendanceView.vue'),
    meta: { requiresAuth: true, title: 'Absensi & Timesheet' },
  },
  {
    path: '/position-rates',
    name: 'PositionRates',
    component: () => import('../views/PositionRates.vue'),
    meta: { requiresAuth: true, title: 'Standar Gaji Jabatan' },
  },
  {
    path: '/hr/office-locations',
    name: 'OfficeLocations',
    component: () => import('../views/OfficeLocations.vue'),
    meta: { requiresAuth: true, title: 'Lokasi Absensi GPS' },
  },
  {
    path: '/document-centre',
    name: 'DocumentCentre',
    component: () => import('../views/DocumentCentre.vue'),
    meta: { requiresAuth: true, title: 'Document Centre' },
  },
  {
    path: '/finance',
    name: 'Finance',
    component: () => import('../views/Finance.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/audit-log',
    name: 'AuditLog',
    component: () => import('../views/AuditLog.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/notifications',
    name: 'Notifications',
    component: () => import('../views/Notifications.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/system-settings',
    name: 'SystemSettings',
    component: () => import('../views/SystemSettings.vue'),
    meta: { requiresAuth: true },
  },
  // Client Management Module
  {
    path: '/clients-management',
    name: 'ClientsManagement',
    component: () => import('../views/ClientsManagement.vue'),
    meta: { requiresAuth: true, title: 'Client Management' },
  },
  {
    path: '/clients/:id',
    name: 'ClientDetail',
    component: () => import('../views/ClientDetail.vue'),
    meta: { requiresAuth: true, title: 'Client Detail' },
  },
  // Estimator Module
  {
    path: '/estimator',
    name: 'EstimatorProposalList',
    component: () => import('../views/EstimatorProposalList.vue'),
    meta: { requiresAuth: true, title: 'Estimator - Proposals' },
  },
  {
    path: '/estimator/proposals/:id',
    name: 'EstimatorProposalEditor',
    component: () => import('../views/EstimatorProposalEditor.vue'),
    meta: { requiresAuth: true, title: 'Estimator - Proposal Editor' },
  },
  {
    path: '/estimator/proposals/:id/rab',
    name: 'EstimatorRAB',
    component: () => import('../views/EstimatorRAB.vue'),
    meta: { requiresAuth: true, title: 'Estimator - RAB' },
  },
  {
    path: '/estimator/masters',
    name: 'EstimatorMasters',
    component: () => import('../views/EstimatorMasters.vue'),
    meta: { requiresAuth: true, title: 'Estimator - Satuan Dasar Harga' },
  },
  {
    path: '/estimator/ahsp',
    name: 'EstimatorAHSP',
    component: () => import('../views/EstimatorAHSP.vue'),
    meta: { requiresAuth: true, title: 'Estimator - AHSP' },
  },
  {
    path: '/estimator/hsp',
    name: 'EstimatorHSP',
    component: () => import('../views/EstimatorHSP.vue'),
    meta: { requiresAuth: true, title: 'Estimator - HSP' },
  },
  // Asset Management Module
  {
    path: '/assets',
    name: 'AssetList',
    component: () => import('../views/AssetList.vue'),
    meta: { requiresAuth: true, title: 'Asset Management' },
  },
  {
    path: '/assets/production-lines',
    name: 'ProductionLines',
    component: () => import('../views/ProductionLines.vue'),
    meta: { requiresAuth: true, title: 'Production Lines' },
  },
  {
    path: '/assets/production-lines/:id',
    name: 'ProductionLineDetail',
    component: () => import('../views/ProductionLineDetail.vue'),
    meta: { requiresAuth: true, title: 'Production Line Detail' },
  },
  {
    path: '/assets/pnids/:id',
    name: 'PnidDetail',
    component: () => import('../views/PnidDetail.vue'),
    meta: { requiresAuth: true, title: 'P&ID Detail' },
  },
  {
    path: '/assets/depreciation-periods',
    name: 'AssetDepreciationPeriods',
    component: () => import('../views/AssetDepreciationPeriods.vue'),
    meta: { requiresAuth: true, title: 'Periode Depresiasi' },
  },
  {
    path: '/assets/:id',
    name: 'AssetDetail',
    component: () => import('../views/AssetDetail.vue'),
    meta: { requiresAuth: true, title: 'Asset Detail' },
  },
  {
    path: '/sales-orders',
    name: 'SalesOrdersReal',
    component: () => import('../views/SalesOrders.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/deliveries',
    name: 'DeliveriesReal',
    component: () => import('../views/Deliveries.vue'),
    meta: { requiresAuth: true },
  },
  {
    // CONTRACT-R51: `SalesContracts.vue` sebelumnya YATIM — file-nya ada, tapi
    // tidak ada route, tidak ada menu, dan tidak ada satu pun yang meng-import.
    // Itu sebabnya ia tidak pernah muncul di mana pun.
    path: '/contracts',
    name: 'Contracts',
    component: () => import('../views/SalesContracts.vue'),
    meta: { requiresAuth: true, title: 'Contracts' },
  },
  {
    path: '/sales-invoices',
    name: 'SalesInvoicesReal',
    component: () => import('../views/SalesInvoices.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/project/events',
    name: 'ProductionEvents',
    component: () => import('../views/EventsCalendar.vue'),
    meta: { requiresAuth: true, title: 'Production Events' },
  },
  {
    path: '/project/tasks',
    name: 'ProductionTasks',
    component: () => import('../views/ProductionTasks.vue'),
    meta: { requiresAuth: true, title: 'Production Tasks' },
  },
  {
    path: '/sales/shipment',
    name: 'ShipmentTracking',
    component: () => import('../views/ShipmentTracking.vue'),
    meta: { requiresAuth: true, title: 'Shipment Tracking' },
  },
  {
    path: '/sales/payments',
    name: 'CustomerPayments',
    component: () => import('../views/CustomerPayments.vue'),
    meta: { requiresAuth: true, title: 'Customer Payments' },
  },
  // Production Module
  {
    path: '/production/planning',
    name: 'ProductionPlanningPage',
    component: () => import('../views/ProductionPlanning.vue'),
    meta: { requiresAuth: true, title: 'Production Planning' },
  },
  {
    path: '/production/mrp',
    name: 'ProductionMRPPage',
    component: () => import('../views/ProductionMRP.vue'),
    meta: { requiresAuth: true, title: 'Material Requirement Planning' },
  },
  {
    path: '/production/issue-material',
    name: 'ProductionIssueMaterialPage',
    component: () => import('../views/ProductionIssueMaterial.vue'),
    meta: { requiresAuth: true, title: 'Issue Material' },
  },
  {
    path: '/production/execution',
    name: 'ProductionExecutionPage',
    component: () => import('../views/ProductionExecution.vue'),
    meta: { requiresAuth: true, title: 'Production Execution' },
  },
  {
    path: '/production/yield',
    name: 'ProductionYieldPage',
    component: () => import('../views/ProductionYield.vue'),
    meta: { requiresAuth: true, title: 'Yield & Scrap' },
  },
  {
    path: '/production/fg-receipt',
    name: 'ProductionFGReceiptPage',
    component: () => import('../views/ProductionFGReceipt.vue'),
    meta: { requiresAuth: true, title: 'FG Receipt' },
  },
  {
    path: '/production/history',
    name: 'ProductionHistoryPage',
    component: () => import('../views/ProductionHistory.vue'),
    meta: { requiresAuth: true, title: 'Production History' },
  },
  // Quality Module
  {
    path: '/quality/test-methods',
    name: 'QualityTestMethodsPage',
    component: () => import('../views/QualityTestMethods.vue'),
    meta: { requiresAuth: true, title: 'QC Test Methods' },
  },
  {
    path: '/quality/sampling',
    name: 'QualitySamplingPage',
    component: () => import('../views/QualitySampling.vue'),
    meta: { requiresAuth: true, title: 'QC Sampling Plans' },
  },
  {
    path: '/quality/results',
    name: 'QualityResultsPage',
    component: () => import('../views/QualityResults.vue'),
    meta: { requiresAuth: true, title: 'QC Results' },
  },
  {
    path: '/quality/batch-release',
    name: 'QualityBatchReleasePage',
    component: () => import('../views/QualityBatchRelease.vue'),
    meta: { requiresAuth: true, title: 'Batch Release' },
  },
  {
    path: '/quality/ncr',
    name: 'QualityNCRPage',
    component: () => import('../views/QualityNCR.vue'),
    meta: { requiresAuth: true, title: 'Non-Conformance Reports' },
  },
  {
    path: '/quality/rework',
    name: 'QualityReworkPage',
    component: () => import('../views/QualityRework.vue'),
    meta: { requiresAuth: true, title: 'Rework Orders' },
  },
  {
    path: '/quality/reports',
    name: 'QualityReportsPage',
    component: () => import('../views/QualityReports.vue'),
    meta: { requiresAuth: true, title: 'QC Reports & Analytics' },
  },
  // Finance Module
  {
    path: '/finance/cogs',
    name: 'FinanceCOGSPage',
    component: () => import('../views/FinanceCOGS.vue'),
    meta: { requiresAuth: true, title: 'COGS Calculation' },
  },
  {
    path: '/finance/ap',
    name: 'FinanceAPPage',
    component: () => import('../views/FinanceAP.vue'),
    meta: { requiresAuth: true, title: 'Accounts Payable' },
  },
  {
    path: '/finance/ar',
    name: 'FinanceARPage',
    component: () => import('../views/FinanceAR.vue'),
    meta: { requiresAuth: true, title: 'Accounts Receivable' },
  },
  {
    path: '/finance/cost-analysis',
    name: 'FinanceCostAnalysisPage',
    component: () => import('../views/FinanceCostAnalysis.vue'),
    meta: { requiresAuth: true, title: 'Cost Analysis' },
  },
  {
    path: '/finance/margin',
    name: 'FinanceMarginPage',
    component: () => import('../views/FinanceMargin.vue'),
    meta: { requiresAuth: true, title: 'Margin Analysis' },
  },
  {
    path: '/finance/summary',
    name: 'FinanceSummaryPage',
    component: () => import('../views/FinanceSummary.vue'),
    meta: { requiresAuth: true, title: 'Financial Summary' },
  },
  {
    path: '/finance/fund-requests',
    name: 'FinanceFundRequestsPage',
    component: () => import('../views/FinanceFundRequests.vue'),
    meta: { requiresAuth: true, title: 'Fund Requests' },
  },
  {
    path: '/finance/payment-schedule',
    name: 'FinancePaymentSchedule',
    component: () => import('../views/FinancePaymentSchedule.vue'),
    meta: { requiresAuth: true, title: 'Payment Schedule' },
  },
  {
    path: '/finance/kasbon-requests',
    name: 'FinanceKasbonRequests',
    component: () => import('../views/FinanceKasbonRequests.vue'),
    meta: { requiresAuth: true, title: 'Pengajuan Kasbon' },
  },
  // Sales Module
  {
    path: '/sales/orders',
    name: 'SalesOrderListPage',
    component: () => import('../views/SalesOrderList.vue'),
    meta: { requiresAuth: true, title: 'Sales Orders' },
  },
  {
    path: '/sales/approval',
    name: 'SalesApprovalPage',
    component: () => import('../views/SalesApproval.vue'),
    meta: { requiresAuth: true, title: 'SO Approval' },
  },
  {
    path: '/sales/price-list',
    name: 'SalesPriceListPage',
    component: () => import('../views/SalesPriceList.vue'),
    meta: { requiresAuth: true, title: 'Price List' },
  },
  {
    path: '/sales/delivery',
    name: 'SalesDeliveryPage',
    component: () => import('../views/SalesDeliveryOrders.vue'),
    meta: { requiresAuth: true, title: 'Delivery Orders' },
  },
  {
    path: '/sales/history',
    name: 'SalesHistoryPage',
    component: () => import('../views/SalesHistoryView.vue'),
    meta: { requiresAuth: true, title: 'Sales History' },
  },
  // Approval Module
  {
    path: '/approval/inbox',
    name: 'ApprovalInboxPage',
    component: () => import('../views/ApprovalInbox.vue'),
    meta: { requiresAuth: true, title: 'My Approval Inbox' },
  },
  {
    path: '/approval/history',
    name: 'ApprovalHistoryPage',
    component: () => import('../views/ApprovalHistory.vue'),
    meta: { requiresAuth: true, title: 'Approval History' },
  },
  {
    path: '/approval/rules',
    name: 'ApprovalRulesPage',
    component: () => import('../views/ApprovalRules.vue'),
    meta: { requiresAuth: true, title: 'Approval Rules' },
  },
  {
    path: '/approval/delegation',
    name: 'ApprovalDelegationPage',
    component: () => import('../views/ApprovalDelegation.vue'),
    meta: { requiresAuth: true, title: 'Delegation' },
  },
  {
    path: '/approval/escalation',
    name: 'ApprovalEscalationPage',
    component: () => import('../views/ApprovalEscalation.vue'),
    meta: { requiresAuth: true, title: 'Escalation Rules' },
  },
  // Reports Module
  {
    path: '/reports/production',
    name: 'ReportsProductionPage',
    component: () => import('../views/ReportsProduction.vue'),
    meta: { requiresAuth: true, title: 'Production Reports' },
  },
  {
    path: '/reports/inventory',
    name: 'ReportsInventoryPage',
    component: () => import('../views/ReportsInventory.vue'),
    meta: { requiresAuth: true, title: 'Inventory Reports' },
  },
  {
    path: '/reports/procurement',
    name: 'ReportsProcurementPage',
    component: () => import('../views/ReportsProcurement.vue'),
    meta: { requiresAuth: true, title: 'Procurement Reports' },
  },
  {
    path: '/reports/qc',
    name: 'ReportsQCPage',
    component: () => import('../views/ReportsQC.vue'),
    meta: { requiresAuth: true, title: 'QC Reports' },
  },
  {
    path: '/reports/sales',
    name: 'ReportsSalesPage',
    component: () => import('../views/ReportsSales.vue'),
    meta: { requiresAuth: true, title: 'Sales Reports' },
  },
  {
    path: '/reports/finance',
    name: 'ReportsFinancePage',
    component: () => import('../views/ReportsFinance.vue'),
    meta: { requiresAuth: true, title: 'Finance Reports' },
  },
  {
    path: '/reports/custom',
    name: 'ReportsCustomPage',
    component: () => import('../views/ReportsCustom.vue'),
    meta: { requiresAuth: true, title: 'Custom Reports' },
  },
  {
    path: '/reports/export',
    name: 'ReportsExportPage',
    component: () => import('../views/ReportsExport.vue'),
    meta: { requiresAuth: true, title: 'Export Data' },
  },
  // Dashboard KPI Module
  {
    path: '/dashboard/production',
    name: 'DashboardProductionKPIPage',
    component: () => import('../views/DashboardProductionKPI.vue'),
    meta: { requiresAuth: true, title: 'Production KPI' },
  },
  {
    path: '/dashboard/inventory',
    name: 'DashboardInventoryKPIPage',
    component: () => import('../views/DashboardInventoryKPI.vue'),
    meta: { requiresAuth: true, title: 'Inventory KPI' },
  },
  {
    path: '/dashboard/sales',
    name: 'DashboardSalesKPIPage',
    component: () => import('../views/DashboardSalesKPI.vue'),
    meta: { requiresAuth: true, title: 'Sales KPI' },
  },
  {
    path: '/dashboard/approvals',
    name: 'DashboardApprovalSummaryPage',
    component: () => import('../views/DashboardApprovalSummary.vue'),
    meta: { requiresAuth: true, title: 'Approval Summary' },
  },
  {
    path: '/dashboard/alerts',
    name: 'DashboardAlertsPage',
    component: () => import('../views/DashboardAlerts.vue'),
    meta: { requiresAuth: true, title: 'Alerts' },
  },
  // Admin Module
  {
    path: '/admin/settings',
    name: 'AdminSettingsPage',
    component: () => import('../views/SystemSettings.vue'),
    meta: { requiresAuth: true, title: 'System Settings' },
  },
  {
    path: '/admin/approval-config',
    name: 'AdminApprovalConfigPage',
    component: () => import('../views/AdminApprovalConfig.vue'),
    meta: { requiresAuth: true, title: 'Approval Configuration' },
  },
  {
    path: '/admin/audit-log',
    name: 'AdminAuditLogPage',
    component: () => import('../views/AuditLog.vue'),
    meta: { requiresAuth: true, title: 'Audit Log' },
  },
  {
    path: '/admin/notifications',
    name: 'AdminNotificationsPage',
    component: () => import('../views/AdminNotifications.vue'),
    meta: { requiresAuth: true, title: 'Notification Settings' },
  },
  {
    path: '/admin/integration',
    name: 'AdminIntegrationPage',
    component: () => import('../views/AdminIntegration.vue'),
    meta: { requiresAuth: true, title: 'Integration Settings' },
  },
  {
    path: '/admin/backup',
    name: 'AdminBackupPage',
    component: () => import('../views/AdminBackup.vue'),
    meta: { requiresAuth: true, title: 'Backup & Restore' },
  },
  ...placeholderRoutes,

  // Harus paling akhir: route apa pun setelah ini tidak akan pernah tercapai.
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('../views/NotFound.vue'),
    meta: { requiresAuth: true, title: 'Halaman tidak ditemukan' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Navigation guard for authentication
router.beforeEach((to, _from, next) => {
  const isAuthenticated = localStorage.getItem('token');

  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/login');
  } else if (to.name === 'Login' && isAuthenticated) {
    next('/');
  } else {
    next();
  }
});

export default router;
