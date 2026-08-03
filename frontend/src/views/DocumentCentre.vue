<template>
<div class="dc-page">
  <!-- Header -->
  <div class="dc-header">
    <div>
      <h1>📚 Document Centre</h1>
      <p class="dc-sub">Standard Library — Procedures, Method Statements, Work Instructions</p>
    </div>
    <button @click="showForm=true" class="btn-primary">+ Upload Document</button>
  </div>

  <!-- Stats -->
  <div class="stat-grid" v-if="stats">
    <div class="stat-card blue"><div class="s-val">{{ stats.total||0 }}</div><div class="s-lbl">Total Dokumen</div></div>
    <div class="stat-card green"><div class="s-val">{{ stats.approved||0 }}</div><div class="s-lbl">Approved</div></div>
    <div class="stat-card amber"><div class="s-val">{{ stats.review||0 }}</div><div class="s-lbl">In Review</div></div>
    <div class="stat-card slate"><div class="s-val">{{ stats.draft||0 }}</div><div class="s-lbl">Draft</div></div>
  </div>

  <div class="dc-body">
    <!-- Sidebar Categories -->
    <div class="cat-panel">
      <div class="cat-title">Kategori</div>
      <div :class="['cat-item', !filterCat?'active':'']" @click="filterCat=null">
        📁 Semua <span class="cat-cnt">{{ stats?.total||0 }}</span>
      </div>
      <div v-for="c in categories" :key="c.id"
        :class="['cat-item', filterCat===c.id?'active':'']"
        @click="filterCat=c.id; loadDocs()">
        {{ c.icon }} {{ c.name }} <span class="cat-cnt">{{ c.doc_count||0 }}</span>
      </div>
    </div>

    <!-- Main content -->
    <div class="doc-main">
      <!-- Toolbar -->
      <div class="doc-toolbar">
        <input v-model="search" @input="loadDocs" placeholder="🔍 Cari judul, nomor, tag..." class="search-inp" />
        <select v-model="filterType" @change="loadDocs" class="sel">
          <option value="">Semua Tipe</option>
          <option value="procedure">Procedure</option>
          <option value="method_statement">Method Statement</option>
          <option value="work_instruction">Work Instruction</option>
          <option value="standard">Standard & Code</option>
          <option value="policy">Policy</option>
          <option value="template">Template</option>
          <option value="drawing">Drawing</option>
          <option value="hse">HSE</option>
        </select>
        <select v-model="filterStatus" @change="loadDocs" class="sel">
          <option value="">Semua Status</option>
          <option value="approved">Approved</option>
          <option value="review">In Review</option>
          <option value="draft">Draft</option>
          <option value="obsolete">Obsolete</option>
        </select>
        <span class="doc-count">{{ docs.length }} dokumen</span>
      </div>

      <!-- Table -->
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr>
            <th>No. Dokumen</th><th>Judul</th><th>Tipe</th>
            <th>Disiplin</th><th>Rev</th><th>Status</th>
            <th>Eff. Date</th><th>File</th><th>Aksi</th>
          </tr></thead>
          <tbody>
            <tr v-if="loading"><td colspan="9" class="tc">⏳ Loading...</td></tr>
            <tr v-else-if="!docs.length"><td colspan="9" class="tc empty">Tidak ada dokumen</td></tr>
            <tr v-for="(d,i) in docs" :key="d.id" :class="i%2?'odd':''">
              <td><code class="doc-num">{{ d.doc_number }}</code></td>
              <td>
                <div class="doc-title">{{ d.title }}</div>
                <div class="doc-tags" v-if="d.tags">{{ d.tags }}</div>
              </td>
              <td><span :class="['badge', 'type-'+d.doc_type]">{{ typeLabel(d.doc_type) }}</span></td>
              <td class="tc small">{{ d.discipline||'—' }}</td>
              <td class="tc"><span class="rev-badge">{{ d.revision }}</span></td>
              <td><span :class="['badge', 'st-'+d.status]">{{ statusLabel(d.status) }}</span></td>
              <td class="tc small">{{ d.effective_date ? fmtDate(d.effective_date) : '—' }}</td>
              <td class="tc">
                <span v-if="d.file_url" class="file-chip" :title="d.file_name">📎</span>
                <span v-else class="no-file">—</span>
              </td>
              <td class="tc" style="white-space:nowrap">
                <button @click="viewDoc(d)" class="act-btn">👁</button>
                <button @click="editDoc(d)" class="act-btn">✏️</button>
                <a v-if="d.file_url" :href="'/api/documents/'+d.id+'/download'" class="act-btn" target="_blank">⬇</a>
                <button @click="delDoc(d)" class="act-btn red">🗑</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Upload/Create Modal -->
  <Teleport to="body">
    <div v-if="showForm" class="modal-bg" @click.self="closeForm">
      <div class="modal">
        <div class="modal-head">
          <h3>{{ editId ? '✏️ Edit Dokumen' : '📤 Upload Dokumen Baru' }}</h3>
          <button @click="closeForm" class="close-btn">×</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="fg">
              <label>Judul Dokumen *</label>
              <input v-model="form.title" placeholder="Nama dokumen" class="inp" />
            </div>
            <div class="fg">
              <label>Kategori *</label>
              <select v-model="form.category_id" class="inp">
                <option value="">— Pilih Kategori —</option>
                <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.icon }} {{ c.name }}</option>
              </select>
            </div>
            <div class="fg">
              <label>Tipe Dokumen</label>
              <select v-model="form.doc_type" class="inp">
                <option value="procedure">Procedure</option>
                <option value="method_statement">Method Statement</option>
                <option value="work_instruction">Work Instruction</option>
                <option value="standard">Standard & Code</option>
                <option value="policy">Policy</option>
                <option value="template">Template</option>
                <option value="drawing">Drawing</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div class="fg">
              <label>Disiplin / Bidang</label>
              <input v-model="form.discipline" placeholder="Cth: Civil, Mechanical, Electrical" class="inp" />
            </div>
            <div class="fg">
              <label>Revisi</label>
              <input v-model="form.revision" placeholder="A" class="inp" style="width:80px" />
            </div>
            <div class="fg">
              <label>Status</label>
              <select v-model="form.status" class="inp">
                <option value="draft">Draft</option>
                <option value="review">In Review</option>
                <option value="approved">Approved</option>
                <option value="obsolete">Obsolete</option>
              </select>
            </div>
            <div class="fg">
              <label>Disetujui Oleh</label>
              <input v-model="form.approved_by" placeholder="Nama approver" class="inp" />
            </div>
            <div class="fg">
              <label>Tanggal Efektif</label>
              <input v-model="form.effective_date" type="date" class="inp" />
            </div>
            <div class="fg fg-full">
              <label>Deskripsi</label>
              <textarea v-model="form.description" rows="2" placeholder="Deskripsi singkat dokumen..." class="inp"></textarea>
            </div>
            <div class="fg fg-full">
              <label>Tags (pisahkan koma)</label>
              <input v-model="form.tags" placeholder="contoh: safety, welding, civil" class="inp" />
            </div>
            <div class="fg fg-full" v-if="editId">
              <label>Upload File (PDF/DOC/XLS/DWG — maks 50MB)</label>
              <input type="file" @change="onFile" class="inp" accept=".pdf,.doc,.docx,.xls,.xlsx,.dwg,.png,.jpg" />
              <div v-if="currentFile" class="file-info">📎 File saat ini: {{ currentFile }}</div>
            </div>
            <div class="fg fg-full" v-else>
              <label>Upload File (PDF/DOC/XLS/DWG — maks 50MB)</label>
              <input type="file" @change="onFile" class="inp" accept=".pdf,.doc,.docx,.xls,.xlsx,.dwg,.png,.jpg" />
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <button @click="closeForm" class="btn-cancel">Batal</button>
          <button @click="saveDoc" :disabled="saving" class="btn-primary">
            {{ saving ? '⏳ Menyimpan...' : (editId ? '💾 Update' : '📤 Simpan & Upload') }}
          </button>
        </div>
      </div>
    </div>

    <!-- View Modal -->
    <div v-if="viewModal" class="modal-bg" @click.self="viewModal=null">
      <div class="modal modal-wide">
        <div class="modal-head">
          <h3>{{ viewModal.category_icon }} {{ viewModal.doc_number }} — {{ viewModal.title }}</h3>
          <button @click="viewModal=null" class="close-btn">×</button>
        </div>
        <div class="modal-body">
          <div class="view-grid">
            <div class="vr"><span class="vl">Kategori</span><span>{{ viewModal.category_name }}</span></div>
            <div class="vr"><span class="vl">Tipe</span><span>{{ typeLabel(viewModal.doc_type) }}</span></div>
            <div class="vr"><span class="vl">Revisi</span><span>{{ viewModal.revision }}</span></div>
            <div class="vr"><span class="vl">Status</span><span :class="['badge','st-'+viewModal.status]">{{ statusLabel(viewModal.status) }}</span></div>
            <div class="vr"><span class="vl">Disiplin</span><span>{{ viewModal.discipline||'—' }}</span></div>
            <div class="vr"><span class="vl">Disetujui</span><span>{{ viewModal.approved_by||'—' }}</span></div>
            <div class="vr"><span class="vl">Efektif</span><span>{{ viewModal.effective_date ? fmtDate(viewModal.effective_date) : '—' }}</span></div>
            <div class="vr fg-full"><span class="vl">Deskripsi</span><span>{{ viewModal.description||'—' }}</span></div>
            <div class="vr fg-full" v-if="viewModal.tags"><span class="vl">Tags</span><span>{{ viewModal.tags }}</span></div>
          </div>
          <div v-if="viewModal.file_url" class="file-preview-box">
            <div>📎 {{ viewModal.file_name }}</div>
            <a :href="'/api/documents/'+viewModal.id+'/download'" class="btn-primary" target="_blank">⬇ Download</a>
          </div>
          <div v-else class="no-file-box">Belum ada file terlampir</div>
        </div>
      </div>
    </div>
  </Teleport>
