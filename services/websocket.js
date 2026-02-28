import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

class WebSocketService {
  constructor(server) {
    this.wss = new WebSocketServer({
      server,
      path: "/ws",
    });

    // Map<userId, Set<ws>>
    this.clients = new Map();

    this.setup();
  }
  broadcastAudit(data) {
  this.broadcast("NEW_AUDIT_LOG", data);
}

  setup() {
    this.wss.on("connection", (ws) => {
      console.log("🔌 WebSocket connected");

      ws.isAlive = true;
      ws.userId = null;

      ws.on("pong", () => {
        ws.isAlive = true;
      });

      ws.on("message", (data) => {
        this.handleMessage(ws, data);
      });

      ws.on("close", () => {
        this.handleDisconnect(ws);
      });

      ws.on("error", (err) => {
        console.error("WS Error:", err);
        this.handleDisconnect(ws);
      });
    });

    // Heartbeat
    setInterval(() => {
      this.clients.forEach((set, userId) => {
        set.forEach((ws) => {
          if (!ws.isAlive) {
            ws.terminate();
            set.delete(ws);
          } else {
            ws.isAlive = false;
            ws.ping();
          }
        });

        if (set.size === 0) {
          this.clients.delete(userId);
          this.broadcast("USER_OFFLINE", { userId });
        }
      });
    }, 30000);
  }

  /* ================= AUTH ================= */

  authenticate(ws, token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      ws.userId = userId;

      if (!this.clients.has(userId)) {
        this.clients.set(userId, new Set());
        this.broadcast("USER_ONLINE", { userId });
      }

      this.clients.get(userId).add(ws);

      ws.send(
        JSON.stringify({
          type: "AUTH_SUCCESS",
          userId,
        })
      );

      console.log("✅ WS Auth:", userId);
    } catch (err) {
      console.error("❌ WS Auth Failed");
      ws.send(JSON.stringify({ type: "AUTH_ERROR" }));
      ws.close();
    }
  }

  /* ================= MAIN HANDLER ================= */

  async handleMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case "AUTH":
        this.authenticate(ws, msg.token);
        break;

      case "SEND_MESSAGE":
        await this.sendMessage(ws, msg);
        break;

      case "READ_MESSAGE":
        await this.markRead(ws, msg);
        break;

      case "TYPING_START":
        this.handleTyping(ws, msg, true);
        break;

      case "TYPING_STOP":
        this.handleTyping(ws, msg, false);
        break;

      default:
        break;
    }
  }

  /* ================= SEND MESSAGE ================= */

  async sendMessage(ws, data) {
    if (!ws.userId) return;

    const { receiverId, text } = data;
    if (!receiverId || !text?.trim()) return;

    const senderObjId = new mongoose.Types.ObjectId(ws.userId);
    const receiverObjId = new mongoose.Types.ObjectId(receiverId);

    let convo = await Conversation.findOne({
      participants: { $all: [senderObjId, receiverObjId] },
    });

    if (!convo) {
      convo = await Conversation.create({
        participants: [senderObjId, receiverObjId],
      });
    }

    const message = await Message.create({
      conversationId: convo._id,
      sender: senderObjId,
      receiver: receiverObjId,
      text,
    });

    convo.lastMessage = text;
    convo.lastSender = senderObjId;
    convo.updatedAt = new Date();
    await convo.save();

    const payload = {
      type: "NEW_MESSAGE",
      data: {
        _id: message._id,
        conversationId: convo._id,
        sender: ws.userId,
        receiver: receiverId,
        text,
        createdAt: message.createdAt,
        read: false,
      },
    };

    // Send to sender (✓ delivered)
    this.sendToUser(ws.userId, payload);

    // Send to receiver
    this.sendToUser(receiverId, payload);

    // Delivery confirmation (if receiver online)
    if (this.clients.has(receiverId)) {
      this.sendToUser(ws.userId, {
        type: "MESSAGE_DELIVERED",
        data: {
          messageId: message._id,
        },
      });
    }

    // Sidebar sync
    this.broadcast("CONVERSATION_UPDATE", {
      conversationId: convo._id,
      sender: ws.userId,
      receiver: receiverId,
      lastMessage: text,
      updatedAt: convo.updatedAt,
    });
  }

  /* ================= READ RECEIPTS ================= */

  async markRead(ws, data) {
    if (!ws.userId) return;

    const { conversationId } = data;

    const messages = await Message.find({
      conversationId,
      receiver: ws.userId,
      read: false,
    });

    await Message.updateMany(
      {
        conversationId,
        receiver: ws.userId,
        read: false,
      },
      { read: true }
    );

    messages.forEach((m) => {
      this.sendToUser(m.sender.toString(), {
        type: "MESSAGE_READ",
        data: {
          messageId: m._id,
        },
      });
    });
  }

  /* ================= TYPING ================= */

  handleTyping(ws, data, isTyping) {
    if (!ws.userId) return;

    const { receiverId } = data;
    if (!receiverId) return;

    this.sendToUser(receiverId, {
      type: isTyping ? "TYPING_START" : "TYPING_STOP",
      data: {
        userId: ws.userId,
      },
    });
  }

  /* ================= HELPERS ================= */

  sendToUser(userId, payload) {
    const sockets = this.clients.get(userId);
    if (!sockets) return;

    sockets.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    });
  }

  broadcast(type, data) {
    const msg = JSON.stringify({ type, data });

    this.clients.forEach((set) => {
      set.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(msg);
        }
      });
    });
  }

  /* ================= DISCONNECT ================= */

  handleDisconnect(ws) {
    if (!ws.userId) return;

    const set = this.clients.get(ws.userId);
    if (!set) return;

    set.delete(ws);

    if (set.size === 0) {
      this.clients.delete(ws.userId);
      this.broadcast("USER_OFFLINE", { userId: ws.userId });
    }

    console.log("❌ WS disconnected:", ws.userId);
  }
}

let instance = null;

export const initWebSocket = (server) => {
  if (!instance) {
    instance = new WebSocketService(server);
    console.log("✅ WebSocket initialized");
  }
  return instance;
};

export const getWebSocketService = () => instance;
