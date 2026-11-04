// Error handlers - Node.js level errors
process.on('uncaughtException', (error) => {
  console.error('----->  UNCAUGHT EXCEPTION - App will exit!');
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('----->  UNHANDLED REJECTION - App will exit!');
  console.error('Promise:', promise);
  console.error('Reason:', reason);
  process.exit(1);
});

console.log('-----> Error handlers registered, starting app...');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');
require('dotenv').config();

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const codeRoutes = require('./routes/code');
const ingestRoutes = require('./routes/ingest');
const gapRoutes = require('./routes/gap');
const teamRoutes = require('./routes/team'); // 🔥 NEW: Team collaboration routes
const swaggerUi = require('swagger-ui-express');
const { logRequest } = require('./utils/logger');

const AUTH_DISABLED = String(process.env.DISABLE_AUTH || "true").toLowerCase() === "true";

if (!process.env.JWT_SECRET) {
  if (AUTH_DISABLED) {
    process.env.JWT_SECRET = crypto.randomBytes(24).toString("hex");
    console.warn("Auth disabled and JWT_SECRET missing. Using ephemeral JWT secret for this runtime.");
  } else {
    console.error("----->  JWT_SECRET is missing in .env file. Please set it before running the server.");
    process.exit(1);
  }
}

// Load Swagger YAML safely
let swaggerDocument = {};
try {
  const yamlPath = path.join(__dirname, "docs", "openapi.yaml");
  const file = fs.readFileSync(yamlPath, "utf8");
  swaggerDocument = yaml.load(file);
} catch (err) {
  console.warn("Swagger YAML not loaded:", err.message);
}

// Initialize Express app
const app = express();
const server = createServer(app);

