const baseConstants = {
  // ===== EXISTING API CONFIG (Keep these) =====
  MAX_TOKENS: 1200,
  TEMPERATURE: 0.2,
  DEFAULT_MODEL: process.env.OPENROUTER_MODEL || "meta-llama/llama-3-8b-instruct",
  TIMEOUT: 30000,

  // ===== ADD THESE MISSING CONSTANTS =====
  
  // Technical concepts categories for domain analysis
  TECHNICAL_CONCEPTS: [
    'Fundamentals',
    'Core Concepts',
    'Advanced Topics',
    'Practical Applications',
    'Tools & Technologies',
    'Best Practices',
    'Common Patterns',
    'Problem Solving Techniques'
  ],

  // Learning difficulty levels
  DIFFICULTY_LEVELS: ['beginner', 'intermediate', 'advanced', 'expert'],

  // Knowledge graph depth limits
  DEFAULT_DEPTH: 3,
  MAX_DEPTH: 5,
  MIN_DEPTH: 1,

  // Domain analysis categories
  DOMAIN_CATEGORIES: [
    'Prerequisites',
    'Learning Path',
    'Key Skills',
    'Resources',
    'Projects',
    'Career Applications'
  ],

  // Concept relationship types for knowledge graphs
  RELATIONSHIP_TYPES: [
    'requires',
    'leads_to',
    'related_to',
    'implements',
    'extends',
    'uses',
    'part_of'
  ],

  // Resource types for learning materials
  RESOURCE_TYPES: [
    'documentation',
    'tutorial',
    'video',
    'course',
    'book',
    'article',
    'tool',
    'framework'
  ],

  // Fallback analysis patterns (when API fails)
  FALLBACK_PATTERNS: {
    'machine learning': ['supervised learning', 'unsupervised learning', 'neural networks', 'model training', 'evaluation metrics'],
    'python': ['syntax', 'data structures', 'OOP', 'libraries', 'best practices'],
    'tensorflow': ['tensors', 'models', 'layers', 'training', 'deployment'],
    'web development': ['HTML', 'CSS', 'JavaScript', 'frameworks', 'deployment'],
    'data science': ['statistics', 'visualization', 'analysis', 'modeling', 'interpretation']
  },

  // Crawling configuration
  MAX_CRAWL_PAGES: 50,
  CRAWL_DEPTH: 2,
  PAGE_TIMEOUT: 10000,

  // Search relevancy thresholds
  MIN_RELEVANCY_SCORE: 0.3,
  HIGH_RELEVANCY_THRESHOLD: 0.7
};

// Freeze the object to prevent modifications
module.exports = Object.freeze(baseConstants);
