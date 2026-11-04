const mongoose = require("mongoose")

const codeSubmissionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Code submission title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    code: {
      type: String,
      required: [true, "Code content is required"],
      maxlength: [100000, "Code cannot exceed 100000 characters"],
    },
    language: {
      type: String,
      required: [true, "Programming language is required"],
      enum: [
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
      ],
      index: true,
    },
    framework: {
      type: String,
      trim: true,
      maxlength: [50, "Framework name cannot exceed 50 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    aiResponse: {
      analysis: {
        type: String,
        required: true,
      },
      insights: [
        {
          type: {
            type: String,
            enum: ["bug", "optimization", "security", "style", "complexity", "performance"],
            required: true,
          },
          severity: {
            type: String,
            enum: ["low", "medium", "high", "critical"],
            required: true,
          },
          line: Number,
          column: Number,
          message: {
            type: String,
            required: true,
          },
          suggestion: String,
          fixable: {
            type: Boolean,
            default: false,
          },
        },
      ],
      metrics: {
        complexity: {
          cyclomatic: Number,
          cognitive: Number,
          maintainability: Number,
        },
        quality: {
          score: {
            type: Number,
            min: 0,
            max: 100,
          },
          grade: {
            type: String,
            enum: ["A+", "A", "B+", "B", "C+", "C", "D+", "D", "F"],
          },
        },
        performance: {
          timeComplexity: String,
          spaceComplexity: String,
          bottlenecks: [String],
        },
        security: {
          vulnerabilities: [
            {
              type: String,
              severity: String,
              description: String,
            },
          ],
          score: {
            type: Number,
            min: 0,
            max: 100,
          },
        },
      },
      suggestions: [
        {
          category: {
            type: String,
            enum: ["refactoring", "optimization", "security", "best-practices", "documentation"],
          },
          priority: {
            type: String,
            enum: ["low", "medium", "high", "critical"],
          },
          title: String,
          description: String,
          codeExample: String,
          impact: String,
        },
      ],
      aiModel: {
        type: String,
        default: "gpt-3.5-turbo",
      },
      processingTime: {
        type: Number, // in milliseconds
        default: 0,
      },
      confidence: {
        type: Number,
        min: 0,
        max: 1,
        default: 0.8,
      },
    },
    status: {
      type: String,
      enum: ["pending", "analyzing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: [30, "Tag cannot exceed 30 characters"],
      },
    ],
    isPublic: {
      type: Boolean,
      default: false,
    },
    reactions: {
      helpful: {
        type: Number,
        default: 0,
      },
      accurate: {
        type: Number,
        default: 0,
      },
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
    },
    feedback: {
      wasHelpful: Boolean,
      comment: String,
      submittedAt: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Indexes for better performance
codeSubmissionSchema.index({ userId: 1, createdAt: -1 })
codeSubmissionSchema.index({ language: 1, createdAt: -1 })
codeSubmissionSchema.index({ status: 1 })
codeSubmissionSchema.index({ tags: 1 })
codeSubmissionSchema.index({ isPublic: 1, createdAt: -1 })
codeSubmissionSchema.index({ isDeleted: 1 })

// Virtual for code preview
codeSubmissionSchema.virtual("codePreview").get(function () {
  return this.code.length > 200 ? this.code.substring(0, 200) + "..." : this.code
})

// Virtual for overall quality score
codeSubmissionSchema.virtual("overallScore").get(function () {
  if (!this.aiResponse?.metrics?.quality?.score) return null

  const qualityScore = this.aiResponse.metrics.quality.score
  const securityScore = this.aiResponse.metrics.security?.score || 100
  const complexityPenalty = this.aiResponse.metrics.complexity?.cyclomatic > 10 ? 10 : 0

  return Math.max(0, Math.min(100, (qualityScore + securityScore) / 2 - complexityPenalty))
})

// Virtual for insight summary
codeSubmissionSchema.virtual("insightSummary").get(function () {
  if (!this.aiResponse?.insights) return null

  const insights = this.aiResponse.insights
  const summary = {
    total: insights.length,
    critical: insights.filter((i) => i.severity === "critical").length,
    high: insights.filter((i) => i.severity === "high").length,
    medium: insights.filter((i) => i.severity === "medium").length,
    low: insights.filter((i) => i.severity === "low").length,
    fixable: insights.filter((i) => i.fixable).length,
  }

  return summary
})

// Pre-save middleware
codeSubmissionSchema.pre("save", function (next) {
  if (this.isModified("code")) {
    // Update processing status
    if (this.status === "completed" && !this.aiResponse) {
      this.status = "pending"
    }
  }
  next()
})

// Static method to get user's code history
codeSubmissionSchema.statics.getUserHistory = async function (userId, options = {}) {
  const { language, status = "completed", limit = 20, page = 1, sortBy = "createdAt", sortOrder = -1 } = options

  const query = {
    userId,
    isDeleted: false,
    status,
  }

  if (language) query.language = language

  const skip = (page - 1) * limit
  const sort = { [sortBy]: sortOrder }

  const [submissions, total] = await Promise.all([
    this.find(query)
      .sort(sort)
      .limit(limit)
      .skip(skip)
      .select("-code") // Exclude full code for list view
      .populate("userId", "name avatar")
      .lean(),
    this.countDocuments(query),
  ])

  return {
    submissions,
    pagination: {
      current: page,
      total: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    },
    total,
  }
}

// Static method to get language statistics
codeSubmissionSchema.statics.getLanguageStats = async function (userId) {
  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        status: "completed",
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: "$language",
        count: { $sum: 1 },
        avgQuality: { $avg: "$aiResponse.metrics.quality.score" },
        totalInsights: { $sum: { $size: "$aiResponse.insights" } },
        lastSubmission: { $max: "$createdAt" },
      },
    },
    { $sort: { count: -1 } },
  ])

  return stats
}

// Static method to get trending issues
codeSubmissionSchema.statics.getTrendingIssues = async function (timeframe = 7) {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - timeframe)

  const trends = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
        status: "completed",
        isDeleted: false,
      },
    },
    { $unwind: "$aiResponse.insights" },
    {
      $group: {
        _id: {
          type: "$aiResponse.insights.type",
          severity: "$aiResponse.insights.severity",
        },
        count: { $sum: 1 },
        examples: {
          $push: {
            message: "$aiResponse.insights.message",
            language: "$language",
          },
        },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ])

  return trends
}

module.exports = mongoose.model("CodeSubmission", codeSubmissionSchema)
