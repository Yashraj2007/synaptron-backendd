const mongoose = require('mongoose');

const domainIngestionSchema = new mongoose.Schema({
  domain: {
    type: String,
    required: true
  },
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['starting', 'analyzing', 'collecting', 'processing', 'building', 'optimizing', 'completed', 'failed'],
    default: 'starting'
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  currentStep: {
    type: Number,
    default: 0
  },
  
  analysisResults: {
    domain: String,
    complexity: String,
    subdomains: mongoose.Schema.Types.Mixed,
    primaryConcepts: mongoose.Schema.Types.Mixed,
    prerequisites: mongoose.Schema.Types.Mixed,
    learningPath: mongoose.Schema.Types.Mixed,
    analysisComplete: Boolean,
    timestamp: String
  },
  
  collectionResults: {
    domain: String,
    academicPapers: Number,
    technicalDocs: Number,
    codeRepos: Number,
    videoTutorials: Number,
    expertInterviews: Number,
    industryReports: Number,
    rawData: mongoose.Schema.Types.Mixed,
    collectionComplete: Boolean,
    timestamp: String
  },
  
  processingResults: {
    concepts: mongoose.Schema.Types.Mixed,
    relationships: mongoose.Schema.Types.Mixed,
    processingStats: {
      totalDocuments: Number,
      conceptsExtracted: Number,
      relationshipsIdentified: Number
    },
    processingComplete: Boolean,
    timestamp: String
  },
  
  knowledgeGraph: {
    nodes: mongoose.Schema.Types.Mixed,
    edges: mongoose.Schema.Types.Mixed,
    stats: {
      totalNodes: Number,
      totalEdges: Number,
      avgConnections: Number,
      graphDensity: Number
    },
    buildComplete: Boolean,
    timestamp: String
  },
  
  optimization: {
    pathways: mongoose.Schema.Types.Mixed,
    learningSequences: mongoose.Schema.Types.Mixed,
    optimizationStats: {
      totalPathways: Number,
      averagePathLength: Number,
      complexityScore: Number,
      recommendedLearningTime: String
    },
    optimizationComplete: Boolean,
    timestamp: String
  },
  
  crawlStats: {
    totalCrawled: { type: Number, default: 0 },
    documentsProcessed: { type: Number, default: 0 },
    conceptsExtracted: { type: Number, default: 0 },
    neuralConnections: { type: Number, default: 0 }
  },
  
  success: {
    type: Boolean,
    default: false
  },
  error: String,
  
  startTime: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  totalDuration: Number,
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// UPDATED: Clean indexes - no duplicates
domainIngestionSchema.index({ sessionId: 1 });
domainIngestionSchema.index({ domain: 1 });
domainIngestionSchema.index({ status: 1 });
domainIngestionSchema.index({ createdAt: -1 });
domainIngestionSchema.index({ domain: 1, createdAt: -1 });

// 🔥 MIDDLEWARE - Auto-update progress when status changes
domainIngestionSchema.pre('save', function(next) {
  // If status is 'completed' and progress is not 100, set it to 100
  if (this.status === 'completed' && this.progress !== 100) {
    this.progress = 100;
  }
  
  // Set success flag based on status
  if (this.status === 'completed') {
    this.success = true;
  } else if (this.status === 'failed') {
    this.success = false;
  }
  
  next();
});

// 🔥 MIDDLEWARE - Also handle findOneAndUpdate
domainIngestionSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  
  // If updating status to 'completed', also set progress to 100
  if (update.$set && update.$set.status === 'completed' && !update.$set.progress) {
    update.$set.progress = 100;
    update.$set.success = true;
  }
  
  // If update object doesn't have $set
  if (update.status === 'completed' && !update.progress) {
    update.progress = 100;
    update.success = true;
  }
  
  next();
});

// Add methods for easier querying
domainIngestionSchema.statics.findBySession = function(sessionId) {
  return this.findOne({ sessionId });
};

domainIngestionSchema.statics.findByDomain = function(domain, limit = 10) {
  return this.find({ domain })
    .sort({ createdAt: -1 })
    .limit(limit);
};

domainIngestionSchema.statics.getRecentIngestions = function(limit = 20) {
  return this.find({ status: 'completed' })
    .sort({ completedAt: -1 })
    .limit(limit);
};

