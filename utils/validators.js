const { body, param, query, validationResult } = require("express-validator")

// Common validation rules
const commonValidations = {
  mongoId: (field) => param(field).isMongoId().withMessage(`Invalid ${field}`),
  email: () => body("email").isEmail().normalizeEmail().withMessage("Please provide a valid email address"),
  password: () =>
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage("Password must contain at least one lowercase letter, one uppercase letter, and one number"),
  name: () => body("name").trim().isLength({ min: 2, max: 50 }).withMessage("Name must be between 2 and 50 characters"),
  pagination: () => [
    query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  ],
}

// Authentication validations
const authValidations = {
  register: [
    commonValidations.name(),
    commonValidations.email(),
    commonValidations.password(),
    body("confirmPassword")
      .custom((value, { req }) => {
        if (value !== req.body.password) {
          throw new Error("Passwords do not match")
        }
        return true
      })
      .withMessage("Passwords do not match"),
  ],

  login: [commonValidations.email(), body("password").notEmpty().withMessage("Password is required")],

  updateProfile: [
    body("name")
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage("Name must be between 2 and 50 characters"),
    body("email").optional().isEmail().normalizeEmail().withMessage("Please provide a valid email address"),
    body("avatar").optional().isURL().withMessage("Avatar must be a valid URL"),
    body("preferences.theme")
      .optional()
      .isIn(["light", "dark", "auto"])
      .withMessage("Theme must be light, dark, or auto"),
    body("preferences.notifications.email")
      .optional()
      .isBoolean()
      .withMessage("Email notification preference must be boolean"),
    body("preferences.notifications.push")
      .optional()
      .isBoolean()
      .withMessage("Push notification preference must be boolean"),
  ],

  changePassword: [
    body("currentPassword").notEmpty().withMessage("Current password is required"),
    body("newPassword")
      .isLength({ min: 6 })
      .withMessage("New password must be at least 6 characters long")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage("New password must contain at least one lowercase letter, one uppercase letter, and one number"),
    body("confirmNewPassword")
      .custom((value, { req }) => {
        if (value !== req.body.newPassword) {
          throw new Error("New passwords do not match")
        }
        return true
      })
      .withMessage("New passwords do not match"),
  ],

  deleteAccount: [body("password").notEmpty().withMessage("Password is required for account deletion")],
}

// Chat validations
const chatValidations = {
  sendMessage: [
    body("message")
      .trim()
      .isLength({ min: 1, max: 10000 })
      .withMessage("Message must be between 1 and 10000 characters"),
    body("sessionId").optional().isString().withMessage("Session ID must be a string"),
    body("domain").optional().trim().isLength({ max: 100 }).withMessage("Domain cannot exceed 100 characters"),
    body("mode")
      .optional()
      .isIn(["chat", "code", "debug", "help"])
      .withMessage("Mode must be chat, code, debug, or help"),
    body("attachments").optional().isArray().withMessage("Attachments must be an array"),
    body("attachments.*.name").optional().isString().withMessage("Attachment name must be a string"),
    body("attachments.*.type").optional().isString().withMessage("Attachment type must be a string"),
    body("attachments.*.size").optional().isInt({ min: 0 }).withMessage("Attachment size must be a positive integer"),
    body("attachments.*.url").optional().isURL().withMessage("Attachment URL must be valid"),
  ],

  getChatHistory: [
    commonValidations.mongoId("userId"),
    query("sessionId").optional().isString().withMessage("Session ID must be a string"),
    query("domain").optional().isString().withMessage("Domain must be a string"),
    query("role").optional().isIn(["user", "ai", "system"]).withMessage("Role must be user, ai, or system"),
    query("startDate").optional().isISO8601().withMessage("Start date must be a valid ISO 8601 date"),
    query("endDate").optional().isISO8601().withMessage("End date must be a valid ISO 8601 date"),
    ...commonValidations.pagination(),
  ],

  updateMessageReaction: [
    commonValidations.mongoId("messageId"),
    body("liked").optional().isBoolean().withMessage("Liked must be a boolean"),
    body("helpful").optional().isBoolean().withMessage("Helpful must be a boolean"),
    body("rating").optional().isInt({ min: 1, max: 5 }).withMessage("Rating must be between 1 and 5"),
  ],

  deleteSession: [param("sessionId").isString().withMessage("Session ID must be a string")],
}

// Code analysis validations
const codeValidations = {
  analyzeCode: [
    body("title").trim().isLength({ min: 1, max: 200 }).withMessage("Title must be between 1 and 200 characters"),
    body("code").trim().isLength({ min: 1, max: 100000 }).withMessage("Code must be between 1 and 100000 characters"),
    body("language")
      .isIn([
        "javascript",
        "typescript",
        "python",
        "java",
        "cpp",
        "c",
        "csharp",
        "php",
        "ruby",
        "go",
        "rust",
        "swift",
        "kotlin",
        "scala",
        "r",
        "sql",
        "html",
        "css",
        "json",
        "xml",
        "yaml",
        "markdown",
        "other",
      ])
      .withMessage("Invalid programming language"),
    body("framework").optional().trim().isLength({ max: 50 }).withMessage("Framework name cannot exceed 50 characters"),
    body("description")
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Description cannot exceed 1000 characters"),
    body("tags").optional().isArray().withMessage("Tags must be an array"),
    body("tags.*")
      .optional()
      .isString()
      .isLength({ max: 30 })
      .withMessage("Each tag must be a string under 30 characters"),
    body("isPublic").optional().isBoolean().withMessage("isPublic must be a boolean"),
  ],

  getCodeHistory: [
    commonValidations.mongoId("userId"),
    query("language").optional().isString().withMessage("Language must be a string"),
    query("status")
      .optional()
      .isIn(["pending", "analyzing", "completed", "failed"])
      .withMessage("Status must be pending, analyzing, completed, or failed"),
    query("sortBy")
      .optional()
      .isIn(["createdAt", "updatedAt", "title", "language"])
      .withMessage("SortBy must be createdAt, updatedAt, title, or language"),
    query("sortOrder").optional().isIn(["asc", "desc"]).withMessage("SortOrder must be asc or desc"),
    ...commonValidations.pagination(),
  ],

  updateSubmissionFeedback: [
    commonValidations.mongoId("id"),
    body("wasHelpful").optional().isBoolean().withMessage("wasHelpful must be a boolean"),
    body("comment").optional().trim().isLength({ max: 500 }).withMessage("Comment cannot exceed 500 characters"),
    body("rating").optional().isInt({ min: 1, max: 5 }).withMessage("Rating must be between 1 and 5"),
  ],

  getSubmission: [commonValidations.mongoId("id")],

  deleteSubmission: [commonValidations.mongoId("id")],

  getTrendingIssues: [
    query("timeframe").optional().isInt({ min: 1, max: 365 }).withMessage("Timeframe must be between 1 and 365 days"),
  ],
}

// Custom validation middleware
const validateRequest = (validations) => {
  return async (req, res, next) => {
    // Run all validations
    await Promise.all(validations.map((validation) => validation.run(req)))

    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "❌ Validation failed",
        errors: errors.array().map((error) => ({
          field: error.path,
          message: error.msg,
          value: error.value,
        })),
      })
    }

    next()
  }
}

// Sanitization helpers
const sanitizeBody = (fields) => {
  return fields.map((field) => body(field).trim().escape())
}

const sanitizeQuery = (fields) => {
  return fields.map((field) => query(field).trim().escape())
}

module.exports = {
  authValidations,
  chatValidations,
  codeValidations,
  commonValidations,
  validateRequest,
  sanitizeBody,
  sanitizeQuery,
}
