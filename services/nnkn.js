
// server/services/ingestion-service.js
const WebCrawler = require('./crawler');
const { sendChatCompletion } = require('../utils/openaiClient');
// At the top of ingestion-service.js with other imports
const baseConstants = require('../config/baseConstants.js');

// Enhanced JSON parsing with better error handling
const safeParseJSON = (text) => {
  if (typeof text !== 'string') return text;
  if (!text || text.trim() === '') return null;
  
  try {
    return JSON.parse(text);
  } catch (error) {
    try {
      // Fix JavaScript-style object notation to JSON
      let fixedText = text
        .replace(/'/g, '"') // Single quotes to double
        .replace(/([\{,]\s*)([a-zA-Z0-9_]+)(\s*):/g, '$1"$2"$3:') // Quote object keys
        .replace(/,\s*}/g, '}') // Remove trailing commas
        .replace(/,\s*]/g, ']'); // Remove trailing commas in arrays
      
      return JSON.parse(fixedText);
    } catch (secondError) {
      console.warn('Failed to parse JSON string:', text.substring(0, 100) + '...');
      return text; // Return original if parsing fails
    }
  }
};

// Enhanced sanitization with validation
const sanitizeAnalysisResults = (analysis) => {
  if (!analysis || typeof analysis !== 'object') return analysis;

  const sanitized = { ...analysis };

  // Fields that should be arrays
  const arrayFields = ['subdomains', 'primaryConcepts', 'prerequisites', 'learningPath'];
  
  arrayFields.forEach(field => {
    if (sanitized[field]) {
      if (typeof sanitized[field] === 'string') {
        const parsed = safeParseJSON(sanitized[field]);
        sanitized[field] = Array.isArray(parsed) ? parsed : [];
      } else if (!Array.isArray(sanitized[field])) {
        sanitized[field] = [];
      }
    } else {
      sanitized[field] = [];
    }
  });

  // Validate numeric fields
  if (sanitized.confidence && (typeof sanitized.confidence !== 'number' || sanitized.confidence < 0 || sanitized.confidence > 100)) {
    sanitized.confidence = 75; // Default confidence
  }

  return sanitized;
};

// Enhanced processing results sanitization
const sanitizeProcessingResults = (processing) => {
  if (!processing || typeof processing !== 'object') return processing;

  const sanitized = { ...processing };

  // Sanitize concepts array
  if (sanitized.concepts) {
    if (typeof sanitized.concepts === 'string') {
      const parsed = safeParseJSON(sanitized.concepts);
      sanitized.concepts = Array.isArray(parsed) ? parsed : [];
    } else if (!Array.isArray(sanitized.concepts)) {
      sanitized.concepts = [];
    }
  } else {
    sanitized.concepts = [];
  }

  // Sanitize relationships array
  if (sanitized.relationships) {
    if (typeof sanitized.relationships === 'string') {
      const parsed = safeParseJSON(sanitized.relationships);
      sanitized.relationships = Array.isArray(parsed) ? parsed : [];
    } else if (!Array.isArray(sanitized.relationships)) {
      sanitized.relationships = [];
    }
  } else {
    sanitized.relationships = [];
  }

  return sanitized;
};

class IngestionService {
  constructor() {
    this.crawler = new WebCrawler();
    
    // Validate configuration
    if (!process.env.OPENAI_API_KEY) {
      console.warn('⚠️  OpenAI API key not found. Using fallback processing.');
    }

    // Initialize performance tracking
    this.performanceMetrics = {
      totalIngestions: 0,
      successfulIngestions: 0,
      averageProcessingTime: 0,
      lastIngestionTime: null
    };
  }

  // Enhanced AI-powered domain analysis with better validation
  async analyzeDomainRequirements(domain) {
    console.log(`Analyzing domain requirements for: ${domain}`);
    
    try {
      if (process.env.OPENAI_API_KEY) {
        const messages = [
          {
            role: "system",
            content: `You are an expert technical domain classifier. Analyze domains for technical relevance.

Technical domains include:
- Programming languages, frameworks, technologies
- Software/web/mobile development
- Data science, AI, machine learning
- Cloud computing, DevOps, infrastructure
- Cybersecurity, networking, systems
- Database technologies, backend systems
- UI/UX design, frontend technologies
- Emerging tech (blockchain, IoT, AR/VR)
- Technical skills, certifications
- Engineering disciplines
- Tech business domains (fintech, edtech)

Respond with VALID JSON ONLY:
{
  "isTechnical": boolean,
  "confidence": number (0-100),
  "reasoning": "detailed explanation",
  "technicalCategory": "specific category if technical",
  "complexity": "beginner/intermediate/advanced",
  "subdomains": ["subdomain1", "subdomain2"],
  "primaryConcepts": ["concept1", "concept2"],
  "prerequisites": ["prereq1", "prereq2"],
  "learningPath": [
    {"step": 1, "topic": "topic1", "duration": "timeframe"},
    {"step": 2, "topic": "topic2", "duration": "timeframe"}
  ]
}`
          },
          {
            role: "user",
            content: `Analyze this domain for technical relevance: "${domain}". Is this suitable for creating technical learning resources?`
          }
        ];

        const result = await sendChatCompletion(messages, {
          model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-405b-instruct:free",
          requireJSON: true,
          temperature: 0.2,
          maxTokens: 1200
        });

        const analysis = result.content;
        
        // Enhanced validation of AI response
        if (!analysis || typeof analysis !== 'object') {
          throw new Error('Invalid AI response format');
        }
        
        // If AI determines it's not technical
        if (analysis.isTechnical === false || (analysis.confidence && analysis.confidence < 70)) {
          return {
            domain,
            isTechnical: false,
            confidence: analysis.confidence || 0,
            error: 'NON_TECHNICAL_DOMAIN',
            message: `❌ "${domain}" is not recognized as a technical domain.`,
            reasoning: analysis.reasoning || "Domain doesn't appear to be technology-related.",
            suggestions: [
              '🔧 Programming: Java, Python, JavaScript, React, Angular, Vue.js',
              '☁️ Cloud/DevOps: AWS, Docker, Kubernetes, Jenkins, Terraform',
              '🤖 AI/Data: Machine Learning, Data Science, TensorFlow, PyTorch',
              '📱 Development: Web Development, Mobile Development, API Design',
              '🔒 Security: Cybersecurity, Ethical Hacking, Network Security',
              '💾 Database: SQL, MongoDB, PostgreSQL, Redis, Database Design'
            ],
            analysisComplete: true,
            timestamp: new Date().toISOString()
          };
        }
        
        // Enhanced technical analysis with validation
        const sanitizedAnalysis = {
          domain,
          isTechnical: true,
          confidence: Math.min(Math.max(analysis.confidence || 90, 70), 100),
          technicalCategory: analysis.technicalCategory || 'General Technology',
          complexity: ['beginner', 'intermediate', 'advanced'].includes(analysis.complexity) 
            ? analysis.complexity : 'intermediate',
          subdomains: Array.isArray(analysis.subdomains) ? analysis.subdomains.slice(0, 8) : [],
          primaryConcepts: Array.isArray(analysis.primaryConcepts) ? analysis.primaryConcepts.slice(0, 10) : [],
          prerequisites: Array.isArray(analysis.prerequisites) ? analysis.prerequisites.slice(0, 6) : [],
          learningPath: Array.isArray(analysis.learningPath) ? analysis.learningPath.slice(0, 8) : [],
          reasoning: analysis.reasoning || `"${domain}" confirmed as technical domain.`,
          analysisComplete: true,
          timestamp: new Date().toISOString()
        };

        return sanitizedAnalysis;
      }
    } catch (error) {
      console.error('Domain analysis error:', error.message);
      console.log('Falling back to pattern-based analysis...');
    }
    
    // Enhanced fallback with better pattern recognition
    return this.generateTechnicalFallbackAnalysis(domain);
  }

