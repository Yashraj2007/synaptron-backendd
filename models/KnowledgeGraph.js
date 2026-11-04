// server/models/KnowledgeGraph.js
const mongoose = require("mongoose");

// Enhanced Node Schema with real crawling data support
const nodeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, index: true }, // Changed from 'label' to 'name' to match ingestion service
    description: { type: String, default: "" }, // Added description field
    type: { 
      type: String, 
      enum: ['fundamental', 'theory', 'algorithm', 'tool', 'application', 'concept', 'skill', 'framework'],
      default: "concept", 
      index: true 
    },
    importance: { type: Number, min: 1, max: 10, default: 5 }, // Changed from 'weight' to 'importance'
    category: { type: String, index: true }, // Technical category (Frontend, Backend, etc.)
    difficulty: { 
      type: String, 
      enum: ['beginner', 'intermediate', 'advanced'], 
      default: 'intermediate' 
    },
    // Enhanced source tracking from real crawling
    sources: {
      documentation: [{ 
        title: String, 
        url: String, 
        relevanceScore: { type: Number, min: 0, max: 1, default: 0.5 }
      }],
      repositories: [{ 
        name: String, 
        url: String, 
        stars: Number, 
        language: String,
        relevanceScore: { type: Number, min: 0, max: 1, default: 0.5 }
      }],
      videos: [{ 
        title: String, 
        channel: String, 
        duration: String, 
        views: Number,
        relevanceScore: { type: Number, min: 0, max: 1, default: 0.5 }
      }],
      communityContent: [{ 
        platform: String, 
        url: String, 
        memberCount: Number 
      }]
    },
    // Metadata for tracking and analytics
    metadata: {
      extractedFrom: { type: String, enum: ['ai', 'crawler', 'pattern', 'fallback'], default: 'fallback' },
      confidence: { type: Number, min: 0, max: 1, default: 0.5 },
      lastUpdated: { type: Date, default: Date.now },
      verificationStatus: { type: String, enum: ['verified', 'pending', 'disputed'], default: 'pending' }
    }
  },
  { _id: false }
);

// Enhanced Edge Schema with relationship intelligence
const edgeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    source: { type: String, required: true, index: true },
    target: { type: String, required: true, index: true },
    relationship: { 
      type: String, 
      enum: ['prerequisite', 'related_to', 'builds_upon', 'applied_in', 'component_of', 'depends_on', 'extends', 'implements'],
      required: true, 
      index: true 
    },
    strength: { type: Number, min: 0, max: 1, default: 0.5 }, // Changed from 'weight' to 'strength'
    bidirectional: { type: Boolean, default: false },
    // Evidence and sources for the relationship
    evidence: {
      aiGenerated: { type: Boolean, default: false },
      patternBased: { type: Boolean, default: false },
      sourceCount: { type: Number, default: 0 },
      confidence: { type: Number, min: 0, max: 1, default: 0.5 }
    },
    // Learning pathway optimization data
    learningWeight: { type: Number, min: 0, max: 1, default: 0.5 },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' }
  },
  { _id: false }
);

// Learning Pathway Schema for optimized learning sequences
const learningPathwaySchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    steps: [{
      nodeId: { type: String, required: true },
      order: { type: Number, required: true },
      estimatedTime: { type: String, default: "1-2 hours" },
      difficulty: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'intermediate' },
      prerequisites: [String] // Node IDs that must be completed first
    }],
    difficulty: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'intermediate' },
    estimatedTime: { type: String, default: "2-4 weeks" },
    completionRate: { type: Number, min: 0, max: 1, default: 0 },
    popularity: { type: Number, default: 0 }
  },
  { _id: false }
);