// Knowledge Graph Schema
const knowledgeGraphSchema = new mongoose.Schema({
  domain: {
    type: String,
    required: true
  },
  ingestionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DomainIngestion',
    required: true
  },
  sessionId: {
    type: String,
    required: true
  },
  nodes: mongoose.Schema.Types.Mixed,
  edges: mongoose.Schema.Types.Mixed,
  pathways: mongoose.Schema.Types.Mixed,
  learningSequences: mongoose.Schema.Types.Mixed,
  graphStats: {
    totalNodes: Number,
    totalEdges: Number,
    avgConnections: Number,
    graphDensity: Number,
    complexityScore: Number
  },
  optimizationResults: mongoose.Schema.Types.Mixed,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Knowledge Graph indexes
knowledgeGraphSchema.index({ domain: 1, createdAt: -1 });
knowledgeGraphSchema.index({ ingestionId: 1 });
knowledgeGraphSchema.index({ sessionId: 1 });

// Crawled Document Schema
const crawledDocumentSchema = new mongoose.Schema({
  domain: {
    type: String,
    required: true
  },
  sourceType: {
    type: String,
    enum: ['academic_paper', 'technical_doc', 'code_repo', 'video_tutorial', 'expert_interview', 'industry_report'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  content: {
    summary: String,
    fullText: String,
    extractedConcepts: [String],
    keyPoints: [String]
  },
  metadata: mongoose.Schema.Types.Mixed,
  processingStatus: {
    type: String,
    enum: ['raw', 'processed', 'analyzed', 'integrated'],
    default: 'raw'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Crawled Document indexes
crawledDocumentSchema.index({ domain: 1, sourceType: 1 });
crawledDocumentSchema.index({ url: 1 }, { unique: true });
crawledDocumentSchema.index({ createdAt: -1 });

// Create models
const DomainIngestion = mongoose.model('DomainIngestion', domainIngestionSchema);
const KnowledgeGraph = mongoose.model('KnowledgeGraph', knowledgeGraphSchema);
const CrawledDocument = mongoose.model('CrawledDocument', crawledDocumentSchema);

// Export models
module.exports = DomainIngestion;
module.exports.KnowledgeGraph = KnowledgeGraph;
module.exports.CrawledDocument = CrawledDocument;














































// old.................. const mongoose = require('mongoose');

// const domainIngestionSchema = new mongoose.Schema({
//   domain: {
//     type: String,
//     required: true
//   },
//   sessionId: {
//     type: String,
//     required: true,
//     unique: true
//   },
//   status: {
//     type: String,
//     enum: ['starting', 'analyzing', 'collecting', 'processing', 'building', 'optimizing', 'completed', 'failed'],
//     default: 'starting'
//   },
//   progress: {
//     type: Number,
//     default: 0,
//     min: 0,
//     max: 100
//   },
//   currentStep: {
//     type: Number,
//     default: 0
//   },
  
//   // UPDATED: More flexible analysisResults to handle AI response variations
//   analysisResults: {
//     domain: String,
//     complexity: String,
//     subdomains: mongoose.Schema.Types.Mixed, // Allow arrays of strings or objects
//     primaryConcepts: mongoose.Schema.Types.Mixed, // Allow arrays of strings or objects
//     prerequisites: mongoose.Schema.Types.Mixed, // Allow arrays of strings or objects
//     learningPath: mongoose.Schema.Types.Mixed, // Allow flexible learning path structure
//     analysisComplete: Boolean,
//     timestamp: String
//   },
  
//   collectionResults: {
//     domain: String,
//     academicPapers: Number,
//     technicalDocs: Number,
//     codeRepos: Number,
//     videoTutorials: Number,
//     expertInterviews: Number,
//     industryReports: Number,
//     rawData: mongoose.Schema.Types.Mixed,
//     collectionComplete: Boolean,
//     timestamp: String
//   },
  
//   // UPDATED: More flexible processingResults
//   processingResults: {
//     concepts: mongoose.Schema.Types.Mixed, // Allow flexible concept structure
//     relationships: mongoose.Schema.Types.Mixed, // Allow flexible relationship structure
//     processingStats: {
//       totalDocuments: Number,
//       conceptsExtracted: Number,
//       relationshipsIdentified: Number
//     },
//     processingComplete: Boolean,
//     timestamp: String
//   },
  
//   // UPDATED: Add knowledgeGraph results
//   knowledgeGraph: {
//     nodes: mongoose.Schema.Types.Mixed,
//     edges: mongoose.Schema.Types.Mixed,
//     stats: {
//       totalNodes: Number,
//       totalEdges: Number,
//       avgConnections: Number,
//       graphDensity: Number
//     },
//     buildComplete: Boolean,
//     timestamp: String
//   },
  
//   // UPDATED: Add optimization results
//   optimization: {
//     pathways: mongoose.Schema.Types.Mixed,
//     learningSequences: mongoose.Schema.Types.Mixed,
//     optimizationStats: {
//       totalPathways: Number,
//       averagePathLength: Number,
//       complexityScore: Number,
//       recommendedLearningTime: String
//     },
//     optimizationComplete: Boolean,
//     timestamp: String
//   },
  
//   crawlStats: {
//     totalCrawled: { type: Number, default: 0 },
//     documentsProcessed: { type: Number, default: 0 },
//     conceptsExtracted: { type: Number, default: 0 },
//     neuralConnections: { type: Number, default: 0 }
//   },
  
//   // UPDATED: Add success field and more error details
//   success: {
//     type: Boolean,
//     default: false
//   },
//   error: String,
  
//   startTime: {
//     type: Date,
//     default: Date.now
//   },
//   completedAt: Date,
//   totalDuration: Number, // in milliseconds
  
//   // UPDATED: Add created/updated tracking
//   createdAt: {
//     type: Date,
//     default: Date.now
//   },
//   updatedAt: {
//     type: Date,
//     default: Date.now
//   }
// }, {
//   timestamps: true // This will automatically manage createdAt and updatedAt
// });

// // UPDATED: Clean indexes - no duplicates
// domainIngestionSchema.index({ sessionId: 1 });
// domainIngestionSchema.index({ domain: 1 });
// domainIngestionSchema.index({ status: 1 });
// domainIngestionSchema.index({ createdAt: -1 });
// domainIngestionSchema.index({ domain: 1, createdAt: -1 });

// // 🔥 MIDDLEWARE - Auto-update progress when status changes
// domainIngestionSchema.pre('save', function(next) {
//   // If status is 'completed' and progress is not 100, set it to 100
//   if (this.status === 'completed' && this.progress !== 100) {
//     this.progress = 100;
//   }
  
//   // Set success flag based on status
//   if (this.status === 'completed') {
//     this.success = true;
//   } else if (this.status === 'failed') {
//     this.success = false;
//   }
  
//   next();
// });

// // 🔥 MIDDLEWARE - Also handle findOneAndUpdate
// domainIngestionSchema.pre('findOneAndUpdate', function(next) {
//   const update = this.getUpdate();
  
//   // If updating status to 'completed', also set progress to 100
//   if (update.$set && update.$set.status === 'completed' && !update.$set.progress) {
//     update.$set.progress = 100;
//     update.$set.success = true;
//   }
  
//   // If update object doesn't have $set
//   if (update.status === 'completed' && !update.progress) {
//     update.progress = 100;
//     update.success = true;
//   }
  
//   next();
// });


// // Add methods for easier querying
// domainIngestionSchema.statics.findBySession = function(sessionId) {
//   return this.findOne({ sessionId });
// };

// domainIngestionSchema.statics.findByDomain = function(domain, limit = 10) {
//   return this.find({ domain })
//     .sort({ createdAt: -1 })
//     .limit(limit);
// };

// domainIngestionSchema.statics.getRecentIngestions = function(limit = 20) {
//   return this.find({ status: 'completed' })
//     .sort({ completedAt: -1 })
//     .limit(limit);
// };

// // UPDATED: Knowledge Graph Schema
// const knowledgeGraphSchema = new mongoose.Schema({
//   domain: {
//     type: String,
//     required: true
//   },
//   ingestionId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'DomainIngestion',
//     required: true
//   },
//   sessionId: {
//     type: String,
//     required: true
//   },
//   nodes: mongoose.Schema.Types.Mixed,
//   edges: mongoose.Schema.Types.Mixed,
//   pathways: mongoose.Schema.Types.Mixed,
//   learningSequences: mongoose.Schema.Types.Mixed,
//   graphStats: {
//     totalNodes: Number,
//     totalEdges: Number,
//     avgConnections: Number,
//     graphDensity: Number,
//     complexityScore: Number
//   },
//   optimizationResults: mongoose.Schema.Types.Mixed,
//   createdAt: {
//     type: Date,
//     default: Date.now
//   },
//   updatedAt: {
//     type: Date,
//     default: Date.now
//   }
// }, {
//   timestamps: true
// });

// // Knowledge Graph indexes
// knowledgeGraphSchema.index({ domain: 1, createdAt: -1 });
// knowledgeGraphSchema.index({ ingestionId: 1 });
// knowledgeGraphSchema.index({ sessionId: 1 });

// // UPDATED: Crawled Document Schema
// const crawledDocumentSchema = new mongoose.Schema({
//   domain: {
//     type: String,
//     required: true
//   },
//   sourceType: {
//     type: String,
//     enum: ['academic_paper', 'technical_doc', 'code_repo', 'video_tutorial', 'expert_interview', 'industry_report'],
//     required: true
//   },
//   title: {
//     type: String,
//     required: true
//   },
//   url: {
//     type: String,
//     required: true
//   },
//   content: {
//     summary: String,
//     fullText: String,
//     extractedConcepts: [String],
//     keyPoints: [String]
//   },
//   metadata: mongoose.Schema.Types.Mixed,
//   processingStatus: {
//     type: String,
//     enum: ['raw', 'processed', 'analyzed', 'integrated'],
//     default: 'raw'
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now
//   },
//   updatedAt: {
//     type: Date,
//     default: Date.now
//   }
// }, {
//   timestamps: true
// });
// console.log(knowledgeGraphSchema);


// // Crawled Document indexes
// crawledDocumentSchema.index({ domain: 1, sourceType: 1 });
// crawledDocumentSchema.index({ url: 1 }, { unique: true });
// crawledDocumentSchema.index({ createdAt: -1 });

// // Create models
// const DomainIngestion = mongoose.model('DomainIngestion', domainIngestionSchema);
// const KnowledgeGraph = mongoose.model('KnowledgeGraph', knowledgeGraphSchema);
// const CrawledDocument = mongoose.model('CrawledDocument', crawledDocumentSchema);

// // Export models
// module.exports = DomainIngestion;
// module.exports.KnowledgeGraph = KnowledgeGraph;
// module.exports.CrawledDocument = CrawledDocument;





