// Initialize Socket.IO with enhanced configuration
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Connect to MongoDB (async IIFE)
(async () => {
  try {
    await connectDB();

    // Security Middleware with Helmet and CSP
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"]
          }
        }
      })
    );

    // CORS middleware
    app.use(
      cors({
        origin: process.env.CLIENT_URL || "http://localhost:5173",
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"]
      })
    );

    // Global Rate Limiting
    const limiter = rateLimit({
      windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
      max: Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      message: { error: "Too many requests from this IP, please try again later." },
      standardHeaders: true,
      legacyHeaders: false
    });
    app.use("/api/", limiter);

    // Request logging middleware
    app.use(logRequest);

    // Body parsers
    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // HTTP Logging
    if (process.env.NODE_ENV === "development") {
      app.use(morgan("dev"));
    } else {
      app.use(morgan("combined"));
    }

    // API Docs
    if (swaggerDocument && Object.keys(swaggerDocument).length) {
      app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    }

    // 🔥 SOCKET.IO - REAL-TIME TEAM COLLABORATION
    io.on("connection", (socket) => {
      console.log(`----->  Socket.IO: Client connected - ${socket.id}`);

      // Original user room functionality
      socket.on("join-user-room", (userId) => {
        socket.join(`user-${userId}`);
        console.log(`----->  User ${userId} joined personal room`);
      });

      // 🔥 TEAM COLLABORATION EVENTS

      // Join team room
      socket.on('join_team', (teamCode) => {
        const roomName = teamCode.toUpperCase();
        socket.join(roomName);
        console.log(`----->  Team: ${socket.id} joined team ${roomName}`);
        
        // Notify others in the room
        socket.to(roomName).emit('member_joined', {
          socketId: socket.id,
          timestamp: new Date().toISOString()
        });

        // Send current room info
        const room = io.sockets.adapter.rooms.get(roomName);
        socket.emit('room_info', {
          teamCode: roomName,
          memberCount: room ? room.size : 1
        });
      });

      // Leave team room
      socket.on('leave_team', (teamCode) => {
        const roomName = teamCode.toUpperCase();
        socket.leave(roomName);
        console.log(`----->  Team: ${socket.id} left team ${roomName}`);
        
        socket.to(roomName).emit('member_left', {
          socketId: socket.id,
          timestamp: new Date().toISOString()
        });
      });

      // Real-time team updates
      socket.on('update_team', (data) => {
        try {
          const { teamCode, update } = data;
          const roomName = teamCode.toUpperCase();
          
          // Broadcast to all in room except sender
          socket.to(roomName).emit('team_updated', update);
          
          console.log(`----->  Team: ${roomName} updated by ${socket.id}`);
        } catch (error) {
          console.error('----->  Team update error:', error);
          socket.emit('error', { message: 'Failed to update team' });
        }
      });

      // Member activity tracking
      socket.on('member_activity', (data) => {
        const { teamCode, userName, timestamp } = data;
        const roomName = teamCode.toUpperCase();
        
        socket.to(roomName).emit('activity_update', {
          userName,
          timestamp,
          type: 'activity',
          socketId: socket.id
        });
      });

      // File locking system
      socket.on('lock_file', (data) => {
        const { teamCode, fileName, userName } = data;
        const roomName = teamCode.toUpperCase();
        
        socket.to(roomName).emit('file_locked', {
          fileName,
          userName,
          timestamp: new Date().toISOString()
        });
        
        console.log(`----->  File: ${fileName} locked by ${userName} in team ${roomName}`);
      });

      socket.on('unlock_file', (data) => {
        const { teamCode, fileName, userName } = data;
        const roomName = teamCode.toUpperCase();
        
        socket.to(roomName).emit('file_unlocked', {
          fileName,
          userName,
          timestamp: new Date().toISOString()
        });
        
        console.log(`----->  File: ${fileName} unlocked by ${userName} in team ${roomName}`);
      });

      // Team chat messages
      socket.on('chat_message', (data) => {
        const { teamCode, message } = data;
        const roomName = teamCode.toUpperCase();
        
        socket.to(roomName).emit('new_message', {
          message,
          timestamp: new Date().toISOString()
        });
        
        console.log(`----->  Chat: Message in team ${roomName} from ${message.sender}`);
      });

      // Task updates
      socket.on('task_update', (data) => {
        const { teamCode, taskTitle, userName } = data;
        const roomName = teamCode.toUpperCase();
        
        socket.to(roomName).emit('task_changed', {
          taskTitle,
          userName,
          timestamp: new Date().toISOString()
        });
        
        console.log(`----->  Task: Updated in team ${roomName} by ${userName}`);
      });

      // Typing indicators
      socket.on('typing_start', (data) => {
        const { teamCode, userName } = data;
        const roomName = teamCode.toUpperCase();
        
        socket.to(roomName).emit('user_typing', { userName });
      });

      socket.on('typing_stop', (data) => {
        const { teamCode, userName } = data;
        const roomName = teamCode.toUpperCase();
        
        socket.to(roomName).emit('user_stopped_typing', { userName });
      });

      // Sprint events
      socket.on('sprint_start', (data) => {
        const { teamCode, sprintNumber, duration } = data;
        const roomName = teamCode.toUpperCase();
        
        socket.to(roomName).emit('sprint_started', {
          sprintNumber,
          duration,
          timestamp: new Date().toISOString()
        });
        
        console.log(`----->  Sprint: Sprint ${sprintNumber} started in team ${roomName}`);
      });

      socket.on('sprint_complete', (data) => {
        const { teamCode, sprintNumber } = data;
        const roomName = teamCode.toUpperCase();
        
        socket.to(roomName).emit('sprint_completed', {
          sprintNumber,
          timestamp: new Date().toISOString()
        });
      });

      // Git events
      socket.on('commit_push', (data) => {
        const { teamCode, commit } = data;
        const roomName = teamCode.toUpperCase();
        
        socket.to(roomName).emit('new_commit', {
          commit,
          timestamp: new Date().toISOString()
        });
        
        console.log(`----->  Git: Commit pushed in team ${roomName}`);
      });

      socket.on('pr_created', (data) => {
        const { teamCode, pullRequest } = data;
        const roomName = teamCode.toUpperCase();
        
        socket.to(roomName).emit('new_pull_request', {
          pullRequest,
          timestamp: new Date().toISOString()
        });
      });

      // Notifications
      socket.on('send_notification', (data) => {
        const { teamCode, notification } = data;
        const roomName = teamCode.toUpperCase();
        
        socket.to(roomName).emit('notification', {
          ...notification,
          timestamp: new Date().toISOString()
        });
      });

      // Disconnect
      socket.on('disconnect', (reason) => {
        console.log(`----->  Socket.IO: Client disconnected - ${socket.id} (${reason})`);
      });

      // Error handling
      socket.on('error', (error) => {
        console.error('----->  Socket.IO: Error -', error);
      });
    });

    // Attach io instance to app
    app.set("io", io);

    // Make io globally available for controllers
    global.io = io;

    // Routes
    app.use("/api/auth", authRoutes);
    app.use("/api/chat", chatRoutes);
    app.use("/api/code", codeRoutes);
    app.use("/api/ingest", ingestRoutes);
    app.use("/api/gap", gapRoutes);
    app.use("/api/teams", teamRoutes); // 🔥 NEW: Team collaboration routes

    // Health endpoint - Enhanced
    app.get("/api/health", (req, res) => {
      const socketConnections = io.engine.clientsCount;
      const rooms = Array.from(io.sockets.adapter.rooms.keys()).filter(
        room => !io.sockets.adapter.sids.has(room)
      );

      res.status(200).json({
        success: true,
        message: "----->  Synaptron Backend is running smoothly!",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        version: "1.2.0",
        services: {
          mongodb: "Connected",
          socketio: `${socketConnections} clients connected`,
          activeTeams: rooms.length
        }
      });
    });

    // Root welcome endpoint - Enhanced
    app.get("/", (req, res) => {
      res.status(200).json({
        success: true,
        message: "----->  Welcome to Synaptron AI Backend API",
        version: "1.2.0",
        documentation: "/api-docs",
        endpoints: {
          auth: "/api/auth",
          chat: "/api/chat",
          code: "/api/code",
          ingest: "/api/ingest",
          teams: "/api/teams", // 🔥 NEW
          health: "/api/health"
        },
        features: {
          realTimeCollaboration: true,
          teamManagement: true,
          fileLocking: true,
          socketIO: true
        }
      });
    });

    // 404 handler
    app.use("*", (req, res) => {
      res.status(404).json({
        success: false,
        message: `----->  Route ${req.originalUrl} not found`,
        availableRoutes: [
          "/api/auth",
          "/api/chat",
          "/api/code",
          "/api/ingest",
          "/api/teams", // 🔥 NEW
          "/api/health"
        ]
      });
    });

    // Global error handling middleware
    app.use((err, req, res, next) => {
      console.error("----->  Global Error:", err.stack);
      res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal Server Error",
        ...(process.env.NODE_ENV === "development" && { stack: err.stack })
      });
    });

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`
|-*-*-*-  ================================= 
         SYNAPTRON BACKEND STARTED 
|-*-*-*-  ================================= 
|-*-*-*-  Server: http://localhost:${PORT} 
|-*-*-*-  Environment: ${process.env.NODE_ENV} 
|-*-*-*-  Database: ${process.env.MONGODB_URI ? "Connected" : "Not configured"} 
|-*-*-*-  AI: ${process.env.OPENAI_API_KEY ? "Enabled" : "Not configured"} 
|-*-*-*-  Socket.IO: Enabled (Real-time collaboration) 
|-*-*-*-  Team Collaboration: Enabled ✨
|-*-*-*-  Ingestion: /api/ingest/start 
|-*-*-*-  Robots: ${String(process.env.RESPECT_ROBOTS || "true")} 
|-*-*-*-  Models: domain=${process.env.AI_DOMAIN_MODEL}, extraction=${process.env.AI_EXTRACTION_MODEL}, roadmap=${process.env.AI_ROADMAP_MODEL} 
|-*-*-*-  =================================
      `);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      console.log(`\n----->  ${signal} received: closing HTTP server gracefully`);
      server.close(() => {
        console.log('----->  HTTP server closed');
        io.close(() => {
          console.log('----->  Socket.IO closed');
          process.exit(0);
        });
      });

      // Force close after 10 seconds
      setTimeout(() => {
        console.error('----->  Forcing shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('----->  Failed to start server:', error);
    process.exit(1);
  }
})();

module.exports = { app, server, io };
