const mongoose = require('mongoose');
const crypto = require('crypto');

// Advanced Task Schema with Critical Path Analysis
const taskSchema = new mongoose.Schema({
  id: { type: String, default: () => crypto.randomUUID() },
  title: { type: String, required: true, index: true },
  description: String,
  assignee: { type: String, index: true },
  assignedBy: String,
  priority: { 
    type: String, 
    enum: ['P0-Critical', 'P1-High', 'P2-Medium', 'P3-Low'],
    default: 'P2-Medium'
  },
  status: { 
    type: String, 
    enum: ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'archived'],
    default: 'todo',
    index: true
  },
  tags: [{ type: String, index: true }],
  estimatedHours: Number,
  actualHours: Number,
  storyPoints: Number,
  dependencies: [String], // Task IDs
  blockedBy: [String], // Task IDs blocking this
  blocking: [String], // Tasks this is blocking
  criticalPath: { type: Boolean, default: false }, // Auto-calculated
  startDate: Date,
  dueDate: Date,
  completedAt: Date,
  completedBy: String,
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now },
  watchers: [String], // Users watching this task
  attachments: [{
    name: String,
    url: String,
    type: String,
    size: Number,
    uploadedBy: String,
    uploadedAt: Date
  }],
  comments: [{
    id: String,
    user: String,
    text: String,
    mentions: [String],
    timestamp: { type: Date, default: Date.now },
    edited: Boolean,
    reactions: [{ user: String, emoji: String }]
  }],
  timeTracking: [{
    user: String,
    startTime: Date,
    endTime: Date,
    duration: Number, // milliseconds
    description: String
  }],
  subtasks: [{
    id: String,
    title: String,
    completed: Boolean,
    assignee: String
  }],
  customFields: Map
});

// Advanced Member Schema with Permissions
const memberSchema = new mongoose.Schema({
  id: { type: String, default: () => crypto.randomUUID() },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  email: { type: String, lowercase: true, trim: true },
  role: { 
    type: String, 
    enum: ['Full-Stack', 'Frontend', 'Backend', 'UI/UX', 'DevOps', 'Mobile', 'Data Science', 'QA', 'Product Manager'],
    required: true
  },
  permissions: {
    canCreateTasks: { type: Boolean, default: true },
    canDeleteTasks: { type: Boolean, default: false },
    canManageMembers: { type: Boolean, default: false },
    canManageSettings: { type: Boolean, default: false },
    canLockFiles: { type: Boolean, default: true },
    canMerge: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false }
  },
  status: {
    online: { type: Boolean, default: false },
    currentActivity: String, // 'coding', 'meeting', 'break', 'afk'
    currentFile: String,
    lastSeen: Date
  },
  metrics: {
    tasksCompleted: { type: Number, default: 0 },
    tasksInProgress: { type: Number, default: 0 },
    commitsToday: { type: Number, default: 0 },
    linesWrittenToday: { type: Number, default: 0 },
    codeReviewsCompleted: { type: Number, default: 0 },
    velocity: { type: Number, default: 0 }, // Story points per sprint
    qualityScore: { type: Number, default: 100 }, // 0-100
    collaborationScore: { type: Number, default: 100 }
  },
  availability: {
    hoursPerDay: { type: Number, default: 8 },
    timezone: String,
    workingHours: {
      start: String, // "09:00"
      end: String // "17:00"
    }
  },
  joinedAt: { type: Date, default: Date.now },
  lastActiveAt: { type: Date, default: Date.now }
});

