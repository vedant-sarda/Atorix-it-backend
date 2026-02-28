import mongoose from "mongoose";

const leaveSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },

    leaveType: {
      type: String,
      enum: ["Paid Leave", "Medical Leave", "Other Leave"],
      required: true,
      trim: true,
    },

    from: {
      type: Date,
      required: true,
    },

    to: {
      type: Date,
      required: true,
    },

    reason: {
      type: String,
      default: "",
      trim: true,
    },

    messageType: {
      type: String,
      enum: ["auto", "custom"],
      default: "auto",
    },

    customMessage: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: ["Approved", "Rejected"],
      default: "Approved",
    },
  },
  {
    timestamps: true, // ✅ createdAt auto generated
  }
);

leaveSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90 } // 90 days
);

export default mongoose.models.Leave ||
  mongoose.model("Leave", leaveSchema);
