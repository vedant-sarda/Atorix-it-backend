import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Conversation",
    required: true,
  },

  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AdminUser",
    required: true,
  },

  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AdminUser",
    required: true,
  },

  text: {
    type: String,
    required: true,
    trim: true,
  },

  read: {
    type: Boolean,
    default: false,
  },

}, {
  timestamps: true,
});

/* AUTO DELETE AFTER 24 HOURS */
messageSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 86400 }
);

export default mongoose.model("Message", messageSchema);
