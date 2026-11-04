const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters long"],
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
      maxlength: [128, "Password cannot exceed 128 characters"],
      select: false,
    },
    avatar: {
      type: String,
      default: null,
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: 'Avatar must be a valid URL'
      }
    },
    
    // 🔥 NEW: Conversation History per Domain
    conversationHistory: {
      type: Map,
      of: [{
        role: {
          type: String,
          enum: ['user', 'assistant', 'system'],
          required: true
        },
        content: {
          type: String,
          required: true,
          maxlength: [10000, "Message content cannot exceed 10000 characters"]
        },
        timestamp: {
          type: Date,
          default: Date.now
        },
        metadata: {
          tokens: Number,
          model: String,
          responseTime: Number
        }
      }],
      default: new Map()
    },

    // 🔥 NEW: Knowledge Graph Digital Twin (State of understanding per domain)
    digitalTwin: {
      type: Map,
      of: {
        domainGoal: String,
        nodes: [{
          conceptId: String,
          conceptName: String,
          state: {
            type: String,
            enum: ['sufficient', 'partial', 'weak-application', 'misconception', 'unconfirmed'],
            default: 'unconfirmed'
          },
          reason: {
            type: String,
            enum: ['forgot terminology', 'can\'t apply it', 'misconception', 'prerequisite weak', 'sufficient evidence', 'none'],
            default: 'none'
          },
          evidenceLog: [{
            interaction: String,
            timestamp: {
              type: Date,
              default: Date.now
            }
          }],
          lastAssessed: {
            type: Date,
            default: Date.now
          }
        }],
        lastUpdated: {
          type: Date,
          default: Date.now
        }
      },
      default: new Map()
    },

    // 🔥 NEW: Chat Sessions
    chatSessions: [{
      domainName: {
        type: String,
        required: true
      },
      sessionId: {
        type: String,
        required: true,
        default: () => new mongoose.Types.ObjectId().toString()
      },
      startedAt: {
        type: Date,
        default: Date.now
      },
      lastMessageAt: {
        type: Date,
        default: Date.now
      },
      messageCount: {
        type: Number,
        default: 0
      },
      status: {
        type: String,
        enum: ['active', 'archived', 'deleted'],
        default: 'active'
      },
      summary: String
    }],
    
    preferences: {
      domains: [
        {
          name: {
            type: String,
            required: true,
            trim: true,
            maxlength: [100, "Domain name cannot exceed 100 characters"]
          },
          complexity: {
            type: Number,
            min: 1,
            max: 10,
            default: 5,
          },
          learningStyle: {
            type: String,
            enum: ["comprehensive", "focused", "practical", "theoretical"],
            default: "comprehensive",
          },
          tags: [{
            type: String,
            trim: true,
            maxlength: [50, "Tag cannot exceed 50 characters"]
          }],
          priority: {
            type: String,
            enum: ["low", "medium", "high"],
            default: "medium"
          },
          createdAt: {
            type: Date,
            default: Date.now,
          },
          lastAccessed: {
            type: Date,
            default: Date.now
          }
        },
      ],
      theme: {
        type: String,
        enum: ["light", "dark", "auto"],
        default: "dark",
      },
      language: {
        type: String,
        enum: ["en", "es", "fr", "de", "zh", "ja", "ko"],
        default: "en"
      },
      notifications: {
        email: {
          type: Boolean,
          default: true,
        },
        push: {
          type: Boolean,
          default: true,
        },
        inApp: {
          type: Boolean,
          default: true,
        },
        frequency: {
          type: String,
          enum: ["immediate", "daily", "weekly", "monthly"],
          default: "daily"
        }
      },
      privacy: {
        profileVisibility: {
          type: String,
          enum: ["public", "private", "friends"],
          default: "public"
        },
        dataSharing: {
          type: Boolean,
          default: false
        }
      }
    },
    stats: {
      totalChats: {
        type: Number,
        default: 0,
        min: 0
      },
      totalCodeAnalyses: {
        type: Number,
        default: 0,
        min: 0
      },
      totalDomains: {
        type: Number,
        default: 0,
        min: 0
      },
      totalSessionTime: {
        type: Number,
        default: 0,
        min: 0
      },
      streak: {
        current: {
          type: Number,
          default: 0,
          min: 0
        },
        longest: {
          type: Number,
          default: 0,
          min: 0
        },
        lastActivity: {
          type: Date,
          default: Date.now
        }
      },
      achievements: [{
        name: String,
        description: String,
        unlockedAt: {
          type: Date,
          default: Date.now
        },
        category: {
          type: String,
          enum: ["learning", "coding", "social", "milestone"],
          default: "learning"
        }
      }],
      lastActive: {
        type: Date,
        default: Date.now,
      },
    },
    subscription: {
      plan: {
        type: String,
        enum: ["free", "premium", "enterprise"],
        default: "free"
      },
      status: {
        type: String,
        enum: ["active", "cancelled", "expired", "trial"],
        default: "active"
      },
      startDate: {
        type: Date,
        default: Date.now
      },
      endDate: Date,
      features: {
        maxDomains: {
          type: Number,
          default: 3
        },
        maxChatHistory: {
          type: Number,
          default: 50
        },
        advancedAnalytics: {
          type: Boolean,
          default: false
        },
        prioritySupport: {
          type: Boolean,
          default: false
        }
      }
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    role: {
      type: String,
      enum: ["user", "admin", "premium", "moderator"],
      default: "user",
    },
    accountStatus: {
      type: String,
      enum: ["pending", "verified", "suspended", "banned"],
      default: "pending"
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    emailVerificationToken: {
      type: String,
      select: false
    },
    passwordResetToken: {
      type: String,
      select: false
    },
    passwordResetExpires: {
      type: Date,
      select: false
    },
    loginAttempts: {
      count: {
        type: Number,
        default: 0
      },
      lastAttempt: Date,
      lockUntil: Date
    },
    twoFactorAuth: {
      enabled: {
        type: Boolean,
        default: false
      },
      secret: {
        type: String,
        select: false
      },
      backupCodes: [{
        type: String,
        select: false
      }]
    }
  },
  {
    timestamps: true,
    toJSON: { 
      virtuals: true,
      transform: function(doc, ret) {
        delete ret.password;
        delete ret.emailVerificationToken;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        if (ret.twoFactorAuth) {
          delete ret.twoFactorAuth.secret;
          delete ret.twoFactorAuth.backupCodes;
        }
        return ret;
      }
    },
    toObject: { virtuals: true },
  },
)

