import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema(
  {
    // Basic Info
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    position: {
      type: String,
      default: "Not Assigned",
      trim: true,
    },

    department: {
      type: String,
      default: "General",
      trim: true,
    },

    joinedAt: {
      type: Date,
      default: Date.now,
    },

    // HR Extended Fields

    profilePhoto: {
      type: String, // Store image URL
      default: "",
    },

    bankAccountNumber: {
      type: String,
      default: "",
      trim: true,
    },

    ifscCode: {
      type: String,
      default: "",
      trim: true,
    },

    panNumber: {
      type: String,
      default: "",
      trim: true,
    },

    aadhaarNumber: {
      type: String,
      default: "",
      trim: true,
    },

    resume: {
      type: String, // Store resume file URL
      default: "",
    },

    address: {
      type: String,
      default: "",
      trim: true,
    },

    // Candidate reference
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobApplication01",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Employee ||
  mongoose.model("Employee", employeeSchema);
