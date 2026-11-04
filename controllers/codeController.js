// WHAT THIS FUNCTION DOES:

// It checks the input (title/code/language…).
// It saves a “submission” record in the database (status = “analyzing”).
// It asks an AI model to analyze the code.
// It saves the AI result into that record (status = “completed”).
// It returns the result to the user.
// If AI fails, it tries a basic fallback; if that fails, it returns an error.

const { validationResult } = require("express-validator")
const OpenAI = require("openai")
const CodeSubmission = require("../models/CodeSubmission")
const User = require("../models/User")
const { sendChatCompletion, generateCodeAnalysisPrompt, cleanAndParseJSON } = require("../utils/openaiClient")
const { logCode } = require("../utils/logger")
const { formatCodeSubmission, formatSuccessResponse } = require("../utils/formatters")

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://openrouter.ai/api/v1", // Add this line
})


// @desc    Analyze code and provide insights
// @route   POST /api/code/analyze
// @access  Private



//Take user’s code → send it to OpenAI → get analysis (bugs, improvements, performance, security issues, etc.) → store in database.
const analyzeCode = async (req, res) => {
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

    const { title, code, language, framework, description, tags = [] } = req.body
    const userId = req.user._id

    // Create code submission
    const codeSubmission = new CodeSubmission({
      userId,
      title,
      code,
      language,
      framework,
      description,
      tags,
      status: "analyzing",
    })

    await codeSubmission.save()

    const startTime = Date.now()

    try {
      // Generate analysis prompt
      const messages = generateCodeAnalysisPrompt(code, language, framework, description)

      // Use the updated OpenAI client with JSON enforcement
      const aiResult = await sendChatCompletion(messages, {
        model: "gpt-4",
        maxTokens: 2000,
        temperature: 0.3,
        requireJSON: true, // Force JSON response
      })

      // Use the parsed JSON content
      const aiAnalysis = aiResult.content // This is now parsed JSON
      const processingTime = aiResult.processingTime

      // Log code analysis activity
      logCode("analyze", userId, codeSubmission._id, {
        language,
        framework,
        tokensUsed: aiResult.tokensUsed,
        processingTime,
      })

      // Extract structured insights from parsed JSON
      const insights = aiAnalysis.issues || []
      const suggestions = aiAnalysis.suggestions || []
      const metrics = {
        ...calculateCodeMetrics(code, language),
        aiMetrics: aiAnalysis.metrics || {}
      }

      // Update code submission with AI response
      codeSubmission.aiResponse = {
        analysis: aiResult.rawContent, // Store original content
        structuredAnalysis: aiAnalysis, // Store parsed JSON
        insights: insights,
        metrics: metrics,
        suggestions: suggestions,
        summary: aiAnalysis.summary || "Analysis completed",
        qualityScore: aiAnalysis.quality_score || calculateQualityScore(metrics),
        aiModel: "gpt-4",
        processingTime,
        confidence: 0.9,
      }
      codeSubmission.status = "completed"

      await codeSubmission.save()

      // Update user stats
      await User.findByIdAndUpdate(userId, {
        $inc: { "stats.totalCodeAnalyses": 1 },
      })

      res.status(200).json({
        success: true,
        message: "✅ Code analysis completed successfully",
        data: {
          submission: codeSubmission,
          processingTime,
          tokensUsed: aiResult.tokensUsed,
          summary: aiAnalysis.summary,
          qualityScore: aiAnalysis.quality_score,
        },
      })
    } catch (aiError) {
      console.error("🤖 AI Analysis Error:", aiError)

      // Handle JSON parsing errors specifically
      if (aiError.message.includes('JSON')) {
        console.error("JSON parsing failed, attempting fallback analysis...")
        
        // Fallback to basic analysis
        const fallbackAnalysis = generateFallbackAnalysis(code, language)
        
        codeSubmission.aiResponse = {
          analysis: "Analysis completed with basic heuristics due to AI parsing error",
          insights: fallbackAnalysis.insights,
          metrics: fallbackAnalysis.metrics,
          suggestions: fallbackAnalysis.suggestions,
          aiModel: "fallback",
          processingTime: Date.now() - startTime,
          confidence: 0.6,
          error: "AI response parsing failed, used fallback analysis"
        }
        codeSubmission.status = "completed"
        await codeSubmission.save()

        return res.status(200).json({
          success: true,
          message: "✅ Code analysis completed with basic heuristics",
          warning: "AI analysis encountered issues, basic analysis provided",
          data: {
            submission: codeSubmission,
            processingTime: Date.now() - startTime,
          },
        })
      }

      // Update submission status to failed
      codeSubmission.status = "failed"
      codeSubmission.aiResponse = {
        error: aiError.message,
        failedAt: new Date(),
        processingTime: Date.now() - startTime
      }
      await codeSubmission.save()

      throw aiError
    }
  } catch (error) {
    console.error("🚨 Analyze Code Error:", error)

    if (error.code === "insufficient_quota") {
      return res.status(429).json({
        success: false,
        message: "🤖 AI service quota exceeded. Please try again later.",
      })
    }

    res.status(500).json({
      success: false,
      message: "🔥 Failed to analyze code",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Get user's code submission history
// @route   GET /api/code/history/:userId
// @access  Private

// Show all past code analyses done by a user (like history).
const getCodeHistory = async (req, res) => {
  try {
    const { userId } = req.params
    const { language, status = "completed", limit = 20, page = 1, sortBy = "createdAt", sortOrder = "desc" } = req.query

    // Check if user can access this history
    if (userId !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "🔒 Access denied. You can only view your own code history.",
      })
    }

    const options = {
      language,
      status,
      limit: Number.parseInt(limit),
      page: Number.parseInt(page),
      sortBy,
      sortOrder: sortOrder === "desc" ? -1 : 1,
    }

    const history = await CodeSubmission.getUserHistory(userId, options)

    res.status(200).json({
      success: true,
      message: "✅ Code history retrieved successfully",
      data: history,
    })
  } catch (error) {
    console.error("🚨 Get Code History Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to retrieve code history",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Get specific code submission
// @route   GET /api/code/submission/:id
// @access  Private

// Fetch one specific code submission (like checking just one exam paper).
const getCodeSubmission = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user._id

    const submission = await CodeSubmission.findOne({
      _id: id,
      userId,
      isDeleted: false,
    }).populate("userId", "name avatar")

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: "🔍 Code submission not found",
      })
    }

    res.status(200).json({
      success: true,
      message: "✅ Code submission retrieved successfully",
      data: {
        submission,
      },
    })
  } catch (error) {
    console.error("🚨 Get Code Submission Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to retrieve code submission",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Update code submission feedback
// @route   PUT /api/code/submission/:id/feedback
// @access  Private
const updateSubmissionFeedback = async (req, res) => {
  try {
    const { id } = req.params
    const { wasHelpful, comment, rating } = req.body
    const userId = req.user._id

    const submission = await CodeSubmission.findOne({
      _id: id,
      userId,
      isDeleted: false,
    })

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: "🔍 Code submission not found",
      })
    }

    // Update feedback
    submission.feedback = {
      wasHelpful,
      comment,
      submittedAt: new Date(),
    }

    if (rating && rating >= 1 && rating <= 5) {
      submission.reactions.rating = rating
    }

    await submission.save()

    res.status(200).json({
      success: true,
      message: "✅ Feedback updated successfully",
      data: {
        submission,
      },
    })
  } catch (error) {
    console.error("🚨 Update Submission Feedback Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to update feedback",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Delete code submission
// @route   DELETE /api/code/submission/:id
// @access  Private
const deleteCodeSubmission = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user._id

    const submission = await CodeSubmission.findOne({
      _id: id,
      userId,
      isDeleted: false,
    })

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: "🔍 Code submission not found",
      })
    }

    // Soft delete
    submission.isDeleted = true
    submission.deletedAt = new Date()
    await submission.save()

    res.status(200).json({
      success: true,
      message: "✅ Code submission deleted successfully",
    })
  } catch (error) {
    console.error("🚨 Delete Code Submission Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to delete code submission",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Get language statistics
// @route   GET /api/code/stats/languages
// @access  Private
const getLanguageStats = async (req, res) => {
  try {
    const userId = req.user._id
    const stats = await CodeSubmission.getLanguageStats(userId)

    res.status(200).json({
      success: true,
      message: "✅ Language statistics retrieved successfully",
      data: {
        stats,
      },
    })
  } catch (error) {
    console.error("🚨 Get Language Stats Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to retrieve language statistics",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Get trending issues
// @route   GET /api/code/stats/trending
// @access  Private
const getTrendingIssues = async (req, res) => {
  try {
    const { timeframe = 7 } = req.query
    const trends = await CodeSubmission.getTrendingIssues(Number.parseInt(timeframe))

    res.status(200).json({
      success: true,
      message: "✅ Trending issues retrieved successfully",
      data: {
        trends,
        timeframe: Number.parseInt(timeframe),
      },
    })
  } catch (error) {
    console.error("🚨 Get Trending Issues Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to retrieve trending issues",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// Helper function to generate fallback analysis when AI fails
const generateFallbackAnalysis = (code, language) => {
  const lines = code.split("\n")
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0)
  
  const insights = []
  const suggestions = []
  
  // Basic code analysis
  if (code.includes("eval(")) {
    insights.push({
      type: "security",
      severity: "high",
      message: "Use of eval() detected - potential security risk",
      line: findLineNumber(code, "eval("),
      fixable: true
    })
  }
  
  if (code.includes("innerHTML")) {
    insights.push({
      type: "security",
      severity: "medium",
      message: "Use of innerHTML detected - consider using textContent for safety",
      line: findLineNumber(code, "innerHTML"),
      fixable: true
    })
  }
  
  // Check for very long lines
  lines.forEach((line, index) => {
    if (line.length > 120) {
      insights.push({
        type: "style",
        severity: "low",
        message: "Line exceeds 120 characters",
        line: index + 1,
        fixable: true
      })
    }
  })
  
  const metrics = calculateCodeMetrics(code, language)
  
  if (metrics.complexity.cyclomatic > 10) {
    suggestions.push({
      category: "refactoring",
      priority: "high",
      title: "High Complexity Detected",
      description: "Consider breaking down complex functions into smaller ones",
      impact: "Improved maintainability and readability"
    })
  }
  
  return {
    insights,
    suggestions,
    metrics,
    summary: `Basic analysis completed. Found ${insights.length} issues and ${suggestions.length} suggestions.`
  }
}

// Helper function to find line number of a pattern
const findLineNumber = (code, pattern) => {
  const lines = code.split("\n")
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(pattern)) {
      return i + 1
    }
  }
  return null
}

// Helper function to calculate quality score
const calculateQualityScore = (metrics) => {
  const complexityScore = Math.max(0, 100 - (metrics.complexity.cyclomatic * 5))
  const maintainabilityScore = metrics.quality.score || 75
  return Math.round((complexityScore + maintainabilityScore) / 2)
}

// Helper function to parse AI insights (Updated to handle JSON structure)
const parseCodeInsights = (aiAnalysis, language) => {
  // If aiAnalysis is already parsed JSON, use it directly
  if (typeof aiAnalysis === 'object' && aiAnalysis.issues) {
    return aiAnalysis.issues
  }
  
  // Fallback to text parsing for backward compatibility
  const insights = []
  if (typeof aiAnalysis !== 'string') {
    return insights
  }

  const lines = aiAnalysis.split("\n")
  let currentInsight = null

  lines.forEach((line, index) => {
    if (line.includes("Bug:") || line.includes("Issue:") || line.includes("Error:")) {
      if (currentInsight) insights.push(currentInsight)
      currentInsight = {
        type: "bug",
        severity: line.includes("Critical") ? "critical" : line.includes("High") ? "high" : "medium",
        message: line.trim(),
        line: extractLineNumber(line),
        fixable: line.includes("fixable") || line.includes("auto-fix"),
      }
    } else if (line.includes("Performance:") || line.includes("Optimization:")) {
      if (currentInsight) insights.push(currentInsight)
      currentInsight = {
        type: "performance",
        severity: "medium",
        message: line.trim(),
        line: extractLineNumber(line),
        fixable: false,
      }
    } else if (line.includes("Security:") || line.includes("Vulnerability:")) {
      if (currentInsight) insights.push(currentInsight)
      currentInsight = {
        type: "security",
        severity: "high",
        message: line.trim(),
        line: extractLineNumber(line),
        fixable: true,
      }
    } else if (currentInsight && line.trim()) {
      currentInsight.message += " " + line.trim()
    }
  })

  if (currentInsight) insights.push(currentInsight)
  return insights.slice(0, 10)
}

// Helper function to extract line numbers from text
const extractLineNumber = (text) => {
  const match = text.match(/line\s+(\d+)/i)
  return match ? Number.parseInt(match[1]) : null
}

// Helper function to calculate basic code metrics
const calculateCodeMetrics = (code, language) => {
  const lines = code.split("\n")
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0)

  const cyclomaticComplexity = calculateCyclomaticComplexity(code, language)
  const maintainabilityIndex = Math.max(0, 171 - 5.2 * Math.log(nonEmptyLines.length) - 0.23 * cyclomaticComplexity)

  return {
    complexity: {
      cyclomatic: cyclomaticComplexity,
      cognitive: Math.min(cyclomaticComplexity * 1.2, 50),
      maintainability: Math.round(maintainabilityIndex),
    },
    quality: {
      score: Math.max(20, Math.min(100, maintainabilityIndex)),
      grade: getQualityGrade(maintainabilityIndex),
    },
    performance: {
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      bottlenecks: [],
    },
    security: {
      vulnerabilities: [],
      score: 85,
    },
  }
}

// Helper function to calculate cyclomatic complexity
const calculateCyclomaticComplexity = (code, language) => {
  const complexityKeywords = {
    javascript: ["if", "else", "for", "while", "switch", "case", "catch", "&&", "||", "?"],
    python: ["if", "elif", "else", "for", "while", "except", "and", "or"],
    java: ["if", "else", "for", "while", "switch", "case", "catch", "&&", "||", "?"],
    cpp: ["if", "else", "for", "while", "switch", "case", "catch", "&&", "||", "?"],
  }

  const keywords = complexityKeywords[language] || complexityKeywords.javascript
  let complexity = 1

  keywords.forEach((keyword) => {
    const regex = new RegExp(`\\b${keyword}\\b`, "gi")
    const matches = code.match(regex)
    if (matches) {
      complexity += matches.length
    }
  })

  return Math.min(complexity, 50)
}

// Helper function to get quality grade
const getQualityGrade = (score) => {
  if (score >= 90) return "A+"
  if (score >= 85) return "A"
  if (score >= 80) return "B+"
  if (score >= 75) return "B"
  if (score >= 70) return "C+"
  if (score >= 65) return "C"
  if (score >= 60) return "D+"
  if (score >= 55) return "D"
  return "F"
}

// Helper function to generate suggestions (Updated)
const generateSuggestions = (aiAnalysis) => {
  // If aiAnalysis is already parsed JSON, use it directly
  if (typeof aiAnalysis === 'object' && aiAnalysis.suggestions) {
    return aiAnalysis.suggestions
  }
  
  // Fallback to text parsing
  const suggestions = []
  
  if (typeof aiAnalysis === 'string') {
    if (aiAnalysis.includes("refactor")) {
      suggestions.push({
        category: "refactoring",
        priority: "medium",
        title: "Code Refactoring Needed",
        description: "Consider refactoring complex functions for better maintainability",
        impact: "Improved code readability and maintainability",
      })
    }

    if (aiAnalysis.includes("performance") || aiAnalysis.includes("optimization")) {
      suggestions.push({
        category: "optimization",
        priority: "high",
        title: "Performance Optimization",
        description: "Optimize code for better performance",
        impact: "Faster execution and better user experience",
      })
    }

    if (aiAnalysis.includes("security") || aiAnalysis.includes("vulnerability")) {
      suggestions.push({
        category: "security",
        priority: "critical",
        title: "Security Enhancement",
        description: "Address security vulnerabilities",
        impact: "Improved application security",
      })
    }
  }

  return suggestions
}

module.exports = {
  analyzeCode,
  getCodeHistory,
  getCodeSubmission,
  updateSubmissionFeedback,
  deleteCodeSubmission,
  getLanguageStats,
  getTrendingIssues,
}
