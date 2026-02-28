// server.js
import "./config/env.js";
import express from "express";
import { createServer } from 'http';
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcrypt";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import cookieParser from 'cookie-parser';
import JobApplication from './models/JobApplication.js';
import Admin from './models/Admin.js';
import AuditLog from './models/AuditLog.js';
import activityRouter from './routes/activity.js';
import chatRoutes from "./routes/chat.js";
import { verifyEmailConnection } from "./services/emailService.js";
import uiAuditRoutes from "./routes/uiAudit.js";
import DemoRequest from './models/DemoRequest.js';
import { initWebSocket, getWebSocketService } from './services/websocket.js';
import authRoutes from './routes/auth.js';
import usersRouter from './routes/users.js';
import demoRequestsRouter from './routes/demoRequests.js';
import auditLogsRouter from './routes/auditLogs.js';
import jobApplicationsRoutes from "./routes/jobApplications.js";
import businessLeadsRouter from './routes/businessLeads.js';
import activityRoutes from './routes/activity.js';

// HR-dashboard Employee
import employeesRoute from "./routes/employees.js";
import leavesRoute from "./routes/leaves.js";



const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://dmatorixit:atorixitsaperp@cluster0.anmzzu9.mongodb.net/atorix?retryWrites=true&w=majority&appName=Cluster0';

if (!MONGODB_URI) {
  console.error("ERROR: MONGODB_URI environment variable not set.");
  process.exit(1);
}

// --- EXPRESS + HTTP SERVER ---
const app = express();
const server = createServer(app);

// --- WEBSOCKET ---
initWebSocket(server);

// --- CORS ---
const allowedOrigins = [
  'http://localhost:3000',
  'https://atorix-backend-server.onrender.com',
  'http://localhost:5000',
  'http://localhost:3001',
  'atorix-it-main-frontend.vercel.app',
  'https://www.atorixit.com',
  "https://atorix-frontend.vercel.app"
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV === 'development' || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'cache-control'],
  exposedHeaders: ['Content-Disposition'],
  credentials: true,
  optionsSuccessStatus: 200,
  preflightContinue: false,
  maxAge: 86400,
};
app.use('/api/activity', activityRoutes);
// --- MIDDLEWARE ---
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/api/activity', activityRouter);
app.use("/api/chat", chatRoutes);

app.set('trust proxy', 1);
app.use('/api/activity', activityRoutes);

const HiringLeadSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
  phone: { type: String, required: true },
  position: { type: String, required: true },
  experience: { type: String },
  skills: [{ type: String }],
  status: {
    type: String,
    enum: ['new', 'reviewed', 'contacted', 'interviewed', 'hired', 'rejected'],
    default: 'new'
  },
  resume: { type: String },
  source: { type: String, default: 'website' },
  notes: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

HiringLeadSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

mongoose.models = mongoose.models || {};
if (!mongoose.models.HiringLead) {
  mongoose.model('HiringLead', HiringLeadSchema);
}

const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(`✓ MongoDB connected to: ${mongoose.connection.db.databaseName}`);

    if (!mongoose.models.DemoRequest) {
      mongoose.model('DemoRequest', DemoRequestSchema);
    }
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);

    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

connectDB();

// --- ROUTES ---
app.get('/', (req, res) => {
  res.json({
    message: 'Atorix IT Backend API',
    status: 'running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      demoRequests: '/api/demo-requests',
      admin: '/api/admin',
      users: '/api/users',
      auditLogs: '/api/audit-logs',
      jobApplications: '/api/job-applications',
      hiringLeads: '/api/hiring-leads'
    }
  });
});