  // Enhanced pattern recognition with more technical terms
  generateTechnicalFallbackAnalysis(domain) {
    const domainLower = domain.toLowerCase().trim();
    
    const technicalPatterns = [
      // Programming languages & frameworks (enhanced)
      /\b(java|python|javascript|typescript|react|angular|vue|node|nodejs|php|ruby|golang|go|rust|swift|kotlin|c\+\+|c#|csharp|scala|clojure|flutter|dart|laravel|django|flask|spring|express)\b/i,
      
      // Development & architecture
      /\b(development|programming|coding|software|web|app|mobile|frontend|backend|fullstack|microservices|api|rest|graphql|architecture|design patterns|solid principles)\b/i,
      
      // Technologies & platforms (expanded)
      /\b(machine learning|ml|ai|artificial intelligence|data science|blockchain|web3|cybersecurity|security|docker|kubernetes|k8s|aws|azure|gcp|firebase|mongodb|postgresql|mysql|redis)\b/i,
      
      // DevOps & tools
      /\b(devops|ci\/cd|jenkins|gitlab|github|terraform|ansible|monitoring|logging|nginx|apache|linux|ubuntu|deployment|infrastructure|cloud|serverless)\b/i,
      
      // Technical methodologies
      /\b(agile|scrum|tdd|bdd|testing|automation|unit testing|integration testing|performance|optimization|scalability|reliability|availability)\b/i,
      
      // Data & analytics
      /\b(database|sql|nosql|analytics|big data|etl|data pipeline|visualization|pandas|numpy|tensorflow|pytorch|keras|scikit|jupyter)\b/i,
      
      // Technical indicators & patterns
      /\b(tech|system|platform|framework|library|sdk|compiler|interpreter|virtual machine|container|orchestration|load balancer)\b/i,
      
      // File extensions and version patterns
      /\.(js|py|java|html|css|sql|json|xml|yaml|yml|md|sh)\b|v?\d+(\.\d+)+|\bstack\b/i,
      
      // Modern tech trends
      /\b(serverless|jamstack|pwa|spa|ssr|ssg|headless|cms|saas|paas|iaas|edge computing|iot|ar|vr|quantum)\b/i
    ];
    
    const isTechnical = technicalPatterns.some(pattern => pattern.test(domainLower));
    
    if (!isTechnical) {
      return {
        domain,
        isTechnical: false,
        confidence: 25,
        error: 'NON_TECHNICAL_DOMAIN',
        message: `❌ "${domain}" doesn't appear to be a technical domain.`,
        reasoning: "No technical keywords, patterns, or technology-related terms detected.",
        suggestions: [
          '💻 Web Development: "React Frontend Development", "Node.js Backend APIs"',
          '🐍 Python: "Python Data Science", "Django Web Framework"',
          '☕ Java: "Spring Boot Microservices", "Java Enterprise Development"',
          '☁️ Cloud: "AWS Cloud Architecture", "Docker Containerization"',
          '🤖 AI/ML: "Machine Learning with Python", "Deep Learning TensorFlow"',
          '🔒 Security: "Cybersecurity Fundamentals", "Ethical Hacking"',
          '📱 Mobile: "React Native Development", "iOS Swift Programming"'
        ],
        analysisComplete: true,
        timestamp: new Date().toISOString()
      };
    }
    
    // Enhanced technical analysis for recognized patterns
    return {
      domain,
      isTechnical: true,
      confidence: 85,
      technicalCategory: this.detectTechnicalCategory(domainLower),
      complexity: this.estimateComplexity(domainLower),
      subdomains: this.generateTechnicalSubdomains(domain),
      primaryConcepts: this.generateTechnicalConcepts(domain),
      prerequisites: this.generateTechnicalPrerequisites(domain),
      learningPath: this.generateTechnicalLearningPath(domain),
      reasoning: `"${domain}" contains technical patterns and technology-related keywords.`,
      analysisComplete: true,
      timestamp: new Date().toISOString()
    };
  }

  // Enhanced category detection
  detectTechnicalCategory(domainLower) {
    const categories = {
      'Frontend Development': /frontend|react|angular|vue|html|css|javascript|ui|ux|responsive|spa/,
      'Backend Development': /backend|api|server|node|express|spring|django|php|ruby|microservices|rest|graphql/,
      'Full Stack Development': /fullstack|full stack|mean|mern|lamp|django/,
      'AI & Machine Learning': /machine learning|ml|ai|artificial intelligence|neural|deep learning|tensorflow|pytorch|data science|analytics/,
      'Cloud & DevOps': /cloud|aws|azure|devops|docker|kubernetes|terraform|jenkins|ci\/cd|deployment/,
      'Mobile Development': /mobile|android|ios|react native|flutter|swift|kotlin/,
      'Data Science & Analytics': /data science|analytics|big data|pandas|numpy|visualization|jupyter|statistics/,
      'Cybersecurity': /security|cybersecurity|penetration|ethical hacking|network security|cryptography/,
      'Database Technology': /database|sql|mongodb|postgresql|redis|nosql|data modeling/,
      'Blockchain & Web3': /blockchain|web3|crypto|smart contract|ethereum|solidity|defi/,
      'Game Development': /game|unity|unreal|gamedev|graphics|3d/
    };

    for (const [category, pattern] of Object.entries(categories)) {
      if (pattern.test(domainLower)) return category;
    }

    return 'General Technology';
  }

  // Enhanced complexity estimation
  estimateComplexity(domainLower) {
    const advanced = /machine learning|ai|blockchain|kubernetes|microservices|distributed|architecture|security|devops|quantum/;
    const beginner = /html|css|basic|introduction|fundamentals|getting started|beginner/;
    
    if (advanced.test(domainLower)) return 'advanced';
    if (beginner.test(domainLower)) return 'beginner';
    return 'intermediate';
  }

  // Enhanced subdomain generation
  generateTechnicalSubdomains(domain) {
    const category = this.detectTechnicalCategory(domain.toLowerCase());
    
    const subdomainMaps = {
      'Frontend Development': [
        'HTML5 & Semantic Markup',
        'CSS3 & Modern Styling',
        'JavaScript ES6+ Features',
        'Responsive Web Design',
        'Frontend Frameworks & Libraries',
        'State Management Solutions',
        'Performance Optimization',
        'Testing & Quality Assurance'
      ],
      'Backend Development': [
        'Server Architecture & Design',
        'RESTful API Development',
        'Database Design & Integration',
        'Authentication & Authorization',
        'Caching & Performance',
        'Error Handling & Logging',
        'Testing & Documentation',
        'Deployment & Monitoring'
      ],
      'AI & Machine Learning': [
        'Mathematical Foundations',
        'Data Preprocessing & Feature Engineering',
        'Supervised Learning Algorithms',
        'Unsupervised Learning & Clustering',
        'Neural Networks & Deep Learning',
        'Model Evaluation & Validation',
        'MLOps & Production Deployment',
        'Ethics & Responsible AI'
      ]
    };

    return subdomainMaps[category] || [
      `Core ${domain} Fundamentals`,
      `${domain} Architecture & Design`,
      `${domain} Best Practices & Patterns`,
      `Advanced ${domain} Techniques`,
      `${domain} Tools & Frameworks`,
      `${domain} Performance & Security`,
      `${domain} Testing & Quality`,
      `${domain} Deployment & Monitoring`
    ];
  }

  // Enhanced concept generation
  generateTechnicalConcepts(domain) {
    const baseconcepts = [
      `${domain} Core Principles & Paradigms`,
      'Architecture Patterns & Design Principles',
      'Implementation Strategies & Best Practices',
      'Performance Optimization Techniques',
      'Security Considerations & Implementations',
      'Testing Methodologies & Quality Assurance',
      'Debugging & Troubleshooting Strategies',
      'Documentation & Code Standards'
    ];

    return baseConstants;
  }

  generateTechnicalPrerequisites(domain) {
    const category = this.detectTechnicalCategory(domain.toLowerCase());
    
    const prereqMaps = {
      'AI & Machine Learning': [
        'Strong mathematical foundation (linear algebra, calculus, statistics)',
        'Programming experience (Python preferred)',
        'Understanding of algorithms and data structures',
        'Basic knowledge of data analysis concepts'
      ],
      'Backend Development': [
        'Solid programming fundamentals',
        'Understanding of computer science basics',
        'Knowledge of databases and SQL',
        'Familiarity with web technologies'
      ],
      'Frontend Development': [
        'Basic programming knowledge',
        'Understanding of web fundamentals (HTML, CSS, JS)',
        'Problem-solving skills',
        'Design and user experience awareness'
      ]
    };

    return prereqMaps[category] || [
      'Basic programming knowledge and logical thinking',
      'Understanding of software development concepts',
      'Familiarity with development tools and environments',
      'Problem-solving and analytical skills',
      'Basic computer science fundamentals'
    ];
  }

  generateTechnicalLearningPath(domain) {
    const category = this.detectTechnicalCategory(domain.toLowerCase());
    const complexity = this.estimateComplexity(domain.toLowerCase());
    
    // Adjust durations based on complexity
    const durationMultiplier = {
      'beginner': 0.8,
      'intermediate': 1.0,
      'advanced': 1.5
    };

    const baseDurations = ['1-2 weeks', '2-3 weeks', '3-4 weeks', '2-3 weeks', '2-3 weeks', '1-2 weeks'];
    const adjustedDurations = baseDurations.map(duration => {
      if (complexity === 'advanced') {
        return duration.replace(/(\d+)/g, match => Math.ceil(parseInt(match) * 1.5));
      } else if (complexity === 'beginner') {
        return duration.replace(/(\d+)/g, match => Math.max(1, Math.floor(parseInt(match) * 0.8)));
      }
      return duration;
    });

    return [
      { step: 1, topic: `${domain} Fundamentals & Environment Setup`, duration: adjustedDurations[0] },
      { step: 2, topic: `Core ${domain} Concepts & Syntax`, duration: adjustedDurations[1] },
      { step: 3, topic: `${domain} Advanced Features & Patterns`, duration: adjustedDurations[2] },
      { step: 4, topic: `Real-World ${domain} Projects`, duration: adjustedDurations[3] },
      { step: 5, topic: `${domain} Best Practices & Optimization`, duration: adjustedDurations[4] },
      { step: 6, topic: `${domain} Testing, Deployment & Maintenance`, duration: adjustedDurations[5] }
    ];
  }

  // Enhanced knowledge collection with better error handling
  async collectKnowledgeSources(domain) {
    console.log(`Starting comprehensive knowledge collection for: ${domain}`);
    
    try {
      // Use crawler with timeout and progress tracking
      const startTime = Date.now();
      const crawlResults = await Promise.race([
        this.crawler.crawlDomain(domain),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Crawling timeout')), 180000)) // 3 minute timeout
      ]);
      
      const crawlDuration = Date.now() - startTime;
      const summary = this.crawler.getCrawlSummary();
      
      console.log(`✅ Knowledge collection completed in ${Math.round(crawlDuration / 1000)}s`);
      
      return {
        domain,
        academicPapers: summary.academicPapers || 0,
        technicalDocs: summary.technicalDocs || 0,
        codeRepos: summary.codeRepos || 0,
        videoTutorials: summary.videoTutorials || 0,
        videoHours: summary.videoHours || 0,
        expertInterviews: summary.expertInterviews || 0,
        industryReports: summary.industryReports || 0,
        rawData: crawlResults || {},
        crawlDuration: crawlDuration,
        collectionComplete: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.warn(`⚠️ Crawler failed (${error.message}), using enhanced mock data...`);
      
      // Enhanced fallback with domain-specific mock data
      return {
        domain,
        academicPapers: this.generateRealisticCount('papers', domain),
        technicalDocs: this.generateRealisticCount('docs', domain),
        codeRepos: this.generateRealisticCount('repos', domain),
        videoTutorials: this.generateRealisticCount('videos', domain),
        videoHours: this.generateRealisticCount('hours', domain),
        expertInterviews: this.generateRealisticCount('interviews', domain),
        industryReports: this.generateRealisticCount('reports', domain),
        rawData: {
          repositories: this.generateEnhancedMockRepositories(domain),
          videos: this.generateEnhancedMockVideos(domain),
          industryReports: this.generateEnhancedMockReports(domain),
          academicPapers: this.generateMockPapers(domain)
        },
        crawlDuration: 0,
        collectionComplete: true,
        fallbackUsed: true,
        timestamp: new Date().toISOString()
      };
    } finally {
      // Always cleanup crawler resources
      try {
        await this.crawler.cleanup();
      } catch (cleanupError) {
        console.warn('Crawler cleanup warning:', cleanupError.message);
      }
    }
  }

  // Generate realistic counts based on domain popularity and type
  generateRealisticCount(type, domain) {
    const domainLower = domain.toLowerCase();
    const popularDomains = ['javascript', 'python', 'react', 'java', 'machine learning', 'ai'];
    const isPopular = popularDomains.some(d => domainLower.includes(d));
    
    const baseCounts = {
      papers: isPopular ? [25, 45] : [10, 25],
      docs: isPopular ? [15, 30] : [8, 18],
      repos: isPopular ? [40, 70] : [20, 40],
      videos: isPopular ? [30, 50] : [15, 30],
      hours: isPopular ? [45, 80] : [20, 45],
      interviews: [3, 8],
      reports: [5, 12]
    };

    const [min, max] = baseCounts[type] || [5, 15];
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Enhanced repository generation with real-world patterns
  generateEnhancedMockRepositories(domain) {
    const domainLower = domain.toLowerCase();
    const repos = [];
    
    // Domain-specific repository templates
    const repoTemplates = {
      'react': [
        { name: 'React Production Boilerplate', desc: 'Enterprise-ready React application template with TypeScript, testing, and CI/CD', stars: [15000, 25000] },
        { name: 'React Component Library', desc: 'Reusable React components following design system principles', stars: [8000, 15000] },
        { name: 'React Performance Optimization', desc: 'Advanced React performance techniques and code splitting strategies', stars: [12000, 20000] },
        { name: 'React Native Cross-Platform', desc: 'Cross-platform mobile development with React Native', stars: [10000, 18000] }
      ],
      'python': [
        { name: 'Python Web Framework Comparison', desc: 'Comprehensive comparison of Django, Flask, and FastAPI with examples', stars: [18000, 28000] },
        { name: 'Python Data Science Pipeline', desc: 'End-to-end data science workflow with pandas, scikit-learn, and visualization', stars: [16000, 24000] },
        { name: 'Python Async Programming', desc: 'Advanced asyncio patterns and concurrent programming techniques', stars: [14000, 22000] },
        { name: 'Python Testing Framework', desc: 'Comprehensive testing strategies with pytest, unittest, and mocking', stars: [11000, 19000] }
      ],
      'machine learning': [
        { name: 'ML Production Deployment Guide', desc: 'Production-ready machine learning model deployment with MLOps practices', stars: [22000, 35000] },
        { name: 'Deep Learning from Scratch', desc: 'Neural network implementation without deep learning frameworks', stars: [19000, 30000] },
        { name: 'ML Feature Engineering Toolkit', desc: 'Advanced feature engineering techniques and automated pipelines', stars: [16000, 26000] },
        { name: 'Computer Vision Applications', desc: 'Real-world computer vision projects with OpenCV and deep learning', stars: [18000, 28000] }
      ]
    };

    // Find matching templates or use generic ones
    let templates = null;
    for (const [key, value] of Object.entries(repoTemplates)) {
      if (domainLower.includes(key)) {
        templates = value;
        break;
      }
    }

    if (!templates) {
      templates = [
        { name: `${domain} Complete Guide`, desc: `Comprehensive ${domain} learning path with projects and examples`, stars: [12000, 20000] },
        { name: `${domain} Best Practices`, desc: `Industry-standard ${domain} practices and architectural patterns`, stars: [10000, 18000] },
        { name: `${domain} Advanced Techniques`, desc: `Advanced ${domain} concepts and optimization strategies`, stars: [8000, 15000] },
        { name: `${domain} Project Templates`, desc: `Production-ready ${domain} starter templates and boilerplates`, stars: [9000, 16000] }
      ];
    }

    // Generate repositories from templates
    return templates.slice(0, 6).map(template => ({
      name: template.name,
      description: template.desc,
      stars: Math.floor(Math.random() * (template.stars[1] - template.stars[0] + 1)) + template.stars[0],
      language: this.inferProgrammingLanguage(domain),
      lastUpdated: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
      topics: this.generateRepoTopics(domain),
      relevanceScore: Math.round((Math.random() * 0.3 + 0.7) * 100) / 100
    }));
  }

  inferProgrammingLanguage(domain) {
    const domainLower = domain.toLowerCase();
    
    if (domainLower.includes('python') || domainLower.includes('django') || domainLower.includes('flask')) return 'Python';
    if (domainLower.includes('javascript') || domainLower.includes('react') || domainLower.includes('node')) return 'JavaScript';
    if (domainLower.includes('java') && !domainLower.includes('javascript')) return 'Java';
    if (domainLower.includes('typescript')) return 'TypeScript';
    if (domainLower.includes('go') || domainLower.includes('golang')) return 'Go';
    if (domainLower.includes('rust')) return 'Rust';
    if (domainLower.includes('swift')) return 'Swift';
    if (domainLower.includes('kotlin')) return 'Kotlin';
    
    return 'JavaScript'; // Default fallback
  }

  generateRepoTopics(domain) {
    const domainLower = domain.toLowerCase();
    const basicsTopics = ['tutorial', 'guide', 'documentation', 'examples'];
    
    if (domainLower.includes('web')) basicsTopics.push('web-development', 'frontend', 'backend');
    if (domainLower.includes('mobile')) basicsTopics.push('mobile', 'app', 'ios', 'android');
    if (domainLower.includes('data')) basicsTopics.push('data-science', 'analytics', 'visualization');
    if (domainLower.includes('ai') || domainLower.includes('machine learning')) basicsTopics.push('ai', 'ml', 'deep-learning');
    
    return basicsTopics.slice(0, 5);
  }

  // Enhanced video generation
  generateEnhancedMockVideos(domain) {
    const videoTypes = [
      { type: 'Complete Course', duration: [6, 12], views: [200000, 800000] },
      { type: 'Advanced Tutorial', duration: [2, 5], views: [100000, 400000] },
      { type: 'Project Walkthrough', duration: [3, 7], views: [150000, 500000] },
      { type: 'Best Practices', duration: [1, 3], views: [80000, 300000] },
      { type: 'Live Coding Session', duration: [4, 8], views: [120000, 350000] }
    ];

    return videoTypes.map(template => ({
      title: `${domain} ${template.type} - ${this.generateVideoTitle(domain)}`,
      duration: this.formatDuration(template.duration),
      views: Math.floor(Math.random() * (template.views[1] - template.views[0] + 1)) + template.views[0],
      likes: Math.floor(Math.random() * 15000) + 5000,
      channel: this.generateChannelName(domain),
      publishedAt: new Date(Date.now() - Math.random() * 730 * 24 * 60 * 60 * 1000).toISOString(), // Last 2 years
      relevanceScore: Math.round((Math.random() * 0.4 + 0.6) * 100) / 100
    }));
  }

  formatDuration(durationRange) {
    const hours = Math.floor(Math.random() * (durationRange[1] - durationRange[0] + 1)) + durationRange[0];
    const minutes = Math.floor(Math.random() * 60);
    const seconds = Math.floor(Math.random() * 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  generateChannelName(domain) {
    const channelPrefixes = ['Tech', 'Code', 'Dev', 'Learn', 'Master', 'Pro'];
    const channelSuffixes = ['Academy', 'Hub', 'Channel', 'TV', 'Tutorials', 'Guide'];
    
    const prefix = channelPrefixes[Math.floor(Math.random() * channelPrefixes.length)];
    const suffix = channelSuffixes[Math.floor(Math.random() * channelSuffixes.length)];
    
    return `${prefix}${domain.split(' ')[0]}${suffix}`;
  }

  generateVideoTitle(domain) {
    const titles = [
      'Complete Masterclass', 'From Zero to Hero', 'Professional Development',
      'Industry Best Practices', 'Real-World Projects', 'Advanced Concepts',
      'Practical Implementation', 'Expert Techniques', 'Production Ready'
    ];
    return titles[Math.floor(Math.random() * titles.length)];
  }

  // Enhanced report generation
  generateEnhancedMockReports(domain) {
    const currentYear = new Date().getFullYear();
    const reportTypes = [
      { type: 'Market Analysis', company: 'McKinsey & Company' },
      { type: 'Technology Trends', company: 'Gartner' },
      { type: 'Skills Gap Report', company: 'Deloitte' },
      { type: 'Industry Outlook', company: 'PwC' },
      { type: 'Security Assessment', company: 'Forrester' }
    ];

    return reportTypes.map(template => ({
      title: `${domain} ${template.type} ${currentYear}`,
      company: template.company,
      publishedDate: `${currentYear}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-01`,
      pages: Math.floor(Math.random() * 80) + 40,
      summary: `Comprehensive ${template.type.toLowerCase()} covering ${domain} market dynamics, trends, and strategic recommendations for organizations.`,
      keyFindings: [
        `${domain} market projected to grow ${Math.floor(Math.random() * 25) + 15}% annually through ${currentYear + 3}`,
        `${Math.floor(Math.random() * 60) + 40}% of enterprises plan significant ${domain} investments in next 2 years`,
        `Critical skill shortages identified in advanced ${domain} capabilities and implementation`,
        `Security and compliance considerations becoming primary adoption factors`
      ],
      relevanceScore: Math.round((Math.random() * 0.3 + 0.7) * 100) / 100
    }));
  }

  // Generate mock academic papers
  generateMockPapers(domain) {
    const paperTitles = [
      `Advances in ${domain}: A Comprehensive Survey`,
      `${domain} Optimization Techniques: State of the Art`,
      `Theoretical Foundations of ${domain} Systems`,
      `${domain} in Practice: Industrial Applications and Case Studies`,
      `Future Directions in ${domain} Research`
    ];

    return paperTitles.map(title => ({
      title,
      authors: [`Dr. ${this.generateAuthorName()}`, `Prof. ${this.generateAuthorName()}`],
      abstract: `This paper presents a comprehensive analysis of ${domain} methodologies and their applications in modern computing environments.`,
      publishedYear: Math.floor(Math.random() * 5) + (new Date().getFullYear() - 4),
      citations: Math.floor(Math.random() * 500) + 50,
      relevanceScore: Math.round((Math.random() * 0.3 + 0.7) * 100) / 100
    }));
  }

  generateAuthorName() {
    const firstNames = ['Alex', 'Sarah', 'Michael', 'Emily', 'David', 'Lisa', 'John', 'Maria'];
    const lastNames = ['Johnson', 'Smith', 'Williams', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore'];
    
    const first = firstNames[Math.floor(Math.random() * firstNames.length)];
    const last = lastNames[Math.floor(Math.random() * lastNames.length)];
    
    return `${first} ${last}`;
  }

  // Enhanced concept extraction with better AI handling
  async extractConcepts(collectedData) {
    const { rawData } = collectedData;
    
    // Build comprehensive content string from available data
    const allContent = [];
    
    try {
      if (rawData.repositories && Array.isArray(rawData.repositories)) {
        allContent.push(...rawData.repositories.map(repo => `${repo.name} ${repo.description || ''}`));
      }
      if (rawData.videos && Array.isArray(rawData.videos)) {
        allContent.push(...rawData.videos.map(video => video.title));
      }
      if (rawData.industryReports && Array.isArray(rawData.industryReports)) {
        allContent.push(...rawData.industryReports.map(report => `${report.title} ${report.summary || ''}`));
      }
      if (rawData.academicPapers && Array.isArray(rawData.academicPapers)) {
        allContent.push(...rawData.academicPapers.map(paper => `${paper.title} ${paper.abstract || ''}`));
      }
    } catch (error) {
      console.warn('Error processing raw data for concept extraction:', error.message);
    }
    
    // Only try AI extraction if we have API key and sufficient content
    if (process.env.OPENAI_API_KEY && allContent.length > 0) {
      try {
        const contentString = allContent.join(' ').substring(0, 4000); // Limit content size
        
        const messages = [
          {
            role: "system",
            content: `Extract key technical concepts and return ONLY valid JSON.

Response format:
{
  "concepts": [
    {
      "name": "concept name",
      "description": "detailed description",
      "importance": number (1-10),
      "category": "theory|practical|tool|framework"
    }
  ]
}

Focus on technical concepts, avoid generic terms. Limit to 12 most important concepts.`
          },
          {
            role: "user",
            content: `Extract key concepts from this ${collectedData.domain} content:\n\n${contentString}`
          }
        ];
        
        const result = await sendChatCompletion(messages, {
          model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-405b-instruct:free",
          requireJSON: true,
          temperature: 0.2,
          maxTokens: 1500
        });

        const response = result.content;
        
        // Validate and sanitize AI response
        if (response && response.concepts && Array.isArray(response.concepts)) {
          const validatedConcepts = response.concepts
            .filter(concept => concept.name && concept.description && concept.importance)
            .slice(0, 12)
            .map(concept => ({
              name: concept.name.trim(),
              description: concept.description.trim(),
              importance: Math.min(Math.max(parseInt(concept.importance) || 5, 1), 10),
              category: ['theory', 'practical', 'tool', 'framework'].includes(concept.category) 
                ? concept.category : 'practical'
            }));
          
          if (validatedConcepts.length > 0) {
            console.log(`✅ Extracted ${validatedConcepts.length} concepts via AI`);
            return validatedConcepts;
          }
        }
      } catch (error) {
        console.error('AI concept extraction error:', error.message);
      }
    }
    
    // Enhanced fallback concept generation
    console.log('Using fallback concept generation...');
    return this.generateEnhancedFallbackConcepts(collectedData.domain);
  }

  // Enhanced relationship identification
  async identifyRelationships(concepts) {
    if (!concepts || concepts.length === 0) return [];
    
    // Only try AI relationship identification if we have API key and sufficient concepts
    if (process.env.OPENAI_API_KEY && concepts.length >= 2) {
      try {
        const conceptsForAI = concepts.slice(0, 10); // Limit concepts to avoid token limits
        
        const messages = [
          {
            role: "system",
            content: `Identify relationships between technical concepts and return ONLY valid JSON.

Response format:
{
  "relationships": [
    {
      "source": "concept name",
      "target": "concept name", 
      "relationship": "prerequisite|builds_upon|related_to|applied_in|component_of",
      "strength": number (0.1-1.0),
      "description": "brief explanation"
    }
  ]
}

Focus on meaningful technical relationships. Limit to 15 most important relationships.`
          },
          {
            role: "user",
            content: `Identify relationships between these concepts:\n\n${JSON.stringify(conceptsForAI.map(c => ({ name: c.name, description: c.description })))}`
          }
        ];
        
        const result = await sendChatCompletion(messages, {
          model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-405b-instruct:free",
          requireJSON: true,
          temperature: 0.1,
          maxTokens: 1000
        });

        const response = result.content;
        
        // Validate and sanitize AI response
        if (response && response.relationships && Array.isArray(response.relationships)) {
          const conceptNames = new Set(concepts.map(c => c.name));
          
          const validatedRelationships = response.relationships
            .filter(rel => 
              rel.source && rel.target && 
              conceptNames.has(rel.source) && conceptNames.has(rel.target) &&
              rel.source !== rel.target
            )
            .slice(0, 15)
            .map(rel => ({
              source: rel.source.trim(),
              target: rel.target.trim(),
              relationship: ['prerequisite', 'builds_upon', 'related_to', 'applied_in', 'component_of']
                .includes(rel.relationship) ? rel.relationship : 'related_to',
              strength: Math.min(Math.max(parseFloat(rel.strength) || 0.5, 0.1), 1.0),
              description: rel.description || `${rel.source} is ${rel.relationship.replace('_', ' ')} ${rel.target}`
            }));
          
          if (validatedRelationships.length > 0) {
            console.log(`✅ Identified ${validatedRelationships.length} relationships via AI`);
            return validatedRelationships;
          }
        }
      } catch (error) {
        console.error('AI relationship identification error:', error.message);
      }
    }
    
    // Enhanced fallback relationship generation
    console.log('Using fallback relationship generation...');
    return this.generateEnhancedFallbackRelationships(concepts);
  }

  // Enhanced fallback concept generation with domain-specific expertise
  generateEnhancedFallbackConcepts(domain) {
    const domainLower = domain.toLowerCase();
    
    // Enhanced concept maps with more technical depth
    const conceptMaps = {
      'javascript': [
        { name: 'Event Loop & Asynchronous Programming', description: 'Understanding JavaScript\'s non-blocking execution model and async operations', importance: 9, category: 'theory' },
        { name: 'Closures & Lexical Scoping', description: 'Function scope, variable access, and closure patterns in JavaScript', importance: 8, category: 'theory' },
        { name: 'Prototypal Inheritance', description: 'JavaScript\'s prototype-based inheritance system and object creation patterns', importance: 8, category: 'theory' },
        { name: 'ES6+ Features', description: 'Modern JavaScript features: arrow functions, destructuring, modules, async/await', importance: 9, category: 'practical' },
        { name: 'DOM Manipulation & Events', description: 'Interacting with HTML documents and handling user interactions', importance: 7, category: 'practical' },
        { name: 'Module Systems', description: 'CommonJS, ES Modules, and modern JavaScript bundling strategies', importance: 7, category: 'tool' }
      ],
      'react': [
        { name: 'Component Lifecycle & Hooks', description: 'Understanding React component lifecycle and modern hooks pattern', importance: 9, category: 'framework' },
        { name: 'State Management', description: 'Local state, Context API, and external state management solutions', importance: 9, category: 'practical' },
        { name: 'Virtual DOM & Reconciliation', description: 'React\'s rendering optimization through virtual DOM diffing', importance: 8, category: 'theory' },
        { name: 'JSX & Component Composition', description: 'JSX syntax and patterns for composing reusable components', importance: 8, category: 'practical' },
        { name: 'React Router & Navigation', description: 'Client-side routing and navigation in single-page applications', importance: 7, category: 'tool' },
        { name: 'Performance Optimization', description: 'Code splitting, lazy loading, and React performance best practices', importance: 8, category: 'practical' }
      ],
      'python': [
        { name: 'Object-Oriented Programming', description: 'Classes, inheritance, polymorphism, and encapsulation in Python', importance: 9, category: 'theory' },
        { name: 'Data Structures & Algorithms', description: 'Python built-in data structures and algorithmic problem solving', importance: 8, category: 'practical' },
        { name: 'Decorators & Metaclasses', description: 'Advanced Python features for code modification and class creation', importance: 7, category: 'theory' },
        { name: 'Concurrency & Parallelism', description: 'Threading, multiprocessing, and async programming in Python', importance: 8, category: 'practical' },
        { name: 'Package Management & Virtual Environments', description: 'pip, conda, virtual environments, and dependency management', importance: 7, category: 'tool' },
        { name: 'Testing & Quality Assurance', description: 'unittest, pytest, code coverage, and testing best practices', importance: 7, category: 'practical' }
      ],
      'machine learning': [
        { name: 'Statistical Learning Theory', description: 'Mathematical foundations of machine learning and statistical inference', importance: 9, category: 'theory' },
        { name: 'Feature Engineering & Selection', description: 'Techniques for creating, selecting, and transforming input variables', importance: 8, category: 'practical' },
        { name: 'Neural Networks & Deep Learning', description: 'Artificial neural networks, backpropagation, and deep learning architectures', importance: 9, category: 'theory' },
        { name: 'Model Evaluation & Validation', description: 'Cross-validation, metrics, bias-variance tradeoff, and model selection', importance: 8, category: 'practical' },
        { name: 'Supervised Learning Algorithms', description: 'Classification and regression algorithms: SVM, decision trees, ensemble methods', importance: 8, category: 'practical' },
        { name: 'MLOps & Production Deployment', description: 'Model versioning, monitoring, and production deployment strategies', importance: 7, category: 'practical' }
      ]
    };
    
    // Find best match or generate generic concepts
    let selectedConcepts = null;
    for (const [key, concepts] of Object.entries(conceptMaps)) {
      if (domainLower.includes(key)) {
        selectedConcepts = concepts;
        break;
      }
    }
    
    if (!selectedConcepts) {
      // Generate domain-specific generic concepts
      const category = this.detectTechnicalCategory(domainLower);
      selectedConcepts = this.generateGenericTechnicalConcepts(domain, category);
    }
    
    return selectedConcepts;
  }

  generateGenericTechnicalConcepts(domain, category) {
    return [
      { name: `${domain} Core Architecture`, description: `Fundamental architectural patterns and design principles in ${domain}`, importance: 9, category: 'theory' },
      { name: `${domain} Implementation Patterns`, description: `Common implementation strategies and coding patterns for ${domain}`, importance: 8, category: 'practical' },
      { name: `${domain} Performance Optimization`, description: `Techniques for optimizing ${domain} applications and systems`, importance: 7, category: 'practical' },
      { name: `${domain} Security Considerations`, description: `Security best practices and vulnerability mitigation in ${domain}`, importance: 8, category: 'practical' },
      { name: `${domain} Testing Strategies`, description: `Testing methodologies, frameworks, and quality assurance for ${domain}`, importance: 7, category: 'practical' },
      { name: `${domain} Development Tools`, description: `Essential tools, frameworks, and libraries for ${domain} development`, importance: 6, category: 'tool' }
    ];
  }

  // Enhanced relationship generation with better logic
  generateEnhancedFallbackRelationships(concepts) {
    const relationships = [];
    const relationshipTypes = [
      { type: 'prerequisite', weight: 0.8 },
      { type: 'builds_upon', weight: 0.7 },
      { type: 'related_to', weight: 0.6 },
      { type: 'applied_in', weight: 0.7 },
      { type: 'component_of', weight: 0.8 }
    ];
    
    // Create more intelligent relationships based on concept importance and categories
    for (let i = 0; i < concepts.length; i++) {
      for (let j = i + 1; j < concepts.length; j++) {
        const concept1 = concepts[i];
        const concept2 = concepts[j];
        
        // Higher chance of relationship for important concepts
        const relationshipProbability = (concept1.importance + concept2.importance) / 20;
        
        if (Math.random() < relationshipProbability) {
          const relationshipType = this.determineIntelligentRelationshipType(concept1, concept2, relationshipTypes);
          const strength = this.calculateRelationshipStrength(concept1, concept2, relationshipType.type);
          
          relationships.push({
            source: concept1.name,
            target: concept2.name,
            relationship: relationshipType.type,
            strength: strength,
            description: this.generateRelationshipDescription(concept1.name, concept2.name, relationshipType.type)
          });
        }
      }
    }
    
    // Ensure we have at least some relationships
    if (relationships.length < 3 && concepts.length >= 2) {
      for (let i = 0; i < Math.min(3, concepts.length - 1); i++) {
        relationships.push({
          source: concepts[i].name,
          target: concepts[i + 1].name,
          relationship: 'builds_upon',
          strength: 0.7,
          description: `${concepts[i].name} provides foundation for ${concepts[i + 1].name}`
        });
      }
    }
    
    return relationships.slice(0, 15); // Limit to 15 relationships
  }

  determineIntelligentRelationshipType(concept1, concept2, relationshipTypes) {
    // Logic to determine relationship type based on concept characteristics
    if (concept1.category === 'theory' && concept2.category === 'practical') {
      return { type: 'applied_in', weight: 0.8 };
    }
    if (concept1.importance > concept2.importance + 2) {
      return { type: 'prerequisite', weight: 0.8 };
    }
    if (concept1.category === concept2.category) {
      return { type: 'related_to', weight: 0.6 };
    }
    
    // Default to random selection with weights
    const totalWeight = relationshipTypes.reduce((sum, rt) => sum + rt.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const rt of relationshipTypes) {
      random -= rt.weight;
      if (random <= 0) return rt;
    }
    
    return relationshipTypes[0];
  }

  calculateRelationshipStrength(concept1, concept2, relationshipType) {
    let baseStrength = 0.5;
    
    // Stronger relationships for similar importance levels
    const importanceDiff = Math.abs(concept1.importance - concept2.importance);
    baseStrength += (10 - importanceDiff) / 20;
    
    // Adjust based on relationship type
    const typeMultipliers = {
      'prerequisite': 0.9,
      'builds_upon': 0.8,
      'component_of': 0.85,
      'applied_in': 0.7,
      'related_to': 0.6
    };
    
    baseStrength *= (typeMultipliers[relationshipType] || 0.6);
    
    return Math.round(Math.min(Math.max(baseStrength, 0.1), 1.0) * 100) / 100;
  }

  generateRelationshipDescription(source, target, relationshipType) {
    const descriptions = {
      'prerequisite': `Understanding ${source} is essential before learning ${target}`,
      'builds_upon': `${target} extends and builds upon concepts from ${source}`,
      'related_to': `${source} and ${target} share common principles and applications`,
      'applied_in': `${source} concepts are directly applied when implementing ${target}`,
      'component_of': `${source} is a fundamental component of ${target}`
    };
    
    return descriptions[relationshipType] || `${source} is related to ${target}`;
  }

  // Enhanced information processing with progress tracking
  async processInformation(collectedData) {
    console.log('Processing collected information...');
    
    try {
      const startTime = Date.now();
      
      // Extract concepts with progress tracking
      const concepts = await this.extractConcepts(collectedData);
      console.log(`📊 Extracted ${concepts.length} concepts`);
      
      // Identify relationships
      const relationships = await this.identifyRelationships(concepts);
      console.log(`🔗 Identified ${relationships.length} relationships`);
      
      const processingTime = Date.now() - startTime;
      
      return {
        concepts,
        relationships,
        processingStats: {
          totalDocuments: this.calculateTotalDocuments(collectedData),
          conceptsExtracted: concepts.length,
          relationshipsIdentified: relationships.length,
          processingTime: processingTime,
          avgConceptImportance: concepts.length > 0 ? 
            Math.round((concepts.reduce((sum, c) => sum + c.importance, 0) / concepts.length) * 100) / 100 : 0
        },
        processingComplete: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Information processing error:', error.message);
      
      // Enhanced fallback processing
      const fallbackConcepts = this.generateEnhancedFallbackConcepts(collectedData.domain);
      const fallbackRelationships = this.generateEnhancedFallbackRelationships(fallbackConcepts);
      
      return {
        concepts: fallbackConcepts,
        relationships: fallbackRelationships,
        processingStats: {
          totalDocuments: this.calculateTotalDocuments(collectedData),
          conceptsExtracted: fallbackConcepts.length,
          relationshipsIdentified: fallbackRelationships.length,
          processingTime: 0,
          avgConceptImportance: 7.5,
          fallbackUsed: true
        },
        processingComplete: true,
        timestamp: new Date().toISOString()
      };
    }
  }

  calculateTotalDocuments(collectedData) {
    return (collectedData.academicPapers || 0) + 
           (collectedData.technicalDocs || 0) + 
           (collectedData.industryReports || 0) +
           (collectedData.expertInterviews || 0);
  }

  // Enhanced knowledge graph building with better algorithms
  async buildKnowledgeGraph(concepts, relationships) {
    console.log('Building knowledge graph...');
    
    try {
      // Create nodes with enhanced properties
      const nodes = concepts.map((concept, index) => ({
        id: index,
        name: concept.name,
        description: concept.description,
        importance: concept.importance,
        category: concept.category || 'practical',
        type: this.classifyConceptType(concept.name),
        connections: 0, // Will be calculated below
        centrality: 0,  // Will be calculated below
        level: this.estimateConceptLevel(concept)
      }));
      
      // Create edges with validation
      const edges = relationships
        .map((rel, index) => {
          const sourceNode = nodes.find(n => n.name === rel.source);
          const targetNode = nodes.find(n => n.name === rel.target);
          
          if (!sourceNode || !targetNode) {
            console.warn(`Invalid relationship: ${rel.source} -> ${rel.target}`);
            return null;
          }
          
          return {
            id: index,
            source: sourceNode.id,
            target: targetNode.id,
            relationship: rel.relationship,
            strength: rel.strength,
            description: rel.description || `${rel.source} ${rel.relationship.replace('_', ' ')} ${rel.target}`
          };
        })
        .filter(edge => edge !== null);
      
      // Calculate node metrics
      this.calculateNodeMetrics(nodes, edges);
      
      // Calculate graph statistics
      const stats = {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        avgConnections: nodes.length > 0 ? 
          Math.round((nodes.reduce((sum, n) => sum + n.connections, 0) / nodes.length) * 100) / 100 : 0,
        graphDensity: nodes.length > 1 ? 
          Math.round((edges.length / (nodes.length * (nodes.length - 1) / 2)) * 10000) / 100 : 0,
        avgImportance: nodes.length > 0 ?
          Math.round((nodes.reduce((sum, n) => sum + n.importance, 0) / nodes.length) * 100) / 100 : 0,
        complexityScore: this.calculateGraphComplexity(nodes, edges)
      };
      
      const graph = {
        nodes,
        edges,
        stats,
        buildComplete: true,
        timestamp: new Date().toISOString()
      };
      
      console.log(`🕸️ Knowledge graph built: ${nodes.length} nodes, ${edges.length} edges`);
      
      return graph;
    } catch (error) {
      console.error('Knowledge graph building error:', error);
      throw error;
    }
  }

  calculateNodeMetrics(nodes, edges) {
    // Calculate connections and centrality for each node
    nodes.forEach(node => {
      node.connections = edges.filter(e => e.source === node.id || e.target === node.id).length;
      
      // Simple centrality measure based on connections and importance
      node.centrality = Math.round((node.connections * 0.7 + node.importance * 0.3) * 100) / 100;
    });
  }

  calculateGraphComplexity(nodes, edges) {
    if (nodes.length === 0) return 0;
    
    const avgImportance = nodes.reduce((sum, n) => sum + n.importance, 0) / nodes.length;
    const connectivity = edges.length / nodes.length;
    const categoryDiversity = new Set(nodes.map(n => n.category)).size;
    
    return Math.round((avgImportance + connectivity + categoryDiversity) * 100) / 100;
  }

  estimateConceptLevel(concept) {
    // Estimate learning level based on importance and category
    if (concept.importance >= 8 && concept.category === 'theory') return 'advanced';
    if (concept.importance <= 5 && concept.category === 'practical') return 'beginner';
    return 'intermediate';
  }

  // Enhanced neural pathway optimization
  async optimizeNeuralPathways(knowledgeGraph, domain) {
    console.log('Optimizing neural pathways...');
    
    try {
      const { nodes, edges } = knowledgeGraph;
      
      // Calculate optimal learning pathways
      const pathways = await this.calculateEnhancedOptimalPathways(nodes, edges, domain);
      
      // Generate structured learning sequences
      const learningSequences = await this.generateEnhancedLearningSequences(nodes, pathways);
      
      // Calculate difficulty progression
      const difficultyProgression = this.calculateDifficultyProgression(pathways);
      
      const optimization = {
        pathways,
        learningSequences,
        difficultyProgression,
        optimizationStats: {
          totalPathways: pathways.length,
          averagePathLength: pathways.length > 0 ? 
            Math.round((pathways.reduce((sum, p) => sum + p.steps.length, 0) / pathways.length) * 100) / 100 : 0,
          complexityScore: this.calculateComplexityScore(knowledgeGraph),
          recommendedLearningTime: this.estimateEnhancedLearningTime(knowledgeGraph, domain),
          optimalStartingPoints: this.identifyOptimalStartingPoints(nodes, edges),
          learningEfficiencyScore: this.calculateLearningEfficiency(pathways, nodes)
        },
        optimizationComplete: true,
        timestamp: new Date().toISOString()
      };
      
      console.log(`🧠 Optimized ${pathways.length} learning pathways`);
      
      return optimization;
    } catch (error) {
      console.error('Neural pathway optimization error:', error);
      throw error;
    }
  }

  // Enhanced pathway calculation with better algorithms
  async calculateEnhancedOptimalPathways(nodes, edges, domain) {
    const pathways = [];
    
    // Identify different types of starting points
    const fundamentalNodes = nodes
      .filter(n => n.importance >= 7 && (n.category === 'theory' || n.level === 'beginner'))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 6);
    
    const practicalNodes = nodes
      .filter(n => n.category === 'practical' && n.importance >= 6)
      .sort((a, b) => b.centrality - a.centrality)
      .slice(0, 4);
    
    // Generate pathways from fundamental concepts
    for (const startNode of fundamentalNodes) {
      const pathway = await this.findEnhancedPathway(startNode, nodes, edges, 'comprehensive');
      if (pathway.steps.length >= 3) {
        pathways.push(pathway);
      }
    }
    
    // Generate practical pathways
    for (const startNode of practicalNodes.slice(0, 2)) {
      const pathway = await this.findEnhancedPathway(startNode, nodes, edges, 'practical');
      if (pathway.steps.length >= 3) {
        pathways.push(pathway);
      }
    }
    
    // Generate quick start pathway for beginners
    const quickStartPathway = this.generateQuickStartPathway(nodes, edges);
    if (quickStartPathway.steps.length >= 2) {
      pathways.push(quickStartPathway);
    }
    
    return pathways.slice(0, 8); // Limit to 8 pathways
  }

  async findEnhancedPathway(startNode, allNodes, allEdges, pathwayType) {
    const visited = new Set();
    const pathway = {
      name: this.generatePathwayName(startNode.name, pathwayType),
      type: pathwayType,
      steps: [startNode],
      difficulty: startNode.importance,
      estimatedTime: this.estimatePathwayTime(startNode, pathwayType),
      description: `Learning pathway starting with ${startNode.name}`
    };
    
    let currentNode = startNode;
    visited.add(currentNode.id);
    
    const maxDepth = pathwayType === 'practical' ? 5 : 6;
    
    for (let depth = 0; depth < maxDepth; depth++) {
      const nextNode = this.findNextOptimalNode(currentNode, allNodes, allEdges, visited, pathwayType);
      if (!nextNode) break;
      
      pathway.steps.push(nextNode);
      visited.add(nextNode.id);
      currentNode = nextNode;
      
      // Update pathway metrics
      pathway.difficulty = Math.round(
        (pathway.difficulty + nextNode.importance) / pathway.steps.length * 100
      ) / 100;
    }
    
    return pathway;
  }

  generatePathwayName(startNodeName, pathwayType) {
    const typeNames = {
      'comprehensive': 'Complete Mastery',
      'practical': 'Hands-on Application',
      'quick': 'Quick Start'
    };
    
    const pathwayName = typeNames[pathwayType] || 'Learning';
    return `${startNodeName} - ${pathwayName} Path`;
  }

  estimatePathwayTime(startNode, pathwayType) {
    const baseTime = {
      'comprehensive': 8,
      'practical': 6,
      'quick': 3
    };
    
    const time = baseTime[pathwayType] || 6;
    const complexityMultiplier = startNode.importance / 10;
    
    return `${Math.round(time * complexityMultiplier)}-${Math.round(time * complexityMultiplier * 1.5)} hours`;
  }

  findNextOptimalNode(currentNode, allNodes, allEdges, visited, pathwayType) {
    // Find connected nodes that haven't been visited
    const connectedEdges = allEdges.filter(e => 
      (e.source === currentNode.id && !visited.has(e.target)) ||
      (e.target === currentNode.id && !visited.has(e.source))
    );
    
    if (connectedEdges.length === 0) {
      // If no connected nodes, find similar nodes by category or importance
      return this.findSimilarUnvisitedNode(currentNode, allNodes, visited, pathwayType);
    }
    
    // Score potential next nodes
    const candidateNodes = connectedEdges.map(edge => {
      const targetId = edge.source === currentNode.id ? edge.target : edge.source;
      const node = allNodes.find(n => n.id === targetId);
      if (!node) return null;
      
      let score = edge.strength * 0.4 + (node.importance / 10) * 0.3;
      
      // Bonus for pathway type preferences
      if (pathwayType === 'practical' && node.category === 'practical') score += 0.2;
      if (pathwayType === 'comprehensive' && node.category === 'theory') score += 0.15;
      
      // Bonus for prerequisite relationships
      if (edge.relationship === 'builds_upon' || edge.relationship === 'applied_in') score += 0.15;
      
      return { node, score, edge };
    }).filter(candidate => candidate !== null);
    
    if (candidateNodes.length === 0) return null;
    
    // Return highest scoring node
    candidateNodes.sort((a, b) => b.score - a.score);
    return candidateNodes[0].node;
  }

  findSimilarUnvisitedNode(currentNode, allNodes, visited, pathwayType) {
    const unvisitedNodes = allNodes.filter(n => !visited.has(n.id));
    if (unvisitedNodes.length === 0) return null;
    
    // Score based on similarity to current node
    const scoredNodes = unvisitedNodes.map(node => {
      let similarity = 0;
      
      // Category similarity
      if (node.category === currentNode.category) similarity += 0.3;
      
      // Importance similarity
      const importanceDiff = Math.abs(node.importance - currentNode.importance);
      similarity += (10 - importanceDiff) / 10 * 0.2;
      
      // Level similarity
      if (node.level === currentNode.level) similarity += 0.2;
      
      return { node, similarity };
    });
    
    scoredNodes.sort((a, b) => b.similarity - a.similarity);
    return scoredNodes[0]?.node || null;
  }

  generateQuickStartPathway(nodes, edges) {
    // Create a beginner-friendly quick start pathway
    const beginnerNodes = nodes
      .filter(n => n.level === 'beginner' || n.importance <= 6)
      .sort((a, b) => b.centrality - a.centrality)
      .slice(0, 4);
    
    return {
      name: 'Quick Start - Essential Foundations',
      type: 'quick',
      steps: beginnerNodes,
      difficulty: beginnerNodes.length > 0 ? 
        Math.round((beginnerNodes.reduce((sum, n) => sum + n.importance, 0) / beginnerNodes.length) * 100) / 100 : 5,
      estimatedTime: '2-4 hours',
      description: 'Fast-track introduction to essential concepts for immediate productivity'
    };
  }

  // Enhanced learning sequence generation
  async generateEnhancedLearningSequences(nodes, pathways) {
    const sequences = pathways.map((pathway, index) => ({
      id: `sequence_${index + 1}`,
      name: pathway.name,
      type: pathway.type,
      description: pathway.description || `Structured learning sequence for ${pathway.steps[0]?.name}`,
      difficulty: pathway.difficulty,
      steps: pathway.steps.map((step, stepIndex) => ({
        order: stepIndex + 1,
        concept: step.name,
        description: step.description,
        category: step.category,
        difficulty: step.importance,
        estimatedTime: this.estimateStepTime(step, pathway.type),
        prerequisites: stepIndex === 0 ? [] : [pathway.steps[stepIndex - 1].name],
        learningObjectives: this.generateLearningObjectives(step, pathway.type),
        resources: this.suggestLearningResources(step)
      })),
      totalTime: pathway.estimatedTime,
      prerequisites: pathway.steps[0]?.name || 'Basic technical knowledge',
      learningOutcomes: this.generateLearningOutcomes(pathway)
    }));
    
    return sequences;
  }

  estimateStepTime(step, pathwayType) {
    const baseTime = {
      'comprehensive': step.importance * 45,
      'practical': step.importance * 30,
      'quick': step.importance * 20
    };
    
    const minutes = baseTime[pathwayType] || step.importance * 30;
    
    if (minutes < 60) return `${Math.round(minutes)} minutes`;
    if (minutes < 180) return `${Math.round(minutes / 60 * 10) / 10} hours`;
    return `${Math.round(minutes / 60)}-${Math.round(minutes / 60 * 1.5)} hours`;
  }

  generateLearningObjectives(step, pathwayType) {
    const objectiveTemplates = {
      'theory': [
        `Understand the fundamental principles of ${step.name}`,
        `Explain how ${step.name} works conceptually`,
        `Identify key components and relationships`
      ],
      'practical': [
        `Apply ${step.name} in real-world scenarios`,
        `Implement ${step.name} using appropriate tools`,
        `Troubleshoot common issues with ${step.name}`
      ],
      'tool': [
        `Configure and use ${step.name} effectively`,
        `Integrate ${step.name} into development workflow`,
        `Optimize ${step.name} for better performance`
      ],
      'framework': [
        `Build applications using ${step.name}`,
        `Follow ${step.name} best practices and conventions`,
        `Extend and customize ${step.name} functionality`
      ]
    };
    
    const templates = objectiveTemplates[step.category] || objectiveTemplates['practical'];
    return templates.slice(0, 2); // Limit to 2 objectives per step
  }

  suggestLearningResources(step) {
    return [
      `Official ${step.name} documentation`,
      `Interactive tutorials and hands-on exercises`,
      `Code examples and practical projects`,
      `Community forums and Q&A platforms`
    ];
  }

  generateLearningOutcomes(pathway) {
    const outcomes = [
      `Master core concepts and principles covered in this pathway`,
      `Apply learned concepts to solve real-world problems`,
      `Demonstrate proficiency through practical projects`
    ];
    
    if (pathway.type === 'comprehensive') {
      outcomes.push(`Achieve advanced understanding suitable for professional development`);
    } else if (pathway.type === 'practical') {
      outcomes.push(`Gain hands-on experience with industry-standard tools and practices`);
    }
    
    return outcomes;
  }

  // Calculate difficulty progression
  calculateDifficultyProgression(pathways) {
    return pathways.map(pathway => ({
      pathwayName: pathway.name,
      difficultyProgression: pathway.steps.map((step, index) => ({
        step: index + 1,
        concept: step.name,
        difficulty: step.importance,
        difficultyLabel: this.getDifficultyLabel(step.importance)
      })),
      averageDifficulty: pathway.difficulty,
      progressionType: this.analyzeProgressionType(pathway.steps)
    }));
  }

  getDifficultyLabel(importance) {
    if (importance <= 4) return 'Beginner';
    if (importance <= 7) return 'Intermediate';
    return 'Advanced';
  }

  analyzeProgressionType(steps) {
    if (steps.length < 2) return 'static';
    
    const difficulties = steps.map(s => s.importance);
    const isIncreasing = difficulties.every((val, i) => i === 0 || val >= difficulties[i - 1]);
    const isDecreasing = difficulties.every((val, i) => i === 0 || val <= difficulties[i - 1]);
    if (isIncreasing) return 'progressive';
    if (isDecreasing) return 'regressive';
    return 'mixed';
  }

  // Enhanced utility methods
  identifyOptimalStartingPoints(nodes, edges) {
    // Find nodes that are good starting points (high importance, low prerequisites)
    const incomingEdges = new Map();
    edges.forEach(edge => {
      if (edge.relationship === 'prerequisite') {
        incomingEdges.set(edge.target, (incomingEdges.get(edge.target) || 0) + 1);
      }
    });

    return nodes
      .filter(node => 
        node.importance >= 6 && 
        (incomingEdges.get(node.id) || 0) <= 1 &&
        (node.category === 'theory' || node.level === 'beginner')
      )
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 3)
      .map(node => ({
        concept: node.name,
        importance: node.importance,
        category: node.category,
        reasoning: `High importance (${node.importance}/10) with minimal prerequisites makes this an excellent starting point`
      }));
  }
   analyzeAndExtractKnowledgeGraph = async (documents) => {
    const prompt = `Extract entities and relationships from this text. Return JSON format:
    {
      "nodes": [{"id": "1", "label": "Entity Name", "type": "Person/Organization/Concept"}],
      "edges": [{"from": "1", "to": "2", "relationship": "works_at/created/related_to"}]
    }
    
    Text: ${documents.map(d => d.content).join('\n')}`;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    
    return JSON.parse(response.choices[0].message.content);
  };
  
  calculateLearningEfficiency(pathways, nodes) {
    if (pathways.length === 0 || nodes.length === 0) return 0;

    // Calculate efficiency based on pathway coverage and logical progression
    const totalImportance = nodes.reduce((sum, n) => sum + n.importance, 0);
    const coveredImportance = pathways.reduce((sum, pathway) => 
      sum + pathway.steps.reduce((pSum, step) => pSum + step.importance, 0), 0
    );

    const coverage = Math.min(coveredImportance / totalImportance, 1);
    const avgPathwayLength = pathways.reduce((sum, p) => sum + p.steps.length, 0) / pathways.length;
    const optimalLength = Math.sqrt(nodes.length); // Optimal pathway length heuristic

    const lengthEfficiency = Math.max(0, 1 - Math.abs(avgPathwayLength - optimalLength) / optimalLength);

    return Math.round((coverage * 0.6 + lengthEfficiency * 0.4) * 100);
  }

  // Enhanced complexity and time estimation
  calculateComplexityScore(knowledgeGraph) {
    const { nodes, edges } = knowledgeGraph;
    if (nodes.length === 0) return 0;

    const avgImportance = nodes.reduce((sum, n) => sum + n.importance, 0) / nodes.length;
    const connectivity = nodes.length > 0 ? edges.length / nodes.length : 0;
    const categoryDiversity = new Set(nodes.map(n => n.category || 'practical')).size;
    const maxImportance = Math.max(...nodes.map(n => n.importance));

    return Math.round(
      (avgImportance * 0.4 + 
       connectivity * 0.3 + 
       categoryDiversity * 0.2 + 
       maxImportance * 0.1) * 10
    ) / 10;
  }

  estimateEnhancedLearningTime(knowledgeGraph, domain) {
    const complexity = this.calculateComplexityScore(knowledgeGraph);
    const nodeCount = knowledgeGraph.nodes.length;
    
    // Base time estimates for different domain types (in hours)
    const domainBaseHours = {
      'javascript': 80,
      'python': 70,
      'react': 90,
      'angular': 95,
      'vue': 85,
      'nodejs': 85,
      'java': 120,
      'spring': 100,
      'machine learning': 150,
      'ai': 160,
      'data science': 130,
      'blockchain': 110,
      'cybersecurity': 120,
      'docker': 60,
      'kubernetes': 80,
      'aws': 100,
      'devops': 90
    };

    // Find matching domain or use default
    let baseHours = 100; // Default
    const domainLower = domain.toLowerCase();
    
    for (const [key, hours] of Object.entries(domainBaseHours)) {
      if (domainLower.includes(key)) {
        baseHours = hours;
        break;
      }
    }

    // Adjust based on complexity and node count
    const complexityMultiplier = Math.max(0.5, Math.min(2.0, complexity / 5));
    const nodeMultiplier = Math.max(0.8, Math.min(1.5, nodeCount / 10));
    
    const totalHours = Math.round(baseHours * complexityMultiplier * nodeMultiplier);

    // Convert to human-readable format
    if (totalHours < 40) return '4-6 weeks (part-time)';
    if (totalHours < 80) return '6-10 weeks (part-time)';
    if (totalHours < 120) return '3-4 months (part-time)';
    if (totalHours < 180) return '4-6 months (part-time)';
    return '6+ months (part-time)';
  }

  // Enhanced concept type classification
  classifyConceptType(conceptName) {
    const name = conceptName.toLowerCase();

    // More sophisticated classification rules
    if (name.match(/(algorithm|method|technique|strategy|approach)/)) return 'algorithm';
    if (name.match(/(theory|principle|concept|foundation|model)/)) return 'theory';
    if (name.match(/(framework|library|tool|platform|sdk|api)/)) return 'tool';
    if (name.match(/(pattern|practice|methodology|convention|standard)/)) return 'practice';
    if (name.match(/(application|implementation|project|example|use case)/)) return 'application';
    if (name.match(/(security|testing|debugging|optimization|performance)/)) return 'quality';

    // Default classification based on technical indicators
    if (name.match(/(programming|coding|development|syntax)/)) return 'fundamental';
    
    return 'practical';
  }

  // Complete ingestion workflow with enhanced error handling and progress tracking
  async performCompleteIngestion(domain, progressCallback, sessionId = null) {
    const results = {
      domain,
      sessionId: sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: new Date().toISOString(),
      steps: {},
      performance: {
        stepTimes: {},
        memoryUsage: {},
        errors: []
      }
    };

    // Update performance metrics
    this.performanceMetrics.totalIngestions++;
    const ingestionStartTime = Date.now();

    try {
      // Step 1: Domain Analysis (WITH ENHANCED VALIDATION)
      const step1Start = Date.now();
      progressCallback?.({ 
        step: 0, 
        progress: 0, 
        status: 'Analyzing domain requirements and technical relevance...',
        details: `Evaluating "${domain}" for technical content and learning potential`
      });

      results.steps.analysis = await this.analyzeDomainRequirements(domain);
      results.performance.stepTimes.analysis = Date.now() - step1Start;

      // CRITICAL: Early termination for non-technical domains
      if (results.steps.analysis.isTechnical === false) {
        results.error = results.steps.analysis.message;
        results.success = false;
        results.endTime = new Date().toISOString();
        results.totalDuration = Date.now() - ingestionStartTime;
        
        progressCallback?.({ 
          step: 0, 
          progress: 100, 
          status: 'Analysis complete - Non-technical domain detected',
          error: results.steps.analysis.message
        });
        
        return results;
      }

      progressCallback?.({ 
        step: 0, 
        progress: 25, 
        status: 'Domain analysis complete - Technical domain confirmed',
        details: `Confidence: ${results.steps.analysis.confidence}% | Category: ${results.steps.analysis.technicalCategory}`
      });

      // Step 2: Knowledge Collection
      const step2Start = Date.now();
      progressCallback?.({ 
        step: 1, 
        progress: 25, 
        status: 'Collecting knowledge sources...',
        details: 'Gathering academic papers, code repositories, videos, and documentation'
      });

      results.steps.collection = await this.collectKnowledgeSources(domain);
      results.performance.stepTimes.collection = Date.now() - step2Start;

      progressCallback?.({ 
        step: 1, 
        progress: 45, 
        status: 'Knowledge collection complete',
        details: `Found: ${results.steps.collection.academicPapers} papers, ${results.steps.collection.codeRepos} repos, ${results.steps.collection.videoTutorials} videos`
      });

      // Step 3: Information Processing
      const step3Start = Date.now();
      progressCallback?.({ 
        step: 2, 
        progress: 45, 
        status: 'Processing and analyzing collected information...',
        details: 'Extracting concepts and identifying relationships using AI analysis'
      });

      results.steps.processing = await this.processInformation(results.steps.collection);
      results.performance.stepTimes.processing = Date.now() - step3Start;

      progressCallback?.({ 
        step: 2, 
        progress: 65, 
        status: 'Information processing complete',
        details: `Extracted ${results.steps.processing.concepts.length} concepts, ${results.steps.processing.relationships.length} relationships`
      });

      // Step 4: Knowledge Graph Construction
      const step4Start = Date.now();
      progressCallback?.({ 
        step: 3, 
        progress: 65, 
        status: 'Building knowledge graph...',
        details: 'Creating interconnected network of concepts and relationships'
      });

      results.steps.knowledgeGraph = await this.buildKnowledgeGraph(
        results.steps.processing.concepts,
        results.steps.processing.relationships
      );
      results.performance.stepTimes.knowledgeGraph = Date.now() - step4Start;

      progressCallback?.({ 
        step: 3, 
        progress: 85, 
        status: 'Knowledge graph construction complete',
        details: `Graph density: ${results.steps.knowledgeGraph.stats.graphDensity}% | Avg connections: ${results.steps.knowledgeGraph.stats.avgConnections}`
      });

      // Step 5: Neural Pathway Optimization
      const step5Start = Date.now();
      progressCallback?.({ 
        step: 4, 
        progress: 85, 
        status: 'Optimizing learning pathways...',
        details: 'Generating personalized learning sequences and difficulty progressions'
      });

      results.steps.optimization = await this.optimizeNeuralPathways(
        results.steps.knowledgeGraph,
        domain
      );
      results.performance.stepTimes.optimization = Date.now() - step5Start;

      progressCallback?.({ 
        step: 4, 
        progress: 100, 
        status: 'Optimization complete - Knowledge system ready',
        details: `Generated ${results.steps.optimization.pathways.length} learning pathways | Est. time: ${results.steps.optimization.optimizationStats.recommendedLearningTime}`
      });

      // Finalize results
      results.endTime = new Date().toISOString();
      results.totalDuration = Date.now() - ingestionStartTime;
      results.success = true;

      // Update performance metrics
      this.performanceMetrics.successfulIngestions++;
      this.performanceMetrics.lastIngestionTime = results.totalDuration;
      this.performanceMetrics.averageProcessingTime = 
        (this.performanceMetrics.averageProcessingTime * (this.performanceMetrics.successfulIngestions - 1) + 
         results.totalDuration) / this.performanceMetrics.successfulIngestions;

      console.log(`✅ Complete ingestion successful for "${domain}" in ${Math.round(results.totalDuration / 1000)}s`);
      
      return results;

    } catch (error) {
      console.error('❌ Complete ingestion error:', error);
      
      results.error = error.message;
      results.success = false;
      results.endTime = new Date().toISOString();
      results.totalDuration = Date.now() - ingestionStartTime;
      results.performance.errors.push({
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });

      progressCallback?.({ 
        step: -1, 
        progress: 0, 
        status: 'Ingestion failed',
        error: error.message
      });

      return results;
    } finally {
      // Always attempt cleanup
      try {
        if (this.crawler) {
          await this.crawler.cleanup();
        }
      } catch (cleanupError) {
        console.warn('⚠️ Cleanup warning:', cleanupError.message);
      }
    }
  }

  // Enhanced real-time statistics
  getRealTimeStats() {
    try {
      const crawlerStats = this.crawler.updateCrawlStats();
      
      return {
        ...crawlerStats,
        ingestionMetrics: {
          totalIngestions: this.performanceMetrics.totalIngestions,
          successRate: this.performanceMetrics.totalIngestions > 0 ? 
            Math.round((this.performanceMetrics.successfulIngestions / this.performanceMetrics.totalIngestions) * 100) : 0,
          averageProcessingTime: Math.round(this.performanceMetrics.averageProcessingTime / 1000) || 0,
          lastIngestionDuration: Math.round(this.performanceMetrics.lastIngestionTime / 1000) || 0
        }
      };
    } catch (error) {
      console.warn('Error getting real-time stats:', error.message);
      return {
        academicPapers: 0,
        technicalDocs: 0,
        codeRepos: 0,
        videoTutorials: 0,
        expertInterviews: 0,
        industryReports: 0,
        ingestionMetrics: {
          totalIngestions: this.performanceMetrics.totalIngestions,
          successRate: 0,
          averageProcessingTime: 0,
          lastIngestionDuration: 0
        }
      };
    }
  }

  // Enhanced result saving with comprehensive validation
  async saveResults(results) {
    try {
      const DomainIngestion = require('../models/DomainIngestion');

      // Enhanced data validation and sanitization
      const sanitizedAnalysisResults = sanitizeAnalysisResults(results.steps?.analysis);
      const sanitizedProcessingResults = sanitizeProcessingResults(results.steps?.processing);

      // Validate required fields
      if (!results.sessionId || !results.domain) {
        throw new Error('Missing required fields: sessionId and domain are mandatory');
      }

      // Prepare comprehensive ingestion record
      const ingestionRecord = new DomainIngestion({
        sessionId: results.sessionId,
        domain: results.domain,
        status: results.success ? 'completed' : 'failed',
        
        // Core analysis results
        analysisResults: sanitizedAnalysisResults,
        collectionResults: results.steps?.collection || {},
        processingResults: sanitizedProcessingResults,
        knowledgeGraph: results.steps?.knowledgeGraph || {},
        optimization: results.steps?.optimization || {},

        // Metadata and performance
        startTime: results.startTime,
        completedAt: results.endTime,
        totalDuration: results.totalDuration,
        performance: {
          stepTimes: results.performance?.stepTimes || {},
          memoryUsage: results.performance?.memoryUsage || {},
          errors: results.performance?.errors || []
        },

        // Success indicators
        success: results.success,
        error: results.error,

        // Enhanced metadata
        metadata: {
          crawlerUsed: results.steps?.collection?.fallbackUsed ? 'fallback' : 'real',
          aiProcessingUsed: process.env.OPENAI_API_KEY ? true : false,
          totalConcepts: results.steps?.processing?.concepts?.length || 0,
          totalRelationships: results.steps?.processing?.relationships?.length || 0,
          totalPathways: results.steps?.optimization?.pathways?.length || 0,
          estimatedLearningTime: results.steps?.optimization?.optimizationStats?.recommendedLearningTime,
          complexityScore: results.steps?.optimization?.optimizationStats?.complexityScore,
          version: '2.0'
        },

        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Save with error handling
      const saved = await ingestionRecord.save();
      console.log(`💾 Results saved successfully for session: ${results.sessionId}`);

      return {
        saved: true,
        ingestionId: saved._id,
        sessionId: results.sessionId,
        domain: results.domain,
        success: results.success,
        totalDuration: results.totalDuration
      };

    } catch (error) {
      console.error('❌ Error saving results:', error);
      
      // Enhanced error logging
      if (error.name === 'ValidationError') {
        console.error('Validation errors:', Object.keys(error.errors));
      }
      
      throw new Error(`Failed to save ingestion results: ${error.message}`);
    }
  }

  // Cleanup method for service shutdown
  async cleanup() {
    console.log('🧹 Cleaning up IngestionService...');
    
    try {
      if (this.crawler) {
        await this.crawler.cleanup();
      }
      
      // Reset performance metrics
      this.performanceMetrics = {
        totalIngestions: 0,
        successfulIngestions: 0,
        averageProcessingTime: 0,
        lastIngestionTime: null
      };
      
      console.log('✅ IngestionService cleanup completed');
    } catch (error) {
      console.warn('⚠️ IngestionService cleanup warning:', error.message);
    }
  }

  // Health check method
  async healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        crawler: 'unknown',
        ai: 'unknown',
        database: 'unknown'
      },
      performance: this.performanceMetrics
    };

    try {
      // Check crawler
      if (this.crawler) {
        health.services.crawler = 'available';
      }

      // Check AI service
      if (process.env.OPENAI_API_KEY) {
        health.services.ai = 'available';
      } else {
        health.services.ai = 'unavailable';
      }

      // Check database (basic check)
      const DomainIngestion = require('../models/DomainIngestion');
      await DomainIngestion.findOne().limit(1);
      health.services.database = 'available';

    } catch (error) {
      health.status = 'degraded';
      health.error = error.message;
      health.services.database = 'error';
    }

    return health;
  }
}

module.exports = IngestionService;



