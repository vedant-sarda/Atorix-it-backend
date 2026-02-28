// backend/routes/auditLogs.js
import express from 'express';
import { authenticate } from '../middleware/auth.js';
import AuditLog from '../models/AuditLog.js';

const router = express.Router();

/**
 * Helper: ignore empty / invalid filters
 */
const clean = (v) => {
  return v !== undefined && v !== null && v !== '' && v !== 'undefined';
};


// =====================================================
// GET AUDIT LOGS (FIXED & SAFE)
// =====================================================
router.get('/', authenticate, async (req, res) => {
  try {

    // Only super admin
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Admin access required'
      });
    }

    const {
      page = 1,
      limit = 15,
      search = '',
      startDate,
      endDate,
      action,
      user,
      type = 'all' // audit | login | all
    } = req.query;

    const parsedLimit = parseInt(limit, 10) || 15;
    const currentPage = Math.max(parseInt(page, 10), 1);
    const skip = (currentPage - 1) * parsedLimit;

    const query = {};

    // =================================================
    // TAB FILTER (LOGIN / AUDIT / ALL)
    // =================================================

    if (type === 'login') {
      query.action = {
        $in: ['LOGIN', 'LOGOUT', 'FAILED_LOGIN']
      };
    }

    if (type === 'audit') {
      query.action = {
        $nin: ['LOGIN', 'LOGOUT', 'FAILED_LOGIN']
      };
    }

    // type=all → no action filter


    // =================================================
    // SEARCH
    // =================================================

    if (clean(search)) {
      query.$or = [
        { userEmail: { $regex: search, $options: 'i' } },
        { action: { $regex: search, $options: 'i' } },
        { target: { $regex: search, $options: 'i' } }
      ];
    }


    // =================================================
    // DATE FILTER
    // =================================================

    if (clean(startDate) || clean(endDate)) {

      query.createdAt = {};

      if (clean(startDate)) {
        query.createdAt.$gte = new Date(startDate);
      }

      if (clean(endDate)) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        query.createdAt.$lte = end;
      }
    }


    // =================================================
    // ACTION FILTER (FIXED - NO MERGE BUG)
    // =================================================

    if (clean(action) && action !== 'all') {

      // Always override safely
      query.action = action;
    }


    // =================================================
    // USER FILTER
    // =================================================

    if (clean(user) && user !== 'all') {
      query.userEmail = user;
    }


    // =================================================
    // QUERY DB
    // =================================================

    const [logs, total] = await Promise.all([

      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),

      AuditLog.countDocuments(query)

    ]);


    // =================================================
    // RESPONSE
    // =================================================

    res.json({
      success: true,
      count: logs.length,
      total,
      page: currentPage,
      pageSize: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit),
      data: logs
    });

  } catch (error) {

    console.error('Error fetching audit logs:', error);

    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});



// =====================================================
// EXPORT CSV (UNCHANGED, SAFE)
// =====================================================
router.get('/export', authenticate, async (req, res) => {
  try {

    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Admin access required'
      });
    }

    const {
      search = '',
      startDate,
      endDate,
      action,
      user
    } = req.query;

    const query = {};


    // SEARCH
    if (clean(search)) {
      query.$or = [
        { userEmail: { $regex: search, $options: 'i' } },
        { action: { $regex: search, $options: 'i' } },
        { target: { $regex: search, $options: 'i' } }
      ];
    }


    // DATE
    if (clean(startDate) || clean(endDate)) {

      query.createdAt = {};

      if (clean(startDate)) {
        query.createdAt.$gte = new Date(startDate);
      }

      if (clean(endDate)) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        query.createdAt.$lte = end;
      }
    }


    // ACTION
    if (clean(action) && action !== 'all') {
      query.action = action;
    }


    // USER
    if (clean(user) && user !== 'all') {
      query.userEmail = user;
    }


    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .lean();


    // CSV HEADER
    const header =
      'Timestamp,User Email,Role,Action,Target,Details\n';


    const csv = logs.map(log => {

      const details =
        typeof log.details === 'object'
          ? JSON.stringify(log.details).replace(/"/g, '""')
          : log.details;

      return `"${log.createdAt}","${log.userEmail}","${log.role}","${log.action}","${log.target}","${details}"`;

    }).join('\n');


    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=audit-logs.csv'
    );

    res.send(header + csv);

  } catch (error) {

    console.error('Export error:', error);

    res.status(500).json({
      success: false,
      message: 'Export failed'
    });
  }
});



// =====================================================
// MANUAL LOG CREATOR (INTERNAL)
// =====================================================
export const createAuditLog = async (logData) => {
  try {
    const log = new AuditLog(logData);
    await log.save();
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
};


export default router;
