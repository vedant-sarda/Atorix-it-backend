import express from "express";
import mongoose from "mongoose";
import Employee from "../models/Employee.js";
import multer from "multer";
import path from "path";
import JobApplication from "../models/JobApplication.js";

const router = express.Router();

//////////////////////////////////////////////////////
// MULTER CONFIG
//////////////////////////////////////////////////////

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

//////////////////////////////////////////////////////
// GET ALL EMPLOYEES
//////////////////////////////////////////////////////
router.get("/", async (req, res) => {
  try {
    const employees = await Employee.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      items: employees,
    });
  } catch (error) {
    console.error("Employees Fetch Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

//////////////////////////////////////////////////////
// CREATE EMPLOYEE
//////////////////////////////////////////////////////
router.post("/", async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      position,
      department,
      bankAccountNumber,
      ifscCode,
      panNumber,
      aadhaarNumber,
      address,
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: "Name and Email are required",
      });
    }

    if (panNumber && aadhaarNumber) {
      return res.status(400).json({
        success: false,
        message: "Only PAN or Aadhaar can be added, not both",
      });
    }

    const employee = await Employee.create({
      name,
      email,
      phone: phone || "",
      position: position || "Not Assigned",
      department: department || "General",
      bankAccountNumber: bankAccountNumber || "",
      ifscCode: ifscCode || "",
      panNumber: panNumber || "",
      aadhaarNumber: aadhaarNumber || "",
      address: address || "",
      candidateId: new mongoose.Types.ObjectId(),
      joinedAt: new Date(),
    });

    res.json({
      success: true,
      item: employee,
    });
  } catch (error) {
    console.error("Create Employee Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

//////////////////////////////////////////////////////
// UPDATE EMPLOYEE (FINAL FIXED VERSION)
//////////////////////////////////////////////////////
router.put(
  "/:id",
  upload.fields([
    { name: "profilePhoto", maxCount: 1 },
    { name: "resume", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const employee = await Employee.findById(req.params.id);

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      const {
        name,
        email,
        phone,
        position,
        department,
        joinedAt,
        bankAccountNumber,
        ifscCode,
        panNumber,
        aadhaarNumber,
        address,
      } = req.body;

      // Validation
      if (panNumber && aadhaarNumber) {
        return res.status(400).json({
          success: false,
          message: "Only PAN or Aadhaar can be updated, not both",
        });
      }

      ////////////////////////////////////////////////////////
      // SAFE FIELD UPDATE (NO ?? OPERATOR)
      ////////////////////////////////////////////////////////

      if (name !== undefined) employee.name = name;
      if (email !== undefined) employee.email = email;
      if (phone !== undefined) employee.phone = phone;
      if (position !== undefined) employee.position = position;
      if (department !== undefined) employee.department = department;
      if (joinedAt !== undefined) employee.joinedAt = joinedAt;

      if (bankAccountNumber !== undefined)
        employee.bankAccountNumber = bankAccountNumber;

      if (ifscCode !== undefined)
        employee.ifscCode = ifscCode;

      if (address !== undefined)
        employee.address = address;

      ////////////////////////////////////////////////////////
      // PAN / Aadhaar Logic
      ////////////////////////////////////////////////////////

      if (panNumber) {
        employee.panNumber = panNumber;
        employee.aadhaarNumber = "";
      }

      if (aadhaarNumber) {
        employee.aadhaarNumber = aadhaarNumber;
        employee.panNumber = "";
      }

      ////////////////////////////////////////////////////////
      // FILE UPLOAD HANDLING
      ////////////////////////////////////////////////////////

      if (req.files?.profilePhoto) {
        employee.profilePhoto =
          "/uploads/" + req.files.profilePhoto[0].filename;
      }

      if (req.files?.resume) {
        employee.resume =
          "/uploads/" + req.files.resume[0].filename;
      }

      await employee.save();

      res.json({
        success: true,
        item: employee,
      });

    } catch (error) {
      console.error("Update Employee Error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

//////////////////////////////////////////////////////
// DELETE EMPLOYEE
//////////////////////////////////////////////////////

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await Employee.findById(id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const candidateId = employee.candidateId;

    // Delete employee first
    await Employee.findByIdAndDelete(id);

    // Only delete JobApplication if it actually exists
    if (candidateId && mongoose.Types.ObjectId.isValid(candidateId)) {
      const applicationExists = await JobApplication.findById(candidateId);

      if (applicationExists) {
        await JobApplication.findByIdAndDelete(candidateId);
      }
    }

    res.json({
      success: true,
      message: "Employee deleted successfully",
    });

  } catch (error) {
    console.error("Delete Employee Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});
export default router;