// Main Team Schema - ENTERPRISE GRADE
const teamSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    index: true,
    minlength: 6,
    maxlength: 8
  },
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  description: String,
  avatar: String,
  
  // Advanced Access Control
  accessControl: {
    isPublic: { type: Boolean, default: false },
    requiresApproval: { type: Boolean, default: true },
    allowedDomains: [String], // Email domains allowed
    inviteOnly: { type: Boolean, default: true }
  },

  // Members with advanced permissions
  members: [memberSchema],
  
  // Pending invitations
  invitations: [{
    email: String,
    invitedBy: String,
    invitedAt: Date,
    token: String,
    expiresAt: Date,
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'expired'], default: 'pending' }
  }],

  // Advanced Task Management
  tasks: [taskSchema],
  
  // Task Dependencies Graph (adjacency list)
  dependencyGraph: {
    type: Map,
    of: [String]
  },

  // Advanced File Management
  files: [{
    id: String,
    path: String,
    name: String,
    type: String,
    size: Number,
    owner: String,
    lockedBy: String,
    lockedAt: Date,
    version: Number,
    versions: [{
      version: Number,
      content: String,
      editedBy: String,
      editedAt: Date,
      changeDescription: String
    }],
    collaborators: [String],
    permissions: {
      read: [String],
      write: [String],
      admin: [String]
    }
  }],

  // Real-time Collaboration State
  activeEditors: {
    type: Map,
    of: {
      file: String,
      cursorPosition: Object,
      selection: Object,
      timestamp: Date
    }
  },

  // Advanced Chat with Threading
  chat: [{
    id: String,
    sender: String,
    text: String,
    type: { type: String, enum: ['message', 'system', 'bot'], default: 'message' },
    threadId: String, // Parent message ID
    mentions: [String],
    reactions: [{ user: String, emoji: String, timestamp: Date }],
    attachments: [{ name: String, url: String, type: String }],
    timestamp: { type: Date, default: Date.now },
    edited: Boolean,
    editedAt: Date,
    deleted: Boolean,
    deletedAt: Date,
    pinned: Boolean
  }],

  // Advanced Git Integration
  gitIntegration: {
    provider: { type: String, enum: ['github', 'gitlab', 'bitbucket'] },
    repoUrl: String,
    repoOwner: String,
    repoName: String,
    accessToken: String, // Encrypted
    webhookSecret: String,
    autoSync: { type: Boolean, default: true },
    branches: [{
      name: String,
      protected: Boolean,
      lastCommit: {
        sha: String,
        message: String,
        author: String,
        timestamp: Date
      }
    }],
    pullRequests: [{
      id: Number,
      number: Number,
      title: String,
      description: String,
      author: String,
      fromBranch: String,
      toBranch: String,
      status: { type: String, enum: ['open', 'merged', 'closed', 'draft'] },
      reviewers: [{
        user: String,
        status: { type: String, enum: ['pending', 'approved', 'changes_requested', 'commented'] },
        timestamp: Date
      }],
      aiReview: {
        score: Number,
        issues: [{ severity: String, line: Number, message: String }],
        suggestions: [String]
      },
      ciStatus: { type: String, enum: ['pending', 'running', 'passed', 'failed'] },
      createdAt: Date,
      mergedAt: Date,
      mergedBy: String
    }],
    commits: [{
      sha: String,
      message: String,
      author: String,
      branch: String,
      filesChanged: [String],
      additions: Number,
      deletions: Number,
      timestamp: Date
    }]
  },

  // Sprint Management
  sprints: [{
    id: String,
    name: String,
    number: Number,
    goal: String,
    startDate: Date,
    endDate: Date,
    status: { type: String, enum: ['planning', 'active', 'completed', 'cancelled'], default: 'planning' },
    tasks: [String], // Task IDs
    metrics: {
      plannedPoints: Number,
      completedPoints: Number,
      velocity: Number,
      burndownData: [{ date: Date, remainingPoints: Number }]
    }
  }],
  currentSprint: String, // Sprint ID

  // Advanced Analytics
  analytics: {
    teamVelocity: [{ date: Date, velocity: Number }],
    codeQualityTrend: [{ date: Date, score: Number }],
    deploymentFrequency: [{ date: Date, count: Number }],
    bugRate: [{ date: Date, count: Number }],
    cycleTime: [{ date: Date, hours: Number }],
    throughput: [{ date: Date, tasksCompleted: Number }]
  },

  // Team Metrics - Real-time Calculation
  metrics: {
    totalCommits: { type: Number, default: 0 },
    totalPullRequests: { type: Number, default: 0 },
    totalLinesWritten: { type: Number, default: 0 },
    totalLinesDeleted: { type: Number, default: 0 },
    tasksCompleted: { type: Number, default: 0 },
    bugsFixed: { type: Number, default: 0 },
    codeReviewsMade: { type: Number, default: 0 },
    averageCycleTime: Number, // hours
    averageLeadTime: Number, // hours
    deploymentCount: { type: Number, default: 0 },
    lastDeployment: Date,
    currentVelocity: Number,
    qualityScore: Number, // 0-100
    technicalDebt: Number // estimated hours
  },

  // Notification Settings
  notifications: [{
    id: String,
    type: { type: String, enum: ['task', 'mention', 'pr', 'deployment', 'alert', 'system'] },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'] },
    title: String,
    message: String,
    recipients: [String],
    readBy: [String],
    link: String,
    timestamp: { type: Date, default: Date.now },
    expiresAt: Date
  }],

  // Audit Log
  auditLog: [{
    id: String,
    action: String,
    actor: String,
    target: String,
    targetType: String,
    changes: Object,
    ipAddress: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now }
  }],

  // Webhooks & Integrations
  webhooks: [{
    id: String,
    name: String,
    url: String,
    secret: String,
    events: [String], // ['task.created', 'task.completed', 'pr.merged', etc.]
    active: { type: Boolean, default: true },
    lastTriggered: Date,
    failureCount: { type: Number, default: 0 }
  }],

  integrations: {
    slack: {
      enabled: Boolean,
      webhookUrl: String,
      channel: String
    },
    discord: {
      enabled: Boolean,
      webhookUrl: String
    },
    jira: {
      enabled: Boolean,
      apiKey: String,
      projectKey: String
    },
    linear: {
      enabled: Boolean,
      apiKey: String
    }
  },

  // Settings
  settings: {
    workingHours: {
      enabled: Boolean,
      timezone: String,
      days: [String],
      startTime: String,
      endTime: String
    },
    autoAssignment: {
      enabled: { type: Boolean, default: true },
      strategy: { type: String, enum: ['round-robin', 'least-busy', 'skill-based'], default: 'skill-based' }
    },
    codeReview: {
      required: { type: Boolean, default: true },
      minReviewers: { type: Number, default: 1 },
      requireApproval: { type: Boolean, default: true }
    },
    cicd: {
      enabled: Boolean,
      provider: String,
      autoDeployOnMerge: Boolean
    }
  },

  // Metadata
  createdBy: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastActivityAt: { type: Date, default: Date.now },
  archivedAt: Date,
  deletedAt: Date
}, {
  timestamps: true,
  collection: 'teams'
});

