import express from "express";
import { logAction } from "../utils/auditLogger.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

/*
  Logs frontend-only UI actions
*/
router.post("/ui", authenticate, async (req, res) => {
  try {
    const { action, target, details } = req.body;

    if (!action) {
      return res.status(400).json({
        success: false,
        message: "Action is required"
      });
    }

    await logAction(
      req,
      action,
      target || "UI",
      details || {}
    );

    res.json({ success: true });

  } catch (err) {
    console.error("UI Audit Error:", err);

    res.status(500).json({
      success: false,
      message: "Failed to log UI action"
    });
  }
});

export default router;