// Enhanced Knowledge Graph Schema
const knowledgeGraphSchema = new mongoose.Schema(
  {
    // Basic identifiers
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      index: true 
    }, // Made optional for public graphs
    ingestionId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "DomainIngestion", 
      index: true, 
      required: true 
    },
    sessionId: { type: String, required: true, index: true }, // Added session tracking
    
    // Domain and categorization
    domain: { type: String, required: true, index: true },
    technicalCategory: { type: String, index: true }, // From AI analysis
    complexity: { 
      type: String, 
      enum: ['beginner', 'intermediate', 'advanced'], 
      default: 'intermediate',
      index: true 
    },
    
    // Graph structure
    nodes: { type: [nodeSchema], default: [] },
    edges: { type: [edgeSchema], default: [] },
    learningPathways: { type: [learningPathwaySchema], default: [] }, // Added learning pathways
    
    // Enhanced statistics and analytics
    stats: {
      nodeCount: { type: Number, default: 0 },
      edgeCount: { type: Number, default: 0 },
      pathwayCount: { type: Number, default: 0 },
      avgConnections: { type: Number, default: 0 },
      graphDensity: { type: Number, default: 0 },
      complexityScore: { type: Number, default: 0 },
      // Data quality metrics
      dataQuality: {
        score: { type: Number, min: 0, max: 100, default: 0 },
        rating: { type: String, enum: ['poor', 'fair', 'good', 'excellent'], default: 'fair' },
        hasRealData: { type: Boolean, default: false },
        sourceDiversity: { type: Number, default: 0 },
        totalSources: { type: Number, default: 0 }
      }
    },
    
    // AI and processing metadata
    processing: {
      aiModel: { type: String, default: "meta-llama/llama-3.1-405b-instruct:free" },
      processingTime: { type: Number, default: 0 }, // in milliseconds
      conceptsExtracted: { type: Number, default: 0 },
      relationshipsIdentified: { type: Number, default: 0 },
      fallbackUsed: { type: Boolean, default: false },
      crawlerVersion: { type: String, default: "2.0-enhanced" }
    },
    
    // Crawling and source data
    sourceData: {
      documentationSources: { type: Number, default: 0 },
      repositorySources: { type: Number, default: 0 },
      videoSources: { type: Number, default: 0 },
      communitySources: { type: Number, default: 0 },
      reportSources: { type: Number, default: 0 },
      crawlTimestamp: { type: Date },
      crawlSuccess: { type: Boolean, default: false }
    },
    
    // Learning and optimization data
    learningOptimization: {
      recommendedLearningTime: { type: String, default: "8-12 weeks" },
      optimalPathways: { type: Number, default: 0 },
      averagePathLength: { type: Number, default: 0 },
      optimizationComplete: { type: Boolean, default: false }
    },
    
    // Version and status tracking
    version: { type: String, default: "1.0" },
    status: { 
      type: String, 
      enum: ['building', 'optimizing', 'completed', 'failed'], 
      default: 'building',
      index: true 
    },
    
    // Enhanced timestamps
    generatedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    lastOptimizedAt: { type: Date }
  },
  { 
    timestamps: true,
    // Add indexes for better query performance
    indexes: [
      { domain: 1, status: 1 },
      { technicalCategory: 1, complexity: 1 },
      { ingestionId: 1, sessionId: 1 },
      { "stats.dataQuality.score": -1 },
      { generatedAt: -1 }
    ]
  }
);

// Instance methods for enhanced functionality
knowledgeGraphSchema.methods.calculateStats = function() {
  this.stats.nodeCount = this.nodes.length;
  this.stats.edgeCount = this.edges.length;
  this.stats.pathwayCount = this.learningPathways.length;
  
  // Calculate average connections per node
  if (this.nodes.length > 0) {
    const totalConnections = this.nodes.reduce((sum, node) => {
      const connections = this.edges.filter(edge => 
        edge.source === node.id || edge.target === node.id
      ).length;
      return sum + connections;
    }, 0);
    this.stats.avgConnections = Math.round((totalConnections / this.nodes.length) * 100) / 100;
  }
  
  // Calculate graph density
  if (this.nodes.length > 1) {
    const maxEdges = (this.nodes.length * (this.nodes.length - 1)) / 2;
    this.stats.graphDensity = Math.round((this.edges.length / maxEdges) * 100) / 100;
  }
  
  return this.stats;
};

