import jwt from 'jsonwebtoken';
import User from '../models/user.js';

/**
 * Middleware to authenticate requests using either cookie or Authorization header
 */
export const authenticate = (req, res, next) => {
  try {

    let token = req.cookies?.token;

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // STANDARDIZED USER OBJECT
    req.user = {
      userId: decoded.userId || decoded.id,
      name: decoded.name || '',
      email: decoded.email || '',
      role: decoded.role || 'user'
    };

    next();

  } catch (error) {

    console.error('Auth error:', error);

    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};


export const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.'
      });
    }
    
    next();
  };
};

// ============================================================================
// Integrated middleware (additional functionality)
// ============================================================================

// Protect routes (integrated from provided middleware)
export const protect = async (req, res, next) => {
  let token;

  // Header Bearer token
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    // Token from cookie
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    next();
  } catch (err) {
    console.error('Error verifying token:', err);
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }
};

// Authorize with specific roles (integrated variant, distinct from existing authorize)
export const authorizeRolesStrict = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }

    next();
  };
};
