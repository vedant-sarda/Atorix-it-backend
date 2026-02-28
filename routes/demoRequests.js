import express from "express";
import mongoose from "mongoose";
import DemoRequest from "../models/DemoRequest.js";
import Lead from "../models/lead.js";
import { logAction } from "../utils/auditLogger.js";
import { authenticate } from "../middleware/auth.js";

import {
  notifyDemoRequest,
  notifyCustomerAccepted,
  notifyCustomerTermination
} from "../services/notificationService.js";

const router = express.Router();

/* =========================================================
   CREATE
========================================================= */
router.post("/", async (req, res) => {
  try {
    const required = ["name", "email", "phone", "company", "role"];

    const missing = required.filter(f => !req.body[f]);

    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing: ${missing.join(", ")}`
      });
    }

    const {
      name,
      email,
      company,
      phone,
      role,
      message,
      interests,
      status = "new"
    } = req.body;

    const existing = await DemoRequest.findOne({
      $or: [
        { email: email.toLowerCase().trim() },
        { phone: phone.trim() }
      ]
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Email or Phone already exists"
      });
    }

    const demoRequest = new DemoRequest({
      name,
      email: email.toLowerCase().trim(),
      company,
      phone: phone.trim(),
      role,
      message: message || "",
      interests: interests || [],
      status,
      source: "manual",
      metadata: {
        priority: "medium",
        submittedAt: new Date()
      }
    });

    await demoRequest.save();

    await notifyDemoRequest(demoRequest);

    await logAction(req, "CREATE_CUSTOMER_MANUAL", "DemoRequest", {
      id: demoRequest._id,
      email: demoRequest.email,
      status
    });

    res.status(201).json({
      success: true,
      data: demoRequest
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Create failed"
    });
  }
});

/* =========================================================
   GET
========================================================= */
// GET WITH PAGINATION
router.get("/", authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;

    const skip = (page - 1) * limit;

    const total = await DemoRequest.countDocuments();

    const data = await DemoRequest.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    await logAction(req, "VIEW_ALL_CUSTOMERS", "DemoRequest", {
      count: data.length,
      page,
    });

    res.json({
      success: true,
      data,
      page,
      totalPages,
      total
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

/* =========================================================
   UPDATE / STATUS
========================================================= */
router.patch("/:id", authenticate, async (req, res) => {
  try {

    const { id } = req.params;
    const { status, ...rest } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const old = await DemoRequest.findById(id);

    if (!old) {
      return res.status(404).json({ message: "Not found" });
    }

    const updated = await DemoRequest.findByIdAndUpdate(
      id,
      {
        ...rest,
        ...(status && { status }),
        updatedAt: new Date()
      },
      { new: true }
    );

    /* =====================================================
       AUTO SYNC TO LEADS (FIXED LOCATION)
    ===================================================== */

    const activeStatuses = [
      "contacted",
      "reviewed",
      "scheduled",
      "completed",
      "hired",
      "cancelled"
    ];
    
    if (activeStatuses.includes(updated.status)) {
    
      const existing = await Lead.findOne({
        email: updated.email
      });
    
      if (!existing) {
      
        await Lead.create({
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
          company: updated.company,
          role: updated.role,
          interests: updated.interests,
          message: updated.message,
          source: "demo_request",
          status: updated.status,
          metadata: {
            syncedFrom: "demo"
          }
        });
      
      } else {
      
        existing.status = updated.status;
        await existing.save();
      }
    }
    /* =====================================================
       LOGGING & NOTIFICATIONS
    ===================================================== */

    if (status && old.status !== status) {

      await logAction(req, "UPDATE_CUSTOMER_STATUS", "DemoRequest", {
        id,
        oldStatus: old.status,
        newStatus: status
      });

      if (["contacted", "hired"].includes(status)) {

        await notifyCustomerAccepted(updated);

        await logAction(req, "SEND_CUSTOMER_ACCEPTANCE", "Notification", {
          id,
          email: updated.email,
          status
        });
      }
    }

    await logAction(req, "UPDATE_CUSTOMER", "DemoRequest", { id });

    res.json({
      success: true,
      data: updated
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Update failed"
    });
  }
});

/* =========================================================
   DELETE (TERMINATION)
========================================================= */
router.delete("/:id", authenticate, async (req, res) => {
  try {

    const customer = await DemoRequest.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({ message: "Not found" });
    }

    /* Send termination notice BEFORE delete */
    await notifyCustomerTermination(customer);

    await DemoRequest.findByIdAndDelete(req.params.id);

    await logAction(req, "DELETE_CUSTOMER", "DemoRequest", {
      id: customer._id,
      email: customer.email
    });

    await logAction(req, "SEND_TERMINATION_NOTICE", "Notification", {
      id: customer._id,
      email: customer.email
    });

    res.json({ success: true });

  } catch (err) {
    console.error(err);

    res.status(500).json({ success: false });
  }
});

/* =========================================================
   VIEW
========================================================= */
router.post("/:id/view", authenticate, async (req, res) => {
  try {

    const item = await DemoRequest.findById(req.params.id);

    if (!item) return res.status(404).json({ message: "Not found" });

    await logAction(req, "VIEW_CUSTOMER", "DemoRequest", {
      id: item._id,
      email: item.email
    });

    res.json({ success: true, data: item });

  } catch {
    res.status(500).json({ success: false });
  }
});
// GET ALL (for analytics)
router.get("/all/raw", authenticate, async (req, res) => {
  try {
    const data = await DemoRequest.find().select("status");

    res.json({
      success: true,
      data
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

router.get('/interests/raw', authenticate, async (req, res) => {
  try {
    const data = await DemoRequest.find().select('interests').lean();

    res.json({
      success: true,
      data
    });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

export default router;
