const jwt = require("jsonwebtoken")
const User = require("../models/User")

// Verify JWT Token
const verifyToken = async (req, res, next) => {
  try {
    let token

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1]
    }
    // Check for token in cookies (if using cookie-based auth)
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "🔒 Access denied. No token provided.",
      })
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET)

      // Get user from database
      const user = await User.findById(decoded.id).select("-password")

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "🔒 Access denied. User not found.",
        })
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: "🔒 Access denied. Account is deactivated.",
        })
      }

      // Update last active timestamp
      user.updateLastActive()

      // Add user to request object
      req.user = user
      next()
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "🔒 Access denied. Token has expired.",
          code: "TOKEN_EXPIRED",
        })
      } else if (jwtError.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          message: "🔒 Access denied. Invalid token.",
          code: "INVALID_TOKEN",
        })
      } else {
        throw jwtError
      }
    }
  } catch (error) {
    console.error("🚨 Auth Middleware Error:", error)
    res.status(500).json({
      success: false,
      message: "🔒 Authentication failed. Please try again.",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// Check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next()
  } else {
    res.status(403).json({
      success: false,
      message: "🔒 Access denied. Admin privileges required.",
    })
  }
}

// Check if user is premium or admin
const requirePremium = (req, res, next) => {
  if (req.user && (req.user.role === "premium" || req.user.role === "admin")) {
    next()
  } else {
    res.status(403).json({
      success: false,
      message: "🔒 Access denied. Premium subscription required.",
      code: "PREMIUM_REQUIRED",
    })
  }
}

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    let token

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1]
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        const user = await User.findById(decoded.id).select("-password")

        if (user && user.isActive) {
          req.user = user
          user.updateLastActive()
        }
      } catch (jwtError) {
        // Silently fail for optional auth
        console.log("Optional auth failed:", jwtError.message)
      }
    }

    next()
  } catch (error) {
    console.error("🚨 Optional Auth Error:", error)
    next() // Continue without authentication
  }
}

// Rate limiting for specific users
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map()

  return (req, res, next) => {
    if (!req.user) return next()

    const userId = req.user._id.toString()
    const now = Date.now()
    const windowStart = now - windowMs

    // Clean old entries
    if (requests.has(userId)) {
      const userRequests = requests.get(userId).filter((time) => time > windowStart)
      requests.set(userId, userRequests)
    } else {
      requests.set(userId, [])
    }

    const userRequests = requests.get(userId)

    if (userRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: "🚫 Too many requests. Please slow down.",
        retryAfter: Math.ceil(windowMs / 1000),
      })
    }

    userRequests.push(now)
    next()
  }
}

// Validate user ownership of resource
const validateOwnership = (Model, paramName = "id") => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[paramName]
      const resource = await Model.findById(resourceId)

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: "🔍 Resource not found.",
        })
      }

      if (resource.userId.toString() !== req.user._id.toString() && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "🔒 Access denied. You can only access your own resources.",
        })
      }

      req.resource = resource
      next()
    } catch (error) {
      console.error("🚨 Ownership Validation Error:", error)
      res.status(500).json({
        success: false,
        message: "🔒 Failed to validate resource ownership.",
      })
    }
  }
}

module.exports = {
  verifyToken,
  requireAdmin,
  requirePremium,
  optionalAuth,
  userRateLimit,
  validateOwnership,
}
