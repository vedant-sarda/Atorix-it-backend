const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");

const Lead = require("../models/lead");
const DemoRequest = require("../models/DemoRequest");
const JobApplication = require("../models/JobApplication");
const AuditLog = require("../models/AuditLog");

const { logAction } = require("../utils/auditLogger");

/* ----------------------------------------
   Helper: Get Date Range
----------------------------------------- */

function getStartDate(range) {
  const now = new Date();

  if (range === "week") {
    return new Date(now.setDate(now.getDate() - 7));
  }

  if (range === "year") {
    return new Date(now.setFullYear(now.getFullYear() - 1));
  }

  // default = month
  return new Date(now.setMonth(now.getMonth() - 1));
}

/* ========================================
   1. Lead Status Distribution
======================================== */

router.get("/leads-status",  async (req, res) => {
  try {
    const range = req.query.range || "month";
    const startDate = getStartDate(range);

    const data = await Lead.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ========================================
   2. Lead Source Distribution
======================================== */

router.get("/leads-source", authenticate, async (req, res) => {
  try {
    const range = req.query.range || "month";
    const startDate = getStartDate(range);

    const data = await Lead.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $lookup: {
          from: "users",
          localField: "assignedTo",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            source: "$source",
            user: "$user.name"
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.source",
          total: { $sum: "$count" },
          users: {
            $push: {
              name: "$_id.user",
              count: "$count"
            }
          }
        }
      },
      { $sort: { total: -1 } }
    ]);

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
/* ========================================
   3. Job Position Analytics
======================================== */

router.get("/job-positions",  async (req, res) => {
  try {
    const range = req.query.range || "month";
    const startDate = getStartDate(range);

    const data = await JobApplication.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: "$position",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ========================================
   4. Demo Interest Demand
======================================== */

router.get("/demo-interests",  async (req, res) => {
  try {
    const range = req.query.range || "month";
    const startDate = getStartDate(range);

    const data = await DemoRequest.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $unwind: "$interests" },
      {
        $group: {
          _id: "$interests",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ========================================
   5. Recent Admin Activity
======================================== */

router.get("/recent-activity", async (req, res) => {
  try {
    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(10);

    const formatted = logs.map((log) => ({
      action: log.action,
      target: log.target,
      user: log.details?.performedBy?.name || log.userEmail,
      role: log.role,
      createdAt: log.createdAt,
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ========================================
   6. Log Analytics Interaction
======================================== */

router.post("/log", async (req, res) => {
  try {
    const { action } = req.body;

    await logAction(
      req,
      action,
      "Analytics Dashboard"
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;