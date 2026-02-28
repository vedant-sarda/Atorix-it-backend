import express from "express";
import mongoose from "mongoose";
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import nodemailer from 'nodemailer';

import { logAction } from '../utils/auditLogger.js';
import  { authenticate }  from '../middleware/auth.js';
// HR-dashboard
import Employee from "../models/Employee.js";
import JobApplication from "../models/JobApplication.js";
import Lead from "../models/lead.js";
import { notifyJobApplication } from "../services/notificationService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

//router.use(authenticate);

// ─── Cloudinary Configuration ─────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── MULTER – store file in memory ───────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, and DOCX files are allowed.'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ─── Cloudinary Helpers ───────────────────────────────────────────────────────

/**
 * Upload a file buffer to Cloudinary.
 * Returns { publicId, secureUrl } on success.
 */
const uploadToCloudinary = async (file) => {
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  const uniqueName = `resume-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  // Write buffer to a real temp file so Cloudinary gets a clean binary stream
  const tmpPath = path.join(os.tmpdir(), `${uniqueName}.${ext}`);

  try {
    fs.writeFileSync(tmpPath, file.buffer);
    console.log('Temp file written:', tmpPath, 'size:', fs.statSync(tmpPath).size);

    const result = await cloudinary.uploader.upload(tmpPath, {
      resource_type: 'raw',
      folder: 'resumes',
      public_id: `${uniqueName}.${ext}`,
      type: 'upload',
      use_filename: false,
      overwrite: false,
    });

    return {
      publicId:  result.public_id,
      secureUrl: result.secure_url,
    };
  } finally {
    // Always clean up temp file
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
};

/**
 * Delete a file from Cloudinary by its publicId.
 */
const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    console.log('Resume deleted from Cloudinary:', publicId);
  } catch (err) {
    console.error('Error deleting file from Cloudinary:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendEmailWithAttachment(to, { subject, text, html, attachments }) {
  const mailOptions = {
    from: process.env.EMAIL_USER || 'no-reply@atorix.com',
    to,
    subject,
    text,
    html,
    attachments: attachments || []
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email notification sent successfully');
  } catch (error) {
    console.error('Failed to send email notification:', error);
  }
}

console.log("✓ Models imported successfully");

// Request logging
router.use((req, res, next) => {
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// POST - Create job application
router.post("/", upload.single("resume"), async (req, res) => {
  console.log("\n=== POST /job-applications ===");
  console.log("Request body:", req.body);
  console.log("File uploaded:", req.file ? req.file.originalname : 'No file');
  if (req.file) {
    console.log('File name:', req.file.originalname);
    console.log('File size:', req.file.size);
    console.log('MIME type:', req.file.mimetype);
  }
  console.log('=================\n');

  if (!req.body) {
    return res.status(400).json({ success: false, message: 'Request body is required' });
  }

  let cloudinaryPublicId = null;

  try {
    if (!JobApplication) {
      throw new Error("JobApplication model not initialized");
    }

    if (mongoose.connection.readyState !== 1) {
      throw new Error(`Database not connected. State: ${mongoose.connection.readyState}`);
    }

    const requiredFields = [
      { field: 'fullName', message: 'Full name is required' },
      { field: 'email',    message: 'Email is required' },
      { field: 'phone',    message: 'Phone number is required' },
      { field: 'position', message: 'Position is required' }
    ];

    const validationErrors = requiredFields
      .filter(({ field }) => !req.body[field]?.trim())
      .map(({ message }) => message);

    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (req.body.email && !emailRegex.test(req.body.email)) {
      validationErrors.push('Please enter a valid email address');
    }

    if (!req.file) {
      validationErrors.push('Resume is required. Please upload your resume.');
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors,
      });
    }

    const existingEmail = await JobApplication.findOne({
      email: req.body.email.toLowerCase().trim()
    });

    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: 'Email already exists',
        field: 'email',
      });
    }

    const existingPhone = await JobApplication.findOne({
      phone: req.body.phone.trim()
    });

    if (existingPhone) {
      return res.status(409).json({
        success: false,
        message: 'Phone number already exists',
        field: 'phone'
      });
    }

    // ── Upload resume to Cloudinary ──────────────────────────────────────────
    const cloudinaryResult = await uploadToCloudinary(req.file);
    cloudinaryPublicId = cloudinaryResult.publicId;
    const resumeUrl = cloudinaryResult.secureUrl;
    console.log('Resume uploaded to Cloudinary. Public ID:', cloudinaryPublicId);
    console.log('Resume URL stored:', resumeUrl);

    // ── Save application ─────────────────────────────────────────────────────
    const application = new JobApplication({
      fullName:        req.body.fullName.trim(),
      email:           req.body.email.toLowerCase().trim(),
      phone:           req.body.phone.trim(),
      position:        req.body.position.trim(),
      experience:      req.body.experience?.trim()      || '',
      currentCompany:  req.body.currentCompany?.trim()  || '',
      expectedSalary:  req.body.expectedSalary?.trim()  || '',
      noticePeriod:    req.body.noticePeriod?.trim()    || '',
      coverLetter:     req.body.coverLetter?.trim()     || '',
      source:          req.body.source || 'Career Portal',
      resumePath:      resumeUrl,          // Cloudinary secure URL
      resumeFileId:    cloudinaryPublicId, // Cloudinary public_id – used for deletion
      status:          'applied',
    });

    await application.save();
    await notifyJobApplication(application);

    await logAction(req, 'CREATE_JOB_APPLICATION', 'JobApplication', {
      applicationId: application._id,
      email: application.email,
      position: application.position
    });

    console.log("Job application saved to database");

    try {
      if (Lead) {
        const lead = new Lead({
          name:    req.body.fullName.trim(),
          email:   req.body.email.toLowerCase().trim(),
          phone:   req.body.phone.trim(),
          company: req.body.currentCompany?.trim() || '',
          role:    req.body.position.trim(),
          source:  'job_application',
          status:  'New Application',
          type:    'Job Application'
        });
        await lead.save();
      }
    } catch (leadError) {
      console.error("Error creating lead entry:", leadError);
    }

    res.status(201).json({
      success: true,
      message: "Application submitted successfully.",
      data: {
        id:          application._id,
        name:        application.fullName,
        email:       application.email,
        position:    application.position,
        submittedAt: application.createdAt
      }
    });

  } catch (error) {
    console.error("ERROR:", error);
    if (cloudinaryPublicId) {
      await deleteFromCloudinary(cloudinaryPublicId);
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - Fetch all job applications
router.get("/", async (req, res) => {
  console.log("GET /job-applications - Fetching applications");

  try {
    const page     = parseInt(req.query.page)     || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const search   = req.query.search             || '';
    const skip     = (page - 1) * pageSize;

    let query = {};
    if (search.trim()) {
      query = {
        $or: [
          { fullName: { $regex: search, $options: 'i' } },
          { email:    { $regex: search, $options: 'i' } },
          { position: { $regex: search, $options: 'i' } },
        ]
      };
    }

    const [total, applications] = await Promise.all([
      JobApplication.countDocuments(query),
      JobApplication.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean()
    ]);

    const totalPages = Math.ceil(total / pageSize);

    res.status(200).json({
      success: true,
      items: applications,
      total,
      totalPages,
      page,
      pageSize,
      hasMore: page < totalPages
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch applications",
      error: error.message
    });
  }
});

// PATCH - Update status (with auto employee creation on hired)
router.patch("/:id", async (req, res) => {
  try {
    const oldCandidate = await JobApplication.findById(req.params.id);

    if (!oldCandidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate not found",
      });
    }

    const updatedCandidate = await JobApplication.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    const oldStatus = oldCandidate.status?.trim().toLowerCase();
    const newStatus = updatedCandidate.status?.trim().toLowerCase();

    console.log("OLD STATUS:", oldStatus);
    console.log("NEW STATUS:", newStatus);

    // 🔥 Create employee when status changes to hired
    if (oldStatus !== "hired" && newStatus === "hired") {
      const exists = await Employee.findOne({
        email: updatedCandidate.email.toLowerCase().trim(),
      });

      if (!exists) {
        const employee = await Employee.create({
          name:        updatedCandidate.fullName?.trim(),
          email:       updatedCandidate.email?.toLowerCase().trim(),
          phone:       updatedCandidate.phone?.trim() || "",
          position:    updatedCandidate.position?.trim() || "Not Assigned",
          department:  "General",
          joinedAt:    new Date(),
          candidateId: updatedCandidate._id,
          resume:      updatedCandidate.resumePath || "",
        });
        console.log("✅ Employee created:", employee._id);
      }
    }

    res.json({
      success: true,
      item: updatedCandidate,
    });

  } catch (error) {
    console.error("PATCH ERROR:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// PUT - Full update
router.put("/:id", async (req, res) => {
  try {
    const updatedCandidate = await JobApplication.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!updatedCandidate) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    if (updatedCandidate.status === "hired") {
      const exists = await Employee.findOne({ email: updatedCandidate.email });

      if (!exists) {
        await Employee.create({
          name:       updatedCandidate.fullName,
          email:      updatedCandidate.email,
          position:   updatedCandidate.position,
          department: "General",
          joinedAt:   new Date(),
        });
      }
    }

    res.json({
      success: true,
      item: updatedCandidate,
    });

  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// DELETE - Delete job application and linked employee
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("Deleting candidate ID:", id);

    // 1️⃣ Delete employee linked to this candidate
    const deletedEmployee = await Employee.findOneAndDelete({ candidateId: id });
    if (deletedEmployee) {
      console.log("✅ Linked employee deleted:", deletedEmployee._id);
    } else {
      console.log("⚠️ No linked employee found");
    }

    // 2️⃣ Delete candidate
    const deletedCandidate = await JobApplication.findByIdAndDelete(id);

    if (!deletedCandidate) {
      return res.status(404).json({
        success: false,
        message: "Job application not found",
      });
    }

    console.log("✅ Candidate deleted:", deletedCandidate._id);

    // ✅ AUDIT
    await logAction(req, 'DELETE_JOB_APPLICATION', 'JobApplication', {
      applicationId: deletedCandidate._id,
      email:         deletedCandidate.email,
      position:      deletedCandidate.position
    });

    // 3️⃣ Delete resume from Cloudinary
    if (deletedCandidate.resumeFileId) {
      await deleteFromCloudinary(deletedCandidate.resumeFileId);
    }

    res.json({
      success: true,
      message: "Candidate & Employee deleted successfully",
    });

  } catch (error) {
    console.error("DELETE ERROR:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// VIEW single job application
router.post("/:id/view", async (req, res) => {
  try {
    const app = await JobApplication.findById(req.params.id);

    if (!app) {
      return res.status(404).json({ message: "Not found" });
    }

    await logAction(req, 'VIEW_JOB_APPLICATION', 'JobApplication', {
      applicationId: app._id,
      email:         app.email
    });

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// GET - Resume proxy: fetches PDF from Cloudinary and serves it inline
router.get("/resume-proxy", (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ message: 'url param required' });

  const decodedUrl = decodeURIComponent(url);
  console.log('Resume proxy fetching:', decodedUrl);

  // Use built-in https - no extra packages needed
  import('https').then(({ default: https }) => {
    https.get(decodedUrl, (proxyRes) => {
      console.log('Cloudinary response status:', proxyRes.statusCode);

      if (proxyRes.statusCode !== 200) {
        return res.status(proxyRes.statusCode).json({ message: 'Failed to fetch resume', status: proxyRes.statusCode });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="resume.pdf"');
      res.setHeader('Cache-Control', 'no-cache');

      proxyRes.pipe(res);
    }).on('error', (err) => {
      console.error('Resume proxy https error:', err.message);
      res.status(500).json({ message: err.message });
    });
  });
});

export default router;