// ✅ Indexes
userSchema.index({ createdAt: -1 })
userSchema.index({ "stats.lastActive": -1 })
userSchema.index({ isActive: 1, role: 1 })
userSchema.index({ accountStatus: 1 })
userSchema.index({ "subscription.plan": 1, "subscription.status": 1 })
userSchema.index({ emailVerified: 1 })
userSchema.index({ "stats.streak.current": -1 })
userSchema.index({ "preferences.domains.name": 1 })
userSchema.index({ "chatSessions.domainName": 1, "chatSessions.lastMessageAt": -1 })
userSchema.index({ "chatSessions.status": 1 })

// Virtuals
userSchema.virtual("publicProfile").get(function () {
  return {
    id: this._id,
    name: this.name,
    avatar: this.avatar,
    role: this.role,
    accountStatus: this.accountStatus,
    joinedAt: this.createdAt,
    stats: {
      totalDomains: this.stats.totalDomains,
      totalChats: this.stats.totalChats,
      currentStreak: this.stats.streak.current,
      longestStreak: this.stats.streak.longest,
      achievements: this.stats.achievements
    }
  }
})

userSchema.virtual("fullProfile").get(function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    avatar: this.avatar,
    preferences: this.preferences,
    stats: this.stats,
    subscription: this.subscription,
    role: this.role,
    accountStatus: this.accountStatus,
    emailVerified: this.emailVerified,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  }
})

userSchema.virtual("subscriptionInfo").get(function () {
  return {
    plan: this.subscription.plan,
    status: this.subscription.status,
    isActive: this.subscription.status === 'active',
    features: this.subscription.features,
    daysRemaining: this.subscription.endDate ? 
      Math.max(0, Math.ceil((this.subscription.endDate - new Date()) / (1000 * 60 * 60 * 24))) : null
  }
})

userSchema.virtual("isLocked").get(function () {
  return !!(this.loginAttempts.lockUntil && this.loginAttempts.lockUntil > Date.now())
})