app.use('/api/activity', activityRouter);
app.use('/api/demo-requests', demoRequestsRouter);
app.use('/api/admin', authRoutes);
app.use('/api/users', usersRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use("/api/employees", employeesRoute);
app.use("/api/leaves", leavesRoute);
app.use('/api/business-leads', businessLeadsRouter);
app.use("/api/job-applications", jobApplicationsRoutes);
app.use("/api/audit-logs", uiAuditRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.get('/api/ping', (req, res) => {
  res.status(200).json({ message: 'pong' });
});

app.get('/api/dev/audit-test', async (req, res) => {
  try {
    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- CONTACT FORM /api/submit ---
app.post('/api/submit', async (req, res) => {
  try {
    const { name, email, phone, company, role, interestedIn, message } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name, Email, and Phone are required.',
      });
    }

    const demoRequest = new DemoRequest({
      name,
      email,
      phone,
      company: company || 'N/A',
      role: role || 'Website Visitor',
      interests: Array.isArray(interestedIn) ? interestedIn : [interestedIn].filter(Boolean),
      message: message || 'No message provided',
      source: 'demo_requests',
      status: 'new',
      metadata: {
        priority: 'medium',
        submittedAt: new Date(),
      },
    });

    const savedRequest = await demoRequest.save();

    const wsService = getWebSocketService();
    if (wsService) {
      wsService.broadcastNewDemoRequest(savedRequest);
    }

    res.status(201).json({
      success: true,
      message: 'Demo request submitted successfully!',
      data: savedRequest,
    });
  } catch (error) {
    console.error('Error submitting demo request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit demo request',
      error: error.message,
    });
  }
});

// --- DEFAULT ADMIN SEED ---
async function initializeAdmin() {
  try {
    if (await Admin.countDocuments() === 0) {
      const hashedPassword = await bcrypt.hash('Noopur123', 10);
      await new Admin({ username: 'Noopur', password: hashedPassword }).save();
      console.log('✓ Default admin user created.');
    }
  } catch (error) {
    console.error('Admin init error:', error);
  }
}
initializeAdmin();

// --- GET HIRING LEADS COUNT ---
app.get('/api/hiring-leads/count', async (req, res) => {
  try {
    const count = await JobApplication.countDocuments();
    res.json({ success: true, count });
  } catch (error) {
    console.error('Error counting hiring leads:', error);
    res.status(500).json({ success: false, message: 'Error counting hiring leads', error: error.message });
  }
});

{/*
// --- GET DEMO REQUESTS ---
app.get('/api/demo-requests', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ success: false, message: 'Database connection error', data: [] });
    }

    let requests = [];
    try {
      if (global.DemoRequestLeads) {
        requests = await global.DemoRequestLeads.find().sort({ createdAt: -1 }).limit(50).lean();
      } else {
        const DemoRequestMain = mongoose.models.DemoRequest || mongoose.model('DemoRequest', DemoRequestSchema);
        requests = await DemoRequestMain.find().sort({ createdAt: -1 }).limit(50).lean();
      }
      return res.json({ success: true, count: requests.length, data: requests });
    } catch (dbError) {
      console.error('Database query error:', dbError);
      return res.status(500).json({ success: false, message: 'Database query error', error: dbError.message, data: [] });
    }
  } catch (error) {
    console.error('Error in /api/demo-requests:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching demo requests', error: error.message, data: [] });
  }
});
*/}

// --- POST NEW HIRING LEAD ---
app.post('/api/hiring-leads', async (req, res) => {
  try {
    const { name, email, phone, position, experience, skills, notes } = req.body;

    const hiringLead = new (mongoose.models.HiringLead)({
      name,
      email,
      phone,
      position,
      experience,
      skills: Array.isArray(skills) ? skills : (skills ? skills.split(',').map(s => s.trim()) : []),
      notes,
      status: 'new',
      source: req.body.source || 'website',
      resume: req.file ? `/uploads/${req.file.filename}` : null
    });

    await hiringLead.save();

    const wss = getWebSocketService();
    if (wss && wss.notifyNewHiringLead) {
      wss.notifyNewHiringLead(hiringLead);
    }

    res.status(201).json({ success: true, message: 'Hiring lead submitted successfully', data: hiringLead });
  } catch (error) {
    console.error('Error saving hiring lead:', error);
    res.status(500).json({ success: false, message: 'Failed to save hiring lead', error: error.message });
  }
});

// --- GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  if (err.name === 'MulterError') {
    return res.status(400).json({ success: false, message: `File upload error: ${err.message}` });
  }
  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

// --- 404 Handler ---
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found', path: req.path });
});

// --- START SERVER ---
const PORT = process.env.PORT || 5001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 MongoDB: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
  verifyEmailConnection();
});