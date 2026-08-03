<template>
  <div class="space-y-8">
    <!-- Header -->
    <div class="bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-lg p-8">
      <h1 class="text-4xl font-bold mb-2">Manufacturing ERP System</h1>
      <p class="text-blue-100">Biochemical Manufacturing & Distribution Platform</p>
      <div class="grid grid-cols-4 gap-4 mt-6 text-sm">
        <div>
          <div class="text-2xl font-bold">8</div>
          <div class="text-blue-100">Core Modules</div>
        </div>
        <div>
          <div class="text-2xl font-bold">50+</div>
          <div class="text-blue-100">Features</div>
        </div>
        <div>
          <div class="text-2xl font-bold">34+</div>
          <div class="text-blue-100">Database Tables</div>
        </div>
        <div>
          <div class="text-2xl font-bold">100+</div>
          <div class="text-blue-100">API Endpoints</div>
        </div>
      </div>
    </div>

    <!-- Module Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- 1. Product Management -->
      <div class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden">
        <div class="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4">
          <h2 class="text-xl font-bold">📦 Product Management</h2>
          <p class="text-purple-100 text-sm">Master data & Bill of Materials</p>
        </div>
        <div class="p-4 space-y-2">
          <router-link
            to="/products"
            class="block px-4 py-2 bg-purple-50 hover:bg-purple-100 rounded text-sm text-purple-900 font-semibold"
          >
            → Product Master
          </router-link>
          <router-link
            to="/categories"
            class="block px-4 py-2 bg-purple-50 hover:bg-purple-100 rounded text-sm text-purple-900 font-semibold"
          >
            → Product Categories
          </router-link>
          <router-link
            to="/units"
            class="block px-4 py-2 bg-purple-50 hover:bg-purple-100 rounded text-sm text-purple-900 font-semibold"
          >
            → Unit of Measure (UoM)
          </router-link>
          <router-link
            to="/bom"
            class="block px-4 py-2 bg-purple-50 hover:bg-purple-100 rounded text-sm text-purple-900 font-semibold"
          >
            → Bill of Materials (BOM)
          </router-link>
          <router-link
            to="/product-types"
            class="block px-4 py-2 bg-purple-50 hover:bg-purple-100 rounded text-sm text-purple-900 font-semibold"
          >
            → Product Types
          </router-link>
        </div>
        <div class="bg-purple-50 px-4 py-2 text-xs text-purple-600">✅ Fully Implemented</div>
      </div>

      <!-- 2. Inventory & Warehouse -->
      <div class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden">
        <div class="bg-gradient-to-r from-green-500 to-green-600 text-white p-4">
          <h2 class="text-xl font-bold">📊 Inventory & Warehouse</h2>
          <p class="text-green-100 text-sm">Stock management & warehouse operations</p>
        </div>
        <div class="p-4 space-y-2">
          <router-link
            to="/warehouses"
            class="block px-4 py-2 bg-green-50 hover:bg-green-100 rounded text-sm text-green-900 font-semibold"
          >
            → Warehouse Locations
          </router-link>
          <router-link
            to="/inventory/stock-card"
            class="block px-4 py-2 bg-green-50 hover:bg-green-100 rounded text-sm text-green-900 font-semibold"
          >
            → Stock Card
          </router-link>
          <router-link
            to="/inventory/transfer"
            class="block px-4 py-2 bg-green-50 hover:bg-green-100 rounded text-sm text-green-900 font-semibold"
          >
            → Stock Transfer
          </router-link>
          <router-link
            to="/inventory/adjustment"
            class="block px-4 py-2 bg-green-50 hover:bg-green-100 rounded text-sm text-green-900 font-semibold"
          >
            → Stock Adjustment
          </router-link>
          <router-link
            to="/inventory/opname"
            class="block px-4 py-2 bg-green-50 hover:bg-green-100 rounded text-sm text-green-900 font-semibold"
          >
            → Stock Opname
          </router-link>
          <router-link
            to="/inventory/batch-tracking"
            class="block px-4 py-2 bg-green-50 hover:bg-green-100 rounded text-sm text-green-900 font-semibold"
          >
            → Batch Tracking (Traceability)
          </router-link>
          <router-link
            to="/inventory/expiry"
            class="block px-4 py-2 bg-green-50 hover:bg-green-100 rounded text-sm text-green-900 font-semibold"
          >
            → Expiry Monitoring (FIFO/FEFO)
          </router-link>
        </div>
        <div class="bg-green-50 px-4 py-2 text-xs text-green-600">✅ Fully Implemented</div>
      </div>

      <!-- 3. Procurement -->
      <div class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden">
        <div class="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4">
          <h2 class="text-xl font-bold">🛒 Procurement</h2>
          <p class="text-blue-100 text-sm">Purchase & supplier management</p>
        </div>
        <div class="p-4 space-y-2">
          <router-link
            to="/suppliers"
            class="block px-4 py-2 bg-blue-50 hover:bg-blue-100 rounded text-sm text-blue-900 font-semibold"
          >
            → Vendor Master
          </router-link>
          <router-link
            to="/procurement/pr"
            class="block px-4 py-2 bg-blue-50 hover:bg-blue-100 rounded text-sm text-blue-900 font-semibold"
          >
            → Purchase Request (PR)
          </router-link>
          <router-link
            to="/procurement/po"
            class="block px-4 py-2 bg-blue-50 hover:bg-blue-100 rounded text-sm text-blue-900 font-semibold"
          >
            → Purchase Order (PO)
          </router-link>
          <router-link
            to="/procurement/pr-approval"
            class="block px-4 py-2 bg-blue-50 hover:bg-blue-100 rounded text-sm text-blue-900 font-semibold"
          >
            → PO Approval Routing
          </router-link>
          <router-link
            to="/procurement/grn"
            class="block px-4 py-2 bg-blue-50 hover:bg-blue-100 rounded text-sm text-blue-900 font-semibold"
          >
            → GRN (Goods Receipt)
          </router-link>
          <router-link
            to="/procurement/price-list"
            class="block px-4 py-2 bg-blue-50 hover:bg-blue-100 rounded text-sm text-blue-900 font-semibold"
          >
            → Vendor Price List
          </router-link>
          <router-link
            to="/procurement/history"
            class="block px-4 py-2 bg-blue-50 hover:bg-blue-100 rounded text-sm text-blue-900 font-semibold"
          >
            → Procurement History
          </router-link>
        </div>
        <div class="bg-blue-50 px-4 py-2 text-xs text-blue-600">✅ Fully Implemented</div>
      </div>

      <!-- 4. Production / Manufacturing -->
      <div class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden">
        <div class="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-4">
          <h2 class="text-xl font-bold">⚙️ Production / Manufacturing</h2>
          <p class="text-orange-100 text-sm">Work orders & shopfloor execution</p>
        </div>
        <div class="p-4 space-y-2">
          <router-link
            to="/workorders"
            class="block px-4 py-2 bg-orange-50 hover:bg-orange-100 rounded text-sm text-orange-900 font-semibold"
          >
            → Work Orders (MRP-lite)
          </router-link>
          <router-link
            to="/production/planning"
            class="block px-4 py-2 bg-orange-50 hover:bg-orange-100 rounded text-sm text-orange-900 font-semibold"
          >
            → Production Planning
          </router-link>
          <router-link
            to="/production/execution"
            class="block px-4 py-2 bg-orange-50 hover:bg-orange-100 rounded text-sm text-orange-900 font-semibold"
          >
            → Shopfloor Execution
          </router-link>
          <router-link
            to="/production/issue-material"
            class="block px-4 py-2 bg-orange-50 hover:bg-orange-100 rounded text-sm text-orange-900 font-semibold"
          >
            → Issue Material to WIP
          </router-link>
          <router-link
            to="/batches"
            class="block px-4 py-2 bg-orange-50 hover:bg-orange-100 rounded text-sm text-orange-900 font-semibold"
          >
            → Batch Management
          </router-link>
          <router-link
            to="/production/yield"
            class="block px-4 py-2 bg-orange-50 hover:bg-orange-100 rounded text-sm text-orange-900 font-semibold"
          >
            → Yield & Scrap Tracking
          </router-link>
          <router-link
            to="/production/fg-receipt"
            class="block px-4 py-2 bg-orange-50 hover:bg-orange-100 rounded text-sm text-orange-900 font-semibold"
          >
            → FG Receipt
          </router-link>
          <router-link
            to="/production/history"
            class="block px-4 py-2 bg-orange-50 hover:bg-orange-100 rounded text-sm text-orange-900 font-semibold"
          >
            → Production History
          </router-link>
        </div>
        <div class="bg-orange-50 px-4 py-2 text-xs text-orange-600">✅ Fully Implemented</div>
      </div>

      <!-- 5. Sales & Distribution -->
      <div class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden">
        <div class="bg-gradient-to-r from-red-500 to-red-600 text-white p-4">
          <h2 class="text-xl font-bold">💰 Sales & Distribution</h2>
          <p class="text-red-100 text-sm">Customer & order management</p>
        </div>
        <div class="p-4 space-y-2">
          <router-link
            to="/customers"
            class="block px-4 py-2 bg-red-50 hover:bg-red-100 rounded text-sm text-red-900 font-semibold"
          >
            → Customer Master
          </router-link>
          <router-link
            to="/sales-orders"
            class="block px-4 py-2 bg-red-50 hover:bg-red-100 rounded text-sm text-red-900 font-semibold"
          >
            → Sales Orders (SO)
          </router-link>
          <router-link
            to="/sales/price-list"
            class="block px-4 py-2 bg-red-50 hover:bg-red-100 rounded text-sm text-red-900 font-semibold"
          >
            → Price List
          </router-link>
          <router-link
            to="/deliveries"
            class="block px-4 py-2 bg-red-50 hover:bg-red-100 rounded text-sm text-red-900 font-semibold"
          >
            → Delivery Orders (DO)
          </router-link>
          <router-link
            to="/sales/shipment"
            class="block px-4 py-2 bg-red-50 hover:bg-red-100 rounded text-sm text-red-900 font-semibold"
          >
            → Shipment Tracking
          </router-link>
          <router-link
            to="/sales-invoices"
            class="block px-4 py-2 bg-red-50 hover:bg-red-100 rounded text-sm text-red-900 font-semibold"
          >
            → Sales Invoices
          </router-link>
          <router-link
            to="/sales/payments"
            class="block px-4 py-2 bg-red-50 hover:bg-red-100 rounded text-sm text-red-900 font-semibold"
          >
            → Customer Payments (AR)
          </router-link>
          <router-link
            to="/sales/history"
            class="block px-4 py-2 bg-red-50 hover:bg-red-100 rounded text-sm text-red-900 font-semibold"
          >
            → Sales History
          </router-link>
        </div>
        <div class="bg-red-50 px-4 py-2 text-xs text-red-600">⚙️ In Progress (75% Complete)</div>
      </div>

      <!-- 6. Quality Assurance -->
      <div class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden">
        <div class="bg-gradient-to-r from-cyan-500 to-cyan-600 text-white p-4">
          <h2 class="text-xl font-bold">✓ Quality Assurance (QA/QC)</h2>
          <p class="text-cyan-100 text-sm">Quality control & compliance</p>
        </div>
        <div class="p-4 space-y-2">
          <router-link
            to="/quality"
            class="block px-4 py-2 bg-cyan-50 hover:bg-cyan-100 rounded text-sm text-cyan-900 font-semibold"
          >
            → Quality Control Dashboard
          </router-link>
          <router-link
            to="/quality/test-methods"
            class="block px-4 py-2 bg-cyan-50 hover:bg-cyan-100 rounded text-sm text-cyan-900 font-semibold"
          >
            → QC Test Methods
          </router-link>
          <router-link
            to="/quality/sampling"
            class="block px-4 py-2 bg-cyan-50 hover:bg-cyan-100 rounded text-sm text-cyan-900 font-semibold"
          >
            → QC Sampling Plan
          </router-link>
          <router-link
            to="/quality/results"
            class="block px-4 py-2 bg-cyan-50 hover:bg-cyan-100 rounded text-sm text-cyan-900 font-semibold"
          >
            → QC Test Results
          </router-link>
          <router-link
            to="/quality/batch-release"
            class="block px-4 py-2 bg-cyan-50 hover:bg-cyan-100 rounded text-sm text-cyan-900 font-semibold"
          >
            → Batch Release Approval
          </router-link>
          <router-link
            to="/quality/ncr"
            class="block px-4 py-2 bg-cyan-50 hover:bg-cyan-100 rounded text-sm text-cyan-900 font-semibold"
          >
            → Non-Conformance Report (NCR)
          </router-link>
          <router-link
            to="/quality/rework"
            class="block px-4 py-2 bg-cyan-50 hover:bg-cyan-100 rounded text-sm text-cyan-900 font-semibold"
          >
            → Rework Management
          </router-link>
          <router-link
            to="/quality/reports"
            class="block px-4 py-2 bg-cyan-50 hover:bg-cyan-100 rounded text-sm text-cyan-900 font-semibold"
          >
            → QC Reports
          </router-link>
        </div>
        <div class="bg-cyan-50 px-4 py-2 text-xs text-cyan-600">✅ Fully Implemented</div>
      </div>

      <!-- 7. Finance -->
      <div class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden">
        <div class="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white p-4">
          <h2 class="text-xl font-bold">💵 Finance (Operational)</h2>
          <p class="text-yellow-100 text-sm">Cost tracking & profitability</p>
        </div>
        <div class="p-4 space-y-2">
          <router-link
            to="/finance"
            class="block px-4 py-2 bg-yellow-50 hover:bg-yellow-100 rounded text-sm text-yellow-900 font-semibold"
          >
            → Finance Dashboard
          </router-link>
          <router-link
            to="/finance/cogs"
            class="block px-4 py-2 bg-yellow-50 hover:bg-yellow-100 rounded text-sm text-yellow-900 font-semibold"
          >
            → COGS per Batch
          </router-link>
          <router-link
            to="/finance/ap"
            class="block px-4 py-2 bg-yellow-50 hover:bg-yellow-100 rounded text-sm text-yellow-900 font-semibold"
          >
            → Accounts Payable (AP)
          </router-link>
          <router-link
            to="/finance/ar"
            class="block px-4 py-2 bg-yellow-50 hover:bg-yellow-100 rounded text-sm text-yellow-900 font-semibold"
          >
            → Accounts Receivable (AR)
          </router-link>
          <router-link
            to="/finance/cost-analysis"
            class="block px-4 py-2 bg-yellow-50 hover:bg-yellow-100 rounded text-sm text-yellow-900 font-semibold"
          >
            → Cost Analysis
          </router-link>
          <router-link
            to="/finance/margin"
            class="block px-4 py-2 bg-yellow-50 hover:bg-yellow-100 rounded text-sm text-yellow-900 font-semibold"
          >
            → Margin Analysis (Profitability)
          </router-link>
          <router-link
            to="/finance/summary"
            class="block px-4 py-2 bg-yellow-50 hover:bg-yellow-100 rounded text-sm text-yellow-900 font-semibold"
          >
            → Monthly Financial Summary
          </router-link>
        </div>
        <div class="bg-yellow-50 px-4 py-2 text-xs text-yellow-600">✅ Newly Implemented</div>
      </div>

      <!-- 8. Human Resources -->
      <div class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden">
        <div class="bg-gradient-to-r from-pink-500 to-pink-600 text-white p-4">
          <h2 class="text-xl font-bold">👥 Human Resources (Lite)</h2>
          <p class="text-pink-100 text-sm">Employee & shift management</p>
        </div>
        <div class="p-4 space-y-2">
          <router-link
            to="/employees"
            class="block px-4 py-2 bg-pink-50 hover:bg-pink-100 rounded text-sm text-pink-900 font-semibold"
          >
            → Employee Database
          </router-link>
          <router-link
            to="/departments"
            class="block px-4 py-2 bg-pink-50 hover:bg-pink-100 rounded text-sm text-pink-900 font-semibold"
          >
            → Departments & Roles
          </router-link>
          <router-link
            to="/attendance"
            class="block px-4 py-2 bg-pink-50 hover:bg-pink-100 rounded text-sm text-pink-900 font-semibold"
          >
            → Attendance Log
          </router-link>
          <div class="px-4 py-2 bg-pink-50 rounded text-sm text-pink-900 font-semibold opacity-50">
            → Shift Schedule (Coming Soon)
          </div>
          <div class="px-4 py-2 bg-pink-50 rounded text-sm text-pink-900 font-semibold opacity-50">
            → Overtime & Approval (Coming Soon)
          </div>
        </div>
        <div class="bg-pink-50 px-4 py-2 text-xs text-pink-600">⚙️ In Progress (60% Complete)</div>
      </div>

      <!-- 9. System Administration -->
      <div class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden">
        <div class="bg-gradient-to-r from-gray-600 to-gray-700 text-white p-4">
          <h2 class="text-xl font-bold">⚡ System Administration</h2>
          <p class="text-gray-100 text-sm">Settings & system management</p>
        </div>
        <div class="p-4 space-y-2">
          <router-link
            to="/users"
            class="block px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded text-sm text-gray-900 font-semibold"
          >
            → Users Management
          </router-link>
          <router-link
            to="/roles"
            class="block px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded text-sm text-gray-900 font-semibold"
          >
            → Roles & Permissions (RBAC)
          </router-link>
          <router-link
            to="/system-settings"
            class="block px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded text-sm text-gray-900 font-semibold"
          >
            → System Settings & KPI
          </router-link>
          <router-link
            to="/approval/rules"
            class="block px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded text-sm text-gray-900 font-semibold"
          >
            → Approval Rules Engine
          </router-link>
          <router-link
            to="/audit-log"
            class="block px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded text-sm text-gray-900 font-semibold"
          >
            → Audit Log & Compliance
          </router-link>
          <router-link
            to="/notifications"
            class="block px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded text-sm text-gray-900 font-semibold"
          >
            → Notification Center
          </router-link>
          <router-link
            to="/approval/inbox"
            class="block px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded text-sm text-gray-900 font-semibold"
          >
            → Approval Inbox
          </router-link>
        </div>
        <div class="bg-gray-50 px-4 py-2 text-xs text-gray-600">✅ Newly Implemented</div>
      </div>

      <!-- 10. Reports & Analytics -->
      <div class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden border-2 border-dashed border-gray-300">
        <div class="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white p-4">
          <h2 class="text-xl font-bold">📈 Reports & Analytics</h2>
          <p class="text-indigo-100 text-sm">Business intelligence & reporting</p>
        </div>
        <div class="p-4 space-y-2">
          <div class="px-4 py-2 bg-indigo-50 rounded text-sm text-indigo-900 font-semibold opacity-50">
            → Production Reports
          </div>
          <div class="px-4 py-2 bg-indigo-50 rounded text-sm text-indigo-900 font-semibold opacity-50">
            → Inventory Reports
          </div>
          <div class="px-4 py-2 bg-indigo-50 rounded text-sm text-indigo-900 font-semibold opacity-50">
            → Procurement Reports
          </div>
          <div class="px-4 py-2 bg-indigo-50 rounded text-sm text-indigo-900 font-semibold opacity-50">
            → QC Reports & Batch Traceability
          </div>
          <div class="px-4 py-2 bg-indigo-50 rounded text-sm text-indigo-900 font-semibold opacity-50">
            → Sales Reports & Performance
          </div>
          <div class="px-4 py-2 bg-indigo-50 rounded text-sm text-indigo-900 font-semibold opacity-50">
            → Finance Reports & P&L
          </div>
          <div class="px-4 py-2 bg-indigo-50 rounded text-sm text-indigo-900 font-semibold opacity-50">
            → Custom Report Builder
          </div>
          <div class="px-4 py-2 bg-indigo-50 rounded text-sm text-indigo-900 font-semibold opacity-50">
            → Data Export & Analytics
          </div>
        </div>
        <div class="bg-indigo-50 px-4 py-2 text-xs text-indigo-600">❌ Not Started (Future Phase)</div>
      </div>

      <!-- 11. Future Modules -->
      <div class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden border-2 border-dashed border-gray-300">
        <div class="bg-gradient-to-r from-violet-500 to-violet-600 text-white p-4">
          <h2 class="text-xl font-bold">🔮 Future Modules</h2>
          <p class="text-violet-100 text-sm">Planned for scale-up</p>
        </div>
        <div class="p-4 space-y-2">
          <div class="px-4 py-2 bg-violet-50 rounded text-sm text-violet-900 font-semibold opacity-50">
            → Customer Relationship Management (CRM)
          </div>
          <div class="px-4 py-2 bg-violet-50 rounded text-sm text-violet-900 font-semibold opacity-50">
            → Asset Management & Maintenance
          </div>
          <div class="px-4 py-2 bg-violet-50 rounded text-sm text-violet-900 font-semibold opacity-50">
            → Multi-currency & Multi-language
          </div>
          <div class="px-4 py-2 bg-violet-50 rounded text-sm text-violet-900 font-semibold opacity-50">
            → Advanced Forecasting
          </div>
          <div class="px-4 py-2 bg-violet-50 rounded text-sm text-violet-900 font-semibold opacity-50">
            → Supply Chain Optimization
          </div>
          <div class="px-4 py-2 bg-violet-50 rounded text-sm text-violet-900 font-semibold opacity-50">
            → Integration with E-commerce
          </div>
        </div>
        <div class="bg-violet-50 px-4 py-2 text-xs text-violet-600">📋 Planned (Phase 2+)</div>
      </div>
    </div>

    <!-- Implementation Legend -->
    <div class="bg-gray-50 rounded-lg p-6 border border-gray-200">
      <h3 class="text-lg font-bold text-gray-900 mb-4">📌 Implementation Status Legend</h3>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div class="flex items-center space-x-2">
          <span class="inline-block w-4 h-4 bg-green-100 border border-green-600 rounded"></span>
          <span class="text-sm text-gray-700">✅ Fully Implemented</span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="inline-block w-4 h-4 bg-yellow-100 border border-yellow-600 rounded"></span>
          <span class="text-sm text-gray-700">⚙️ In Progress</span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="inline-block w-4 h-4 bg-red-100 border border-red-600 rounded"></span>
          <span class="text-sm text-gray-700">❌ Not Started</span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="inline-block w-4 h-4 bg-indigo-100 border border-indigo-600 rounded"></span>
          <span class="text-sm text-gray-700">📈 Future Phase</span>
        </div>
        <div class="flex items-center space-x-2">
          <span class="inline-block w-4 h-4 bg-violet-100 border border-violet-600 rounded"></span>
          <span class="text-sm text-gray-700">🔮 Planned</span>
        </div>
      </div>
    </div>

    <!-- Quick Stats -->
    <div class="bg-blue-50 rounded-lg p-6 border border-blue-200">
      <h3 class="text-lg font-bold text-blue-900 mb-4">📊 Project Statistics</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div>
          <div class="text-3xl font-bold text-blue-600">9</div>
          <div class="text-sm text-blue-900">Active Modules</div>
        </div>
        <div>
          <div class="text-3xl font-bold text-blue-600">2</div>
          <div class="text-sm text-blue-900">Future Modules</div>
        </div>
        <div>
          <div class="text-3xl font-bold text-blue-600">50+</div>
          <div class="text-sm text-blue-900">Features</div>
        </div>
        <div>
          <div class="text-3xl font-bold text-blue-600">100+</div>
          <div class="text-sm text-blue-900">API Endpoints</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// ProjectOverview component - No state management needed, purely navigational
</script>

<style scoped>
/* Smooth transitions for hover effects */
.transition-shadow {
  transition: box-shadow 0.3s ease-in-out;
}
</style>
