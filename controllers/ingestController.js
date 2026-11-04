// server/controllers/ingestController.js
const IngestionService = require('../services/ingestion-service');
const { DomainIngestion } = require('../models/DomainIngestion');
const baseConstants = require('../config/baseConstants');

// Initialize services
const ingestionService = new IngestionService();
const activeIngestions = new Map();

// Enhanced logging helper
const logWithContext = (level, message, context = {}) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} [${level.toUpperCase()}] ${message}`, JSON.stringify(context));
};

// Performance tracking helper
const trackPerformance = (operation, duration, context = {}) => {
  logWithContext('info', `Performance: ${operation} completed in ${duration}ms`, context);
};

// ✅ Start domain ingestion process
const startIngestion = async (req, res) => {
  const startTime = Date.now();
  let sessionId = null;
  
  try {
    const { domain } = req.body;
    
    if (!domain || typeof domain !== 'string' || domain.trim().length === 0) {
      logWithContext('warn', 'Ingestion start attempted without valid domain', { 
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      return res.status(400).json({ 
        success: false,
        error: 'Domain is required and must be a non-empty string' 
      });
    }

    // Generate unique session ID
    sessionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logWithContext('info', `Starting ingestion process for domain: ${domain}`, { 
      sessionId, 
      domain,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    // Store active ingestion with comprehensive metadata
    activeIngestions.set(sessionId, {
      domain: domain.trim(),
      status: 'starting',
      progress: 0,
      currentStep: 0,
      startTime: new Date(),
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      stats: { 
        documentsProcessed: 0, 
        conceptsExtracted: 0, 
        neuralConnections: 0,
        errors: 0,
        warnings: 0
      },
      steps: {
        analysis: { status: 'pending', startTime: null, endTime: null },
        collection: { status: 'pending', startTime: null, endTime: null },
        processing: { status: 'pending', startTime: null, endTime: null },
        knowledgeGraph: { status: 'pending', startTime: null, endTime: null },
        optimization: { status: 'pending', startTime: null, endTime: null }
      }
    });

    // Start ingestion process asynchronously
    performIngestionProcess(sessionId, domain.trim()).catch(error => {
      logWithContext('error', `Async ingestion process failed for session ${sessionId}`, {
        error: error.message,
        sessionId,
        domain
      });
    });
    
    const duration = Date.now() - startTime;
    trackPerformance('ingestion_start', duration, { sessionId, domain });
    
    res.json({ 
      success: true,
      sessionId, 
      status: 'started',
      message: 'Domain ingestion process initiated successfully',
      domain: domain.trim(),
      estimatedTime: '3-8 minutes',
      endpoints: {
        progress: `/api/ingest/progress/${sessionId}`,
        status: `/api/ingest/status/${sessionId}`,
        data: `/api/ingest/data/${sessionId}`
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Failed to start ingestion process', { 
      sessionId, 
      domain: req.body?.domain,
      error: error.message,
      stack: error.stack,
      duration 
    });
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to start ingestion process',
      sessionId,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
};

// ✅ Get ingestion progress (detailed for UI updates)
const getIngestionProgress = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({ 
        success: false,
        error: 'Session ID is required' 
      });
    }
    
    const ingestion = activeIngestions.get(sessionId);
    if (!ingestion) {
      logWithContext('warn', `Progress requested for non-existent session: ${sessionId}`, {
        ip: req.ip
      });
      return res.status(404).json({ 
        success: false,
        error: 'Ingestion session not found',
        sessionId,
        suggestion: 'The session may have completed or expired. Try fetching the final data instead.'
      });
    }
    
    // Calculate comprehensive timing information
    const now = new Date();
    const elapsed = now - ingestion.startTime;
    const estimatedTotal = ingestion.progress > 5 ? (elapsed / ingestion.progress) * 100 : null;
    const estimatedRemaining = estimatedTotal ? Math.max(0, estimatedTotal - elapsed) : null;
    
    // Calculate step-specific progress
    const stepProgress = calculateStepProgress(ingestion);
    
    const response = {
      success: true,
      sessionId,
      domain: ingestion.domain,
      status: ingestion.status,
      progress: ingestion.progress,
      currentStep: ingestion.currentStep,
      stepDetails: stepProgress,
      stats: ingestion.stats,
      steps: ingestion.steps,
      timing: {
        elapsedTime: elapsed,
        elapsedTimeFormatted: formatDuration(elapsed),
        estimatedTotalTime: estimatedTotal,
        estimatedRemainingTime: estimatedRemaining,
        estimatedRemainingFormatted: estimatedRemaining ? formatDuration(estimatedRemaining) : null
      },
      lastUpdate: ingestion.lastUpdate || ingestion.startTime,
      lastChecked: now.toISOString()
    };
    
    res.json(response);
  } catch (error) {
    logWithContext('error', 'Failed to get progress', { 
      sessionId: req.params.sessionId,
      error: error.message 
    });
    res.status(500).json({ 
      success: false,
      error: 'Failed to get progress' 
    });
  }
};

// ✅ Get completed ingestion data (full dataset)
const getIngestionData = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    logWithContext('info', `Fetching ingestion data for session: ${sessionId}`, {
      sessionId,
      ip: req.ip
    });
    
    // Check if still in progress first
    const activeIngestion = activeIngestions.get(sessionId);
    if (activeIngestion && activeIngestion.status !== 'completed') {
      return res.json({
        success: true,
        ...activeIngestion,
        isActive: true,
        message: 'Ingestion still in progress',
        progressEndpoint: `/api/ingest/progress/${sessionId}`
      });
    }
    
    // Find completed ingestion in database
    const ingestion = await DomainIngestion.findOne({ sessionId });
    
    if (!ingestion) {
      logWithContext('warn', `Ingestion not found for session: ${sessionId}`);
      return res.status(404).json({ 
        success: false, 
        message: 'Ingestion session not found',
        sessionId,
        suggestion: 'Check if the session ID is correct or if the ingestion has been cleaned up.'
      });
    }
    
    // Return complete data structure for frontend
    const responseData = {
      success: true,
      _id: ingestion._id,
      domain: ingestion.domain,
      sessionId: ingestion.sessionId,
      status: ingestion.status,
      progress: ingestion.progress || 100,
      currentStep: ingestion.currentStep || 5,
      
      // Core analysis results
      analysisResults: ingestion.analysisResults || {},
      
      // Collection results with source counts
      collectionResults: ingestion.collectionResults || {},
      
      // Processing results with concepts and relationships
      processingResults: ingestion.processingResults || {
        concepts: [],
        relationships: [],
        processingStats: {}
      },
      
      // Knowledge graph data for visualization
      knowledgeGraph: ingestion.knowledgeGraph || {
        nodes: [],
        edges: [],
        stats: {}
      },
      
      // Optimization results with learning pathways
      optimization: ingestion.optimization || {
        pathways: [],
        learningSequences: [],
        optimizationStats: {}
      },
      
      // Statistics and metadata
      crawlStats: ingestion.crawlStats || {},
      metadata: ingestion.metadata || {},
      performance: ingestion.performance || {},
      
      // Timing information
      startTime: ingestion.startTime,
      completedAt: ingestion.completedAt,
      totalDuration: ingestion.totalDuration,
      createdAt: ingestion.createdAt,
      updatedAt: ingestion.updatedAt,
      
      // Status flags
      success: ingestion.success,
      error: ingestion.error,
      isActive: false,
      
      // Summary for quick reference
      summary: {
        concepts: ingestion.processingResults?.concepts?.length || 0,
        relationships: ingestion.processingResults?.relationships?.length || 0,
        nodes: ingestion.knowledgeGraph?.nodes?.length || 0,
        edges: ingestion.knowledgeGraph?.edges?.length || 0,
        pathways: ingestion.optimization?.pathways?.length || 0,
        learningTime: ingestion.optimization?.optimizationStats?.recommendedLearningTime,
        complexity: ingestion.analysisResults?.complexity,
        category: ingestion.analysisResults?.technicalCategory
      }
    };
    
    logWithContext('info', `Successfully fetched ingestion data for session: ${sessionId}`, {
      sessionId,
      domain: ingestion.domain,
      status: ingestion.status,
      hasKnowledgeGraph: !!(ingestion.knowledgeGraph?.nodes?.length),
      nodeCount: ingestion.knowledgeGraph?.nodes?.length || 0,
      edgeCount: ingestion.knowledgeGraph?.edges?.length || 0,
      conceptCount: ingestion.processingResults?.concepts?.length || 0
    });
    
    res.json(responseData);
    
  } catch (error) {
    logWithContext('error', `Error fetching ingestion data: ${error.message}`, { 
      sessionId: req.params.sessionId,
      error: error.message,
      stack: error.stack 
    });
    
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error while fetching ingestion data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
};

// ✅ Get ingestion status (lightweight for polling)
const getIngestionStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Check active ingestions first (in-memory, faster)
    const activeIngestion = activeIngestions.get(sessionId);
    if (activeIngestion) {
      const elapsedTime = Date.now() - activeIngestion.startTime;
      const progressRate = activeIngestion.progress > 0 ? elapsedTime / activeIngestion.progress : 0;
      
      return res.json({
        success: true,
        sessionId,
        domain: activeIngestion.domain,
        status: activeIngestion.status,
        progress: activeIngestion.progress || 0,
        currentStep: activeIngestion.currentStep || 0,
        stats: activeIngestion.stats || {},
        isActive: true,
        timing: {
          elapsedTime,
          elapsedTimeFormatted: formatDuration(elapsedTime),
          estimatedRemaining: progressRate > 0 ? Math.max(0, (100 - activeIngestion.progress) * progressRate) : null
        },
        lastUpdate: activeIngestion.lastUpdate || activeIngestion.startTime
      });
    }
    
    // Check database for completed ingestion (lightweight query)
    const ingestion = await DomainIngestion.findOne({ sessionId })
      .select('sessionId status progress currentStep crawlStats domain completedAt success totalDuration error');
    
    if (!ingestion) {
      return res.status(404).json({ 
        success: false, 
        message: 'Ingestion session not found',
        sessionId,
        suggestion: 'Verify the session ID or check if the session has expired.'
      });
    }
    
    res.json({
      success: true,
      sessionId: ingestion.sessionId,
      domain: ingestion.domain,
      status: ingestion.status,
      progress: ingestion.status === 'completed' ? 100 : (ingestion.progress || 0),
      currentStep: ingestion.currentStep || 0,
      stats: ingestion.crawlStats || {},
      isActive: false,
      completedAt: ingestion.completedAt,
      totalDuration: ingestion.totalDuration,
      success: ingestion.success,
      error: ingestion.error
    });
    
  } catch (error) {
    logWithContext('error', `Error fetching ingestion status: ${error.message}`, {
      sessionId: req.params.sessionId,
      error: error.message
    });
    
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error while fetching status' 
    });
  }
};

// ✅ Get latest knowledge graph (fallback endpoint)
const getLatestKnowledgeGraph = async (req, res) => {
  try {
    logWithContext('info', 'Fetching latest completed knowledge graph');
    
    // Find the most recent completed ingestion with a knowledge graph
    const latestIngestion = await DomainIngestion.findOne({ 
      status: 'completed',
      success: true,
      'knowledgeGraph.nodes': { $exists: true, $not: { $size: 0 } }
    })
    .sort({ completedAt: -1 })
    .limit(1);
    
    if (!latestIngestion) {
      return res.status(404).json({
        success: false,
        message: 'No completed knowledge graphs found',
        suggestion: 'Try running a new ingestion to generate a knowledge graph.'
      });
    }
    
    const responseData = {
      success: true,
      _id: latestIngestion._id,
      domain: latestIngestion.domain,
      sessionId: latestIngestion.sessionId,
      status: latestIngestion.status,
      knowledgeGraph: latestIngestion.knowledgeGraph,
      optimization: latestIngestion.optimization,
      completedAt: latestIngestion.completedAt,
      stats: latestIngestion.knowledgeGraph?.stats || {},
      metadata: latestIngestion.metadata || {},
      summary: {
        nodes: latestIngestion.knowledgeGraph?.nodes?.length || 0,
        edges: latestIngestion.knowledgeGraph?.edges?.length || 0,
        pathways: latestIngestion.optimization?.pathways?.length || 0,
        complexity: latestIngestion.knowledgeGraph?.stats?.complexityScore
      }
    };
    
    logWithContext('info', `Found latest knowledge graph`, {
      sessionId: latestIngestion.sessionId,
      domain: latestIngestion.domain,
      nodeCount: latestIngestion.knowledgeGraph?.nodes?.length || 0,
      edgeCount: latestIngestion.knowledgeGraph?.edges?.length || 0
    });
    
    res.json(responseData);
    
  } catch (error) {
    logWithContext('error', `Error fetching latest knowledge graph: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching knowledge graph'
    });
  }
};