// Pre-save middleware - Password hashing
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next()

  try {
    if (this.password.length < 6) {
      throw new Error("Password must be at least 6 characters long")
    }

    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// Pre-save middleware - Stats updates
userSchema.pre("save", function (next) {
  if (this.isModified("preferences.domains")) {
    this.stats.totalDomains = this.preferences.domains.length
  }

  // 🔥 Update total chats from conversation history
  if (this.isModified("conversationHistory")) {
    let totalChats = 0
    for (const conversation of this.conversationHistory.values()) {
      totalChats += conversation.filter(m => m.role === 'user').length
    }
    this.stats.totalChats = totalChats
  }

  this.stats.lastActive = new Date()

  if (this.isModified("stats.lastActive")) {
    this.updateStreak()
  }

  next()
})

// Pre-save middleware - Subscription features
userSchema.pre("save", function (next) {
  if (this.isModified("subscription.plan")) {
    switch (this.subscription.plan) {
      case "free":
        this.subscription.features = {
          maxDomains: 3,
          maxChatHistory: 50,
          advancedAnalytics: false,
          prioritySupport: false
        }
        break
      case "premium":
        this.subscription.features = {
          maxDomains: 25,
          maxChatHistory: 1000,
          advancedAnalytics: true,
          prioritySupport: true
        }
        break
      case "enterprise":
        this.subscription.features = {
          maxDomains: -1,
          maxChatHistory: -1,
          advancedAnalytics: true,
          prioritySupport: true
        }
        break
    }
  }
  next()
})

// Instance Methods
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password)
  } catch (error) {
    throw new Error("Password comparison failed")
  }
}

userSchema.methods.updateLastActive = function () {
  this.stats.lastActive = new Date()
  this.updateStreak()
  return this.save({ validateBeforeSave: false })
}

userSchema.methods.updateStreak = function () {
  const now = new Date()
  const lastActivity = this.stats.streak.lastActivity
  const dayInMs = 24 * 60 * 60 * 1000

  if (lastActivity) {
    const daysSinceLastActivity = Math.floor((now - lastActivity) / dayInMs)
    
    if (daysSinceLastActivity === 1) {
      this.stats.streak.current += 1
      if (this.stats.streak.current > this.stats.streak.longest) {
        this.stats.streak.longest = this.stats.streak.current
      }
    } else if (daysSinceLastActivity > 1) {
      this.stats.streak.current = 1
    }
  } else {
    this.stats.streak.current = 1
    this.stats.streak.longest = 1
  }

  this.stats.streak.lastActivity = now
}

userSchema.methods.addAchievement = function (achievementData) {
  const existingAchievement = this.stats.achievements.find(
    achievement => achievement.name === achievementData.name
  )
  
  if (!existingAchievement) {
    this.stats.achievements.push({
      name: achievementData.name,
      description: achievementData.description,
      category: achievementData.category || "learning",
      unlockedAt: new Date()
    })
    return this.save({ validateBeforeSave: false })
  }
  
  return Promise.resolve(this)
}

// 🔥 NEW: Conversation Methods
userSchema.methods.addMessage = async function (domain, role, content, metadata = {}) {
  const conversationKey = domain.toLowerCase().replace(/\s+/g, '_')
  let conversation = this.conversationHistory.get(conversationKey) || []
  
  const newMessage = {
    role,
    content,
    timestamp: new Date(),
    metadata
  }
  
  conversation.push(newMessage)
  
  if (conversation.length > 100) {
    conversation = conversation.slice(-100)
  }
  
  this.conversationHistory.set(conversationKey, conversation)
  
  let session = this.chatSessions.find(s => 
    s.domainName === domain && s.status === 'active'
  )
  
  if (!session) {
    session = {
      domainName: domain,
      sessionId: new mongoose.Types.ObjectId().toString(),
      startedAt: new Date(),
      lastMessageAt: new Date(),
      messageCount: 0,
      status: 'active'
    }
    this.chatSessions.push(session)
  } else {
    session.lastMessageAt = new Date()
  }
  
  session.messageCount += 1
  
  if (role === 'user') {
    this.stats.totalChats += 1
  }
  
  return this.save({ validateBeforeSave: false })
}

userSchema.methods.getConversation = function (domain, limit = 50) {
  const conversationKey = domain.toLowerCase().replace(/\s+/g, '_')
  const conversation = this.conversationHistory.get(conversationKey) || []
  return conversation.slice(-limit)
}

userSchema.methods.clearConversation = function (domain) {
  const conversationKey = domain.toLowerCase().replace(/\s+/g, '_')
  this.conversationHistory.delete(conversationKey)
  
  const session = this.chatSessions.find(s => 
    s.domainName === domain && s.status === 'active'
  )
  if (session) {
    session.status = 'archived'
  }
  
  return this.save({ validateBeforeSave: false })
}

userSchema.methods.getActiveSessions = function () {
  return this.chatSessions.filter(s => s.status === 'active')
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
}

userSchema.methods.archiveOldSessions = function () {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  
  this.chatSessions.forEach(session => {
    if (session.status === 'active' && session.lastMessageAt < thirtyDaysAgo) {
      session.status = 'archived'
    }
  })
  
  return this.save({ validateBeforeSave: false })
}

