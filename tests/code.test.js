const request = require("supertest")
const mongoose = require("mongoose")
const app = require("../index")
const User = require("../models/User")
const CodeSubmission = require("../models/CodeSubmission")

// Mock OpenAI
jest.mock("../utils/openaiClient", () => ({
  sendChatCompletion: jest.fn().mockResolvedValue({
    success: true,
    data: {
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: "This is a simple JavaScript function",
              quality_score: 85,
              issues: [
                {
                  type: "style",
                  severity: "low",
                  line: 1,
                  message: "Consider using const instead of let",
                  suggestion: "Use const for variables that don't change",
                  fixable: true,
                },
              ],
              suggestions: [
                {
                  category: "best-practices",
                  priority: "medium",
                  title: "Use modern JavaScript features",
                  description: "Consider using arrow functions and const/let",
                  impact: "Better code readability",
                },
              ],
              metrics: {
                complexity: 2,
                maintainability: 85,
                security_score: 95,
              },
            }),
          },
        },
      ],
      usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
    },
    processingTime: 2000,
    tokensUsed: 150,
  }),
}))

const MONGODB_URI = process.env.MONGODB_TEST_URI || "mongodb://localhost:27017/synaptron_test"
const AUTH_DISABLED = String(process.env.DISABLE_AUTH || "true").toLowerCase() === "true"

