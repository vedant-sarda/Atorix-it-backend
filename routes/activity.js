import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { logAction } from '../utils/auditLogger.js';
import AuditLog from '../models/AuditLog.js';

const router = express.Router();

router.post('/page-visit', authenticate, async (req, res) => {
  try {
    const page = req.body?.page;

    if (!page) {
      return res.status(400).json({
        success: false,
        message: 'Page is required'
      });
    }

    await logAction(req, 'PAGE_VISIT', 'DASHBOARD', {
      page,
    });

    res.json({ success: true });

  } catch (err) {
    console.error('Activity log error:', err);

    res.status(500).json({
      success: false,
      message: 'Failed to log activity'
    });
  }
});

router.get('/recent', authenticate, async (req, res) => {
  try {

    const logs = await AuditLog.find({
      userEmail: { $ne: "SYSTEM" },   // ✅ Exclude system logs
      role: { $ne: "system" }         // extra safety
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({
      success: true,
      data: logs
    });

  } catch (err) {
    console.error('Recent activity fetch error:', err);
    res.status(500).json({ success: false });
  }
});

export default router;