userSchema.methods.getConversationAnalytics = function (domain = null) {
  if (domain) {
    const conversationKey = domain.toLowerCase().replace(/\s+/g, '_')
    const conversation = this.conversationHistory.get(conversationKey) || []
    
    return {
      domain,
      totalMessages: conversation.length,
      userMessages: conversation.filter(m => m.role === 'user').length,
      assistantMessages: conversation.filter(m => m.role === 'assistant').length,
      firstMessage: conversation[0]?.timestamp,
      lastMessage: conversation[conversation.length - 1]?.timestamp
    }
  }
  
  const analytics = []
  for (const [domain, conversation] of this.conversationHistory.entries()) {
    analytics.push({
      domain: domain.replace(/_/g, ' '),
      totalMessages: conversation.length,
      userMessages: conversation.filter(m => m.role === 'user').length,
      assistantMessages: conversation.filter(m => m.role === 'assistant').length,
      firstMessage: conversation[0]?.timestamp,
      lastMessage: conversation[conversation.length - 1]?.timestamp
    })
  }
  
  return analytics
}

userSchema.methods.canAddDomain = function () {
  const maxDomains = this.subscription.features.maxDomains
  return maxDomains === -1 || this.preferences.domains.length < maxDomains
}

userSchema.methods.hasFeature = function (featureName) {
  return this.subscription.features[featureName] === true
}

userSchema.methods.incLoginAttempts = function () {
  if (this.loginAttempts.lockUntil && this.loginAttempts.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { 'loginAttempts.lockUntil': 1 },
      $set: { 'loginAttempts.count': 1, 'loginAttempts.lastAttempt': Date.now() }
    })
  }

  const updates = { 
    $inc: { 'loginAttempts.count': 1 },
    $set: { 'loginAttempts.lastAttempt': Date.now() }
  }

  if (this.loginAttempts.count + 1 >= 5 && !this.loginAttempts.lockUntil) {
    updates.$set['loginAttempts.lockUntil'] = Date.now() + 2 * 60 * 60 * 1000
  }

  return this.updateOne(updates)
}

userSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { 'loginAttempts.count': 1, 'loginAttempts.lockUntil': 1 }
  })
}

// Static Methods
userSchema.statics.findActiveUsers = function (limit = 50) {
  return this.find({ 
    isActive: true, 
    accountStatus: { $in: ['verified', 'pending'] }
  })
  .select("-password -emailVerificationToken -passwordResetToken -passwordResetExpires")
  .limit(limit)
  .sort({ "stats.lastActive": -1 })
}

userSchema.statics.getUserStats = async function (userId) {
  const user = await this.findById(userId).select("stats preferences subscription createdAt")
  if (!user) throw new Error("User not found")

  return {
    ...user.stats.toObject(),
    totalDomains: user.preferences.domains.length,
    subscriptionPlan: user.subscription.plan,
    joinedDate: user.createdAt,
    membershipDays: Math.floor((Date.now() - user.createdAt) / (1000 * 60 * 60 * 24))
  }
}

userSchema.statics.getLeaderboard = function (type = 'streak', limit = 10) {
  const sortField = type === 'streak' ? 'stats.streak.current' : 'stats.totalChats'
  
  return this.find({ 
    isActive: true, 
    accountStatus: 'verified',
    'preferences.privacy.profileVisibility': { $in: ['public', 'friends'] }
  })
  .select("name avatar stats.streak stats.totalChats stats.achievements")
  .sort({ [sortField]: -1 })
  .limit(limit)
}

userSchema.statics.findByDomainInterest = function (domainName, limit = 20) {
  return this.find({
    "preferences.domains.name": { $regex: domainName, $options: 'i' },
    isActive: true,
    accountStatus: 'verified'
  })
  .select("name avatar preferences.domains stats")
  .limit(limit)
}

userSchema.statics.getSubscriptionAnalytics = async function () {
  return this.aggregate([
    {
      $group: {
        _id: "$subscription.plan",
        count: { $sum: 1 },
        avgDomainsPerUser: { $avg: "$stats.totalDomains" },
        avgChatsPerUser: { $avg: "$stats.totalChats" }
      }
    }
  ])
}

// 🔥 NEW: Static method for conversation analytics
userSchema.statics.getTotalConversations = async function () {
  const result = await this.aggregate([
    {
      $project: {
        conversationCount: { $size: { $objectToArray: "$conversationHistory" } }
      }
    },
    {
      $group: {
        _id: null,
        totalConversations: { $sum: "$conversationCount" }
      }
    }
  ])
  
  return result[0]?.totalConversations || 0
}

module.exports = mongoose.model("User", userSchema)