knowledgeGraphSchema.methods.getNodeById = function(nodeId) {
  return this.nodes.find(node => node.id === nodeId);
};

knowledgeGraphSchema.methods.getNodesByType = function(type) {
  return this.nodes.filter(node => node.type === type);
};

knowledgeGraphSchema.methods.getConnectedNodes = function(nodeId) {
  const connectedNodeIds = new Set();
  
  this.edges.forEach(edge => {
    if (edge.source === nodeId) {
      connectedNodeIds.add(edge.target);
    } else if (edge.target === nodeId) {
      connectedNodeIds.add(edge.source);
    }
  });
  
  return Array.from(connectedNodeIds).map(id => this.getNodeById(id)).filter(Boolean);
};

knowledgeGraphSchema.methods.findOptimalPath = function(startNodeId, endNodeId) {
  // Simple breadth-first search for optimal learning path
  const queue = [{ nodeId: startNodeId, path: [startNodeId] }];
  const visited = new Set([startNodeId]);
  
  while (queue.length > 0) {
    const { nodeId, path } = queue.shift();
    
    if (nodeId === endNodeId) {
      return path.map(id => this.getNodeById(id)).filter(Boolean);
    }
    
    this.edges
      .filter(edge => edge.source === nodeId && !visited.has(edge.target))
      .forEach(edge => {
        visited.add(edge.target);
        queue.push({
          nodeId: edge.target,
          path: [...path, edge.target]
        });
      });
  }
  
  return []; // No path found
};

// Static methods for querying
knowledgeGraphSchema.statics.findByDomain = function(domain, limit = 10) {
  return this.find({ domain })
    .sort({ generatedAt: -1 })
    .limit(limit);
};

knowledgeGraphSchema.statics.findByCategory = function(category, limit = 10) {
  return this.find({ technicalCategory: category })
    .sort({ "stats.dataQuality.score": -1 })
    .limit(limit);
};

knowledgeGraphSchema.statics.getHighQualityGraphs = function(minScore = 70, limit = 20) {
  return this.find({ 
    "stats.dataQuality.score": { $gte: minScore },
    status: 'completed'
  })
  .sort({ "stats.dataQuality.score": -1, generatedAt: -1 })
  .limit(limit);
};

knowledgeGraphSchema.statics.findByIngestion = function(ingestionId) {
  return this.findOne({ ingestionId });
};

knowledgeGraphSchema.statics.findBySession = function(sessionId) {
  return this.findOne({ sessionId });
};

// Pre-save middleware to update stats
knowledgeGraphSchema.pre('save', function(next) {
  if (this.isModified('nodes') || this.isModified('edges')) {
    this.calculateStats();
  }
  next();
});

// Create compound indexes for better performance
knowledgeGraphSchema.index({ domain: 1, status: 1 });
knowledgeGraphSchema.index({ technicalCategory: 1, complexity: 1 });
knowledgeGraphSchema.index({ ingestionId: 1, sessionId: 1 });
knowledgeGraphSchema.index({ "stats.dataQuality.score": -1 });
knowledgeGraphSchema.index({ generatedAt: -1 });

module.exports = mongoose.models.KnowledgeGraph || mongoose.model('KnowledgeGraph', knowledgeGraphSchema);




























// server/models/KnowledgeGraph.js
/* eslint-disable max-lines */
// const mongoose = require('mongoose');

// /* ─────────────────────────  NODE  ───────────────────────── */
// const nodeSchema = new mongoose.Schema(
//   {
//     id          : { type: String, required: true },
//     name        : { type: String, required: true, index: true },
//     description : { type: String, default: '' },

