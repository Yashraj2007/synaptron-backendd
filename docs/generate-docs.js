const swaggerJsdoc = require("swagger-jsdoc")
const fs = require("fs")
const path = require("path")

const options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Synaptron AI Backend API",
      version: "1.0.0",
      description: `
        Backend API for Synaptron AI Agent Application
        
        This API provides endpoints for:
        - User authentication and management
        - AI-powered chat functionality
        - Code analysis and insights
        - Real-time communication via Socket.IO
      `,
      contact: {
        name: "Synaptron Team",
        email: "support@synaptron.ai",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: "http://localhost:5000/api",
        description: "Development server",
      },
      {
        url: "https://api.synaptron.ai/api",
        description: "Production server",
      },
    ],
  },
  apis: [
    path.join(__dirname, "../routes/*.js"),
    path.join(__dirname, "../controllers/*.js"),
    path.join(__dirname, "../models/*.js"),
  ],
}

const specs = swaggerJsdoc(options)

// Write to file
const outputPath = path.join(__dirname, "swagger.json")
fs.writeFileSync(outputPath, JSON.stringify(specs, null, 2))

console.log(`📚 API documentation generated at: ${outputPath}`)
console.log(`🌐 View at: http://localhost:5000/api-docs`)

module.exports = specs