// Indexes for Performance
teamSchema.index({ code: 1 });
teamSchema.index({ createdAt: -1 });
teamSchema.index({ 'members.email': 1 });
teamSchema.index({ 'members.name': 'text', name: 'text' }); // Text search
teamSchema.index({ 'tasks.status': 1 });
teamSchema.index({ 'tasks.assignee': 1 });
teamSchema.index({ lastActivityAt: -1 });

// Virtual for active members count
teamSchema.virtual('activeMembersCount').get(function() {
  return this.members.filter(m => m.status.online).length;
});

// Pre-save middleware
teamSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  this.lastActivityAt = new Date();
  
  // Calculate critical path
  this.calculateCriticalPath();
  
  next();
});

// Method: Calculate Critical Path
teamSchema.methods.calculateCriticalPath = function() {
  // Implement Critical Path Method (CPM) algorithm
  const tasks = this.tasks;
  const graph = this.dependencyGraph || new Map();
  
  // Build adjacency list and calculate longest path
  const visited = new Set();
  const longestPath = new Map();
  
  const dfs = (taskId, path = []) => {
    if (visited.has(taskId)) return longestPath.get(taskId) || 0;
    
    visited.add(taskId);
    const task = tasks.find(t => t.id === taskId);
    if (!task) return 0;
    
    let maxPath = task.estimatedHours || 0;
    const dependencies = graph.get(taskId) || [];
    
    for (const depId of dependencies) {
      const depPath = dfs(depId, [...path, taskId]);
      maxPath = Math.max(maxPath, depPath + (task.estimatedHours || 0));
    }
    
    longestPath.set(taskId, maxPath);
    return maxPath;
  };
  
  // Mark critical path tasks
  tasks.forEach(task => {
    const pathLength = dfs(task.id);
    task.criticalPath = pathLength === longestPath.get(task.id);
  });
};

// Method: Calculate Team Velocity
teamSchema.methods.calculateVelocity = function() {
  const completedSprints = this.sprints.filter(s => s.status === 'completed');
  if (completedSprints.length === 0) return 0;
  
  const totalPoints = completedSprints.reduce((sum, sprint) => 
    sum + (sprint.metrics.completedPoints || 0), 0);
  
  return Math.round(totalPoints / completedSprints.length);
};

// Method: Get Team Health Score
teamSchema.methods.getHealthScore = function() {
  const factors = {
    velocity: this.metrics.currentVelocity / 100, // Normalize
    quality: this.metrics.qualityScore / 100,
    deployment: this.metrics.deploymentCount > 0 ? 1 : 0,
    collaboration: this.members.reduce((sum, m) => 
      sum + m.metrics.collaborationScore, 0) / this.members.length / 100,
    blockers: 1 - (this.tasks.filter(t => t.status === 'blocked').length / this.tasks.length)
  };
  
  const weights = { velocity: 0.2, quality: 0.3, deployment: 0.2, collaboration: 0.2, blockers: 0.1 };
  
  return Math.round(
    Object.entries(factors).reduce((score, [key, value]) => 
      score + (value * weights[key]), 0) * 100
  );
};

// Static: Find by code
teamSchema.statics.findByCode = function(code) {
  return this.findOne({ code: code.toUpperCase(), deletedAt: null });
};

// Static: Search teams
teamSchema.statics.searchTeams = function(query, options = {}) {
  const { page = 1, limit = 10, sortBy = 'lastActivityAt', sortOrder = -1 } = options;
  
  return this.find(
    { 
      $text: { $search: query },
      deletedAt: null 
    },
    { score: { $meta: 'textScore' } }
  )
    .sort({ score: { $meta: 'textScore' }, [sortBy]: sortOrder })
    .limit(limit * 1)
    .skip((page - 1) * limit);
};

module.exports = mongoose.model('Team', teamSchema);
