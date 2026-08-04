import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';

import db, { initializeDatabase } from './config/database';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import productRoutes from './routes/product.routes';
import bomRoutes from './routes/bom.routes';
import workOrderRoutes from './routes/workorder.routes';
import inventoryRoutes from './routes/inventory.routes';
import procurementRoutes from './routes/procurement.routes';
import salesRoutes from './routes/sales.routes';
import warehouseRoutes from './routes/warehouse.routes';
import qualityRoutes from './routes/quality.routes';
import qcRoutes from './routes/qc.routes';
import batchRoutes from './routes/batch.routes';
import simulationRoutes from './routes/simulation.routes';
import productionRoutes from './routes/production.routes';
import estimatorRoutes from './routes/estimator.routes';
import categoryRoutes from './routes/category.routes';
import productTypeRoutes from './routes/product-type.routes';
import itemTypeRoutes from './routes/item-type.routes';
import departmentRoutes from './routes/department.routes';
import clientsRoutes from './routes/clients.routes';
import roleRoutes from './routes/role.routes';
import permissionsRoutes from './routes/permissions.routes';
import unitRoutes from './routes/unit.routes';
import hrRoutes from './routes/hr.routes';
import financeRoutes from './routes/finance.routes';
import auditRoutes from './routes/audit.routes';
import notificationsRoutes from './routes/notifications.routes';
import settingsRoutes from './routes/settings.routes';
import importRoutes from './routes/import.routes';
import approvalRoutes from './routes/approval.routes';
import reportsRoutes from './routes/reports.routes';
import aiRoutes from './routes/ai.routes';
import rndRoutes from './routes/rnd.routes';
import { projectRoutes } from './routes/project.routes';
import prospectsRoutes from './routes/prospects.routes';
import notesRoutes from './routes/notes.routes';
import inboxRoutes from './routes/inbox.routes';
import ppicRoutes from './routes/ppic.routes';
import webauthnRoutes from './routes/webauthn.routes';
import documentsRoutes from './routes/documents.routes';
import materialRequestRoutes from './routes/material-request.routes';
import assetRoutes from './routes/asset.routes';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());

// CORS: dulu `cors()` polos, artinya origin mana pun boleh memanggil API.
// Daftar origin diambil dari CORS_ORIGINS (dipisah koma) supaya bisa beda
// antara dev dan produksi tanpa mengubah kode.
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
const defaultOrigins = process.env.NODE_ENV === 'production'
  ? ['https://blackboxs.io']
  : ['http://localhost:5173', 'http://localhost:3005'];
const allowedOrigins = corsOrigins.length ? corsOrigins : defaultOrigins;

app.use(cors({
  origin: (origin, callback) => {
    // Tanpa Origin = permintaan non-browser (curl, health check, app mobile native)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin tidak diizinkan: ${origin}`));
  },
  credentials: true,
}));

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting — jalur autentikasi jadi sasaran utama brute force.
// Login mobile hanya butuh NIK, jadi tanpa throttling seluruh rentang NIK
// bisa disapu dalam hitungan menit.
// Batas ketat di produksi; di dev dilonggarkan supaya test suite tidak
// terblokir sendiri. Bisa ditimpa lewat AUTH_RATE_LIMIT_MAX.
const authLimitMax = Number(process.env.AUTH_RATE_LIMIT_MAX)
  || (process.env.NODE_ENV === 'production' ? 20 : 500);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: authLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' },
});
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan, coba lagi sebentar lagi.' },
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/hr/mobile/login', authLimiter);
app.use('/api/webauthn/auth', authLimiter);
app.use('/api', generalLimiter);

// Routes
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', message: 'ERP API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/bom', bomRoutes);
app.use('/api/workorders', workOrderRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/procurement', procurementRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/quality', qualityRoutes);
app.use('/api/qc', qcRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/simulate', simulationRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/estimator', estimatorRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/product-types', productTypeRoutes);
app.use('/api/item-types', itemTypeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/import', importRoutes);
app.use('/api/approval', approvalRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/rnd', rndRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/prospects', prospectsRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/ppic', ppicRoutes);
app.use('/api/webauthn', webauthnRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/material-requests', materialRequestRoutes);
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT as number, '0.0.0.0', () => {
      console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Trigger restart
export default app;

