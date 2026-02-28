import express from "express";
import Leave from "../models/Leave.js";
import Employee from "../models/Employee.js";
import { sendLeaveApprovalMail } from "../services/mailService.js";


const router = express.Router();

//////////////////////////////////////////////////////
// CREATE LEAVE
//////////////////////////////////////////////////////
router.post("/", async (req, res) => {
  try {
    const {
      employeeId,
      leaveType,
      from,
      to,
      status,
      customMessage,
      messageType,
    } = req.body;

    // 🔎 Validate employee
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // ✅ Create Leave
    const leave = new Leave({
      employeeId,
      leaveType,
      from,
      to,
      status: status || "Approved",
      messageType: messageType || "auto",
      customMessage:
        messageType === "custom" ? customMessage : "",
    });

    const savedLeave = await leave.save();

    // ✅ Send Mail if Approved
    if (savedLeave.status === "Approved") {
      await sendLeaveApprovalMail(employee, savedLeave);
    }

    res.status(201).json({
      success: true,
      message: "Leave created successfully",
      data: savedLeave,
    });
  } catch (error) {
    console.error("CREATE LEAVE ERROR:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

//////////////////////////////////////////////////////
// GET ALL LEAVES
//////////////////////////////////////////////////////
router.get("/", async (req, res) => {
  try {
    const leaves = await Leave.find()
      .populate("employeeId", "name email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      items: leaves,
    });
  } catch (error) {
    console.error("FETCH LEAVE ERROR:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

//////////////////////////////////////////////////////
// GET SINGLE LEAVE
//////////////////////////////////////////////////////
router.get("/:id", async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id)
      .populate("employeeId", "name email");

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave not found",
      });
    }

    res.json({
      success: true,
      data: leave,
    });
  } catch (error) {
    console.error("FETCH SINGLE ERROR:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

//////////////////////////////////////////////////////
// UPDATE LEAVE
//////////////////////////////////////////////////////
router.put("/:id", async (req, res) => {
  try {
    const {
      leaveType,
      from,
      to,
      status,
      customMessage,
      messageType,
    } = req.body;

    const leave = await Leave.findById(req.params.id)
      .populate("employeeId");

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave not found",
      });
    }

    // ✅ Update fields
    leave.leaveType = leaveType;
    leave.from = from;
    leave.to = to;
    leave.status = status;

    leave.messageType = messageType || "auto";
    leave.customMessage =
      messageType === "custom" ? customMessage : "";

    const updatedLeave = await leave.save();

    // ✅ Send mail if Approved
    if (updatedLeave.status === "Approved") {
      await sendLeaveApprovalMail(
        updatedLeave.employeeId,
        updatedLeave
      );
    }

    res.json({
      success: true,
      message: "Leave updated successfully",
      item: updatedLeave,
    });
  } catch (error) {
    console.error("UPDATE ERROR:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

//////////////////////////////////////////////////////
// DELETE LEAVE
//////////////////////////////////////////////////////
router.delete("/:id", async (req, res) => {
  try {
    const leave = await Leave.findByIdAndDelete(req.params.id);

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave not found",
      });
    }

    res.json({
      success: true,
      message: "Leave deleted successfully",
    });
  } catch (error) {
    console.error("DELETE ERROR:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
