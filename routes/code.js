const express = require("express")
const { body, param, query } = require("express-validator")
const {
  analyzeCode,
  getCodeHistory,
  getCodeSubmission,
  updateSubmissionFeedback,
  deleteCodeSubmission,
  getLanguageStats,
  getTrendingIssues,
} = require("../controllers/codeController")
const { verifyToken, userRateLimit } = require("../middlewares/authMiddleware")

const router = express.Router()

// Validation rules
const analyzeCodeValidation = [
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
]

const codeHistoryValidation = [
  param("userId").isMongoId().withMessage("Invalid user ID"),
  query("limit").optional().isInt({ min: 1, max: 50 }).withMessage("Limit must be between 1 and 50"),
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
]

const submissionFeedbackValidation = [
  param("id").isMongoId().withMessage("Invalid submission ID"),
  body("wasHelpful").optional().isBoolean().withMessage("wasHelpful must be a boolean"),
  body("comment").optional().trim().isLength({ max: 500 }).withMessage("Comment cannot exceed 500 characters"),
  body("rating").optional().isInt({ min: 1, max: 5 }).withMessage("Rating must be between 1 and 5"),
]

// Apply rate limiting to code analysis (more restrictive due to AI usage)
const codeAnalysisRateLimit = userRateLimit(10, 60 * 60 * 1000) // 10 requests per hour

// Routes
router.post("/analyze", verifyToken, codeAnalysisRateLimit, analyzeCodeValidation, analyzeCode)
router.get("/history/:userId", verifyToken, codeHistoryValidation, getCodeHistory)
router.get("/submission/:id", verifyToken, getCodeSubmission)
router.put("/submission/:id/feedback", verifyToken, submissionFeedbackValidation, updateSubmissionFeedback)
router.delete("/submission/:id", verifyToken, deleteCodeSubmission)
router.get("/stats/languages", verifyToken, getLanguageStats)
router.get("/stats/trending", verifyToken, getTrendingIssues)

module.exports = router