//     type: {
//       type : String,
//       enum : [
//         'fundamental','theory','algorithm','tool',
//         'application','concept','skill','framework'
//       ],
//       default: 'concept',
//       index : true
//     },

//     importance : { type: Number, min: 1, max: 10, default: 5 },
//     category   : { type: String, index: true },

//     difficulty : {
//       type : String,
//       enum : ['beginner','intermediate','advanced'],
//       default: 'intermediate'
//     },

//     /* ── source tracking ── */
//     sources: {
//       documentation: [{
//         title         : String,
//         url           : String,
//         relevanceScore: { type: Number, min: 0, max: 1, default: 0.5 }
//       }],
//       repositories : [{
//         name          : String,
//         url           : String,
//         stars         : Number,
//         language      : String,
//         relevanceScore: { type: Number, min: 0, max: 1, default: 0.5 }
//       }],
//       videos: [{
//         title         : String,
//         channel       : String,
//         duration      : String,
//         views         : Number,
//         relevanceScore: { type: Number, min: 0, max: 1, default: 0.5 }
//       }],
//       communityContent: [{
//         platform   : String,
//         url        : String,
//         memberCount: Number
//       }]
//     },

//     /* ── metadata ── */
//     metadata: {
//       extractedFrom     : {
//         type : String,
//         enum : ['ai','crawler','pattern','fallback'],
//         default: 'fallback'
//       },
//       confidence        : { type: Number, min: 0, max: 1, default: 0.5 },
//       lastUpdated       : { type: Date, default: Date.now },
//       verificationStatus: {
//         type : String,
//         enum : ['verified','pending','disputed'],
//         default: 'pending'
//       }
//     }
//   },
//   { _id: false }
// );

// /* ─────────────────────────  EDGE  ───────────────────────── */
// const edgeSchema = new mongoose.Schema(
//   {
//     id      : { type: String, required: true },
//     source  : { type: String, required: true, index: true },
//     target  : { type: String, required: true, index: true },

//     relationship: {
//       type : String,
//       enum : [
//         'prerequisite','related_to','builds_upon',
//         'applied_in','component_of','depends_on',
//         'extends','implements'
//       ],
//       required: true,
//       index   : true
//     },

//     strength     : { type: Number, min: 0, max: 1, default: 0.5 },
//     bidirectional: { type: Boolean, default: false },

//     evidence: {
//       aiGenerated  : { type: Boolean, default: false },
//       patternBased : { type: Boolean, default: false },
//       sourceCount  : { type: Number,  default: 0 },
//       confidence   : { type: Number,  min: 0, max: 1, default: 0.5 }
//     },

//     learningWeight: { type: Number, min: 0, max: 1, default: 0.5 },
//     difficulty    : {
//       type : String,
//       enum : ['easy','medium','hard'],
//       default: 'medium'
//     }
//   },
//   { _id: false }
// );

// /* ─────────────  LEARNING PATHWAY  ───────────── */
// const learningPathwaySchema = new mongoose.Schema(
//   {
//     id         : { type: String, required: true },
//     name       : { type: String, required: true },
//     description: { type: String, default: '' },

//     steps: [{
//       nodeId       : { type: String, required: true },
//       order        : { type: Number, required: true },
//       estimatedTime: { type: String, default: '1-2 hours' },
//       difficulty   : {
//         type : String,
//         enum : ['beginner','intermediate','advanced'],
//         default: 'intermediate'
//       },
//       prerequisites: [String]
//     }],

//     difficulty     : {
//       type : String,
//       enum : ['beginner','intermediate','advanced'],
//       default: 'intermediate'
//     },
//     estimatedTime  : { type: String, default: '2-4 weeks' },
//     completionRate : { type: Number, min: 0, max: 1, default: 0 },
//     popularity     : { type: Number, default: 0 }
//   },
//   { _id: false }
// );

