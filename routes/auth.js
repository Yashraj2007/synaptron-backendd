const express = require("express")
const { body } = require("express-validator")
const {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
  getUserStats,
} = require("../controllers/authController")
const { verifyToken } = require("../middlewares/authMiddleware")

const router = express.Router()

// Validation rules
const registerValidation = [
  body("name").trim().isLength({ min: 2, max: 50 }).withMessage("Name must be between 2 and 50 characters"),
  body("email").isEmail().normalizeEmail().withMessage("Please provide a valid email address"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("Password must contain at least one lowercase letter, one uppercase letter, and one number"),
]

const loginValidation = [
  body("email").isEmail().normalizeEmail().withMessage("Please provide a valid email address"),
  body("password").notEmpty().withMessage("Password is required"),
]

const updateProfileValidation = [
  body("name").optional().trim().isLength({ min: 2, max: 50 }).withMessage("Name must be between 2 and 50 characters"),
  body("email").optional().isEmail().normalizeEmail().withMessage("Please provide a valid email address"),
  body("preferences.theme")
    .optional()
    .isIn(["light", "dark", "auto"])
    .withMessage("Theme must be light, dark, or auto"),
]

const changePasswordValidation = [
  body("currentPassword").notEmpty().withMessage("Current password is required"),
  body("newPassword")
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters long")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("New password must contain at least one lowercase letter, one uppercase letter, and one number"),
]

// Routes
router.post("/register", registerValidation, register)
router.post("/login", loginValidation, login)
router.get("/profile", verifyToken, getProfile)
router.put("/profile", verifyToken, updateProfileValidation, updateProfile)
router.put("/change-password", verifyToken, changePasswordValidation, changePassword)
router.delete("/account", verifyToken, deleteAccount)
router.get("/stats", verifyToken, getUserStats)

module.exports = router
