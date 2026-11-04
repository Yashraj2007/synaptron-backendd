const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { validationResult } = require("express-validator")
const User = require("../models/User")
const { logAuth } = require("../utils/logger")
const { formatUserResponse, formatSuccessResponse, formatErrorResponse } = require("../utils/formatters")

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  })
}

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "❌ Validation failed",
        errors: errors.array(),
      })
    }

    const { name, email, password } = req.body

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() })
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "❌ User already exists with this email address",
      })
    }

    // Create new user
    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
    })

    await user.save()

    // Log successful registration
    logAuth("register", user._id, true, { email: user.email })

    // Generate token
    const token = generateToken(user._id)

    // Remove password from response
    const userResponse = user.toObject()
    delete userResponse.password

    res.status(201).json({
      success: true,
      message: "🎉 User registered successfully!",
      data: {
        user: userResponse,
        token,
      },
    })
  } catch (error) {
    console.error("🚨 Register Error:", error)
    logAuth("register", null, false, { email: req.body.email, error: error.message })
    res.status(500).json({
      success: false,
      message: "🔥 Registration failed. Please try again.",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "❌ Validation failed",
        errors: errors.array(),
      })
    }

    const { email, password } = req.body

    // Find user and include password for comparison
    const user = await User.findOne({ email: email.toLowerCase() }).select("+password")

    if (!user) {
      logAuth("login", null, false, { email, reason: "Invalid credentials" })
      return res.status(401).json({
        success: false,
        message: "❌ Invalid email or password",
      })
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "❌ Account is deactivated. Please contact support.",
      })
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password)
    if (!isPasswordValid) {
      logAuth("login", null, false, { email, reason: "Invalid credentials" })
      return res.status(401).json({
        success: false,
        message: "❌ Invalid email or password",
      })
    }

    // Update last active
    await user.updateLastActive()

    // Log successful login
    logAuth("login", user._id, true, { email: user.email })

    // Generate token
    const token = generateToken(user._id)

    // Remove password from response
    const userResponse = user.toObject()
    delete userResponse.password

    res.status(200).json({
      success: true,
      message: "🎉 Login successful!",
      data: {
        user: userResponse,
        token,
      },
    })
  } catch (error) {
    console.error("🚨 Login Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Login failed. Please try again.",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password").populate("preferences.domains")

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "🔍 User not found",
      })
    }

    res.status(200).json({
      success: true,
      message: "✅ Profile retrieved successfully",
      data: {
        user: user.profile,
      },
    })
  } catch (error) {
    console.error("🚨 Get Profile Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to retrieve profile",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "❌ Validation failed",
        errors: errors.array(),
      })
    }

    const { name, email, preferences, avatar } = req.body
    const userId = req.user._id

    // Check if email is being changed and if it's already taken
    if (email && email.toLowerCase() !== req.user.email) {
      const existingUser = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: userId },
      })

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "❌ Email address is already in use",
        })
      }
    }

    // Prepare update data
    const updateData = {}
    if (name) updateData.name = name.trim()
    if (email) updateData.email = email.toLowerCase().trim()
    if (avatar) updateData.avatar = avatar
    if (preferences) updateData.preferences = { ...req.user.preferences, ...preferences }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true, runValidators: true }).select(
      "-password",
    )

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "🔍 User not found",
      })
    }

    res.status(200).json({
      success: true,
      message: "✅ Profile updated successfully!",
      data: {
        user: updatedUser.profile,
      },
    })
  } catch (error) {
    console.error("🚨 Update Profile Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to update profile",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "❌ Validation failed",
        errors: errors.array(),
      })
    }

    const { currentPassword, newPassword } = req.body
    const userId = req.user._id

    // Get user with password
    const user = await User.findById(userId).select("+password")
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "🔍 User not found",
      })
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword)
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "❌ Current password is incorrect",
      })
    }

    // Update password
    user.password = newPassword
    await user.save()

    res.status(200).json({
      success: true,
      message: "✅ Password changed successfully!",
    })
  } catch (error) {
    console.error("🚨 Change Password Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to change password",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Delete user account
// @route   DELETE /api/auth/account
// @access  Private
const deleteAccount = async (req, res) => {
  try {
    const { password } = req.body
    const userId = req.user._id

    // Get user with password
    const user = await User.findById(userId).select("+password")
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "🔍 User not found",
      })
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password)
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "❌ Password is incorrect",
      })
    }

    // Soft delete - deactivate account
    user.isActive = false
    user.email = `deleted_${Date.now()}_${user.email}`
    await user.save()

    res.status(200).json({
      success: true,
      message: "✅ Account deleted successfully",
    })
  } catch (error) {
    console.error("🚨 Delete Account Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to delete account",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Get user statistics
// @route   GET /api/auth/stats
// @access  Private
const getUserStats = async (req, res) => {
  try {
    const stats = await User.getUserStats(req.user._id)

    res.status(200).json({
      success: true,
      message: "✅ User statistics retrieved successfully",
      data: { stats },
    })
  } catch (error) {
    console.error("🚨 Get User Stats Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to retrieve user statistics",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
  getUserStats,
}