// /* ───────────────────  KNOWLEDGE GRAPH  ─────────────────── */
// const knowledgeGraphSchema = new mongoose.Schema(
//   {
//     /* identifiers */
//     userId: {
//       type : mongoose.Schema.Types.ObjectId,
//       ref  : 'User',
//       index: true
//     },
//     ingestionId: {
//       type    : mongoose.Schema.Types.ObjectId,
//       ref     : 'DomainIngestion',
//       required: true,
//       index   : true
//     },
//     sessionId: { type: String, required: true, index: true },

//     /* domain + complexity */
//     domain            : { type: String, required: true, index: true },
//     technicalCategory : { type: String, index: true },
//     complexity        : {
//       type : String,
//       enum : ['beginner','intermediate','advanced'],
//       default: 'intermediate',
//       index : true
//     },

//     /* graph data */
//     nodes           : { type: [nodeSchema],            default: [] },
//     edges           : { type: [edgeSchema],            default: [] },
//     learningPathways: { type: [learningPathwaySchema], default: [] },

//     /* statistics */
//     stats: {
//       nodeCount     : { type: Number, default: 0 },
//       edgeCount     : { type: Number, default: 0 },
//       pathwayCount  : { type: Number, default: 0 },
//       avgConnections: { type: Number, default: 0 },
//       graphDensity  : { type: Number, default: 0 },
//       complexityScore: { type: Number, default: 0 },
//       dataQuality: {
//         score          : { type: Number, min: 0, max: 100, default: 0 },
//         rating         : {
//           type : String,
//           enum : ['poor','fair','good','excellent'],
//           default: 'fair'
//         },
//         hasRealData    : { type: Boolean, default: false },
//         sourceDiversity: { type: Number,  default: 0 },
//         totalSources   : { type: Number,  default: 0 }
//       }
//     },

//     /* AI & processing info */
//     processing: {
//       aiModel              : { type: String, default: 'meta-llama/llama-3.1-405b-instruct:free' },
//       processingTime       : { type: Number, default: 0 }, // ms
//       conceptsExtracted    : { type: Number, default: 0 },
//       relationshipsIdentified: { type: Number, default: 0 },
//       fallbackUsed         : { type: Boolean, default: false },
//       crawlerVersion       : { type: String, default: '2.0-enhanced' }
//     },

//     /* crawl metadata */
//     sourceData: {
//       documentationSources: { type: Number, default: 0 },
//       repositorySources   : { type: Number, default: 0 },
//       videoSources        : { type: Number, default: 0 },
//       communitySources    : { type: Number, default: 0 },
//       reportSources       : { type: Number, default: 0 },
//       crawlTimestamp      : { type: Date   },
//       crawlSuccess        : { type: Boolean, default: false }
//     },

//     /* learning optimisation */
//     learningOptimization: {
//       recommendedLearningTime: { type: String, default: '8-12 weeks' },
//       optimalPathways        : { type: Number, default: 0 },
//       averagePathLength      : { type: Number, default: 0 },
//       optimizationComplete   : { type: Boolean, default: false }
//     },

//     /* status + timestamps */
//     version: { type: String, default: '1.0' },
//     status : {
//       type : String,
//       enum : ['building','optimizing','completed','failed'],
//       default: 'building',
//       index : true
//     },

//     generatedAt     : { type: Date, default: Date.now },
//     completedAt     : { type: Date },
//     lastOptimizedAt : { type: Date }
//   },
//   {
//     timestamps: true
//   }
// );

// /* ─────────  METHODS  ───────── */
// knowledgeGraphSchema.methods.calculateStats = function () {
//   this.stats.nodeCount    = this.nodes.length;
//   this.stats.edgeCount    = this.edges.length;
//   this.stats.pathwayCount = this.learningPathways.length;

