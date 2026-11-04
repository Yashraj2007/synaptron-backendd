const winston = require("winston");
const path = require("path");
const fs = require("fs");

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output with better colors and formatting
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    let log = `${timestamp} [${level}]`;
    if (service) {
      log += ` [${service}]`;
    }
    log += `: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    return log;
  })
);

// Custom format for file output with enhanced structure
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Enhanced error format for better debugging
const errorFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = JSON.stringify({
      timestamp,
      level,
      message,
      stack,
      ...meta
    }, null, 2);
    return log;
  })
);

// Create the main logger with enhanced configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: fileFormat,
  defaultMeta: { 
    service: "synaptron-backend",
    pid: process.pid,
    hostname: require('os').hostname()
  },
  transports: [
    // Critical errors
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      format: errorFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true
    }),
    // Warning logs
    new winston.transports.File({
      filename: path.join(logsDir, "warn.log"),
      level: "warn",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    // Combined logs
    new winston.transports.File({
      filename: path.join(logsDir, "app.log"),
      maxsize: 10485760, // 10MB
      maxFiles: 15,
      tailable: true
    }),
    // Debug logs (only in development)
    ...(process.env.NODE_ENV !== "production" ? [
      new winston.transports.File({
        filename: path.join(logsDir, "debug.log"),
        level: "debug",
        maxsize: 5242880,
        maxFiles: 3
      })
    ] : [])
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, "exceptions.log"),
      maxsize: 5242880,
      maxFiles: 3
    })
  ],
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, "rejections.log"),
      maxsize: 5242880,
      maxFiles: 3
    })
  ]
});

// Add console transport for development with enhanced formatting
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
      level: "debug"
    })
  );
}

// Specialized logger for authentication
const authLogger = winston.createLogger({
  level: "info",
  format: fileFormat,
  defaultMeta: { 
    service: "synaptron-auth",
    component: "authentication"
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, "auth.log"),
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "auth-errors.log"),
      level: "error",
      maxsize: 5242880,
      maxFiles: 3,
    })
  ]
});

// Specialized logger for chat operations
const chatLogger = winston.createLogger({
  level: "info",
  format: fileFormat,
  defaultMeta: { 
    service: "synaptron-chat",
    component: "chat"
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, "chat.log"),
      maxsize: 5242880,
      maxFiles: 5,
    })
  ]
});

// Specialized logger for code operations
const codeLogger = winston.createLogger({
  level: "info",
  format: fileFormat,
  defaultMeta: { 
    service: "synaptron-code",
    component: "code"
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, "code.log"),
      maxsize: 5242880,
      maxFiles: 5,
    })
  ]
});

// NEW: Specialized logger for ingestion operations
const ingestionLogger = winston.createLogger({
  level: "info",
  format: fileFormat,
  defaultMeta: { 
    service: "synaptron-ingestion",
    component: "ingestion"
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, "ingestion.log"),
      maxsize: 10485760, // 10MB for ingestion logs
      maxFiles: 7,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "ingestion-errors.log"),
      level: "error",
      maxsize: 5242880,
      maxFiles: 5,
    })
  ]
});

// Enhanced request logging middleware
const logRequest = (req, res, next) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  // Add request ID to request object for tracking
  req.requestId = requestId;

  res.on("finish", () => {
    const duration = Date.now() - start;
    const logData = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get("User-Agent"),
      ip: req.ip || req.connection.remoteAddress,
      userId: req.user?.id || "anonymous",
      contentLength: res.get("Content-Length") || 0
    };

    if (res.statusCode >= 500) {
      logger.error("HTTP Request - Server Error", logData);
    } else if (res.statusCode >= 400) {
      logger.warn("HTTP Request - Client Error", logData);
    } else if (duration > 5000) {
      logger.warn("HTTP Request - Slow Response", logData);
    } else {
      logger.info("HTTP Request", logData);
    }
  });

  next();
};

// Enhanced error logging
const logError = (error, req = null, additionalInfo = {}) => {
  const errorData = {
    message: error.message,
    stack: error.stack,
    name: error.name,
    code: error.code,
    timestamp: new Date().toISOString(),
    ...additionalInfo,
  };

  if (req) {
    errorData.request = {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      userId: req.user?.id || "anonymous",
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get("User-Agent")
    };
  }

  logger.error("Application Error", errorData);
};

// Enhanced authentication logging
const logAuth = (action, userId, success, additionalInfo = {}) => {
  const logData = {
    action,
    userId,
    success,
    timestamp: new Date().toISOString(),
    ip: additionalInfo.ip,
    userAgent: additionalInfo.userAgent,
    ...additionalInfo,
  };

  if (success) {
    authLogger.info(`Auth ${action} Success`, logData);
  } else {
    authLogger.warn(`Auth ${action} Failed`, logData);
  }
};

// Enhanced chat logging
const logChat = (action, userId, sessionId, additionalInfo = {}) => {
  const logData = {
    action,
    userId,
    sessionId,
    timestamp: new Date().toISOString(),
    messageCount: additionalInfo.messageCount,
    tokenUsage: additionalInfo.tokenUsage,
    ...additionalInfo,
  };

  chatLogger.info(`Chat ${action}`, logData);
};

// Enhanced code logging
const logCode = (action, userId, submissionId, additionalInfo = {}) => {
  const logData = {
    action,
    userId,
    submissionId,
    timestamp: new Date().toISOString(),
    language: additionalInfo.language,
    executionTime: additionalInfo.executionTime,
    ...additionalInfo,
  };

  codeLogger.info(`Code ${action}`, logData);
};

// NEW: Ingestion-specific logging
const logIngestion = (action, sessionId, status, additionalInfo = {}) => {
  const logData = {
    action,
    sessionId,
    status,
    timestamp: new Date().toISOString(),
    domain: additionalInfo.domain,
    progress: additionalInfo.progress,
    itemsProcessed: additionalInfo.itemsProcessed,
    ...additionalInfo,
  };

  if (status === 'error') {
    ingestionLogger.error(`Ingestion ${action}`, logData);
  } else if (status === 'warning') {
    ingestionLogger.warn(`Ingestion ${action}`, logData);
  } else {
    ingestionLogger.info(`Ingestion ${action}`, logData);
  }
};

// Enhanced performance monitoring
const logPerformance = (operation, duration, additionalInfo = {}) => {
  const logData = {
    operation,
    duration: `${duration}ms`,
    timestamp: new Date().toISOString(),
    memoryUsage: process.memoryUsage(),
    ...additionalInfo,
  };

  if (duration > 10000) {
    logger.error("Very Slow Operation", logData);
  } else if (duration > 5000) {
    logger.warn("Slow Operation", logData);
  } else if (duration > 1000) {
    logger.info("Performance Warning", logData);
  } else {
    logger.debug("Performance", logData);
  }
};

// NEW: Database operation logging
const logDatabase = (operation, collection, duration, additionalInfo = {}) => {
  const logData = {
    operation,
    collection,
    duration: `${duration}ms`,
    timestamp: new Date().toISOString(),
    ...additionalInfo,
  };

  if (duration > 5000) {
    logger.warn("Slow Database Operation", logData);
  } else {
    logger.debug("Database Operation", logData);
  }
};

// NEW: System health logging
const logSystemHealth = (metrics) => {
  const healthData = {
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    cpu: process.cpuUsage(),
    ...metrics
  };

  logger.info("System Health", healthData);
};

// Graceful shutdown logging
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
});

// Export all loggers and utilities
module.exports = {
  // Main loggers
  logger,
  authLogger,
  chatLogger,
  codeLogger,
  ingestionLogger,
  
  // Logging utilities
  logRequest,
  logError,
  logAuth,
  logChat,
  logCode,
  logIngestion,
  logPerformance,
  logDatabase,
  logSystemHealth,
  
  // Direct logger access (for backward compatibility)
  log: logger,
  
  // Logger levels for easy access
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6
  }
};
