/**
 * Format user data for API responses
 * @param {Object} user - User object from database
 * @returns {Object} Formatted user data
 */
const formatUserResponse = (user) => {
  if (!user) return null

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    preferences: user.preferences,
    stats: user.stats,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    isActive: user.isActive,
  }
}

/**
 * Format chat message for API responses
 * @param {Object} message - Message object from database
 * @returns {Object} Formatted message data
 */
const formatChatMessage = (message) => {
  if (!message) return null

  return {
    id: message._id,
    userId: message.userId,
    sessionId: message.sessionId,
    role: message.role,
    message: message.message,
    metadata: message.metadata,
    reactions: message.reactions,
    isEdited: message.isEdited,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    formattedTime: message.formattedTime,
  }
}

/**
 * Format code submission for API responses
 * @param {Object} submission - Code submission object from database
 * @param {boolean} includeCode - Whether to include full code
 * @returns {Object} Formatted submission data
 */
const formatCodeSubmission = (submission, includeCode = true) => {
  if (!submission) return null

  const formatted = {
    id: submission._id,
    userId: submission.userId,
    title: submission.title,
    language: submission.language,
    framework: submission.framework,
    description: submission.description,
    status: submission.status,
    tags: submission.tags,
    aiResponse: submission.aiResponse,
    reactions: submission.reactions,
    feedback: submission.feedback,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    overallScore: submission.overallScore,
    insightSummary: submission.insightSummary,
  }

  if (includeCode) {
    formatted.code = submission.code
  } else {
    formatted.codePreview = submission.codePreview
  }

  return formatted
}

/**
 * Format API error response
 * @param {string} message - Error message
 * @param {Array} errors - Validation errors (optional)
 * @param {string} code - Error code (optional)
 * @returns {Object} Formatted error response
 */
const formatErrorResponse = (message, errors = null, code = null) => {
  const response = {
    success: false,
    message,
    timestamp: new Date().toISOString(),
  }

  if (errors) response.errors = errors
  if (code) response.code = code

  return response
}

/**
 * Format API success response
 * @param {string} message - Success message
 * @param {Object} data - Response data (optional)
 * @param {Object} meta - Metadata (optional)
 * @returns {Object} Formatted success response
 */
const formatSuccessResponse = (message, data = null, meta = null) => {
  const response = {
    success: true,
    message,
    timestamp: new Date().toISOString(),
  }

  if (data) response.data = data
  if (meta) response.meta = meta

  return response
}

/**
 * Format pagination data
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total items
 * @returns {Object} Pagination object
 */
const formatPagination = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit)

  return {
    current: page,
    limit,
    total: totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    totalItems: total,
  }
}

/**
 * Format time duration in human readable format
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} Formatted duration
 */
const formatDuration = (milliseconds) => {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`
  } else if (milliseconds < 60000) {
    return `${(milliseconds / 1000).toFixed(1)}s`
  } else if (milliseconds < 3600000) {
    return `${(milliseconds / 60000).toFixed(1)}m`
  } else {
    return `${(milliseconds / 3600000).toFixed(1)}h`
  }
}

/**
 * Format file size in human readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
const formatFileSize = (bytes) => {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
  if (bytes === 0) return "0 Bytes"

  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`
}

/**
 * Sanitize user input
 * @param {string} input - User input string
 * @returns {string} Sanitized string
 */
const sanitizeInput = (input) => {
  if (typeof input !== "string") return input

  return input
    .trim()
    .replace(/[<>]/g, "") // Remove potential HTML tags
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+=/gi, "") // Remove event handlers
}

/**
 * Generate random string
 * @param {number} length - Length of string
 * @returns {string} Random string
 */
const generateRandomString = (length = 10) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Validate email format
 * @param {string} email - Email address
 * @returns {boolean} True if valid email
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Mask sensitive data for logging
 * @param {string} data - Sensitive data
 * @param {number} visibleChars - Number of visible characters
 * @returns {string} Masked data
 */
const maskSensitiveData = (data, visibleChars = 4) => {
  if (!data || data.length <= visibleChars) return "***"
  return data.substring(0, visibleChars) + "*".repeat(data.length - visibleChars)
}

module.exports = {
  formatUserResponse,
  formatChatMessage,
  formatCodeSubmission,
  formatErrorResponse,
  formatSuccessResponse,
  formatPagination,
  formatDuration,
  formatFileSize,
  sanitizeInput,
  generateRandomString,
  isValidEmail,
  maskSensitiveData,
}
