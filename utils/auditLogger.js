// backend/utils/auditLogger.js

import AuditLog from '../models/AuditLog.js';
import { getWebSocketService } from '../services/websocket.js';

/**
 * Central audit logger
 * Safe + consistent
 */
export async function logAction(req, action, target, details = {}) {
  try {

    // Normalize user
    const user = req.user ? req.user : {
      email: "SYSTEM",
      role: "system",
      userId: null,
      name: "System"
    };
    const logData = {
      userEmail: user.email || 'SYSTEM',
      role: user.role || 'public',

      action,
      target,

      details: {
        ...details,
        performedBy: {
          id: user.userId || null,
          name: user.name || null,
          email: user.email || null,
          role: user.role || null
        }
      },

      ipAddress:
        req.headers['x-forwarded-for'] ||
        req.ip ||
        req.connection?.remoteAddress ||
        '',

      userAgent: req.headers['user-agent'] || ''
    };

    const saved = await AuditLog.create(logData);

    // Realtime push
    const ws = getWebSocketService();
    if (ws) {
      ws.broadcastAudit(saved);
    }

    {/*
    if (process.env.NODE_ENV === 'development') {
      console.log('[AUDIT]', action, target);
    }
    */}

  } catch (err) {
    console.error('Audit Log Error:', err);
  }
}