// ✅ Analyze domain (standalone endpoint)
const analyzeDomain = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { domain } = req.body;
    
    if (!domain || typeof domain !== 'string' || domain.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Domain is required and must be a non-empty string' 
      });
    }
    
    logWithContext('info', `Analyzing domain: ${domain}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    const analysis = await ingestionService.analyzeDomainRequirements(domain.trim());
    
    const duration = Date.now() - startTime;
    trackPerformance('domain_analysis', duration, { domain: domain.trim() });
    
    res.json({
      success: true,
      domain: domain.trim(),
      analysis,
      processingTime: `${duration}ms`,
      timestamp: new Date().toISOString(),
      recommendations: generateAnalysisRecommendations(analysis)
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Domain analysis failed', {
      domain: req.body?.domain,
      error: error.message,
      duration
    });
    
    res.status(500).json({ 
      success: false,
      error: 'Domain analysis failed', 
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
};

// ✅ Crawl knowledge sources (standalone endpoint)
const crawlKnowledge = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { domain, sources = [] } = req.body;
    
    if (!domain || typeof domain !== 'string' || domain.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Domain is required and must be a non-empty string' 
      });
    }
    
    logWithContext('info', `Starting knowledge crawl for domain: ${domain}`, {
      domain: domain.trim(),
      sourcesProvided: sources.length,
      ip: req.ip
    });
    
    const crawlResults = await ingestionService.collectKnowledgeSources(domain.trim());
    
    const duration = Date.now() - startTime;
    trackPerformance('knowledge_crawl', duration, { 
      domain: domain.trim(),
      academicPapers: crawlResults.academicPapers || 0,
      technicalDocs: crawlResults.technicalDocs || 0,
      codeRepos: crawlResults.codeRepos || 0
    });
    
    res.json({
      success: true,
      domain: domain.trim(),
      results: crawlResults,
      processingTime: `${duration}ms`,
      timestamp: new Date().toISOString(),
      summary: {
        totalSources: (crawlResults.academicPapers || 0) + 
                     (crawlResults.technicalDocs || 0) + 
                     (crawlResults.codeRepos || 0) + 
                     (crawlResults.videoTutorials || 0) + 
                     (crawlResults.industryReports || 0),
        fallbackUsed: crawlResults.fallbackUsed || false
      }
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Knowledge crawling failed', {
      domain: req.body?.domain,
      error: error.message,
      duration
    });
    
    res.status(500).json({ 
      success: false,
      error: 'Knowledge crawling failed', 
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
};

// ✅ Process information (standalone endpoint)
const processInformation = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { collectedData, domain } = req.body;
    
    if (!collectedData) {
      return res.status(400).json({ 
        success: false,
        error: 'Collected data is required for processing' 
      });
    }
    
    logWithContext('info', 'Processing collected information', {
      domain: domain || 'unknown',
      hasRawData: !!collectedData.rawData,
      ip: req.ip
    });
    
    const processedResults = await ingestionService.processInformation(collectedData);
    
    const duration = Date.now() - startTime;
    trackPerformance('information_processing', duration, { 
      domain,
      conceptsExtracted: processedResults.concepts?.length || 0,
      relationshipsIdentified: processedResults.relationships?.length || 0
    });
    
    res.json({
      success: true,
      domain: domain || 'unknown',
      processed: processedResults,
      processingTime: `${duration}ms`,
      timestamp: new Date().toISOString(),
      summary: {
        concepts: processedResults.concepts?.length || 0,
        relationships: processedResults.relationships?.length || 0,
        processingStats: processedResults.processingStats || {}
      }
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Information processing failed', {
      domain: req.body?.domain,
      error: error.message,
      duration
    });
    
    res.status(500).json({ 
      success: false,
      error: 'Information processing failed', 
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
};

// ✅ Build knowledge graph (standalone endpoint)
const buildKnowledgeGraph = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { concepts, relationships, domain } = req.body;
    
    if (!concepts || !Array.isArray(concepts)) {
      return res.status(400).json({ 
        success: false,
        error: 'Concepts array is required for knowledge graph building' 
      });
    }
    
    if (!relationships || !Array.isArray(relationships)) {
      return res.status(400).json({ 
        success: false,
        error: 'Relationships array is required for knowledge graph building' 
      });
    }
    
    logWithContext('info', 'Building knowledge graph', {
      domain: domain || 'unknown',
      conceptsCount: concepts.length,
      relationshipsCount: relationships.length,
      ip: req.ip
    });
    
    const knowledgeGraph = await ingestionService.buildKnowledgeGraph(concepts, relationships);
    
    const duration = Date.now() - startTime;
    trackPerformance('knowledge_graph_building', duration, {
      domain,
      nodesCount: knowledgeGraph.nodes?.length || 0,
      edgesCount: knowledgeGraph.edges?.length || 0
    });
    
    res.json({
      success: true,
      domain: domain || 'unknown',
      knowledgeGraph,
      processingTime: `${duration}ms`,
      timestamp: new Date().toISOString(),
      summary: {
        nodes: knowledgeGraph.nodes?.length || 0,
        edges: knowledgeGraph.edges?.length || 0,
        stats: knowledgeGraph.stats || {}
      }
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Knowledge graph building failed', {
      domain: req.body?.domain,
      error: error.message,
      duration
    });
    
    res.status(500).json({ 
      success: false,
      error: 'Knowledge graph building failed', 
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
};

// ✅ Optimize neural pathways (standalone endpoint)
const optimizeNeuralPathways = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { knowledgeGraph, domain } = req.body;
    
    if (!knowledgeGraph || typeof knowledgeGraph !== 'object') {
      return res.status(400).json({ 
        success: false,
        error: 'Knowledge graph object is required for pathway optimization' 
      });
    }
    
    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ 
        success: false,
        error: 'Domain is required for pathway optimization' 
      });
    }
    
    logWithContext('info', 'Optimizing neural pathways', {
      domain: domain.trim(),
      graphSize: knowledgeGraph.nodes?.length || 0,
      ip: req.ip
    });
    
    const optimization = await ingestionService.optimizeNeuralPathways(knowledgeGraph, domain.trim());
    
    const duration = Date.now() - startTime;
    trackPerformance('neural_pathway_optimization', duration, { 
      domain: domain.trim(),
      pathwaysGenerated: optimization.pathways?.length || 0
    });
    
    res.json({
      success: true,
      domain: domain.trim(),
      optimization,
      processingTime: `${duration}ms`,
      timestamp: new Date().toISOString(),
      summary: {
        pathways: optimization.pathways?.length || 0,
        learningSequences: optimization.learningSequences?.length || 0,
        optimizationStats: optimization.optimizationStats || {}
      }
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Neural pathway optimization failed', {
      domain: req.body?.domain,
      error: error.message,
      duration
    });
    
    res.status(500).json({ 
      success: false,
      error: 'Neural pathway optimization failed', 
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
};

// ✅ Get crawler statistics
const getCrawlerStats = async (req, res) => {
  try {
    const stats = ingestionService.getRealTimeStats();
    
    const activeCount = activeIngestions.size;
    const activeList = Array.from(activeIngestions.values());
    
    // Calculate active ingestions summary
    const activeSummary = {
      total: activeCount,
      byStatus: activeList.reduce((acc, ing) => {
        acc[ing.status] = (acc[ing.status] || 0) + 1;
        return acc;
      }, {}),
      totalProcessed: activeList.reduce((sum, ing) => sum + (ing.stats?.documentsProcessed || 0), 0),
      avgProgress: activeCount > 0 ? 
        Math.round(activeList.reduce((sum, ing) => sum + (ing.progress || 0), 0) / activeCount) : 0
    };
    
    const enhancedStats = {
      ...stats,
      activeIngestions: activeSummary,
      systemInfo: {
        uptime: Math.round(process.uptime()),
        uptimeFormatted: formatDuration(process.uptime() * 1000),
        memoryUsage: {
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB',
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
        },
        nodeVersion: process.version,
        platform: process.platform
      }
    };
    
    res.json({
      success: true,
      stats: enhancedStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logWithContext('error', 'Failed to get crawler statistics', { error: error.message });
    res.status(500).json({ 
      success: false,
      error: 'Failed to get crawler statistics' 
    });
  }
};

// ✅ Get all active ingestions
const getActiveIngestions = async (req, res) => {
  try {
    const active = Array.from(activeIngestions.entries()).map(([id, data]) => ({
      sessionId: id,
      domain: data.domain,
      status: data.status,
      progress: data.progress,
      currentStep: data.currentStep,
      startTime: data.startTime,
      elapsedTime: Date.now() - data.startTime,
      elapsedTimeFormatted: formatDuration(Date.now() - data.startTime),
      stats: data.stats,
      userAgent: data.userAgent,
      ip: data.ip,
      steps: data.steps
    }));
    
    // Sort by start time (most recent first)
    active.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
    const summary = {
      total: active.length,
      completed: active.filter(ing => ing.status === 'completed').length,
      running: active.filter(ing => 
        ing.status !== 'completed' && 
        ing.status !== 'failed' && 
        ing.status !== 'interrupted'
      ).length,
      failed: active.filter(ing => ing.status === 'failed').length,
      avgProgress: active.length > 0 ? 
        Math.round(active.reduce((sum, ing) => sum + ing.progress, 0) / active.length) : 0
    };
    
    res.json({
      success: true,
      activeIngestions: active,
      summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logWithContext('error', 'Failed to get active ingestions', { error: error.message });
    res.status(500).json({ 
      success: false,
      error: 'Failed to get active ingestions' 
    });
  }
};

// ✅ Get recent completed ingestions
const getRecentIngestions = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Max 50 items
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;
    
    // Query with proper field selection for performance
    const ingestions = await DomainIngestion.find({ 
      status: 'completed',
      success: true
    })
    .select('domain sessionId completedAt totalDuration analysisResults.technicalCategory analysisResults.complexity metadata.complexityScore processingResults.concepts.length knowledgeGraph.stats.totalNodes')
    .sort({ completedAt: -1 })
    .skip(skip)
    .limit(limit);
    
    const total = await DomainIngestion.countDocuments({ 
      status: 'completed',
      success: true
    });
    
    // Enhance the data with computed fields
    const enhancedIngestions = ingestions.map(ing => ({
      _id: ing._id,
      domain: ing.domain,
      sessionId: ing.sessionId,
      completedAt: ing.completedAt,
      totalDuration: ing.totalDuration,
      totalDurationFormatted: ing.totalDuration ? formatDuration(ing.totalDuration) : 'Unknown',
      category: ing.analysisResults?.technicalCategory || 'General Technology',
      complexity: ing.analysisResults?.complexity || 'intermediate',
      complexityScore: ing.metadata?.complexityScore || 0,
      conceptsCount: ing.processingResults?.concepts?.length || 0,
      nodesCount: ing.knowledgeGraph?.stats?.totalNodes || 0
    }));
    
    res.json({
      success: true,
      ingestions: enhancedIngestions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logWithContext('error', 'Failed to get recent ingestions', { error: error.message });
    res.status(500).json({ 
      success: false,
      error: 'Failed to get recent ingestions' 
    });
  }
};

// ✅ Test crawler functionality
const testCrawler = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { url, maxPages = 3 } = req.body;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ 
        success: false,
        error: 'URL is required and must be a string' 
      });
    }
    
    // Validate URL format
    try {
      new URL(url);
    } catch (urlError) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid URL format',
        example: 'https://example.com/page'
      });
    }
    
    // Validate maxPages
    const validMaxPages = Math.min(Math.max(parseInt(maxPages) || 3, 1), 10); // 1-10 pages max
    
    logWithContext('info', `Testing crawler with URL: ${url}`, {
      url,
      maxPages: validMaxPages,
      ip: req.ip
    });
    
    // Use a test domain for crawler testing
    const testResults = await ingestionService.collectKnowledgeSources('test crawler domain');
    
    const duration = Date.now() - startTime;
    trackPerformance('crawler_test', duration, {
      url,
      maxPages: validMaxPages,
      success: true
    });
    
    res.json({
      success: true,
      testResults,
      processingTime: `${duration}ms`,
      requestedUrl: url,
      maxPages: validMaxPages,
      timestamp: new Date().toISOString(),
      note: 'This is a test using the knowledge collection service. Real URL crawling would require additional implementation.'
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Crawler test failed', {
      url: req.body?.url,
      error: error.message,
      duration
    });
    
    res.status(500).json({ 
      success: false,
      error: 'Crawler test failed', 
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
};

// ✅ Delete ingestion (cleanup endpoint)
const deleteIngestion = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }
    
    logWithContext('info', `Deleting ingestion for session: ${sessionId}`, {
      sessionId,
      ip: req.ip
    });
    
    // Remove from active ingestions if present
    const wasActive = activeIngestions.delete(sessionId);
    
    // Remove from database
    const deletedIngestion = await DomainIngestion.findOneAndDelete({ sessionId });
    
    if (!deletedIngestion && !wasActive) {
      return res.status(404).json({
        success: false,
        message: 'Ingestion session not found',
        sessionId
      });
    }
    
    logWithContext('info', `Successfully deleted ingestion for session: ${sessionId}`, {
      sessionId,
      wasActive,
      wasInDatabase: !!deletedIngestion
    });
    
    res.json({
      success: true,
      message: 'Ingestion deleted successfully',
      sessionId,
      deletedFrom: {
        activeMemory: wasActive,
        database: !!deletedIngestion
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logWithContext('error', 'Failed to delete ingestion', {
      sessionId: req.params.sessionId,
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to delete ingestion'
    });
  }
};

// ✅ Health check endpoint
const healthCheck = async (req, res) => {
  try {
    const health = await ingestionService.healthCheck();
    
    const activeIngestionsCount = activeIngestions.size;
    const memoryUsage = process.memoryUsage();
    
    const healthData = {
      ...health,
      activeIngestions: activeIngestionsCount,
      systemHealth: {
        uptime: process.uptime(),
        memoryUsage: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024)
        },
        loadAverage: require('os').loadavg()
      },
      endpoints: {
        total: Object.keys(module.exports).length,
        active: true
      }
    };
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthData);
    
  } catch (error) {
    logWithContext('error', 'Health check failed', { error: error.message });
    
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
};

// ✅ HELPER FUNCTIONS

// Calculate step-specific progress details
const calculateStepProgress = (ingestion) => {
  const steps = [
    { name: 'Domain Analysis', key: 'analysis', weight: 20 },
    { name: 'Knowledge Collection', key: 'collection', weight: 25 },
    { name: 'Information Processing', key: 'processing', weight: 25 },
    { name: 'Knowledge Graph Building', key: 'knowledgeGraph', weight: 20 },
    { name: 'Neural Pathway Optimization', key: 'optimization', weight: 10 }
  ];
  
  return steps.map((step, index) => ({
    ...step,
    stepNumber: index + 1,
    status: ingestion.steps?.[step.key]?.status || 'pending',
    isActive: ingestion.currentStep === index + 1,
    isCompleted: ingestion.currentStep > index + 1,
    progress: ingestion.currentStep > index + 1 ? 100 : 
              ingestion.currentStep === index + 1 ? Math.max(0, ingestion.progress - (steps.slice(0, index).reduce((sum, s) => sum + s.weight, 0))) : 0
  }));
};

// Format duration in human-readable format
const formatDuration = (milliseconds) => {
  if (!milliseconds) return '0s';
  
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

// Generate analysis-based recommendations
const generateAnalysisRecommendations = (analysis) => {
  const recommendations = [];
  
  if (!analysis.isTechnical) {
    return analysis.suggestions || [];
  }
  
  if (analysis.complexity === 'advanced') {
    recommendations.push('Consider starting with fundamental concepts before diving into advanced topics');
    recommendations.push('Allocate extra time for understanding complex relationships');
  }
  
  if (analysis.complexity === 'beginner') {
    recommendations.push('This domain is beginner-friendly - perfect for getting started quickly');
    recommendations.push('Focus on hands-on practice to reinforce learning');
  }
  
  if (analysis.primaryConcepts?.length > 10) {
    recommendations.push('This domain has many concepts - consider breaking learning into smaller chunks');
  }
  
  if (analysis.prerequisites?.length > 5) {
    recommendations.push('Review prerequisites thoroughly before starting the main content');
  }
  
  return recommendations.length > 0 ? recommendations : [
    'Proceed with the ingestion to get detailed learning pathways',
    'The system will generate optimized learning sequences based on your domain'
  ];
};

// ✅ ASYNC INGESTION PROCESS (Main background function)
async function performIngestionProcess(sessionId, domain) {
  const ingestion = activeIngestions.get(sessionId);
  const overallStartTime = Date.now();
  
  if (!ingestion) {
    logWithContext('error', `Ingestion process called for non-existent session: ${sessionId}`);
    return;
  }
  
  try {
    logWithContext('info', `Starting complete ingestion process`, { 
      sessionId, 
      domain,
      startTime: new Date().toISOString()
    });

    // Enhanced progress callback with step tracking
    const progressCallback = (update) => {
      const current = activeIngestions.get(sessionId);
      if (current) {
        const previousProgress = current.progress || 0;
        
        current.progress = Math.max(previousProgress, update.progress || 0);
        current.currentStep = update.step || current.currentStep;
        current.status = update.status || current.status;
        current.lastUpdate = new Date();
        
        // Update step details if provided
        if (update.step && current.steps) {
          const stepNames = ['analysis', 'collection', 'processing', 'knowledgeGraph', 'optimization'];
          const stepKey = stepNames[update.step - 1];
          if (stepKey && current.steps[stepKey]) {
            current.steps[stepKey].status = update.status === 'completed' ? 'completed' : 'running';
            if (update.status === 'completed') {
              current.steps[stepKey].endTime = new Date();
            } else if (!current.steps[stepKey].startTime) {
              current.steps[stepKey].startTime = new Date();
            }
          }
        }
        
        if (update.stats) {
          current.stats = { ...current.stats, ...update.stats };
        }
        
        if (update.details) {
          current.details = update.details;
        }
        
        // Log significant progress updates
        if (update.progress && (
          update.progress >= 100 ||
          update.progress % 25 === 0 ||
          update.progress - previousProgress >= 10
        )) {
          logWithContext('info', `Progress update for ${sessionId}`, {
            sessionId,
            domain,
            progress: update.progress,
            step: update.step,
            status: update.status,
            details: update.details
          });
        }
        
        activeIngestions.set(sessionId, current);
      }
    };
    
    // Initialize first step
    progressCallback({ 
      progress: 5, 
      step: 1, 
      status: 'analyzing',
      details: 'Starting domain analysis...'
    });
    
    // Start the comprehensive ingestion process
    const results = await ingestionService.performCompleteIngestion(
      domain, 
      progressCallback, 
      sessionId
    );
    
    // Handle results based on success/failure
    if (results.success) {
      progressCallback({ 
        progress: 95, 
        step: 5, 
        status: 'saving',
        details: 'Saving results to database...'
      });
      
      // Save results with retry logic
      let saveResult;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          saveResult = await ingestionService.saveResults(results);
          logWithContext('info', `Results saved successfully for session ${sessionId}`, {
            sessionId,
            ingestionId: saveResult.ingestionId,
            saved: saveResult.saved
          });
          break;
        } catch (saveError) {
          retryCount++;
          logWithContext('warn', `Save attempt ${retryCount} failed for session ${sessionId}`, {
            error: saveError.message,
            sessionId,
            domain,
            retryCount,
            maxRetries
          });
          
          if (retryCount === maxRetries) {
            throw new Error(`Failed to save after ${maxRetries} attempts: ${saveError.message}`);
          }
          
          // Exponential backoff: 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        }
      }
      
      // Update final success status
      const finalIngestion = activeIngestions.get(sessionId);
      if (finalIngestion) {
        finalIngestion.status = 'completed';
        finalIngestion.progress = 100;
        finalIngestion.currentStep = 5;
        finalIngestion.results = results;
        finalIngestion.saved = saveResult?.saved || false;
        finalIngestion.ingestionId = saveResult?.ingestionId;
        finalIngestion.completedAt = new Date();
        finalIngestion.processingTime = Date.now() - overallStartTime;
        finalIngestion.error = null;
        
        // Mark all steps as completed
        if (finalIngestion.steps) {
          Object.keys(finalIngestion.steps).forEach(stepKey => {
            finalIngestion.steps[stepKey].status = 'completed';
            if (!finalIngestion.steps[stepKey].endTime) {
              finalIngestion.steps[stepKey].endTime = new Date();
            }
          });
        }
        
        activeIngestions.set(sessionId, finalIngestion);
      }
      
      const totalDuration = Date.now() - overallStartTime;
      
      logWithContext('info', `Ingestion completed successfully for session ${sessionId}`, {
        sessionId,
        domain,
        duration: totalDuration,
        durationFormatted: formatDuration(totalDuration),
        concepts: results.steps?.processing?.concepts?.length || 0,
        relationships: results.steps?.processing?.relationships?.length || 0,
        nodes: results.steps?.knowledgeGraph?.nodes?.length || 0,
        pathways: results.steps?.optimization?.pathways?.length || 0,
        saved: saveResult?.saved || false
      });
      
      trackPerformance('complete_ingestion_success', totalDuration, {
        sessionId,
        domain,
        concepts: results.steps?.processing?.concepts?.length || 0,
        relationships: results.steps?.processing?.relationships?.length || 0
      });
      
    } else {
      // Handle failed ingestion
      throw new Error(results.error || 'Ingestion failed without specific error message');
    }
    
    // Schedule cleanup after 2 hours for completed ingestions
    setTimeout(() => {
      if (activeIngestions.has(sessionId)) {
        const ing = activeIngestions.get(sessionId);
        if (ing && ing.status === 'completed') {
          activeIngestions.delete(sessionId);
          logWithContext('info', `Cleaned up completed session ${sessionId} after timeout`);
        }
      }
    }, 7200000); // 2 hours
    
  } catch (error) {
    const totalDuration = Date.now() - overallStartTime;
    
    logWithContext('error', `Ingestion failed for session ${sessionId}`, {
      sessionId,
      domain,
      error: error.message,
      stack: error.stack,
      duration: totalDuration,
      durationFormatted: formatDuration(totalDuration)
    });
    
    // Update failed status
    const failedIngestion = activeIngestions.get(sessionId);
    if (failedIngestion) {
      failedIngestion.status = 'failed';
      failedIngestion.progress = Math.min(failedIngestion.progress || 0, 99); // Don't show 100% for failed
      failedIngestion.error = error.message;
      failedIngestion.errorDetails = process.env.NODE_ENV === 'development' ? error.stack : undefined;
      failedIngestion.failedAt = new Date();
      failedIngestion.processingTime = totalDuration;
      
      // Mark current step as failed
      if (failedIngestion.steps && failedIngestion.currentStep) {
        const stepNames = ['analysis', 'collection', 'processing', 'knowledgeGraph', 'optimization'];
        const currentStepKey = stepNames[failedIngestion.currentStep - 1];
        if (currentStepKey && failedIngestion.steps[currentStepKey]) {
          failedIngestion.steps[currentStepKey].status = 'failed';
          failedIngestion.steps[currentStepKey].error = error.message;
        }
      }
      
      activeIngestions.set(sessionId, failedIngestion);
    }
    
    trackPerformance('complete_ingestion_failed', totalDuration, {
      sessionId,
      domain,
      error: error.message
    });
    
    // Schedule cleanup after 1 hour for failed ingestions
    setTimeout(() => {
      if (activeIngestions.has(sessionId)) {
        activeIngestions.delete(sessionId);
        logWithContext('info', `Cleaned up failed session ${sessionId} after timeout`);
      }
    }, 3600000); // 1 hour
  }
}

// ✅ GRACEFUL SHUTDOWN HANDLERS
const gracefulShutdown = (signal) => {
  logWithContext('warn', `${signal} received, initiating graceful shutdown...`);
  
  let activeCount = 0;
  let completedCount = 0;
  let runningCount = 0;
  
  activeIngestions.forEach((ingestion, sessionId) => {
    if (ingestion.status === 'completed') {
      completedCount++;
    } else if (ingestion.status === 'failed') {
      // Already handled
    } else {
      ingestion.status = 'interrupted';
      ingestion.error = `Server shutdown (${signal})`;
      ingestion.interruptedAt = new Date();
      runningCount++;
    }
    activeCount++;
  });
  
  logWithContext('info', 'Graceful shutdown completed', {
    signal,
    totalActiveSessions: activeCount,
    completedSessions: completedCount,
    interruptedSessions: runningCount
  });
  
  // Clean up ingestion service
  if (ingestionService && ingestionService.cleanup) {
    ingestionService.cleanup().then(() => {
      logWithContext('info', 'Ingestion service cleaned up successfully');
    }).catch(error => {
      logWithContext('error', 'Error during ingestion service cleanup', { error: error.message });
    });
  }
  
  // Allow some time for cleanup, then exit
  setTimeout(() => {
    process.exit(0);
  }, 5000);
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logWithContext('error', 'Uncaught Exception', { 
    error: error.message, 
    stack: error.stack 
  });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logWithContext('error', 'Unhandled Rejection', { 
    reason: reason?.toString(), 
    promise: promise?.toString() 
  });
});

// ✅ EXPORT ALL CONTROLLER METHODS
module.exports = {
  // Core ingestion endpoints
  startIngestion,
  getIngestionProgress,
  getIngestionData,
  getIngestionStatus,
  getLatestKnowledgeGraph,
  
  // Standalone processing endpoints
  analyzeDomain,
  crawlKnowledge,
  processInformation,
  buildKnowledgeGraph,
  optimizeNeuralPathways,
  
  // Management and monitoring endpoints
  getCrawlerStats,
  getActiveIngestions,
  getRecentIngestions,
  deleteIngestion,
  testCrawler,
  healthCheck
};