</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';

const api = axios.create({ baseURL: '/api', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

const docs = ref<any[]>([]);
const categories = ref<any[]>([]);
const stats = ref<any>(null);
const loading = ref(false);
const saving = ref(false);
const showForm = ref(false);
const viewModal = ref<any>(null);
const editId = ref<number|null>(null);
const currentFile = ref('');
const filterCat = ref<number|null>(null);
const filterType = ref('');
const filterStatus = ref('');
const search = ref('');
const fileRef = ref<File|null>(null);

const form = ref({ title:'', category_id:'', doc_type:'procedure', revision:'A', status:'draft',
  description:'', discipline:'', approved_by:'', effective_date:'', tags:'' });

async function loadAll() {
  await Promise.all([loadCategories(), loadStats(), loadDocs()]);
}
async function loadCategories() {
  const r = await api.get('/documents/categories');
  categories.value = r.data.data || [];
}
async function loadStats() {
  const r = await api.get('/documents/stats');
  stats.value = r.data;
}
async function loadDocs() {
  loading.value = true;
  try {
    const r = await api.get('/documents', { params: {
      category_id: filterCat.value||undefined,
      doc_type: filterType.value||undefined,
      status: filterStatus.value||undefined,
      search: search.value||undefined
    }});
    docs.value = r.data.data || [];
  } finally { loading.value = false; }
}

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) fileRef.value = f;
}

