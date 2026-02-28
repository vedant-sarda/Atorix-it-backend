import express from "express";
import mongoose from "mongoose";
import { authenticate } from "../middleware/auth.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import AdminUser from "../models/AdminUser.js";

const router = express.Router();

/* USERS */
router.get("/users", authenticate, async (req, res) => {
  const users = await AdminUser.find({ isActive: true })
    .select("_id name email role color");

  res.json({ success: true, data: users });
});

/* CONVERSATIONS */
router.get("/conversations", authenticate, async (req, res) => {

  const userId = req.user.userId;

  const conversations = await Conversation.find({
    participants: userId,
  })
    .populate("participants", "name role color")
    .sort({ updatedAt: -1 });

  res.json({ success: true, data: conversations });
});

/* UNREAD COUNTS */
router.get("/unread", authenticate, async (req, res) => {

  const userId = req.user.userId;

  const unread = await Message.aggregate([
    {
      $match: {
        receiver: new mongoose.Types.ObjectId(userId),
        read: false,
      },
    },
    {
      $group: {
        _id: "$sender",
        count: { $sum: 1 },
      },
    },
  ]);

  res.json({
    success: true,
    data: unread,
  });
});

/* MESSAGES */
router.get("/messages/:conversationId", authenticate, async (req, res) => {

  const messages = await Message.find({
    conversationId: req.params.conversationId,
  }).sort({ createdAt: 1 });

  res.json({ success: true, data: messages });
});

export default router;