describe("Code Analysis Routes", () => {
  let authToken
  let userId

  beforeAll(async () => {
    await mongoose.connect(MONGODB_URI)
  })

  afterAll(async () => {
    await mongoose.connection.close()
  })

  beforeEach(async () => {
    await User.deleteMany({})
    await CodeSubmission.deleteMany({})

    const userData = {
      name: "Test User",
      email: "test@example.com",
      password: "Password123",
      confirmPassword: "Password123",
    }

    const registerResponse = await request(app).post("/api/auth/register").send(userData)
    authToken = registerResponse.body.data?.token
    userId = registerResponse.body.data.user.id
  })

  describe("POST /api/code/analyze", () => {
    const validCodeData = {
      title: "Test Function",
      code: `function add(a, b) {
        return a + b;
      }`,
      language: "javascript",
      description: "A simple addition function",
      tags: ["function", "math"],
    }

    it("should analyze code successfully", async () => {
      const agent = AUTH_DISABLED
        ? request(app).post("/api/code/analyze")
        : request(app).post("/api/code/analyze").set("Authorization", `Bearer ${authToken}`)

      const response = await agent.send(validCodeData).expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.submission.title).toBe(validCodeData.title)
      expect(response.body.data.submission.status).toBe("completed")
      expect(response.body.data.submission.aiResponse).toBeDefined()
      expect(response.body.data.tokensUsed).toBe(150)
    })

    ;(AUTH_DISABLED ? it.skip : it)("should not analyze code without authentication", async () => {
      const response = await request(app).post("/api/code/analyze").send(validCodeData).expect(401)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("Access denied")
    })

    it("should not analyze code without title", async () => {
      const invalidData = { ...validCodeData, title: "" }

      const response = await request(app)
        .post("/api/code/analyze")
        .set("Authorization", `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("Validation failed")
    })

    it("should not analyze code with invalid language", async () => {
      const invalidData = { ...validCodeData, language: "invalid-language" }

      const response = await request(app)
        .post("/api/code/analyze")
        .set("Authorization", `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("Validation failed")
    })
  })

  describe("GET /api/code/history/:userId", () => {
    beforeEach(async () => {
      // Create test code submission
      await CodeSubmission.create({
        userId,
        title: "Test Function",
        code: "function test() { return true; }",
        language: "javascript",
        status: "completed",
        aiResponse: {
          analysis: "Test analysis",
          insights: [],
          metrics: { complexity: { cyclomatic: 1 } },
          suggestions: [],
        },
      })
    })

    it("should get user code history", async () => {
      const response = await request(app)
        .get(`/api/code/history/${userId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.submissions).toBeDefined()
      expect(response.body.data.submissions.length).toBe(1)
      expect(response.body.data.submissions[0].title).toBe("Test Function")
    })

    it("should filter code history by language", async () => {
      const response = await request(app)
        .get(`/api/code/history/${userId}?language=javascript`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.submissions.length).toBe(1)
    })

    it("should not get other user's code history", async () => {
      const otherUserId = new mongoose.Types.ObjectId()

      const response = await request(app)
        .get(`/api/code/history/${otherUserId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(403)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("Access denied")
    })
  })

  describe("GET /api/code/submission/:id", () => {
    let submissionId

    beforeEach(async () => {
      const submission = await CodeSubmission.create({
        userId,
        title: "Test Function",
        code: "function test() { return true; }",
        language: "javascript",
        status: "completed",
        aiResponse: {
          analysis: "Test analysis",
          insights: [],
          metrics: { complexity: { cyclomatic: 1 } },
          suggestions: [],
        },
      })
      submissionId = submission._id
    })

    it("should get specific code submission", async () => {
      const response = await request(app)
        .get(`/api/code/submission/${submissionId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.submission.title).toBe("Test Function")
      expect(response.body.data.submission.code).toBeDefined()
    })

    it("should not get non-existent submission", async () => {
      const fakeId = new mongoose.Types.ObjectId()

      const response = await request(app)
        .get(`/api/code/submission/${fakeId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(404)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("not found")
    })
  })

  describe("PUT /api/code/submission/:id/feedback", () => {
    let submissionId

    beforeEach(async () => {
      const submission = await CodeSubmission.create({
        userId,
        title: "Test Function",
        code: "function test() { return true; }",
        language: "javascript",
        status: "completed",
        aiResponse: {
          analysis: "Test analysis",
          insights: [],
          metrics: { complexity: { cyclomatic: 1 } },
          suggestions: [],
        },
      })
      submissionId = submission._id
    })

    it("should update submission feedback", async () => {
      const feedbackData = {
        wasHelpful: true,
        comment: "Very helpful analysis!",
        rating: 5,
      }

      const response = await request(app)
        .put(`/api/code/submission/${submissionId}/feedback`)
        .set("Authorization", `Bearer ${authToken}`)
        .send(feedbackData)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.submission.feedback.wasHelpful).toBe(true)
      expect(response.body.data.submission.feedback.comment).toBe("Very helpful analysis!")
      expect(response.body.data.submission.reactions.rating).toBe(5)
    })

    it("should not update feedback with invalid rating", async () => {
      const invalidFeedback = {
        rating: 10, // Invalid rating (should be 1-5)
      }

      const response = await request(app)
        .put(`/api/code/submission/${submissionId}/feedback`)
        .set("Authorization", `Bearer ${authToken}`)
        .send(invalidFeedback)
        .expect(400)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("Validation failed")
    })
  })

  describe("DELETE /api/code/submission/:id", () => {
    let submissionId

    beforeEach(async () => {
      const submission = await CodeSubmission.create({
        userId,
        title: "Test Function",
        code: "function test() { return true; }",
        language: "javascript",
        status: "completed",
        aiResponse: {
          analysis: "Test analysis",
          insights: [],
          metrics: { complexity: { cyclomatic: 1 } },
          suggestions: [],
        },
      })
      submissionId = submission._id
    })

    it("should delete code submission", async () => {
      const response = await request(app)
        .delete(`/api/code/submission/${submissionId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.message).toContain("deleted successfully")

      // Verify submission is soft deleted
      const submission = await CodeSubmission.findById(submissionId)
      expect(submission.isDeleted).toBe(true)
    })
  })

  describe("GET /api/code/stats/languages", () => {
    beforeEach(async () => {
      // Create test submissions with different languages
      await CodeSubmission.create([
        {
          userId,
          title: "JS Function",
          code: "function test() {}",
          language: "javascript",
          status: "completed",
          aiResponse: {
            analysis: "Test",
            insights: [],
            metrics: { quality: { score: 85 } },
            suggestions: [],
          },
        },
        {
          userId,
          title: "Python Function",
          code: "def test(): pass",
          language: "python",
          status: "completed",
          aiResponse: {
            analysis: "Test",
            insights: [],
            metrics: { quality: { score: 90 } },
            suggestions: [],
          },
        },
      ])
    })

    it("should get language statistics", async () => {
      const response = await request(app)
        .get("/api/code/stats/languages")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.stats).toBeDefined()
      expect(response.body.data.stats.length).toBe(2)
    })
  })
})