function resetForm() {
  form.value = { title:'', category_id:'', doc_type:'procedure', revision:'A', status:'draft',
    description:'', discipline:'', approved_by:'', effective_date:'', tags:'' };
  fileRef.value = null; editId.value = null; currentFile.value = '';
}

function closeForm() { showForm.value = false; resetForm(); }

function editDoc(d: any) {
  editId.value = d.id;
  form.value = { title: d.title, category_id: d.category_id, doc_type: d.doc_type,
    revision: d.revision, status: d.status, description: d.description||'',
    discipline: d.discipline||'', approved_by: d.approved_by||'',
    effective_date: d.effective_date?.slice(0,10)||'', tags: d.tags||'' };
  currentFile.value = d.file_name || '';
  showForm.value = true;
}

function viewDoc(d: any) { viewModal.value = d; }

async function saveDoc() {
  if (!form.value.title || !form.value.category_id) { alert('Judul dan kategori wajib diisi'); return; }
  saving.value = true;
  try {
    let id = editId.value;
    if (id) {
      await api.put(`/documents/${id}`, form.value);
    } else {
      const r = await api.post('/documents', form.value);
      id = r.data.data.id;
    }
    if (fileRef.value && id) {
      const fd = new FormData();
      fd.append('file', fileRef.value);
      await api.post(`/documents/${id}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    }
    closeForm(); await loadAll();
  } catch(e:any) { alert(e?.response?.data?.error || 'Gagal menyimpan'); }
  finally { saving.value = false; }
}

async function delDoc(d: any) {
  if (!confirm(`Hapus "${d.title}"?`)) return;
  await api.delete(`/documents/${d.id}`);
  await loadAll();
}

function typeLabel(t: string) {
  const m: any = { procedure:'Procedure', method_statement:'Method Stmt', work_instruction:'Work Instr',
    standard:'Standard', policy:'Policy', template:'Template', drawing:'Drawing', other:'Other' };
  return m[t] || t;
}
function statusLabel(s: string) {
  const m: any = { draft:'Draft', review:'In Review', approved:'Approved', obsolete:'Obsolete' };
  return m[s] || s;
}
function fmtDate(d: string) { return new Date(d).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }); }

onMounted(loadAll);
</script>

<style scoped>
.dc-page { padding: 20px; display: flex; flex-direction: column; gap: 16px; background: #f8fafc; min-height: 100vh; }
.dc-header { display: flex; justify-content: space-between; align-items: flex-start; }
.dc-header h1 { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0; }
.dc-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
.btn-primary { background: #1d4ed8; color: white; border: none; border-radius: 8px; padding: 9px 18px; font-weight: 700; cursor: pointer; font-size: 13px; }
.btn-cancel { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 9px 16px; font-size: 13px; cursor: pointer; }
.stat-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; }
.stat-card { border-radius: 12px; padding: 16px 20px; }
.stat-card.blue { background: #eff6ff; border: 1px solid #bfdbfe; }
.stat-card.green { background: #f0fdf4; border: 1px solid #bbf7d0; }
.stat-card.amber { background: #fffbeb; border: 1px solid #fde68a; }
.stat-card.slate { background: #f8fafc; border: 1px solid #e2e8f0; }
.s-val { font-size: 28px; font-weight: 800; color: #0f172a; }
.s-lbl { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-top: 2px; }
.dc-body { display: flex; gap: 16px; }
.cat-panel { width: 200px; flex-shrink: 0; background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 12px; height: fit-content; }
.cat-title { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; padding: 4px 8px 8px; }
.cat-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-radius: 8px; cursor: pointer; font-size: 13px; color: #374151; transition: all .15s; }
.cat-item:hover { background: #f1f5f9; }
.cat-item.active { background: #eff6ff; color: #1d4ed8; font-weight: 700; }
.cat-cnt { background: #f1f5f9; color: #64748b; font-size: 11px; padding: 1px 6px; border-radius: 10px; font-weight: 600; }
.doc-main { flex: 1; display: flex; flex-direction: column; gap: 12px; }
.doc-toolbar { display: flex; gap: 10px; align-items: center; background: white; padding: 12px 16px; border-radius: 12px; border: 1px solid #e2e8f0; }
.search-inp { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; font-size: 13px; outline: none; }
.sel { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; font-size: 13px; background: white; }
.doc-count { font-size: 12px; color: #94a3b8; white-space: nowrap; }
.tbl-wrap { background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.tbl thead th { background: #f8fafc; padding: 10px 8px; font-weight: 700; color: #374151; border-bottom: 2px solid #e2e8f0; text-align: left; white-space: nowrap; }
.tbl tbody td { padding: 8px; border-bottom: 1px solid #f8fafc; vertical-align: middle; }
.tbl tbody .odd td { background: #fafafa; }
.tc { text-align: center; } .small { font-size: 11px; color: #64748b; }
.empty { padding: 40px; color: #94a3b8; text-align: center; }
.doc-num { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11px; color: #1e40af; font-weight: 600; }
.doc-title { font-weight: 600; color: #1e293b; }
.doc-tags { font-size: 10px; color: #94a3b8; margin-top: 2px; }
.rev-badge { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; }
.file-chip { font-size: 16px; cursor: default; }
.no-file { color: #cbd5e1; }
.badge { padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; }
.type-procedure { background: #dbeafe; color: #1d4ed8; }
.type-method_statement { background: #fef3c7; color: #b45309; }
.type-work_instruction { background: #d1fae5; color: #065f46; }
.type-standard { background: #ede9fe; color: #6d28d9; }
.type-policy { background: #fee2e2; color: #b91c1c; }
.type-template { background: #cffafe; color: #0e7490; }
.type-drawing { background: #ffedd5; color: #c2410c; }
.st-draft { background: #f1f5f9; color: #64748b; }
.st-review { background: #fef3c7; color: #b45309; }
.st-approved { background: #dcfce7; color: #15803d; }
.st-obsolete { background: #f3f4f6; color: #9ca3af; text-decoration: line-through; }
.act-btn { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 7px; cursor: pointer; font-size: 12px; margin: 0 1px; }
.act-btn.red { color: #ef4444; } .act-btn:hover { background: #f1f5f9; }
.act-btn { text-decoration: none; display: inline-block; }
.modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 999; display: flex; align-items: center; justify-content: center; padding: 16px; }
.modal { background: white; border-radius: 16px; width: 100%; max-width: 700px; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 60px rgba(0,0,0,0.25); }
.modal-wide { max-width: 600px; }
.modal-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #f1f5f9; }
.modal-head h3 { font-size: 15px; font-weight: 700; color: #0f172a; margin: 0; }
.close-btn { background: none; border: none; font-size: 20px; cursor: pointer; color: #94a3b8; }
.modal-body { padding: 20px; }
.modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid #f1f5f9; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.fg { display: flex; flex-direction: column; gap: 4px; }
.fg-full { grid-column: 1/-1; }
label { font-size: 12px; font-weight: 600; color: #374151; }
.inp { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; font-size: 13px; outline: none; width: 100%; transition: border .15s; }
.inp:focus { border-color: #3b82f6; }
textarea.inp { resize: vertical; font-family: inherit; }
.file-info { font-size: 11px; color: #3b82f6; margin-top: 4px; }
.view-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
.vr { display: flex; flex-direction: column; gap: 3px; }
.vl { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; }
.file-preview-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; }
.no-file-box { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 20px; text-align: center; color: #94a3b8; font-size: 13px; }
</style>