//   /* avg connections */
//   if (this.nodes.length) {
//     const totalConnections = this.nodes.reduce((sum, n) => {
//       const connections = this.edges
//         .filter(e => e.source === n.id || e.target === n.id).length;
//       return sum + connections;
//     }, 0);
//     this.stats.avgConnections = Math.round(
//       (totalConnections / this.nodes.length) * 100
//     ) / 100;
//   }

//   /* density */
//   if (this.nodes.length > 1) {
//     const maxEdges = (this.nodes.length * (this.nodes.length - 1)) / 2;
//     this.stats.graphDensity =
//       Math.round((this.edges.length / maxEdges) * 100) / 100;
//   }
//   return this.stats;
// };

// knowledgeGraphSchema.methods.getNodeById = function (id) {
//   return this.nodes.find(n => n.id === id);
// };

// knowledgeGraphSchema.methods.getNodesByType = function (type) {
//   return this.nodes.filter(n => n.type === type);
// };

// knowledgeGraphSchema.methods.getConnectedNodes = function (id) {
//   const connected = new Set();
//   this.edges.forEach(e => {
//     if (e.source === id) connected.add(e.target);
//     else if (e.target === id) connected.add(e.source);
//   });
//   return Array.from(connected)
//     .map(cid => this.getNodeById(cid))
//     .filter(Boolean);
// };

// knowledgeGraphSchema.methods.findOptimalPath = function (startId, endId) {
//   /* simple BFS */
//   const queue   = [{ id: startId, path: [startId] }];
//   const visited = new Set([startId]);

//   while (queue.length) {
//     const { id, path } = queue.shift();
//     if (id === endId) {
//       return path.map(pid => this.getNodeById(pid)).filter(Boolean);
//     }

//     this.edges
//       .filter(e => e.source === id && !visited.has(e.target))
//       .forEach(e => {
//         visited.add(e.target);
//         queue.push({ id: e.target, path: [...path, e.target] });
//       });
//   }
//   return [];
// };

// /* ─────────  STATICS  ───────── */
// knowledgeGraphSchema.statics.findByDomain = function (domain, limit = 10) {
//   return this.find({ domain })
//     .sort({ generatedAt: -1 })
//     .limit(limit);
// };

// knowledgeGraphSchema.statics.findByCategory = function (cat, limit = 10) {
//   return this.find({ technicalCategory: cat })
//     .sort({ 'stats.dataQuality.score': -1 })
//     .limit(limit);
// };

// knowledgeGraphSchema.statics.getHighQualityGraphs = function (
//   min = 70,
//   limit = 20
// ) {
//   return this.find({
//     'stats.dataQuality.score': { $gte: min },
//     status: 'completed'
//   })
//     .sort({ 'stats.dataQuality.score': -1, generatedAt: -1 })
//     .limit(limit);
// };

// knowledgeGraphSchema.statics.findByIngestion = function (ingestionId) {
//   return this.findOne({ ingestionId });
// };

// knowledgeGraphSchema.statics.findBySession = function (sessionId) {
//   return this.findOne({ sessionId });
// };

// /* ─────────  MIDDLEWARE  ───────── */
// knowledgeGraphSchema.pre('save', function (next) {
//   if (this.isModified('nodes') || this.isModified('edges')) {
//     this.calculateStats();
//   }
//   next();
// });

// /* ─────────  INDEXES  ───────── */
// knowledgeGraphSchema.index({ domain: 1, status: 1 });
// knowledgeGraphSchema.index({ technicalCategory: 1, complexity: 1 });
// knowledgeGraphSchema.index({ ingestionId: 1, sessionId: 1 });
// knowledgeGraphSchema.index({ 'stats.dataQuality.score': -1 });
// knowledgeGraphSchema.index({ generatedAt: -1 });

// /* ────────────────────────────────────────────────────────── */
// module.exports =
//   mongoose.models.KnowledgeGraph ||
//   mongoose.model('KnowledgeGraph', knowledgeGraphSchema);
