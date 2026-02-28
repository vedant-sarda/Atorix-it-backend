import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema({
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminUser",
      required: true,
    },
  ],

  lastMessage: {
    type: String,
    default: "",
  },

  lastSender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AdminUser",
  },
}, {
  timestamps: true,
});

export default mongoose.model("Conversation", conversationSchema);
