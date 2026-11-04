const jwt = require("jsonwebtoken")
const User = require("../models/User")

const AUTH_DISABLED = String(process.env.DISABLE_AUTH || "true").toLowerCase() === "true"
const GUEST_EMAIL = process.env.GUEST_EMAIL || "guest@synaptron.com."
const GUEST_NAME = process.env.GUEST_NAME || "Guest User"
const GUEST_PASSWORD = process.env.GUEST_PASSWORD || "GuestPassword123!"

let guestUserCache = null

async function getOrCreateGuestUser() {
  if (guestUserCache) return guestUserCache
  let user = await User.findOne({ email: GUEST_EMAIL }).select("-password")
  if (!user) {
    // Create a non-admin, active guest user
    user = new User({
      name: GUEST_NAME,
      email: GUEST_EMAIL,
      password: GUEST_PASSWORD,
      role: "user",
      isActive: true,
      preferences: {
        theme: "dark",
        notifications: { email: false, push: false },
      },
    })
    await user.save()
    // Remove password from instance for downstream usage
    user = await User.findById(user._id).select("-password")
  }
  guestUserCache = user
  return user
}

// Verify JWT Token (becomes a no-op with a guest user when DISABLE_AUTH=true)
const verifyToken = async (req, res, next) => {
  try {
    if (AUTH_DISABLED) {
      const user = await getOrCreateGuestUser()
      req.user = user
      return next()
    }

    let token

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1]
    } else if (req.cookies && req.cookies.token) {
      // Check for token in cookies (if using cookie-based auth)
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
  if (AUTH_DISABLED) return next()
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
  if (AUTH_DISABLED) return next()
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
    if (AUTH_DISABLED) {
      const user = await getOrCreateGuestUser()
      req.user = user
      return next()
    }

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
        console.log("Optional auth failed:", jwtError.message)
      }
    }

    next()
  } catch (error) {
    console.error("🚨 Optional Auth Error:", error)
    next()
  }
}

// Rate limiting for specific users
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map()

  return (req, res, next) => {
    // With auth disabled, ensure a guest user is present (verifyToken will set it on protected routes)
    if (!req.user && AUTH_DISABLED) {
      // no per-user rate limit when completely anonymous; fall back to IP
      const key = req.ip
      const now = Date.now()
      const windowStart = now - windowMs

      if (requests.has(key)) {
        const arr = requests.get(key).filter((t) => t > windowStart)
        requests.set(key, arr)
      } else {
        requests.set(key, [])
      }

      const arr = requests.get(key)
      if (arr.length >= maxRequests) {
        return res.status(429).json({
          success: false,
          message: "🚫 Too many requests. Please slow down.",
          retryAfter: Math.ceil(windowMs / 1000),
        })
      }

      arr.push(now)
      return next()
    }

    if (!req.user) return next()

    const userId = req.user._id?.toString?.() || "guest"
    const now = Date.now()
    const windowStart = now - windowMs

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
      if (AUTH_DISABLED) return next()

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
