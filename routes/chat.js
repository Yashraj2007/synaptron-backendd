const express = require("express")
const { body, param, query } = require("express-validator")
const {
  sendMessage,
  getChatHistory,
  getChatSessions,
  deleteChatSession,
  updateMessageReaction,
  getSessionStats,
  verifyClaim,
  evaluateFinalTest,
} = require("../controllers/chatController")
const { verifyToken, userRateLimit } = require("../middlewares/authMiddleware")

const router = express.Router()

// Validation rules
const sendMessageValidation = [
  body("message").trim().isLength({ min: 1, max: 10000 }).withMessage("Message must be between 1 and 10000 characters"),
  body("sessionId").optional().isString().withMessage("Session ID must be a string"),
  body("domain").optional().trim().isLength({ max: 100 }).withMessage("Domain cannot exceed 100 characters"),
  body("mode")
    .optional()
    .isIn([
      "chat", "code", "debug", "help", "tutor",
      "smart-learning", "smart-learning-agent", "quick-check",
      "CLAIM_VERIFICATION", "PREREQUISITE_CHECK", "MODULE_CHECK",
    ])
    .withMessage("Invalid chat mode"),
  body("attachments").optional().isArray().withMessage("Attachments must be an array"),
]

const verifyClaimValidation = [
  body("conceptId").isString().notEmpty().withMessage("Concept ID is required"),
  body("conceptName").isString().notEmpty().withMessage("Concept Name is required"),
  body("domain").isString().notEmpty().withMessage("Domain is required"),
  body("messages").isArray().notEmpty().withMessage("Messages array is required"),
]

const chatHistoryValidation = [
  param("userId").isMongoId().withMessage("Invalid user ID"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
]

const messageReactionValidation = [
  param("messageId").isMongoId().withMessage("Invalid message ID"),
  body("liked").optional().isBoolean().withMessage("Liked must be a boolean"),
  body("helpful").optional().isBoolean().withMessage("Helpful must be a boolean"),
  body("rating").optional().isInt({ min: 1, max: 5 }).withMessage("Rating must be between 1 and 5"),
]

// Apply rate limiting to chat routes
const chatRateLimit = userRateLimit(50, 15 * 60 * 1000) // 50 requests per 15 minutes

// Routes
router.post("/send", verifyToken, chatRateLimit, sendMessageValidation, sendMessage)
router.post("/verify-claim", verifyToken, chatRateLimit, verifyClaimValidation, verifyClaim)
router.post("/evaluate-final-test", verifyToken, chatRateLimit, evaluateFinalTest)
router.get("/history/:userId", verifyToken, chatHistoryValidation, getChatHistory)
router.get("/sessions", verifyToken, getChatSessions)
router.delete("/session/:sessionId", verifyToken, deleteChatSession)
router.put("/message/:messageId/reaction", verifyToken, messageReactionValidation, updateMessageReaction)
router.get("/session/:sessionId/stats", verifyToken, getSessionStats)

module.exports = router
