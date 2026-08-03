<template>
<div class="att-page">
  <div class="att-header">
    <h1>👷 HR & Payroll</h1>
    <div class="header-actions">
      <select v-model="filterProject" class="sel"><option value="">Semua Proyek</option><option v-for="p in projects" :key="p.id" :value="p.id">{{p.name}}</option></select>
      <input type="month" v-model="filterMonth" class="sel"/>
    </div>
  </div>
  <div class="tab-nav">
    <button :class="['tab-btn', activeTab==='daily'?'active':'']" @click="activeTab='daily'">📋 Absensi Harian</button>
    <button :class="['tab-btn', activeTab==='riwayat'?'active':'']" @click="activeTab='riwayat';loadRiwayat()">📝 Edit Riwayat</button>
    <button :class="['tab-btn', activeTab==='timesheet'?'active':'']" @click="activeTab='timesheet'">📊 Timesheet</button>
    <button :class="['tab-btn', activeTab==='kasbon'?'active':'']" @click="activeTab='kasbon';loadAdvances()">💳 Kasbon</button>
    <button :class="['tab-btn', activeTab==='payslip'?'active':'']" @click="activeTab='payslip'">💰 Slip Gaji</button>
  </div>

  <!-- TAB 1: ABSENSI HARIAN -->
  <div v-if="activeTab==='daily'" class="card">
    <div class="card-toolbar">
      <div class="toolbar-left">
        <span class="card-title">📋 Input Absensi Harian</span>
        <input type="date" v-model="attendDate" :max="today" class="sel"
          :style="isSpecialDay ? 'border-color:#ef4444;background:#fff1f2' : isAttendDateWeekend() ? 'border-color:#f59e0b;background:#fffbeb' : ''"/>
        <!-- Holiday badge -->
        <span v-if="isHoliday"
          style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;border-radius:8px;padding:3px 10px;font-size:.72rem;font-weight:700;display:flex;align-items:center;gap:4px">
          🏖 Libur Nasional — Jam kerja manual
        </span>
        <!-- Weekend badge (only if not holiday) -->
        <span v-else-if="isAttendDateWeekend()"
          style="background:#fef3c7;color:#b45309;border:1px solid #fde68a;border-radius:8px;padding:3px 10px;font-size:.72rem;font-weight:700">
          📅 Akhir Pekan — Jam kerja manual
        </span>
        <select v-model="attendProject" class="sel"><option value="">— Pilih Proyek —</option><option v-for="p in projects" :key="p.id" :value="p.id">{{p.name}}</option></select>
      </div>
      <div class="toolbar-right">
        <!-- Holiday toggle -->
        <button @click="toggleHoliday"
          :class="isHoliday ? 'btn-holiday-active' : 'btn-holiday'"
          title="Tandai hari ini sebagai Libur Nasional (jam kerja = manual, seperti akhir pekan)">
          🏖 {{ isHoliday ? 'Libur Nasional ✓' : 'Libur Nasional' }}
        </button>
        <!-- Quick actions -->
        <div class="bulk-actions">
          <button @click="checkAllPresent" class="btn-check-all" title="Set semua karyawan = Hadir">
            ✓ Semua Hadir
          </button>
          <button @click="checkAllAbsent" class="btn-check-absent" title="Set semua karyawan = Absen">
            ✗ Semua Absen
          </button>
        </div>
        <button @click="saveBulk" :disabled="saving" class="btn-primary">{{ saving?'Menyimpan...':'💾 Simpan Absensi' }}</button>
      </div>
    </div>
    <!-- Summary bar -->
    <div v-if="activeEmployees.length" class="summary-bar" :style="isHoliday ? 'background:#fff1f2;border-bottom-color:#fecdd3' : ''">
      <span v-if="isHoliday" style="color:#b91c1c;font-weight:700;font-size:.72rem">🏖 LIBUR NASIONAL</span>
      <span class="sum-item sum-present">✓ Hadir: <strong>{{ countStatus('present') }}</strong></span>
      <span class="sum-item sum-absent">✗ Absen: <strong>{{ countStatus('absent') }}</strong></span>
      <span class="sum-item sum-none">— Belum diisi: <strong>{{ countStatus(null) }}</strong></span>
      <span class="sum-sep">·</span>
      <span class="sum-item">Total: <strong>{{ activeEmployees.length }}</strong> karyawan</span>
    </div>

    <div class="tbl-wrap">
      <table class="tbl">
        <thead><tr>
          <th style="width:36px">
            <!-- master checkbox: click → all present -->
            <input type="checkbox"
              :checked="allPresent"
              :indeterminate.prop="somePresent && !allPresent"
              @change="toggleAllPresent"
              title="Centang = semua hadir"
              style="width:16px;height:16px;cursor:pointer"
            />
          </th>
          <th>No</th><th>Karyawan</th><th>Posisi</th>
          <th>Status</th><th>Nilai</th><th>Check In</th><th>Check Out</th><th>OT (jam)</th><th>Catatan</th>
        </tr></thead>
        <tbody>
          <tr v-if="!activeEmployees.length"><td colspan="10" class="empty">Tidak ada karyawan aktif</td></tr>
          <tr v-for="(e,i) in activeEmployees" :key="e.id"
            :class="[i%2?'odd':'', dailyRec[e.id]?.status==='absent'?'row-absent':'', dailyRec[e.id]?.status==='present'?'row-present':'']">
            <td class="tc" style="padding:0 8px">
              <!-- per-row checkbox: checked = hadir -->
              <input type="checkbox"
                :checked="dailyRec[e.id]?.status === 'present'"
                @change="toggleOne(e.id, $event)"
                style="width:16px;height:16px;cursor:pointer"
              />
            </td>
            <td class="tc">{{i+1}}</td>
            <td class="td-name"><div class="emp-name">{{e.name}}</div><div class="emp-code">{{e.code}}</div></td>
            <td class="tc small">{{e.position}}</td>
            <td class="tc">
              <div class="status-btns">
                <button :class="['sb','sb-p',dailyRec[e.id]?.status==='present'?'active':'']" @click="setStatus(e.id,'present',1)">✓</button>
                <button :class="['sb','sb-a',dailyRec[e.id]?.status==='absent'?'active':'']" @click="setStatus(e.id,'absent',0)">✗</button>
              </div>
            </td>
            <td class="tc"><span class="ts-val" :class="tsClass(dailyRec[e.id]?.timesheet_value)">{{ dailyRec[e.id]?.timesheet_value??'—' }}</span></td>
            <td><input type="time" class="time-inp" v-model="dailyRec[e.id].check_in" v-if="dailyRec[e.id]"/></td>
            <td><input type="time" class="time-inp" v-model="dailyRec[e.id].check_out" v-if="dailyRec[e.id]"/></td>
            <td><input type="number" class="ot-inp" v-model.number="dailyRec[e.id].overtime_hours" v-if="dailyRec[e.id]" min="0" max="24" step="0.5"/></td>
            <td><input class="note-inp" v-model="dailyRec[e.id].notes" v-if="dailyRec[e.id]" placeholder="catatan..."/></td>
          </tr>
        </tbody>
        <tfoot v-if="activeEmployees.length">
          <tr class="tfoot-row">
            <td colspan="4" class="tf-label">Total Hari Ini</td>
            <td class="tc"><strong>{{ countStatus('present') }} hadir · {{ countStatus('absent') }} absen</strong></td>
            <td class="tc"><strong>{{ totalTsToday.toFixed(1) }}</strong></td>
            <td colspan="4"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

  <!-- MONTHLY SUMMARY PANEL -->
  <div v-if="activeTab==='daily' && monthLogs.length > 0" class="summary-panel">
    <div class="sp-header">
      <span class="sp-title">📊 Ringkasan Bulan Berjalan — {{ filterMonthLabel }}</span>
      <span class="sp-sub">Berdasarkan timesheet tersimpan · Estimasi biaya belum termasuk potongan</span>
    </div>

    <!-- Row 1: KPI Cards -->
    <div class="sp-grid">
      <div class="sp-card sp-blue">
        <div class="sp-icon">👷</div>
        <div class="sp-content">
          <div class="sp-label">MANPOWER AKTIF</div>
          <div class="sp-value">{{ mthStats.manpower }}</div>
          <div class="sp-sub2">karyawan hadir bulan ini</div>
        </div>
      </div>
      <div class="sp-card sp-indigo">
        <div class="sp-icon">⏱</div>
        <div class="sp-content">
          <div class="sp-label">TOTAL MAN-HOUR</div>
          <div class="sp-value">{{ mthStats.manhour.toLocaleString('id-ID') }}</div>
          <div class="sp-sub2">jam kerja ({{ mthStats.totalDays.toFixed(1) }} hari × 8 jam)</div>
        </div>
      </div>
      <div class="sp-card sp-violet">
        <div class="sp-icon">⚡</div>
        <div class="sp-content">
          <div class="sp-label">TOTAL LEMBUR</div>
          <div class="sp-value">{{ mthStats.totalOT.toFixed(1) }}</div>
          <div class="sp-sub2">jam overtime bulan ini</div>
        </div>
      </div>
      <div class="sp-card sp-emerald">
        <div class="sp-icon">📅</div>
        <div class="sp-content">
          <div class="sp-label">TINGKAT KEHADIRAN</div>
          <div class="sp-value">{{ mthStats.attendanceRate.toFixed(0) }}%</div>
          <div class="sp-sub2">{{ mthStats.totalPresentDays }} hadir · {{ mthStats.totalAbsentDays }} absen</div>
        </div>
      </div>
    </div>

    <!-- Row 2: Financial KPIs -->
    <div class="sp-divider">💰 Estimasi Biaya Tenaga Kerja</div>
    <div class="sp-grid">
      <div class="sp-card sp-green">
        <div class="sp-icon">💵</div>
        <div class="sp-content">
          <div class="sp-label">GAJI POKOK</div>
          <div class="sp-value sp-rp">{{ fmtRp(mthStats.totalBasicSalary) }}</div>
          <div class="sp-sub2">{{ mthStats.totalDays.toFixed(1) }} man-days × rate/hari</div>
        </div>
      </div>
      <div class="sp-card sp-amber">
        <div class="sp-icon">🌙</div>
        <div class="sp-content">
          <div class="sp-label">UPAH LEMBUR</div>
          <div class="sp-value sp-rp">{{ fmtRp(mthStats.totalOTPay) }}</div>
          <div class="sp-sub2">{{ mthStats.totalOT.toFixed(1) }} jam × rate OT</div>
        </div>
      </div>
      <div class="sp-card sp-teal">
        <div class="sp-icon">🎁</div>
        <div class="sp-content">
          <div class="sp-label">TUNJANGAN</div>
          <div class="sp-value sp-rp">{{ fmtRp(mthStats.totalTunjangan) }}</div>
          <div class="sp-sub2">{{ mthStats.totalDays.toFixed(1) }} man-days × rate tunjangan</div>
        </div>
      </div>
      <div class="sp-card sp-rose" style="border:2px solid #fca5a5">
        <div class="sp-icon">🏦</div>
        <div class="sp-content">
          <div class="sp-label">ESTIMASI TOTAL GAJI</div>
          <div class="sp-value sp-rp" style="font-size:1.05rem;color:#be123c">{{ fmtRp(mthStats.totalGross) }}</div>
          <div class="sp-sub2">Pokok + lembur + tunjangan</div>
        </div>
      </div>
    </div>

    <!-- Row 3: Per-employee breakdown -->
    <div class="sp-divider">👤 Breakdown Per Karyawan</div>
    <div class="sp-emp-table">
      <table class="tbl">
        <thead><tr>
          <th>Karyawan</th><th>Posisi</th>
          <th class="tc">Hari Kerja</th><th class="tc">Man-Hour</th>
          <th class="tc">OT (jam)</th><th class="tc">Gaji Pokok</th>
          <th class="tc">OT Pay</th><th class="tc">Estimasi Total</th>
        </tr></thead>
        <tbody>
          <tr v-for="(row, i) in mthStats.perEmployee" :key="row.id" :class="i%2?'odd':''">
            <td><div class="emp-name">{{ row.name }}</div><div class="emp-code">{{ row.code }}</div></td>
            <td class="small tc">{{ row.position||'—' }}</td>
            <td class="tc"><span class="ts-1">{{ row.days.toFixed(1) }}</span></td>
            <td class="tc" style="color:#6366f1;font-weight:700">{{ (row.days * 8).toFixed(0) }} jam</td>
            <td class="tc" style="color:#f59e0b;font-weight:600">{{ row.ot.toFixed(1) }}</td>
            <td class="tc">{{ fmtRp(row.basicSalary) }}</td>
            <td class="tc" style="color:#f59e0b">{{ fmtRp(row.otPay) }}</td>
            <td class="tc ts-salary">{{ fmtRp(row.total) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr style="background:#0f172a;color:#38bdf8;font-weight:800">
            <td colspan="2" style="padding:8px 12px;text-align:left">TOTAL ({{ mthStats.manpower }} karyawan)</td>
            <td class="tc">{{ mthStats.totalDays.toFixed(1) }}</td>
            <td class="tc">{{ mthStats.manhour }} jam</td>
            <td class="tc">{{ mthStats.totalOT.toFixed(1) }}</td>
            <td class="tc">{{ fmtRp(mthStats.totalBasicSalary) }}</td>
            <td class="tc">{{ fmtRp(mthStats.totalOTPay) }}</td>
            <td class="tc" style="color:#34d399;font-size:.9rem">{{ fmtRp(mthStats.totalGross) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

  <!-- TAB 2: EDIT RIWAYAT -->
  <div v-if="activeTab==='riwayat'" class="card">
    <div class="card-toolbar">
      <span class="card-title">📝 Edit Riwayat Absensi</span>
      <div class="toolbar-right">
        <select v-model="riwayatEmployee" class="sel" style="min-width:160px">
          <option value="">— Semua Karyawan —</option>
          <option v-for="e in activeEmployees" :key="e.id" :value="e.id">{{e.name}}</option>
        </select>
        <input type="month" v-model="filterMonth" class="sel"/>
      </div>
    </div>
    <div class="tbl-wrap">
      <table class="tbl">
        <thead><tr>
          <th>Tanggal</th><th>Karyawan</th><th>Status</th><th>Nilai</th>
          <th>Check In</th><th>Check Out</th><th>OT</th><th>Catatan</th><th>Proyek</th><th>Aksi</th>
        </tr></thead>
        <tbody>
          <tr v-if="!filteredRiwayat.length"><td colspan="10" class="empty">Tidak ada data absensi</td></tr>
          <tr v-for="(log, i) in filteredRiwayat" :key="log.id" :class="i%2?'odd':''">
            <td class="tc small">{{ log.date?.slice(0,10) }}</td>
            <td class="td-name"><div class="emp-name">{{ log.employee_name }}</div><div class="emp-code">{{ log.employee_code }}</div></td>
            <td class="tc">
              <span :class="log.status==='present'?'badge-approved':'badge-pending'" style="font-size:.65rem">
                {{ log.status==='present'?'Hadir':'Absen' }}
              </span>
            </td>
            <td class="tc"><span :class="tsClass(log.timesheet_value)">{{ log.timesheet_value }}</span></td>
            <td class="tc small">{{ log.check_in||'—' }}</td>
            <td class="tc small">{{ log.check_out||'—' }}</td>
            <td class="tc small">{{ log.overtime_hours||0 }} jam</td>
            <td class="small">{{ log.notes||'—' }}</td>
            <td class="tc small">{{ log.project_name||'—' }}</td>
            <td class="tc" style="white-space:nowrap">
              <button @click="openEditModal(log)" style="background:#dbeafe;color:#1d4ed8;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer">✏️ Edit</button>
              <button @click="deleteAttendance(log)" style="background:#fee2e2;color:#dc2626;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;margin-left:4px">🗑</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- TAB 3: TIMESHEET -->
  <div v-if="activeTab==='timesheet'" class="card">
    <div class="card-title" style="padding:14px 18px">📊 Timesheet — {{ filterMonthLabel }}</div>
    <div class="tbl-wrap">
      <table class="tbl">
        <thead><tr>
          <th class="th-sticky">Karyawan</th><th class="th-sticky">Posisi</th>
          <th v-for="d in daysInMonth" :key="d" class="th-day" :class="{weekend:isWeekend(d)}">
            <div>{{d}}</div><div class="day-name">{{dayName(d)}}</div>
          </th>
          <th class="th-sticky">Total</th><th class="th-sticky">Rate/Hari</th><th class="th-sticky">Gaji Pokok</th>
        </tr></thead>
        <tbody>
          <tr v-for="(e,i) in activeEmployees" :key="e.id" :class="i%2?'odd':''">
            <td class="td-emp">{{e.name}}</td><td class="small tc">{{e.position}}</td>
            <td v-for="d in daysInMonth" :key="d" class="tc ts-cell" :class="{weekend:isWeekend(d)}">
              <span :class="tsClass(getTsVal(e.id,d))">{{ getTsVal(e.id,d)??'' }}</span>
            </td>
            <td class="tc ts-total">{{ empMonthTotal(e.id).toFixed(1) }}</td>
            <td class="tc small">{{ fmtRp(e.basic_rate>0?e.basic_rate:Math.round((e.salary||0)/22)) }}</td>
            <td class="tc ts-salary">{{ fmtRp(Math.round(empMonthTotal(e.id)*(e.basic_rate>0?e.basic_rate:Math.round((e.salary||0)/22)))) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- TAB 3: KASBON -->
  <div v-if="activeTab==='kasbon'" class="card">
    <div class="card-toolbar">
      <span class="card-title">💳 Kasbon / Salary Advance</span>
      <button @click="showAdvForm=!showAdvForm" class="btn-primary">+ Tambah Kasbon</button>
    </div>
    <div v-if="showAdvForm" class="adv-form">
      <select v-model="advForm.employee_id" class="sel"><option value="">— Pilih Karyawan —</option><option v-for="e in activeEmployees" :key="e.id" :value="e.id">{{e.name}}</option></select>
      <input type="number" v-model.number="advForm.amount" placeholder="Jumlah (Rp)" class="sel" style="width:140px"/>
      <input type="date" v-model="advForm.advance_date" :max="today" class="sel"/>
      <input type="month" v-model="advForm.period" placeholder="Periode" class="sel"/>
      <input v-model="advForm.description" placeholder="Keterangan..." class="sel" style="width:200px"/>
      <button @click="saveAdvance" class="btn-primary" :disabled="savingAdv">{{ savingAdv?'...':'💾 Simpan' }}</button>
      <button @click="showAdvForm=false" class="btn-cancel">Batal</button>
    </div>

    <!-- Grouped by period -->
    <div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px">
      <div v-if="!groupedAdvances.length" class="empty" style="padding:40px">Belum ada data kasbon</div>

      <!-- Per-period parent card -->
      <div v-for="grp in groupedAdvances" :key="grp.key"
        style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.04)">

        <!-- Card header -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <div>
              <div style="font-weight:700;font-size:.92rem;color:#0f172a">{{ grp.label }}</div>
              <div style="font-size:.7rem;color:#94a3b8;margin-top:2px">{{ grp.items.length }} karyawan · Due: {{ grp.dueDate }}</div>
            </div>
            <span :class="'badge-'+grp.requestStatus" style="font-size:.68rem">{{ grp.requestStatus }}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="text-align:right">
              <div style="font-size:.7rem;color:#64748b">Total Kasbon</div>
              <div style="font-weight:800;color:#1d4ed8;font-size:.95rem">{{ fmtRp(grp.total) }}</div>
            </div>
            <!-- Actions -->
            <select v-model="kasbonExpProjectId" class="sel" style="font-size:.72rem;padding:4px 6px;min-width:140px;border-radius:8px">
              <option value="">— Project —</option>
              <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <button @click="generateKasbonToExpense(grp)" :disabled="krSaving || !kasbonExpProjectId"
              style="padding:6px 14px;background:#1d4ed8;color:white;border:none;border-radius:8px;font-size:.75rem;font-weight:700;cursor:pointer"
              :style="{opacity:(!kasbonExpProjectId||krSaving)?0.5:1}">
              📊 Generate ke Project Expense
            </button>
            <span v-if="grp.requestStatus==='approved'" style="font-size:.72rem;color:#15803d;background:#dcfce7;padding:4px 10px;border-radius:8px;font-weight:600">✅ Sudah di Expense</span>
            <button v-if="grp.requestStatus==='approved'" @click="rejectKasbon(grp)"
              style="padding:5px 12px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:8px;font-size:.72rem;font-weight:600;cursor:pointer">
              ↩ Batalkan
            </button>
            <button @click="toggleKasbonGroup(grp.key)"
              style="padding:6px 12px;background:white;border:1px solid #e2e8f0;border-radius:8px;font-size:.75rem;color:#374151;cursor:pointer">
              {{ expandedKeys[grp.key] ? '▲ Sembunyikan' : '▼ Lihat Detail' }}
            </button>
          </div>
        </div>

        <!-- Inline detail table -->
        <div v-show="expandedKeys[grp.key]" style="overflow-x:auto">
          <table class="tbl" style="background:white">
            <thead><tr>
              <th>Karyawan</th><th>Tanggal</th><th>Keterangan</th><th>Jumlah</th><th>Sisa</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              <tr v-for="(a,i) in grp.items" :key="a.id" :class="i%2?'odd':''">
                <td><div class="emp-name">{{a.employee_name}}</div><div class="emp-code">{{a.employee_code}}</div></td>
                <td class="tc small">{{a.advance_date?.slice(0,10)}}</td>
                <td class="small">{{a.description||'—'}}</td>
                <td class="tc" style="font-weight:600">{{fmtRp(a.amount)}}</td>
                <td class="tc" :class="a.remaining>0?'red-txt':''">{{fmtRp(a.remaining)}}</td>
                <td class="tc"><span :class="'badge-'+a.status">{{a.status}}</span></td>
                <td class="tc"><button @click="deleteAdvance(a.id)" class="btn-del" :disabled="!!a.kasbon_request_id">🗑</button></td>
              </tr>
            </tbody>
            <tfoot>
              <tr style="background:#f8fafc">
                <td colspan="3" style="text-align:right;font-weight:700;padding:6px 8px;color:#374151">Total</td>
                <td style="text-align:center;font-weight:800;color:#1d4ed8">{{fmtRp(grp.total)}}</td>
                <td colspan="3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  </div>


  <!-- TAB 4: SLIP GAJI — Summary Table + Generate ke Payment Schedule -->
  <div v-if="activeTab==='payslip'" class="card">

    <!-- Header + Summary Cards -->
    <div class="ps-toolbar" style="flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span class="card-title">💰 Slip Gaji</span>
        <!-- Month navigation -->
        <div style="display:flex;align-items:center;gap:4px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:3px 6px">
          <button @click="shiftMonth(-1)"
            style="background:none;border:none;padding:2px 6px;cursor:pointer;font-size:14px;color:#64748b;border-radius:6px;line-height:1"
            title="Bulan sebelumnya">‹</button>
          <input type="month" v-model="filterMonth" class="sel"
            style="border:none;background:transparent;font-weight:700;font-size:.82rem;color:#1d4ed8;padding:2px 4px;cursor:pointer;min-width:130px"/>
          <button @click="shiftMonth(1)" :disabled="filterMonth >= currentMonth"
            style="background:none;border:none;padding:2px 6px;cursor:pointer;font-size:14px;color:#64748b;border-radius:6px;line-height:1"
            :style="{opacity: filterMonth >= currentMonth ? 0.3 : 1}"
            title="Bulan berikutnya">›</button>
        </div>
        <button v-if="filterMonth !== currentMonth" @click="filterMonth = currentMonth"
          style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:8px;padding:4px 10px;font-size:.72rem;font-weight:700;cursor:pointer">
          Bulan Ini
        </button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-left:auto;flex-wrap:wrap">
        <button @click="generateAllPayslips" :disabled="generatingAll"
          style="background:#6366f1;color:white;border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer"
          :style="{opacity:generatingAll?0.5:1}">
          {{ generatingAll ? '⏳...' : '⚡ Generate Semua' }}
        </button>
        <select v-model="expenseProjectId" class="sel" style="font-size:.78rem;padding:6px 8px;min-width:180px;border-radius:8px">
          <option value="">— Pilih Project —</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button @click="generateToProjectExpense" :disabled="expenseSaving || !expenseProjectId || payrollSummary.filter(r=>r.saved).length===0"
          style="background:#10b981;color:white;border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer"
          :style="{opacity:(expenseSaving||!expenseProjectId||payrollSummary.filter(r=>r.saved).length===0)?0.5:1}">
          {{ expenseSaving ? '⏳...' : '📊 Generate ke Project Expense' }}
        </button>
      </div>
    </div>

    <!-- Summary stats -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:0 16px 14px">
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:12px">
        <div style="font-size:11px;color:#0369a1;font-weight:600">TOTAL KARYAWAN</div>
        <div style="font-size:20px;font-weight:800;color:#0c4a6e;margin-top:2px">{{ payrollSummary.length }}</div>
      </div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px">
        <div style="font-size:11px;color:#15803d;font-weight:600">TOTAL GAJI KOTOR</div>
        <div style="font-size:16px;font-weight:800;color:#14532d;margin-top:2px">{{ fmtRp(payrollSummary.reduce((s,r)=>s+r.gross,0)) }}</div>
      </div>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px">
        <div style="font-size:11px;color:#c2410c;font-weight:600">TOTAL POTONGAN</div>
        <div style="font-size:16px;font-weight:800;color:#7c2d12;margin-top:2px">{{ fmtRp(payrollSummary.reduce((s,r)=>s+r.deductions,0)) }}</div>
      </div>
      <div style="background:#fdf4ff;border:1px solid #e9d5ff;border-radius:10px;padding:12px">
        <div style="font-size:11px;color:#7e22ce;font-weight:600">TOTAL GAJI BERSIH</div>
        <div style="font-size:18px;font-weight:800;color:#581c87;margin-top:2px">{{ fmtRp(payrollSummary.reduce((s,r)=>s+r.net,0)) }}</div>
      </div>
    </div>

    <!-- Employee Payroll Table -->
    <div class="tbl-wrap" style="max-height:480px;overflow-y:auto">
      <table class="tbl">
        <thead style="position:sticky;top:0;z-index:5">
          <tr>
            <th style="min-width:160px">Karyawan</th>
            <th class="tc">Jabatan</th>
            <th class="tc">Hari Kerja</th>
            <th class="tc">Gaji Pokok</th>
            <th class="tc">Tunjangan</th>
            <th class="tc">Lembur</th>
            <th class="tc" style="color:#ef4444">Kasbon</th>
            <th class="tc" style="color:#8b5cf6">Gaji Bersih</th>
            <th class="tc">Status</th>
            <th class="tc">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loadingPayrollSummary">
            <td colspan="10" class="tc" style="padding:30px;color:#94a3b8">⏳ Menghitung...</td>
          </tr>
          <tr v-else-if="payrollSummary.length===0">
            <td colspan="10" class="tc" style="padding:30px;color:#94a3b8">Tidak ada karyawan aktif</td>
          </tr>
          <tr v-for="(row, i) in payrollSummary" :key="row.employee_id" :class="i%2?'odd':''"
            :style="row.saved ? 'background:#f0fdf4' : ''">
            <td><div class="emp-name">{{ row.name }}</div></td>
            <td class="tc small">{{ row.position || '—' }}</td>
            <td class="tc">{{ row.total_days }} hr</td>
            <td class="tc">{{ fmtRp(row.basic_salary) }}</td>
            <td class="tc green">{{ fmtRp(row.tunjangan) }}</td>
            <td class="tc" style="color:#f59e0b">{{ fmtRp(row.ot_pay) }}</td>
            <td class="tc red">{{ fmtRp(row.kasbon) }}</td>
            <td class="tc ts-salary">{{ fmtRp(row.net) }}</td>
            <td class="tc">
              <span v-if="row.saved" class="badge-final" style="background:#dcfce7;color:#15803d">✓ Final</span>
              <span v-else style="font-size:11px;color:#94a3b8;font-style:italic">Draft</span>
            </td>
            <td class="tc" style="white-space:nowrap;display:flex;gap:4px;padding:6px">
              <button @click="previewPayslip(row)" title="Lihat Slip"
                style="background:#e0e7ff;color:#4338ca;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer">👁</button>
              <button @click="generateAndSave(row)" :disabled="row.generating"
                style="background:#dbeafe;color:#1d4ed8;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer"
                :title="row.saved ? 'Recalculate & update' : 'Generate & save'">
                {{ row.generating ? '...' : (row.saved ? '🔄' : '⚡') }}
              </button>
              <button v-if="row.saved" @click="previewAndPrint(row)"
                style="background:#f3f4f6;color:#374151;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer">🖨</button>
            </td>
          </tr>
        </tbody>
        <!-- Totals row -->
        <tfoot v-if="payrollSummary.length > 0" style="position:sticky;bottom:0">
          <tr style="background:#f8fafc;font-weight:800;border-top:2px solid #e2e8f0">
<td colspan="3" style="padding:10px 12px;font-size:13px">TOTAL ({{ payrollSummary.length }} karyawan)</td>
            <td class="tc">{{ fmtRp(payrollSummary.reduce((s,r)=>s+r.basic_salary,0)) }}</td>
            <td class="tc green">{{ fmtRp(payrollSummary.reduce((s,r)=>s+r.tunjangan,0)) }}</td>
            <td class="tc" style="color:#f59e0b">{{ fmtRp(payrollSummary.reduce((s,r)=>s+r.ot_pay,0)) }}</td>
            <td class="tc red">{{ fmtRp(payrollSummary.reduce((s,r)=>s+r.kasbon,0)) }}</td>
            <td class="tc ts-salary" style="font-size:14px">{{ fmtRp(payrollSummary.reduce((s,r)=>s+r.net,0)) }}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Payslip Preview Modal -->
    <Teleport to="body">
      <div v-if="payslipModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:999;display:flex;align-items:center;justify-content:center;padding:12px"
        @click.self="payslipModal=null">
        <div style="background:white;border-radius:12px;width:100%;max-width:1100px;max-height:95vh;overflow-y:auto;box-shadow:0 30px 60px rgba(0,0,0,0.35)">
          <!-- Modal toolbar -->
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid #e2e8f0;background:#f8fafc;border-radius:12px 12px 0 0">
            <span style="font-weight:800;font-size:14px;color:#0f172a">🧾 Slip Gaji — {{ payslipModal.employee?.name || payslipModal.name }}</span>
            <div style="display:flex;gap:8px">
              <button v-if="!payslipModal.saved" @click="savePayslipModal" :disabled="savingPs"
                style="background:#10b981;color:white;border:none;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer">
                {{ savingPs ? '...' : '💾 Finalisasi' }}
              </button>
              <button @click="printPayslip"
                style="background:#6366f1;color:white;border:none;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer">🖨 Print</button>
              <button @click="payslipModal=null" style="background:#f1f5f9;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:16px">×</button>
            </div>
          </div>

          <!-- Print body -->
          <div id="payslip-print">
            <div v-if="payslip">

              <!-- ─── EXCEL-STYLE LAYOUT: Left + Right ─── -->
              <div class="slip-wrap">

                <!-- ══ LEFT PANEL: Salary Summary ══ -->
                <div class="slip-left">
                  <!-- Company header -->
                  <div class="slip-co">🏗 BLACKBOX EPC</div>
                  <div class="slip-title">SLIP GAJI / PAYSLIP</div>
                  <div class="slip-period">{{ psMonthLabel }}</div>

                  <!-- Employee info -->
                  <table class="slip-info-tbl">
                    <tr><td class="sil">ID</td><td class="sic">:</td><td class="siv">{{ payslip.employee.code }}</td></tr>
                    <tr><td class="sil">Nama</td><td class="sic">:</td><td class="siv">{{ payslip.employee.name }}</td></tr>
                    <tr><td class="sil">Jabatan</td><td class="sic">:</td><td class="siv">{{ payslip.employee.position }}</td></tr>
                    <tr><td class="sil">Status</td><td class="sic">:</td><td class="siv">
                      {{ payslip.employee.salary_type === 'hourly' ? 'Per Jam' : payslip.employee.salary_type === 'daily' ? 'Harian' : 'Bulanan' }}
                    </td></tr>
                  </table>

                  <div class="slip-divider"></div>

                  <!-- Salary calculations (derived from detail table) -->
                  <!-- Edit button for monthly employees -->
                  <div v-if="slipSalaryType === 'monthly'" style="display:flex;justify-content:flex-end;margin-bottom:6px">
                    <button v-if="!slipEditMode" @click="startSlipEdit" 
                      style="font-size:11px;padding:3px 10px;background:#3b82f6;color:#fff;border:none;border-radius:4px;cursor:pointer">
                      ✏️ Edit Slip
                    </button>
                    <div v-else style="display:flex;gap:6px">
                      <button @click="slipEditMode=false" 
                        style="font-size:11px;padding:3px 10px;background:#94a3b8;color:#fff;border:none;border-radius:4px;cursor:pointer">
                        Batal
                      </button>
                      <button @click="saveSlipOverrides" :disabled="savingSlipOverride"
                        style="font-size:11px;padding:3px 10px;background:#22c55e;color:#fff;border:none;border-radius:4px;cursor:pointer">
                        {{ savingSlipOverride ? '⏳...' : '✓ Simpan' }}
                      </button>
                    </div>
                  </div>

                  <table class="slip-calc-tbl">
                    <!-- Gaji Pokok row -->
                    <tr v-if="slipSalaryType === 'hourly'">
                      <td class="scl">Gaji Pokok</td><td class="scc">:</td>
                      <td class="scn">{{ payslip?.calculation?.total_hours ?? slipNormalHours }}</td>
                      <td class="sco">×</td>
                      <td class="scr">{{ fmtRp(slipBasicRate) }}</td>
                      <td class="sce">=</td>
                      <td class="scv cur">Rp {{ fmtNum(slipBasicSalary) }}</td>
                    </tr>
                    <tr v-else-if="slipSalaryType === 'monthly'">
                      <td class="scl">Gaji Pokok</td><td class="scc">:</td>
                      <td class="scn" colspan="3" style="text-align:right">Bulanan (All-in)</td>
                      <td class="sce">=</td>
                      <td class="scv cur">Rp {{ fmtNum(slipBasicSalary) }}</td>
                    </tr>
                    <tr v-else>
                      <td class="scl">Gaji Pokok</td><td class="scc">:</td>
                      <td class="scn">{{ payslip?.attendance?.total_days ?? slipDayIn }}</td>
                      <td class="sco">×</td>
                      <td class="scr">{{ fmtRp(slipBasicRate) }}</td>
                      <td class="sce">=</td>
                      <td class="scv cur">Rp {{ fmtNum(slipBasicSalary) }}</td>
                    </tr>
                    <!-- Lembur row -->
                    <tr>
                      <td class="scl">Lembur</td><td class="scc">:</td>
                      <td class="scn">
                        <input v-if="slipEditMode" type="number" v-model.number="slipOverrides.otHours" 
                          style="width:40px;text-align:center;border:1px solid #cbd5e1;border-radius:3px;font-size:12px"/>
                        <template v-else>{{ payslip?.attendance?.total_ot_hours ?? slipOTHours }}</template>
                      </td>
                      <td class="sco">×</td>
                      <td class="scr">
                        <input v-if="slipEditMode" type="number" v-model.number="slipOverrides.otRate"
                          style="width:70px;text-align:right;border:1px solid #cbd5e1;border-radius:3px;font-size:12px"/>
                        <template v-else>{{ fmtRp(slipOTRate) }}</template>
                      </td>
                      <td class="sce">=</td>
                      <td class="scv cur">Rp {{ fmtNum(slipOTPay) }}</td>
                    </tr>
                    <!-- Tunjangan row -->
                    <tr v-if="slipTunjangan || slipEditMode">
                      <td class="scl">Tunjangan</td><td class="scc">:</td>
                      <td class="scn" colspan="3" style="text-align:right">
                        <template v-if="slipEditMode">
                          <input type="number" v-model.number="slipOverrides.tunjangan"
                            style="width:100px;text-align:right;border:1px solid #cbd5e1;border-radius:3px;font-size:12px"/>
                        </template>
                        <template v-else>{{ slipDayIn }} × {{ fmtRp(slipTjgRate) }}</template>
                      </td>
                      <td class="sce">=</td>
                      <td class="scv cur">Rp {{ fmtNum(slipTunjangan) }}</td>
                    </tr>
                  </table>

                  <!-- Total Bruto -->
                  <div class="slip-total-bruto">
                    <span>Total Gaji Bruto</span>
                    <span>Rp {{ fmtNum(slipGross) }}</span>
                  </div>

                  <div class="slip-divider"></div>

                  <!-- Potongan -->
                  <table class="slip-calc-tbl" v-if="payslip.deductions.total || slipEditMode">
                    <tr v-if="payslip.advances.advance_1">
                      <td class="scl" colspan="5">Potongan Pinjaman</td>
                      <td class="sce"></td>
                      <td class="scv" style="color:#dc2626">Rp {{ fmtNum(payslip.advances.advance_1) }}</td>
                    </tr>
                    <tr v-if="payslip.advances.advance_2">
                      <td class="scl" colspan="5">Potongan Kasbon 2</td>
                      <td class="sce"></td>
                      <td class="scv" style="color:#dc2626">Rp {{ fmtNum(payslip.advances.advance_2) }}</td>
                    </tr>
                    <tr v-if="payslip.deductions.bpjs_kes">
                      <td class="scl" colspan="5">BPJS Kesehatan</td>
                      <td class="sce"></td>
                      <td class="scv" style="color:#dc2626">Rp {{ fmtNum(payslip.deductions.bpjs_kes) }}</td>
                    </tr>
                    <tr v-if="payslip.deductions.pph21">
                      <td class="scl" colspan="5">PPh 21</td>
                      <td class="sce"></td>
                      <td class="scv" style="color:#dc2626">Rp {{ fmtNum(payslip.deductions.pph21) }}</td>
                    </tr>
                    <!-- Potongan tambahan (edit mode) -->
                    <tr v-if="slipEditMode || slipOverrides.extraDeduction > 0">
                      <td class="scl" colspan="4">
                        <input v-if="slipEditMode" type="text" v-model="slipOverrides.extraDeductionLabel" placeholder="Nama potongan"
                          style="width:120px;border:1px solid #cbd5e1;border-radius:3px;font-size:12px"/>
                        <template v-else>{{ slipOverrides.extraDeductionLabel || 'Potongan Lain' }}</template>
                      </td>
                      <td class="sce"></td>
                      <td class="sce"></td>
                      <td class="scv" style="color:#dc2626">
                        <input v-if="slipEditMode" type="number" v-model.number="slipOverrides.extraDeduction"
                          style="width:90px;text-align:right;border:1px solid #cbd5e1;border-radius:3px;font-size:12px"/>
                        <template v-else>Rp {{ fmtNum(slipOverrides.extraDeduction) }}</template>
                      </td>
                    </tr>
                  </table>

                  <!-- Total Gaji Bersih (highlighted) -->
                  <div class="slip-total-net">
                    <span>Total Gaji</span>
                    <div class="slip-net-box">
                      <span>Rp</span>
                      <span class="slip-net-val">{{ fmtNum(slipNet) }}</span>
                    </div>
                  </div>

                  <div class="slip-divider"></div>

                  <!-- Note & Sisa Pinjaman -->
                  <div class="slip-note-section">
                    <div class="slip-note-title">Note</div>
                    <table class="slip-info-tbl" style="margin-top:4px">
                      <tr><td class="sil">Sisa Pinjaman</td><td class="sic">:</td><td class="siv">Rp —</td></tr>
                    </table>
                  </div>

                  <!-- Legend -->
                  <div class="slip-legend">
                    <div class="sleg-item"><span class="sleg-box weekend"></span>SABTU-MINGGU</div>
                    <div class="sleg-item"><span class="sleg-box holiday"></span>LIBUR NASIONAL</div>
                  </div>

                  <div class="slip-divider"></div>

                  <!-- Signatures -->
                  <div class="slip-sign-row">
                    <div class="slip-sign"><div class="slip-sign-space"></div><div>Diterima Oleh</div></div>
                    <div class="slip-sign"><div class="slip-sign-space"></div><div>Payroll</div></div>
                  </div>
                  <div style="margin-top:8px;font-size:.65rem;color:#94a3b8;text-align:center">{{ payslip.employee.name }}</div>
                </div>

                <!-- ══ RIGHT PANEL: Daily Timesheet ══ -->
                <div class="slip-right">
                  <table class="slip-ts-tbl">
                    <thead>
                      <tr>
                        <th rowspan="2" class="ts-th">Tanggal</th>
                        <th rowspan="2" class="ts-th">Hari</th>
                        <th colspan="2" class="ts-th">Jam Kerja</th>
                        <th rowspan="2" class="ts-th">Normal</th>
                        <th colspan="4" class="ts-th" style="background:#ef4444;color:white">LEMBUR</th>
                        <th rowspan="2" class="ts-th ts-ot">Total Jam Lembur</th>
                        <th rowspan="2" class="ts-th">TJG</th>
                        <th rowspan="2" class="ts-th">Day In</th>
                      </tr>
                      <tr>
                        <th class="ts-th ts-sm">In</th>
                        <th class="ts-th ts-sm">Out</th>
                        <th class="ts-th ts-sm" style="background:#fca5a5">1</th>
                        <th class="ts-th ts-sm" style="background:#fca5a5">2</th>
                        <th class="ts-th ts-sm" style="background:#fca5a5">3</th>
                        <th class="ts-th ts-sm" style="background:#fca5a5">4</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="day in psCalendarDays" :key="day.date"
                        :class="day.isWeekend ? 'ts-weekend' : day.isHoliday ? 'ts-holiday' : ''">
                        <td class="ts-td ts-date">{{ day.label }}</td>
                        <td class="ts-td ts-day">{{ day.dayName }}</td>
                        <td class="ts-td ts-time">{{ day.checkIn }}</td>
                        <td class="ts-td ts-time">{{ day.checkOut }}</td>
                        <td class="ts-td ts-num">{{ day.normalHours || '' }}</td>
                        <td class="ts-td ts-ot1">{{ day.ot1 || '' }}</td>
                        <td class="ts-td ts-ot1">{{ day.ot2 || '' }}</td>
                        <td class="ts-td ts-ot1">{{ day.ot3 || '' }}</td>
                        <td class="ts-td ts-ot1">{{ day.ot4 || '' }}</td>
                        <td class="ts-td ts-num">{{ day.totalOT || '' }}</td>
                        <td class="ts-td ts-num">{{ day.tjg ? Number(day.tjg).toLocaleString('id-ID') : '' }}</td>
                        <td class="ts-td ts-num">{{ day.dayIn }}</td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr class="ts-foot">
                        <td colspan="2" class="ts-td" style="font-weight:700;text-align:center">Jumlah</td>
                        <td class="ts-td"></td>
                        <td class="ts-td"></td>
                        <td class="ts-td ts-num" style="font-weight:800;color:#1d4ed8">{{ psCalTotNormal }}</td>
                        <td class="ts-td ts-num" style="font-weight:800;color:#dc2626">{{ psCalTotOT1 || '' }}</td>
                        <td class="ts-td ts-num" style="font-weight:800;color:#dc2626">{{ psCalTotOT2 || '' }}</td>
                        <td class="ts-td ts-num" style="font-weight:800;color:#dc2626">{{ psCalTotOT3 || '' }}</td>
                        <td class="ts-td ts-num" style="font-weight:800;color:#dc2626">{{ psCalTotOT4 || '' }}</td>
                        <td class="ts-td ts-num" style="font-weight:800;color:#dc2626">{{ psCalTotOT }}</td>
                        <td class="ts-td ts-num" style="font-weight:800">{{ psCalTotTjg ? Number(psCalTotTjg).toLocaleString('id-ID') : 0 }}</td>
                        <td class="ts-td ts-num" style="font-weight:800;color:#1d4ed8">{{ psCalTotDayIn }}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

              </div><!-- slip-wrap -->
            </div>
            <div v-else style="padding:40px;text-align:center;color:#94a3b8">⏳ Memuat slip gaji...</div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</div>

<!-- EDIT ABSENSI MODAL -->
<Teleport to="body">
  <div v-if="editModal" class="modal-overlay" @click.self="editModal=null">
    <div class="modal-box" style="max-width:520px">
      <div class="modal-head">
        <span>✏️ Edit Absensi — {{ editModal.employee_name }}</span>
        <button @click="editModal=null" style="background:none;border:none;font-size:1.2rem;cursor:pointer">×</button>
      </div>
      <div class="modal-body" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="grid-column:1/-1">
          <label style="font-size:.75rem;font-weight:600;color:#374151">Tanggal</label>
          <input type="date" v-model="editForm.date" :max="today" class="sel" style="width:100%;margin-top:4px"/>
        </div>
        <div>
          <label style="font-size:.75rem;font-weight:600;color:#374151">Status</label>
          <select v-model="editForm.status" class="sel" style="width:100%;margin-top:4px" @change="editForm.timesheet_value = editForm.status==='present'?1:0">
            <option value="present">✓ Hadir</option>
            <option value="absent">✗ Absen</option>
            <option value="half">½ Setengah Hari</option>
            <option value="permit">📋 Izin</option>
            <option value="sick">🤒 Sakit</option>
          </select>
        </div>
        <div>
          <label style="font-size:.75rem;font-weight:600;color:#374151">Nilai Timesheet</label>
          <input type="number" v-model.number="editForm.timesheet_value" min="0" max="1" step="0.5" class="sel" style="width:100%;margin-top:4px"/>
        </div>
        <div>
          <label style="font-size:.75rem;font-weight:600;color:#374151">Check In</label>
          <input type="time" v-model="editForm.check_in" class="sel" style="width:100%;margin-top:4px"/>
        </div>
        <div>
          <label style="font-size:.75rem;font-weight:600;color:#374151">Check Out</label>
          <input type="time" v-model="editForm.check_out" class="sel" style="width:100%;margin-top:4px"/>
        </div>
        <div>
          <label style="font-size:.75rem;font-weight:600;color:#374151">Lembur (jam)</label>
          <input type="number" v-model.number="editForm.overtime_hours" min="0" max="24" step="0.5" class="sel" style="width:100%;margin-top:4px"/>
        </div>
        <div>
          <label style="font-size:.75rem;font-weight:600;color:#374151">Proyek</label>
          <select v-model="editForm.project_id" class="sel" style="width:100%;margin-top:4px">
            <option :value="null">— Tanpa Proyek —</option>
            <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <div style="grid-column:1/-1">
          <label style="font-size:.75rem;font-weight:600;color:#374151">Catatan</label>
          <input v-model="editForm.notes" class="sel" style="width:100%;margin-top:4px" placeholder="Catatan opsional..."/>
        </div>
      </div>
      <div class="modal-foot">
        <button @click="editModal=null" class="btn-cancel">Batal</button>
        <button @click="saveEditModal" :disabled="savingEdit" class="btn-primary" style="background:#1d4ed8;color:white;border:none;border-radius:8px;padding:8px 20px;font-weight:700;cursor:pointer">
          {{ savingEdit ? '⏳ Menyimpan...' : '💾 Simpan Perubahan' }}
        </button>
      </div>
    </div>
  </div>
</Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, reactive } from 'vue';
import { api } from '../lib/api';

const activeTab     = ref('daily');
const filterProject = ref('');
const filterMonth   = ref(new Date().toISOString().slice(0,7));
const today         = new Date().toISOString().slice(0,10);
const attendDate    = ref(today);
const attendProject = ref('');
const isHoliday     = ref(false); // toggle: tanggal ini libur nasional
const saving        = ref(false);
const loadingPs     = ref(false);
const savingPs      = ref(false);
const savingAdv     = ref(false);
const psEmployee    = ref('');
const payslip       = ref<any>(null);
const payrollRequest = ref<any>(null); // existing payroll request for current period
const payrollSaving  = ref(false);
const projects      = ref<any[]>([]);
const allEmployees  = ref<any[]>([]);
const monthLogs     = ref<any[]>([]);
const advances      = ref<any[]>([]);
const kasbonRequests = ref<any[]>([]);
const psHistory     = ref<any[]>([]);
const showAdvForm   = ref(false);
const dailyRec      = ref<Record<number,any>>({});
const advForm       = ref({ employee_id:'', amount:0, advance_date:new Date().toISOString().slice(0,10), period:'', description:'' });
const krSaving      = ref(false);
// Payroll summary new state
const payrollSummary        = ref<any[]>([]);
const loadingPayrollSummary = ref(false);
const generatingAll         = ref(false);
const payslipModal          = ref<any>(null);
const filterYear            = ref(new Date().getFullYear());
const expenseProjectId      = ref<number|''>('');
const expenseSaving         = ref(false);
const kasbonExpProjectId    = ref<number|''>('');

// ── Monthly Stats computed ─────────────────────────────────────────────────────
const mthStats = computed(() => {
  const empMap = new Map<number, any>();
  for (const e of allEmployees.value) {
    empMap.set(e.id, e);
  }

  // Per-employee aggregates from monthLogs
  const perEmpMap = new Map<number, { days: number; ot: number; presentDays: number; absentDays: number }>();
  for (const log of monthLogs.value) {
    const eid = log.employee_id;
    if (!perEmpMap.has(eid)) perEmpMap.set(eid, { days: 0, ot: 0, presentDays: 0, absentDays: 0 });
    const agg = perEmpMap.get(eid)!;
    agg.days += parseFloat(log.timesheet_value) || 0;
    agg.ot   += parseFloat(log.overtime_hours) || 0;
    if (log.status === 'present' || log.status === 'half') agg.presentDays++;
    else if (log.status === 'absent') agg.absentDays++;
  }

  let totalDays = 0, totalOT = 0, totalPresentDays = 0, totalAbsentDays = 0;
  let totalBasicSalary = 0, totalOTPay = 0, totalTunjangan = 0;
  const perEmployee: any[] = [];

  for (const [eid, agg] of perEmpMap.entries()) {
    const emp = empMap.get(eid);
    if (!emp) continue;
    const salaryType = emp.salary_type || 'daily';
    const basicRate = emp.basic_rate > 0 ? parseFloat(emp.basic_rate) : Math.round((emp.salary || 0) / 22);
    const tunjanganRate = emp.tunjangan_rate > 0 ? parseFloat(emp.tunjangan_rate) : 0;
    // OT rate: match payslip engine — use basic rate, NOT 1.5x
    const otRate = emp.ot_rate > 0 ? parseFloat(emp.ot_rate) : (salaryType === 'hourly' ? basicRate : Math.round(basicRate / 8));
    const basicSalary = salaryType === 'hourly' ? Math.round(agg.days * 8 * basicRate) : Math.round(agg.days * basicRate);
    const otPay = Math.round(agg.ot * otRate);
    const tunjangan = Math.round(agg.days * tunjanganRate);
    const total = basicSalary + otPay + tunjangan;

    totalDays += agg.days;
    totalOT += agg.ot;
    totalPresentDays += agg.presentDays;
    totalAbsentDays += agg.absentDays;
    totalBasicSalary += basicSalary;
    totalOTPay += otPay;
    totalTunjangan += tunjangan;

    perEmployee.push({
      id: eid,
      name: emp.first_name || emp.name || emp.code || '',
      code: emp.employee_code || emp.code || '',
      position: emp.position || '',
      days: agg.days, ot: agg.ot,
      basicSalary, otPay, tunjangan, total,
    });
  }

  // Sort by name
  perEmployee.sort((a, b) => a.name.localeCompare(b.name));

  const totalRecords = totalPresentDays + totalAbsentDays;
  return {
    manpower: perEmpMap.size,
    totalDays,
    manhour: Math.round(totalDays * 8),
    totalOT,
    totalPresentDays,
    totalAbsentDays,
    attendanceRate: totalRecords > 0 ? (totalPresentDays / totalRecords) * 100 : 0,
    totalBasicSalary,
    totalOTPay,
    totalTunjangan,
    totalGross: totalBasicSalary + totalOTPay + totalTunjangan,
    perEmployee,
  };
});
// ─────────────────────────────────────────────────────────────────────────────

// ── Edit Riwayat state ────────────────────────────────────────────────────────
const riwayatEmployee = ref<number|''>('');
const riwayatLogs     = ref<any[]>([]);
const editModal       = ref<any>(null);
const savingEdit      = ref(false);
const editForm        = ref({
  date: '', status: 'present', timesheet_value: 1,
  check_in: '', check_out: '', overtime_hours: 0, notes: '', project_id: null as number|null
});

const filteredRiwayat = computed(() =>
  riwayatEmployee.value
    ? riwayatLogs.value.filter(l => l.employee_id === riwayatEmployee.value)
    : riwayatLogs.value
);

async function loadRiwayat() {
  const [y, m] = filterMonth.value.split('-');
  try {
    const res = await api.get('/hr/attendance', { params: { month: m, year: y } });
    riwayatLogs.value = (res.data.data || []).sort((a: any, b: any) => b.date?.localeCompare(a.date));
  } catch { riwayatLogs.value = []; }
}

function openEditModal(log: any) {
  editModal.value = log;
  editForm.value = {
    date:             log.date?.slice(0, 10) || '',
    status:           log.status || 'present',
    timesheet_value:  parseFloat(log.timesheet_value) ?? 1,
    check_in:         log.check_in || '',
    check_out:        log.check_out || '',
    overtime_hours:   parseFloat(log.overtime_hours) || 0,
    notes:            log.notes || '',
    project_id:       log.project_id || null,
  };
}

async function saveEditModal() {
  if (!editModal.value?.id) return;
  savingEdit.value = true;
  try {
    await api.put(`/hr/attendance/${editModal.value.id}`, editForm.value);
    editModal.value = null;
    await loadRiwayat();
    await loadMonthLogs();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal menyimpan');
  } finally { savingEdit.value = false; }
}

async function deleteAttendance(log: any) {
  if (!confirm(`Hapus data absensi ${log.employee_name} tanggal ${log.date?.slice(0,10)}?`)) return;
  try {
    await api.delete(`/hr/attendance/${log.id}`);
    await loadRiwayat();
    await loadMonthLogs();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal hapus');
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// Track kasbon group expand state — plain object so Vue reactivity works
const expandedKeys = ref<Record<string, boolean>>({});
function toggleKasbonGroup(key: string) {
  expandedKeys.value[key] = !expandedKeys.value[key];
}

// Group advances by period, merge with kasbon_requests
const groupedAdvances = computed(() => {
  const map = new Map<string, any>();
  const MONTHS = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

  for (const a of advances.value) {
    const key = a.period_year && a.period_month
      ? `${a.period_year}-${String(a.period_month).padStart(2,'0')}`
      : a.advance_date?.slice(0,7) || 'tanpa-periode';
    if (!map.has(key)) {
      const [y, m] = key.split('-');
      map.set(key, {
        key,
        label: `Kasbon ${MONTHS[+m] || m} ${y}`,
        dueDate: a.advance_date?.slice(0,10) || key,
        items: [],
        total: 0,
        expanded: !!expandedKeys.value[key],
        requestStatus: 'none',
        requestId: null,
      });
    }
    const grp = map.get(key)!;
    grp.items.push(a);
    grp.total += Number(a.amount || 0);
    // Use earliest advance_date as due
    if (a.advance_date && a.advance_date < grp.dueDate) grp.dueDate = a.advance_date.slice(0,10);
  }

  // Overlay kasbon_requests status
  for (const kr of kasbonRequests.value) {
    const krKey = kr.due_date ? kr.due_date.slice(0,7) : null;
    if (krKey && map.has(krKey)) {
      const grp = map.get(krKey)!;
      if (grp.requestStatus === 'none' || kr.status === 'approved') {
        grp.requestStatus = kr.status;
        grp.requestId = kr.id;
      }
    }
  }

  // Override: check actual advance statuses
  for (const [, grp] of map) {
    const allPending = grp.items.every((a: any) => a.status === 'pending');
    const allDeducted = grp.items.every((a: any) => a.status === 'deducted');
    if (allPending) grp.requestStatus = 'none';
    else if (allDeducted && grp.requestStatus === 'none') grp.requestStatus = 'approved';
  }

  return [...map.values()].sort((a,b) => b.key.localeCompare(a.key));
});


const activeEmployees = computed(() => allEmployees.value.filter(e => e.status==='ACTIVE'));

const filterMonthLabel = computed(() => {
  const [y,m] = filterMonth.value.split('-');
  return new Date(+y,+m-1,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'});
});
const psMonthLabel = computed(() => {
  const [y,m] = filterMonth.value.split('-').map(Number);
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  const prevLabel = new Date(prevY, prevM - 1, 26).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  const curLabel  = new Date(y, m - 1, 25).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${prevLabel} – ${curLabel}`;
});
const daysInMonth = computed(() => {
  const [y,m] = filterMonth.value.split('-').map(Number);
  return Array.from({length: new Date(y,m,0).getDate()}, (_,i)=>i+1);
});

const fmtNum = (v:number) => Math.round(v||0).toLocaleString('id-ID');

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Build calendar days for payslip timesheet panel (cut-off: 26th prev month → 25th current month)
const psCalendarDays = computed(() => {
  if (!payslip.value) return [];
  const [y, m] = filterMonth.value.split('-').map(Number);
  
  // Period: 26th of previous month → 25th of current month
  const startDate = new Date(m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2, 26);
  const endDate   = new Date(y, m - 1, 25);

  // Aggregate logs by date (employee may have entries from multiple projects on same day)
  const logMap = new Map<string, any>();
  for (const log of (payslip.value.attendance?.logs || [])) {
    const ds = log.date?.slice(0,10);
    if (logMap.has(ds)) {
      const existing = logMap.get(ds);
      existing.actual_hours = (existing.actual_hours || 0) + (log.actual_hours || 0);
      existing.adjusted_ot_hours = (parseFloat(existing.adjusted_ot_hours) || 0) + (parseFloat(log.adjusted_ot_hours) || 0);
      existing.overtime_hours = (parseFloat(existing.overtime_hours) || 0) + (parseFloat(log.overtime_hours) || 0);
      existing.timesheet_value = (parseFloat(existing.timesheet_value) || 0) + (parseFloat(log.timesheet_value) || 0);
    } else {
      logMap.set(ds, { ...log });
    }
  }
  const days = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const cy = cursor.getFullYear();
    const cm = cursor.getMonth() + 1;
    const cd = cursor.getDate();
    const dow = cursor.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const dateStr = `${cy}-${String(cm).padStart(2,'0')}-${String(cd).padStart(2,'0')}`;
    const log = logMap.get(dateStr);
    const present = log?.status === 'present';
    const otHours = parseFloat(log?.adjusted_ot_hours ?? log?.overtime_hours ?? 0);
    let normalHours: number|'' = '';
    if (present) {
      // Use backend-computed actual_hours if available (same value used for salary calc)
      if (log?.actual_hours !== undefined) {
        normalHours = log.actual_hours;
      } else if (log?.check_in && log?.check_out) {
        const [ih,im] = log.check_in.split(':').map(Number);
        const [oh,om] = log.check_out.split(':').map(Number);
        normalHours = Math.max(0, (oh*60+om - ih*60-im)/60 - 1);
        normalHours = Math.round(normalHours * 10) / 10;
      } else {
        normalHours = parseFloat(log?.timesheet_value || 1) * 8;
      }
    }
    const ot1 = otHours >= 1 ? 1 : (otHours > 0 ? otHours : '');
    const ot2 = otHours >= 2 ? 1 : (otHours > 1 ? otHours-1 : '');
    const ot3 = otHours >= 3 ? 1 : (otHours > 2 ? otHours-2 : '');
    const ot4 = otHours >= 4 ? otHours-3 : '';
    const tjgPerDay = payslip.value?.calculation?.tunjangan_per_day || payslip.value?.employee?.tunjangan_rate || 0;
    days.push({
      date: dateStr,
      label: `${cd}-${MONTHS_SHORT[cm-1]}-${String(cy).slice(2)}`,
      dayName: DAY_NAMES[dow],
      isWeekend,
      isHoliday: false,
      checkIn:  present && log?.check_in  ? log.check_in.slice(0,5)  : '',
      checkOut: present && log?.check_out ? log.check_out.slice(0,5) : '',
      normalHours: present ? normalHours : '',
      ot1, ot2, ot3, ot4,
      totalOT: otHours > 0 ? otHours : '',
      tjg: present ? tjgPerDay : '',
      dayIn: present ? 1 : 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
});

const psCalTotNormal  = computed(() => psCalendarDays.value.reduce((s,d)=>s+(Number(d.normalHours)||0),0).toFixed(1).replace('.0',''));
const psCalTotOT1     = computed(() => psCalendarDays.value.reduce((s,d)=>s+(Number(d.ot1)||0),0));
const psCalTotOT2     = computed(() => psCalendarDays.value.reduce((s,d)=>s+(Number(d.ot2)||0),0));
const psCalTotOT3     = computed(() => psCalendarDays.value.reduce((s,d)=>s+(Number(d.ot3)||0),0));
const psCalTotOT4     = computed(() => psCalendarDays.value.reduce((s,d)=>s+(Number(d.ot4)||0),0));
const psCalTotOT      = computed(() => psCalendarDays.value.reduce((s,d)=>s+(Number(d.totalOT)||0),0));
const psCalTotTjg     = computed(() => psCalendarDays.value.reduce((s,d)=>s+(Number(d.tjg)||0),0));
const psCalTotDayIn   = computed(() => psCalendarDays.value.reduce((s,d)=>s+d.dayIn,0));

// ── Derived slip summary (from detail table, always in sync) ──────────────────
const slipEditMode = ref(false);
const slipOverrides = reactive({
  otHours: 0,
  otRate: 0,
  tunjangan: 0,
  extraDeduction: 0,
  extraDeductionLabel: '',
});

function startSlipEdit() {
  // Pre-fill overrides with current computed values
  slipOverrides.otHours = psCalTotOT.value;
  slipOverrides.otRate = payslip.value?.calculation?.ot_rate_per_hour || payslip.value?.employee?.ot_rate || 0;
  slipOverrides.tunjangan = Math.round(psCalTotDayIn.value * (payslip.value?.calculation?.tunjangan_per_day || payslip.value?.employee?.tunjangan_rate || 0));
  slipOverrides.extraDeduction = 0;
  slipOverrides.extraDeductionLabel = '';
  slipEditMode.value = true;
}

const savingSlipOverride = ref(false);
async function saveSlipOverrides() {
  if (!payslip.value || !payslipModal.value) return;
  savingSlipOverride.value = true;
  try {
    const [y, m] = filterMonth.value.split('-');
    const empId = payslipModal.value.employee_id;

    // 1. Persist rate changes to employee record (so backend uses them on next computation)
    const editedTjgRate = slipDayIn.value > 0 ? Math.round(slipOverrides.tunjangan / slipDayIn.value) : 0;
    await api.patch(`/hr/employees/${empId}/rates`, {
      ot_rate: slipOverrides.otRate,
      tunjangan_rate: editedTjgRate,
    });

    // 2. Re-fetch payslip from backend (now uses updated rates from employee record)
    const freshRes = await api.get('/hr/payslip', {
      params: { employee_id: empId, month: +m, year: +y, project_id: filterProject.value || undefined }
    });
    payslip.value = freshRes.data;

    // 3. Save the finalized slip to payslip_records using fresh backend-computed values
    const calc = payslip.value.calculation;
    const deductions = { ...payslip.value.deductions };
    // Apply extra deduction if set
    if (slipOverrides.extraDeduction > 0) {
      deductions.extra_deduction = slipOverrides.extraDeduction;
      deductions.extra_deduction_label = slipOverrides.extraDeductionLabel || 'Potongan Lain';
      deductions.total = (deductions.total || 0) + slipOverrides.extraDeduction;
    }
    const netSalary = (calc.gross_salary || 0) - (deductions.total || 0);

    await api.post('/hr/payslip/save', {
      employee_id: empId,
      period_month: +m, period_year: +y,
      project_id: filterProject.value || null,
      calculation: calc,
      advances: payslip.value.advances,
      deductions,
      net_salary: netSalary,
    });

    slipEditMode.value = false;
    await loadPayrollSummary();
    await loadHistory();
    alert('✅ Slip gaji berhasil disimpan');
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal simpan');
  } finally {
    savingSlipOverride.value = false;
  }
}

// ── Slip values: ALWAYS from backend payslip.value (same source as table) ──
// Edit mode overrides only apply during active editing session
const slipBasicSalary = computed(() => payslip.value?.calculation?.basic_salary ?? 0);
const slipOTHours     = computed(() => {
  if (slipEditMode.value) return slipOverrides.otHours;
  return payslip.value?.calculation?.total_ot_hours ?? payslip.value?.attendance?.total_ot_hours ?? 0;
});
const slipOTRate      = computed(() => {
  if (slipEditMode.value) return slipOverrides.otRate;
  return payslip.value?.calculation?.ot_rate_per_hour || payslip.value?.employee?.ot_rate || 0;
});
const slipOTPay       = computed(() => {
  if (slipEditMode.value) return Math.round(slipOTHours.value * slipOTRate.value);
  return payslip.value?.calculation?.ot_pay ?? 0;
});
const slipTunjangan   = computed(() => {
  if (slipEditMode.value) return slipOverrides.tunjangan;
  return payslip.value?.calculation?.tunjangan ?? 0;
});
const slipGross       = computed(() => {
  if (slipEditMode.value) return slipBasicSalary.value + slipOTPay.value + slipTunjangan.value;
  return payslip.value?.calculation?.gross_salary ?? 0;
});
const slipTotalDeductions = computed(() => {
  const base = payslip.value?.deductions?.total || 0;
  if (slipEditMode.value) return base + (slipOverrides.extraDeduction || 0);
  return base;
});
const slipNet         = computed(() => {
  if (slipEditMode.value) return slipGross.value - slipTotalDeductions.value;
  return payslip.value?.net_salary ?? 0;
});
// Keep these for the calendar display and edit mode initialization
const slipNormalHours = computed(() => Number(psCalTotNormal.value) || 0);
const slipDayIn       = computed(() => psCalTotDayIn.value);
const slipBasicRate   = computed(() => payslip.value?.calculation?.basic_rate_per_day || payslip.value?.employee?.basic_rate || 0);
const slipTjgRate     = computed(() => payslip.value?.calculation?.tunjangan_per_day || payslip.value?.employee?.tunjangan_rate || 0);
const slipSalaryType  = computed(() => payslip.value?.employee?.salary_type || 'daily');

function initDailyRec() {
  const rec: Record<number,any> = {};
  // Special day = weekend OR libur nasional → no default times
  const special = isSpecialDay.value;
  for (const e of activeEmployees.value)
    rec[e.id] = {
      status: '',
      timesheet_value: null,
      check_in:  special ? '' : '08:00',
      check_out: special ? '' : '17:00',
      overtime_hours: 0,
      notes: ''
    };
  dailyRec.value = rec;
}
function setStatus(id:number, st:string, val:number) {
  if(!dailyRec.value[id]) dailyRec.value[id]={};
  dailyRec.value[id].status=st; dailyRec.value[id].timesheet_value=val;
}
function countStatus(s: string | null) {
  if (s === null) return Object.values(dailyRec.value).filter((r: any) => !r.status).length;
  return Object.values(dailyRec.value).filter((r: any) => r.status === s).length;
}

// ── Check All helpers ─────────────────────────────────────────────────────────
// Weekday: 08:00–17:00 default | Weekend: blank (user fills manually)
const DEFAULT_IN  = '08:00';
const DEFAULT_OUT = '17:00';

function isAttendDateWeekend(): boolean {
  const d = new Date(attendDate.value + 'T00:00:00');
  return d.getDay() === 0 || d.getDay() === 6; // 0=Sun, 6=Sat
}

// isSpecialDay = weekend ATAU libur nasional (jam kerja manual, no auto-fill)
const isSpecialDay = computed(() => isHoliday.value || isAttendDateWeekend());

function toggleHoliday() {
  isHoliday.value = !isHoliday.value;
  // Reset daily records so jam kerja mengikuti mode baru
  initDailyRec();
}

const allPresent = computed(() =>
  activeEmployees.value.length > 0 &&
  activeEmployees.value.every(e => dailyRec.value[e.id]?.status === 'present')
);
const somePresent = computed(() =>
  activeEmployees.value.some(e => dailyRec.value[e.id]?.status === 'present')
);

function checkAllPresent() {
  const special = isSpecialDay.value; // weekend or holiday: no auto-fill times
  for (const e of activeEmployees.value) {
    if (!dailyRec.value[e.id]) dailyRec.value[e.id] = {};
    dailyRec.value[e.id].status = 'present';
    dailyRec.value[e.id].timesheet_value = 1;
    if (!special) {
      if (!dailyRec.value[e.id].check_in)  dailyRec.value[e.id].check_in  = DEFAULT_IN;
      if (!dailyRec.value[e.id].check_out) dailyRec.value[e.id].check_out = DEFAULT_OUT;
    }
  }
}
function checkAllAbsent() {
  for (const e of activeEmployees.value) {
    if (!dailyRec.value[e.id]) dailyRec.value[e.id] = {};
    dailyRec.value[e.id].status = 'absent';
    dailyRec.value[e.id].timesheet_value = 0;
  }
}
function toggleAllPresent(ev: Event) {
  const checked = (ev.target as HTMLInputElement).checked;
  checked ? checkAllPresent() : checkAllAbsent();
}
function toggleOne(id: number, ev: Event) {
  const checked = (ev.target as HTMLInputElement).checked;
  const special = isSpecialDay.value; // weekend or holiday: no auto-fill times
  if (checked) {
    setStatus(id, 'present', 1);
    if (!special) {
      if (!dailyRec.value[id].check_in)  dailyRec.value[id].check_in  = DEFAULT_IN;
      if (!dailyRec.value[id].check_out) dailyRec.value[id].check_out = DEFAULT_OUT;
    }
  } else {
    setStatus(id, 'absent', 0);
  }
}
// ─────────────────────────────────────────────────────────────────────────────


const totalTsToday = computed(()=>Object.values(dailyRec.value).reduce((a:number,r:any)=>a+(r.timesheet_value||0),0));
function tsClass(v:any){ if(v===1||v==='1')return 'ts-1'; if(v===0.5||v==='0.5')return 'ts-half'; if(v===0||v==='0')return 'ts-0'; return ''; }
function isWeekend(day:number){ const [y,m]=filterMonth.value.split('-').map(Number); const d=new Date(y,m-1,day).getDay(); return d===0||d===6; }
function dayName(day:number){ const [y,m]=filterMonth.value.split('-').map(Number); return new Date(y,m-1,day).toLocaleDateString('id-ID',{weekday:'short'}); }
function getTsVal(empId:number, day:number){ const [y,m]=filterMonth.value.split('-').map(Number); const date=`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`; const log=monthLogs.value.find(l=>l.employee_id===empId&&l.date?.slice(0,10)===date); return log?parseFloat(log.timesheet_value):null; }
function empMonthTotal(empId:number){ return monthLogs.value.filter(l=>l.employee_id===empId).reduce((a,l)=>a+(parseFloat(l.timesheet_value)||0),0); }
const fmtRp=(v:number)=>'Rp '+((v||0).toLocaleString('id-ID'));

async function saveBulk() {
  saving.value=true;
  try {
    const records=activeEmployees.value.filter(e=>dailyRec.value[e.id]?.status).map(e=>({employee_id:e.id,...dailyRec.value[e.id]}));
    if(!records.length){alert('Tandai status absensi dulu');return;}
    await api.post('/hr/attendance/bulk',{date:attendDate.value,project_id:attendProject.value||null,records});
    alert('✅ Absensi tersimpan!');
    await loadMonthLogs();
  } catch(e){alert('Gagal menyimpan');}
  finally{saving.value=false;}
}

async function loadAdvances() {
  const res=await api.get('/hr/advances');
  advances.value=res.data.data||[];
  // Also load kasbon_requests to overlay status
  try {
    const kr = await api.get('/finance/kasbon-requests');
    kasbonRequests.value = kr.data.data || [];
  } catch { kasbonRequests.value = []; }
}
async function saveAdvance() {
  if(!advForm.value.employee_id||!advForm.value.amount){alert('Isi karyawan & jumlah');return;}
  savingAdv.value=true;
  try {
    const [py,pm]=advForm.value.period?advForm.value.period.split('-'):[null,null];
    await api.post('/hr/advances',{employee_id:advForm.value.employee_id,amount:advForm.value.amount,description:advForm.value.description||null,advance_date:advForm.value.advance_date,period_month:pm?+pm:null,period_year:py?+py:null});
    advForm.value={employee_id:'',amount:0,advance_date:new Date().toISOString().slice(0,10),period:'',description:''};
    showAdvForm.value=false;
    await loadAdvances();
  } catch(e){alert('Gagal simpan kasbon');}
  finally{savingAdv.value=false;}
}
async function deleteAdvance(id:number) {
  if(!confirm('Hapus kasbon ini?'))return;
  await api.delete('/hr/advances/'+id);
  await loadAdvances();
}

// Quick generate: create kasbon_request for all pending in group, auto-submit+approve
async function quickCreateRequest(grp: any) {
  const pendingIds = grp.items.filter((a:any) => !a.kasbon_request_id).map((a:any) => a.id);
  if (!pendingIds.length) { alert('Semua kasbon di periode ini sudah diajukan'); return; }
  if (!confirm(`Generate Pengajuan Kasbon ke Payment Schedule?\n${grp.label} · ${grp.items.length} karyawan · ${fmtRp(grp.total)}`)) return;
  krSaving.value = true;
  try {
    // 1. Create request
    const res = await api.post('/finance/kasbon-requests', {
      salary_advance_ids: pendingIds,
      purpose: grp.label,
    });
    const kasbonId = res.data.data.id;
    // 2. Submit
    await api.put(`/finance/kasbon-requests/${kasbonId}/submit`);
    // 3. Auto-approve so it goes to Payment Schedule
    await api.put(`/finance/kasbon-requests/${kasbonId}/approve`);
    alert(`✅ ${grp.label} berhasil di-generate ke Payment Schedule!`);
    await loadAdvances();
  } catch(e:any) {
    alert(e?.response?.data?.error || 'Gagal generate');
  } finally {
    krSaving.value = false;
  }
}

// Generate kasbon group → Project Expense (cost control)
async function generateKasbonToExpense(grp: any) {
  if (!kasbonExpProjectId.value) { alert('Pilih project terlebih dahulu'); return; }
  const projectName = projects.value.find(p => p.id === kasbonExpProjectId.value)?.name || '';
  if (!confirm(`Generate kasbon "${grp.label}" ke project "${projectName}"?\n\n${grp.items.length} karyawan · Total: ${fmtRp(grp.total)}`)) return;

  krSaving.value = true;
  try {
    // Build detail list
    const details = grp.items.map((a: any) => `${a.employee_name}: ${fmtRp(a.amount)}`);
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const expNum = `EXP-KSB-${datePart}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Create expense directly via project expense endpoint
    await api.post(`/projects/${kasbonExpProjectId.value}/expenses`, {
      category: 'kasbon',
      description: `Kasbon ${grp.label} (${grp.items.length} karyawan)`,
      amount: grp.total,
      expense_date: grp.dueDate || now.toISOString().slice(0, 10),
      notes: JSON.stringify({ type: 'kasbon', details }),
      status: 'approved',
    });

    // Mark advances as deducted
    for (const a of grp.items) {
      if (a.status !== 'deducted') {
        await api.put(`/hr/advances/${a.id}`, { ...a, status: 'deducted', remaining: 0 });
      }
    }

    alert(`✅ Kasbon ${grp.label} berhasil di-generate ke Project Expense!\n\nProject: ${projectName}\nTotal: ${fmtRp(grp.total)}\nKaryawan: ${grp.items.length}\n\nCek di Project → tab Expense`);
    await loadAdvances();
  } catch(e: any) {
    alert(e?.response?.data?.error || 'Gagal generate expense');
  } finally {
    krSaving.value = false;
  }
}

// Mark all advances in group as paid → will appear as deduction in slip gaji
async function markKasbonPaid(grp: any) {
  if (!confirm(`Tandai kasbon ${grp.label} sebagai TERBAYAR?\nNilai akan otomatis ter-deduct di Slip Gaji bulan ini.`)) return;
  try {
    for (const a of grp.items) {
      await api.put(`/hr/advances/${a.id}`, { ...a, status: 'deducted', remaining: 0 });
    }
    alert(`✅ ${grp.items.length} kasbon ditandai terbayar. Akan muncul sebagai potongan di Slip Gaji.`);
    await loadAdvances();
  } catch(e:any) {
    alert(e?.response?.data?.error || 'Gagal update status');
  }
}

// Reject/revert kasbon group — reset to editable
async function rejectKasbon(grp: any) {
  if (!confirm(`Batalkan kasbon "${grp.label}"?\n\nStatus akan dikembalikan agar bisa di-edit dan di-generate ulang ke project lain.`)) return;
  krSaving.value = true;
  try {
    // If there's a kasbon_request, reject it
    if (grp.requestId) {
      try { await api.put(`/finance/kasbon-requests/${grp.requestId}/reject`); } catch {}
    }
    // Reset all advances in group back to pending
    for (const a of grp.items) {
      await api.put(`/hr/advances/${a.id}`, { ...a, status: 'pending', remaining: a.amount });
    }
    alert(`✅ Kasbon ${grp.label} berhasil dibatalkan. Silakan edit dan generate ulang.`);
    await loadAdvances();
  } catch(e: any) {
    alert(e?.response?.data?.error || 'Gagal membatalkan');
  } finally {
    krSaving.value = false;
  }
}

async function loadPayslip() {
  if(!psEmployee.value){alert('Pilih karyawan');return;}
  loadingPs.value=true; payslip.value=null;
  try {
    const [y,m]=filterMonth.value.split('-');
    const res=await api.get('/hr/payslip',{params:{employee_id:psEmployee.value,month:m,year:y,project_id:filterProject.value||undefined}});
    payslip.value=res.data;
  } catch(e){alert('Gagal generate slip gaji');}
  finally{loadingPs.value=false;}
}
async function savePayslip() {
  if(!payslip.value)return;
  savingPs.value=true;
  try {
    const [y,m]=filterMonth.value.split('-');
    await api.post('/hr/payslip/save',{employee_id:psEmployee.value,period_month:+m,period_year:+y,project_id:filterProject.value||null,calculation:{...payslip.value.calculation,total_days:payslip.value.attendance.total_days,total_ot_hours:payslip.value.attendance.total_ot_hours},advances:payslip.value.advances,deductions:payslip.value.deductions,net_salary:payslip.value.net_salary});
    alert('✅ Slip gaji disimpan!');
    payslip.value=null;
    await loadHistory();
  } catch(e){alert('Gagal simpan slip');}
  finally{savingPs.value=false;}
}
async function loadHistory() {
  const [y, m] = filterMonth.value.split('-').map(Number);
  try {
    const res = await api.get('/hr/payslip/history', { params: { year: y } });
    // Endpoint returns { data: rows }
    const allHistory: any[] = res.data.data || res.data || [];
    psHistory.value = allHistory.filter((h: any) => Number(h.period_month) === m && Number(h.period_year) === y);
  } catch { psHistory.value = []; }
  // Check if payroll request already exists for this period
  try {
    const pr = await api.get('/finance/payroll-requests');
    const list: any[] = pr.data?.data || [];
    payrollRequest.value = list.find((r: any) => Number(r.period_month) === m && Number(r.period_year) === y) || null;
  } catch { payrollRequest.value = null; }
}
// Month navigation for payslip
const currentMonth = computed(() => new Date().toISOString().slice(0, 7));

function shiftMonth(delta: number) {
  const [y, m] = filterMonth.value.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  filterMonth.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function printPayslip(){ window.print(); }


async function quickGeneratePayroll() {
  const m = Number(filterMonth.value || (new Date().getMonth()+1));
  const y = Number(filterYear.value || new Date().getFullYear());
  const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const label = `Gaji ${monthNames[m-1]} ${y}`;
  if (!confirm(`Generate ${label} ke Payment Schedule?\n${psHistory.value.length} slip gaji · Total akan dihitung otomatis`)) return;
  payrollSaving.value = true;
  try {
    // 1. Create payroll request
    const res = await api.post('/finance/payroll-requests', {
      period_month: m,
      period_year: y,
      purpose: label,
    });
    const payrollId = res.data.data.id;
    // 2. Submit
    await api.put(`/finance/payroll-requests/${payrollId}/submit`);
    // 3. Auto-approve → appears in Payment Schedule
    await api.put(`/finance/payroll-requests/${payrollId}/approve`);
    alert(`✅ ${label} berhasil di-generate ke Payment Schedule!\n${res.data.data.employee_count} karyawan`);
    await loadHistory();
  } catch(e:any) {
    alert(e?.response?.data?.error || 'Gagal generate payroll');
  } finally {
    payrollSaving.value = false;
  }
}

// Generate payroll to Project Expense (cost control)
async function generateToProjectExpense() {
  if (!expenseProjectId.value) { alert('Pilih project terlebih dahulu'); return; }
  const [y, m] = filterMonth.value.split('-').map(Number);
  const savedCount = payrollSummary.value.filter(r => r.saved).length;
  const projectName = projects.value.find(p => p.id === expenseProjectId.value)?.name || '';
  const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const label = `${monthNames[m-1]} ${y}`;

  if (!confirm(`Generate expense gaji ${label} ke project "${projectName}"?\n\n${savedCount} slip gaji finalized akan dibuatkan expense record di modul Project → Expense.`)) return;

  expenseSaving.value = true;
  try {
    const res = await api.post('/hr/payslip/generate-expense', {
      period_month: m,
      period_year: y,
      project_id: expenseProjectId.value,
    });
    const d = res.data.data;
    alert(`✅ Expense berhasil di-generate!\n\nProject: ${d.project_name}\nPeriode: ${d.period}\nKaryawan: ${d.employee_count}\nGaji Bersih: ${fmtRp(d.total_net)}\nKasbon: ${fmtRp(d.total_kasbon)}\n\nCek di Project → tab Expense`);
  } catch(e: any) {
    alert(e?.response?.data?.error || 'Gagal generate expense');
  } finally {
    expenseSaving.value = false;
  }
}

// Load payroll summary: ALWAYS use live backend computation (same source as slip modal)
async function loadPayrollSummary() {
  loadingPayrollSummary.value = true;
  try {
    const [y, m] = filterMonth.value.split('-').map(Number);
    const projId = filterProject.value || '';

    const empRes = await api.get('/hr/employees');
    const employees: any[] = (empRes.data.data || [])
      .filter((e: any) => e.status === 'ACTIVE')
      .map((e: any) => ({
        id: e.id,
        name: e.first_name || e.name || e.employee_code || e.code || '',
        position: e.position || '',
        code: e.employee_code || e.code || '',
      }));

    // Fetch live payslip for ALL employees in parallel
    const results = await Promise.all(
      employees.map(e =>
        api.get('/hr/payslip', { params: { employee_id: e.id, month: m, year: y, project_id: projId || undefined } })
          .then(res => ({ id: e.id, ps: res.data }))
          .catch(() => ({ id: e.id, ps: null }))
      )
    );
    const liveMap = new Map(results.map(r => [r.id, r.ps]));

    const summary = employees.map(e => {
      const ps = liveMap.get(e.id);
      if (ps && ps.calculation) {
        const calc = ps.calculation;
        return {
          employee_id: e.id, name: e.name, position: e.position,
          total_days:   Number(ps.attendance?.total_days || 0),
          basic_salary: Number(calc.basic_salary || 0),
          tunjangan:    Number(calc.tunjangan || 0),
          ot_pay:       Number(calc.ot_pay || 0),
          kasbon:       Number(ps.advances?.advance_1 || 0) + Number(ps.advances?.advance_2 || 0),
          gross:        Number(calc.gross_salary || 0),
          deductions:   Number(ps.deductions?.total || 0),
          net:          Number(ps.net_salary || 0),
          saved: false, payslip_id: null, generating: false,
        };
      }
      return {
        employee_id: e.id, name: e.name, position: e.position,
        total_days: 0, basic_salary: 0, tunjangan: 0, ot_pay: 0, kasbon: 0,
        gross: 0, deductions: 0, net: 0,
        saved: false, payslip_id: null, generating: false,
      };
    });

    payrollSummary.value = summary;
    if (allEmployees.value.length === 0) allEmployees.value = empRes.data.data || [];
  } catch(err) {
    console.error('loadPayrollSummary error:', err);
    payrollSummary.value = [];
  } finally {
    loadingPayrollSummary.value = false;
  }
}

async function generateAndSave(row: any) {
  row.generating = true;
  try {
    const [y, m] = filterMonth.value.split('-');
    // Generate payslip for this employee
    const res = await api.get('/hr/payslip', { params: { employee_id: row.employee_id, month: m, year: y, project_id: filterProject.value || undefined } });
    const ps = res.data;
    // Save it
    await api.post('/hr/payslip/save', {
      employee_id: row.employee_id, period_month: +m, period_year: +y,
      project_id: filterProject.value || null,
      calculation: { ...ps.calculation, total_days: ps.attendance.total_days, total_ot_hours: ps.attendance.total_ot_hours },
      advances: ps.advances, deductions: ps.deductions, net_salary: ps.net_salary
    });
    await loadPayrollSummary();
    await loadHistory();
  } catch(e: any) {
    alert(e?.response?.data?.error || 'Gagal generate');
    row.generating = false;
  }
}

async function generateAllPayslips() {
  if (!confirm(`Generate / update slip gaji untuk semua ${activeEmployees.value.length} karyawan aktif bulan ${psMonthLabel.value}?\n\nSlip yang sudah tersimpan akan di-recalculate ulang.`)) return;
  generatingAll.value = true;
  const [y, m] = filterMonth.value.split('-');
  let success = 0, failed = 0;
  for (const e of activeEmployees.value) {
    try {
      const res = await api.get('/hr/payslip', { params: { employee_id: e.id, month: m, year: y, project_id: filterProject.value || undefined } });
      const ps = res.data;
      await api.post('/hr/payslip/save', {
        employee_id: e.id, period_month: +m, period_year: +y, project_id: filterProject.value || null,
        calculation: { ...ps.calculation, total_days: ps.attendance.total_days, total_ot_hours: ps.attendance.total_ot_hours },
        advances: ps.advances, deductions: ps.deductions, net_salary: ps.net_salary
      });
      success++;
    } catch { failed++; }
  }
  await loadPayrollSummary();
  await loadHistory();
  generatingAll.value = false;
  alert(`✅ ${success} slip berhasil di-generate${failed ? `, ${failed} gagal` : ''}`);
}

async function previewPayslip(row: any) {
  payslipModal.value = row;
  payslip.value = null;
  slipEditMode.value = false;
  try {
    const [y, m] = filterMonth.value.split('-');
    const res = await api.get('/hr/payslip', { params: { employee_id: row.employee_id, month: m, year: y, project_id: filterProject.value || undefined } });
    payslip.value = res.data;
  } catch { alert('Gagal load payslip'); }
}

async function previewAndPrint(row: any) {
  await previewPayslip(row);
  setTimeout(() => window.print(), 800);
}

async function savePayslipModal() {
  if (!payslip.value || !payslipModal.value) return;
  savingPs.value = true;
  try {
    const [y, m] = filterMonth.value.split('-');
    await api.post('/hr/payslip/save', {
      employee_id: payslipModal.value.employee_id, period_month: +m, period_year: +y, project_id: filterProject.value || null,
      calculation: { ...payslip.value.calculation, total_days: payslip.value.attendance.total_days, total_ot_hours: payslip.value.attendance.total_ot_hours },
      advances: payslip.value.advances, deductions: payslip.value.deductions, net_salary: payslip.value.net_salary
    });
    payslipModal.value = null; payslip.value = null;
    await loadPayrollSummary(); await loadHistory();
  } catch(e: any) { alert(e?.response?.data?.error || 'Gagal simpan'); }
  finally { savingPs.value = false; }
}

async function loadMonthLogs() {
  const [y,m]=filterMonth.value.split('-');
  const res=await api.get('/hr/attendance',{params:{month:m,year:y,project_id:filterProject.value||undefined}});
  monthLogs.value=res.data.data||[];
}
async function loadProjects(){
  const res = await api.get('/projects');
  // API returns plain array with field 'title' (aliased from project_name)
  const raw = Array.isArray(res.data) ? res.data : (res.data.data || res.data.projects || []);
  projects.value = raw.map((p: any) => ({ id: p.id, name: p.title || p.project_name || p.name || '—', status: p.status }));
}
async function loadEmployees(){
  const res=await api.get('/hr/employees');
  allEmployees.value=(res.data.data||[]).map((e:any)=>({
    ...e,
    name: e.first_name || e.name || e.code || '',
    code: e.employee_code || e.code || '',
  }));
}

watch(filterMonth, () => {
  loadMonthLogs();
  if (activeTab.value === 'payslip') { loadHistory(); loadPayrollSummary(); }
});
watch(activeTab, (tab) => { if (tab === 'payslip') { loadHistory(); loadPayrollSummary(); } });
watch(attendDate, () => {
  isHoliday.value = false; // auto-reset libur nasional saat ganti tanggal
  initDailyRec();
});

onMounted(async () => {
  await Promise.all([loadProjects(), loadEmployees()]);
  initDailyRec();
  await loadMonthLogs();
  await loadAdvances();
  await loadHistory();
  await loadPayrollSummary();
});

</script>

<style scoped>
.att-page{display:flex;flex-direction:column;gap:14px;padding:20px;}
.att-header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;}
.att-header h1{font-size:1.2rem;font-weight:800;color:#0f172a;margin:0;}
.header-actions{display:flex;gap:8px;flex-wrap:wrap;}
.sel{border:1px solid #d1d5db;border-radius:8px;padding:7px 10px;font-size:.82rem;background:white;}
.tab-nav{display:flex;gap:6px;flex-wrap:wrap;}
.tab-btn{padding:9px 18px;border:1px solid #e2e8f0;border-radius:10px;background:white;font-size:.82rem;font-weight:600;cursor:pointer;color:#64748b;transition:all .15s;}
.tab-btn.active{background:#1d4ed8;color:white;border-color:#1d4ed8;}
.card{background:white;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;}
.card-title{font-size:.88rem;font-weight:700;color:#0f172a;}
.card-toolbar{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-bottom:1px solid #f1f5f9;flex-wrap:wrap;gap:8px;}
.toolbar-left{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.toolbar-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.bulk-actions{display:flex;gap:6px;}
.btn-check-all{padding:7px 14px;background:#dcfce7;color:#15803d;border:1.5px solid #86efac;border-radius:8px;font-size:.78rem;font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap;}
.btn-check-all:hover{background:#16a34a;color:white;border-color:#16a34a;}
.btn-check-absent{padding:7px 14px;background:#fee2e2;color:#b91c1c;border:1.5px solid #fca5a5;border-radius:8px;font-size:.78rem;font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap;}
.btn-check-absent:hover{background:#dc2626;color:white;border-color:#dc2626;}
.btn-holiday{padding:7px 14px;background:#fff7ed;color:#9a3412;border:1.5px solid #fed7aa;border-radius:8px;font-size:.78rem;font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap;}
.btn-holiday:hover{background:#ea580c;color:white;border-color:#ea580c;}
.btn-holiday-active{padding:7px 14px;background:#ea580c;color:white;border:1.5px solid #ea580c;border-radius:8px;font-size:.78rem;font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap;box-shadow:0 0 0 3px rgba(234,88,12,.25);}
.btn-holiday-active:hover{background:#c2410c;border-color:#c2410c;}
/* Summary bar */
.summary-bar{display:flex;align-items:center;gap:12px;padding:8px 18px;background:#f8fafc;border-bottom:1px solid #f1f5f9;font-size:.76rem;flex-wrap:wrap;}
.sum-item{display:flex;align-items:center;gap:4px;color:#64748b;}
.sum-present{color:#15803d;font-weight:600;}
.sum-absent{color:#b91c1c;font-weight:600;}
.sum-none{color:#b45309;font-weight:600;}
.sum-sep{color:#cbd5e1;}
/* Row highlights */
.row-absent td{background:#fef2f2!important;} .row-absent td input{background:#fef2f2;}
.row-present td{background:#f0fdf4!important;} .row-present td input{background:#f0fdf4;}
.btn-primary:disabled{opacity:.6;}
.btn-save{padding:8px 18px;background:#059669;color:white;border:none;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer;}
.btn-print{padding:8px 18px;background:#7c3aed;color:white;border:none;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer;}
.btn-cancel{padding:8px 14px;background:#f1f5f9;color:#374151;border:1px solid #e2e8f0;border-radius:8px;font-size:.82rem;cursor:pointer;}
.btn-del{background:none;border:none;cursor:pointer;font-size:1rem;opacity:.6;}
.btn-del:hover{opacity:1;}
.adv-form{display:flex;flex-wrap:wrap;gap:8px;padding:12px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;}
.tbl-wrap{overflow-x:auto;}
.tbl{border-collapse:collapse;width:100%;font-size:.76rem;}
.tbl thead th{background:#f8fafc;padding:8px 6px;font-weight:700;color:#374151;border-bottom:2px solid #e2e8f0;white-space:nowrap;text-align:center;}
.tbl tbody td{border-bottom:1px solid #f8fafc;padding:5px 6px;vertical-align:middle;}
.tbl tbody .odd td{background:#fafafa;}
.tc{text-align:center;} .small{font-size:.68rem;} .td-name{padding-left:10px!important;}
.emp-name{font-weight:600;color:#1e293b;} .emp-code{font-size:.65rem;color:#94a3b8;}
.empty{text-align:center;color:#94a3b8;padding:40px!important;} .loading{text-align:center;padding:40px;color:#64748b;}
.status-btns{display:flex;gap:6px;justify-content:center;}
.sb{width:32px;height:32px;border-radius:50%;border:2px solid #e2e8f0;font-size:.85rem;cursor:pointer;background:white;transition:all .15s;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;}
.sb-p.active{background:#16a34a;border-color:#16a34a;color:white;font-weight:700;box-shadow:0 2px 6px rgba(22,163,74,.4);}
.sb-a.active{background:#dc2626;border-color:#dc2626;color:white;font-weight:700;box-shadow:0 2px 6px rgba(220,38,38,.4);}
.sb:hover{transform:scale(1.1);}
.ts-val,.ts-cell span{font-weight:700;font-size:.8rem;}
.ts-1{color:#16a34a;} .ts-half{color:#ca8a04;} .ts-0{color:#dc2626;}
.ts-total{color:#1d4ed8;font-weight:700;background:#eff6ff;}
.ts-salary{color:#059669;font-weight:700;white-space:nowrap;}
.th-sticky{position:sticky;background:#f8fafc;z-index:2;} .th-day{min-width:30px;font-size:.65rem;}
.th-day.weekend{background:#fef3c7;} .ts-cell.weekend{background:#fffbeb;}
.day-name{font-size:.55rem;font-weight:400;color:#94a3b8;}
.td-emp{padding-left:10px!important;white-space:nowrap;font-weight:600;}
.tfoot-row td{background:#0f172a;color:#38bdf8;font-weight:700;padding:6px;}
.tf-label{text-align:left!important;padding-left:12px!important;}
.time-inp{width:70px;border:1px solid #e2e8f0;border-radius:5px;padding:3px 5px;font-size:.72rem;}
.ot-inp{width:45px;border:1px solid #e2e8f0;border-radius:5px;padding:3px;text-align:center;font-size:.72rem;}
.note-inp{width:100px;border:1px solid #e2e8f0;border-radius:5px;padding:3px 6px;font-size:.7rem;}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:999;padding:16px;}
.modal-box{background:white;border-radius:16px;width:100%;max-width:680px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.2);}
.modal-head{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e2e8f0;font-size:.95rem;font-weight:700;color:#0f172a;}
.modal-body{padding:16px 20px;overflow-y:auto;flex:1;}
.modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid #e2e8f0;}
.kr-sel td{background:#eff6ff!important;}
.badge-pending{background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:20px;font-size:.68rem;font-weight:700;}
.badge-approved{background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:20px;font-size:.68rem;font-weight:700;}
.badge-deducted{background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:20px;font-size:.68rem;font-weight:700;}
.badge-final{background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:20px;font-size:.68rem;font-weight:700;}
.red-txt{color:#dc2626;font-weight:600;}
.ps-toolbar{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #f1f5f9;flex-wrap:wrap;gap:8px;}
.payslip{max-width:620px;margin:20px auto;border:2px solid #e2e8f0;border-radius:14px;overflow:hidden;}
.ps-head{background:#0f172a;color:white;padding:20px;text-align:center;}
.ps-company{font-size:1.1rem;font-weight:800;letter-spacing:.05em;}
.ps-title{font-size:.8rem;opacity:.7;margin:4px 0;}
.ps-period{font-size:.75rem;color:#38bdf8;}
.ps-body{padding:20px;}
.ps-info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:4px;}
.ps-info-item{background:#f8fafc;border-radius:8px;padding:8px 12px;}
.pi-label{display:block;font-size:.62rem;color:#6b7280;font-weight:600;text-transform:uppercase;}
.pi-val{font-size:.8rem;font-weight:700;color:#0f172a;}
.ps-divider{height:1px;background:#f1f5f9;margin:14px 0;}
.ps-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.ps-col{display:flex;flex-direction:column;gap:6px;}
.ps-row{display:flex;justify-content:space-between;align-items:center;font-size:.8rem;padding:3px 0;}
.ps-row.total{font-weight:700;border-top:1px solid #e2e8f0;padding-top:8px;margin-top:4px;}
.ps-label{font-size:.63rem;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:6px;}
.ps-nett{display:flex;justify-content:space-between;background:#0f172a;color:#38bdf8;padding:14px 16px;border-radius:10px;font-weight:800;font-size:.95rem;margin-top:14px;}
.ps-sign{display:flex;justify-content:space-around;margin-top:24px;}
.sign-box{text-align:center;font-size:.75rem;}
.sign-line{margin-bottom:4px;color:#6b7280;}
.sign-space{height:50px;border-bottom:1px solid #374151;width:120px;margin:0 auto;}
.green{color:#059669;font-weight:600;} .red{color:#dc2626;font-weight:600;}

/* Summary Panel */
.summary-panel{display:flex;flex-direction:column;gap:0;background:white;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;}
.sp-header{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:linear-gradient(135deg,#0f172a,#1e3a5f);flex-wrap:wrap;gap:6px;}
.sp-title{font-size:.9rem;font-weight:800;color:white;}
.sp-sub{font-size:.65rem;color:#94a3b8;}
.sp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:14px 16px;}
.sp-card{display:flex;align-items:center;gap:12px;border-radius:12px;padding:12px 14px;border:1px solid transparent;transition:transform .15s;}
.sp-card:hover{transform:translateY(-1px);}
.sp-icon{font-size:1.6rem;line-height:1;flex-shrink:0;}
.sp-content{flex:1;min-width:0;}
.sp-label{font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b;}
.sp-value{font-size:1.4rem;font-weight:900;color:#0f172a;line-height:1.1;margin:2px 0;}
.sp-rp{font-size:.95rem!important;}
.sp-sub2{font-size:.62rem;color:#94a3b8;margin-top:1px;}
.sp-blue{background:#eff6ff;border-color:#bfdbfe;} .sp-blue .sp-value{color:#1d4ed8;}
.sp-indigo{background:#eef2ff;border-color:#c7d2fe;} .sp-indigo .sp-value{color:#4338ca;}
.sp-violet{background:#f5f3ff;border-color:#ddd6fe;} .sp-violet .sp-value{color:#7c3aed;}
.sp-emerald{background:#ecfdf5;border-color:#a7f3d0;} .sp-emerald .sp-value{color:#059669;}
.sp-green{background:#f0fdf4;border-color:#bbf7d0;} .sp-green .sp-value{color:#15803d;}
.sp-amber{background:#fffbeb;border-color:#fde68a;} .sp-amber .sp-value{color:#b45309;}
.sp-teal{background:#f0fdfa;border-color:#99f6e4;} .sp-teal .sp-value{color:#0f766e;}
.sp-rose{background:#fff1f2;border-color:#fecdd3;} .sp-rose .sp-value{color:#be123c;}
.sp-divider{padding:8px 18px;background:#f8fafc;border-top:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9;font-size:.72rem;font-weight:700;color:#475569;letter-spacing:.04em;}
.sp-emp-table{overflow-x:auto;}
@media(max-width:900px){.sp-grid{grid-template-columns:repeat(2,1fr);}}
@media(max-width:580px){.sp-grid{grid-template-columns:1fr;}}
@media print{
  .att-header,.card-toolbar,.ps-toolbar,.header-actions,.tab-nav,.adv-form{display:none!important;}
  .payslip{border:none;max-width:100%;}
  .slip-wrap{flex-direction:row!important;}
}

/* ── Excel-style Slip Gaji ── */
.slip-wrap{display:flex;flex-direction:row;gap:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;font-size:.72rem;}
.slip-left{min-width:240px;max-width:260px;padding:14px 16px;border-right:2px solid #e2e8f0;display:flex;flex-direction:column;gap:8px;}
.slip-right{flex:1;overflow-x:auto;padding:10px 10px 10px 0;}

/* Left panel */
.slip-co{font-size:.85rem;font-weight:900;color:#0f172a;letter-spacing:.04em;}
.slip-title{font-size:.68rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;}
.slip-period{font-size:.68rem;color:#1d4ed8;font-weight:700;margin-bottom:4px;}
.slip-info-tbl{border-collapse:collapse;width:100%;}
.slip-info-tbl td{padding:2px 3px;vertical-align:top;}
.sil{color:#64748b;white-space:nowrap;font-size:.68rem;min-width:56px;}
.sic{color:#94a3b8;padding:2px 4px;font-size:.68rem;}
.siv{font-weight:700;color:#0f172a;font-size:.7rem;}
.slip-divider{height:1px;background:#e2e8f0;margin:6px 0;}
.slip-calc-tbl{border-collapse:collapse;width:100%;}
.slip-calc-tbl td{padding:2px 2px;vertical-align:middle;}
.scl{color:#374151;font-size:.68rem;white-space:nowrap;min-width:58px;}
.scc{color:#94a3b8;padding:0 3px;font-size:.68rem;}
.scn{text-align:right;font-weight:700;color:#0f172a;font-size:.68rem;min-width:24px;}
.sco{text-align:center;color:#6b7280;padding:0 2px;font-size:.7rem;}
.scr{text-align:right;font-size:.65rem;color:#374151;min-width:52px;}
.sce{text-align:center;color:#94a3b8;padding:0 2px;}
.scv{text-align:right;font-weight:700;font-size:.68rem;color:#374151;min-width:68px;}
.scv.cur{color:#059669;}
.slip-total-bruto{display:flex;justify-content:space-between;background:#f1f5f9;border-radius:6px;padding:5px 8px;font-weight:800;font-size:.72rem;color:#0f172a;}
.slip-total-net{display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:.72rem;color:#0f172a;}
.slip-net-box{display:flex;align-items:center;gap:4px;background:#22c55e;color:white;border-radius:6px;padding:4px 8px;}
.slip-net-val{font-size:.85rem;font-weight:900;}
.slip-note-section{background:#f8fafc;border-radius:6px;padding:6px 8px;}
.slip-note-title{font-size:.62rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.04em;}
.slip-legend{display:flex;flex-direction:column;gap:4px;margin-top:4px;}
.sleg-item{display:flex;align-items:center;gap:6px;font-size:.63rem;color:#374151;}
.sleg-box{width:14px;height:10px;border-radius:2px;flex-shrink:0;}
.sleg-box.weekend{background:#ef4444;}
.sleg-box.holiday{background:#22c55e;}
.slip-sign-row{display:flex;justify-content:space-between;gap:8px;}
.slip-sign{flex:1;text-align:center;font-size:.65rem;color:#374151;}
.slip-sign-space{height:40px;border-bottom:1px solid #374151;margin-bottom:4px;}

/* Right panel — timesheet table */
.slip-ts-tbl{border-collapse:collapse;width:100%;font-size:.65rem;}
.ts-th{background:#4ade80;color:#0f172a;padding:4px 6px;text-align:center;border:1px solid #d1d5db;font-weight:700;font-size:.6rem;white-space:nowrap;}
.ts-sm{font-size:.58rem;padding:3px 4px;}
.ts-ot{font-size:.58rem;}
.ts-td{padding:2px 5px;border:1px solid #e5e7eb;text-align:center;white-space:nowrap;}
.ts-date{color:#374151;font-size:.62rem;}
.ts-day{color:#475569;font-size:.62rem;}
.ts-time{color:#1d4ed8;font-size:.62rem;font-weight:600;}
.ts-num{font-weight:700;color:#0f172a;}
.ts-ot1{color:#dc2626;}
.ts-weekend{background:#fee2e2;}
.ts-weekend .ts-td{color:#991b1b;}
.ts-holiday{background:#dcfce7;}
.ts-holiday .ts-td{color:#14532d;}
.ts-foot td{background:#f1f5f9;font-size:.65rem;border-top:2px solid #9ca3af;}
</style>
