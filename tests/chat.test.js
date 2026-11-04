const request = require("supertest")
const mongoose = require("mongoose")
const app = require("../index")
const User = require("../models/User")
const ChatMessage = require("../models/ChatMessage")

// Mock OpenAI
jest.mock("../utils/openaiClient", () => ({
  sendChatCompletion: jest.fn().mockResolvedValue({
    success: true,
    data: {
      choices: [{ message: { content: "This is a test AI response" } }],
      usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
    },
    processingTime: 1000,
    tokensUsed: 25,
  }),
}))

const MONGODB_URI = process.env.MONGODB_TEST_URI || "mongodb://localhost:27017/synaptron_test"
const AUTH_DISABLED = String(process.env.DISABLE_AUTH || "true").toLowerCase() === "true"

describe("Chat Routes", () => {
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
    await ChatMessage.deleteMany({})

    // Create and login user (still fine when auth is disabled)
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

  describe("POST /api/chat/send", () => {
    it("should send message and get AI response", async () => {
      const messageData = {
        message: "Hello, how are you?",
        domain: "general",
        mode: "chat",
      }

      const agent = AUTH_DISABLED
        ? request(app).post("/api/chat/send")
        : request(app).post("/api/chat/send").set("Authorization", `Bearer ${authToken}`)

      const response = await agent.send(messageData).expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.userMessage.message).toBe(messageData.message)
      expect(response.body.data.aiMessage.message).toBe("This is a test AI response")
      expect(response.body.data.sessionId).toBeDefined()
    })

    ;(AUTH_DISABLED ? it.skip : it)("should not send empty message", async () => {
      const messageData = {
        message: "",
        domain: "general",
      }

      const response = await request(app)
        .post("/api/chat/send")
        .set("Authorization", `Bearer ${authToken}`)
        .send(messageData)
        .expect(400)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("Validation failed")
    })

    ;(AUTH_DISABLED ? it.skip : it)("should not send message without authentication", async () => {
      const messageData = { message: "Hello, how are you?" }
      const response = await request(app).post("/api/chat/send").send(messageData).expect(401)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("Access denied")
    })
  })

  describe("GET /api/chat/sessions", () => {
    beforeEach(async () => {
      const sessionId = `session_${userId}_${Date.now()}`
      await ChatMessage.create([
        {
          userId,
          sessionId,
          role: "user",
          message: "Hello",
          metadata: { domain: "general", mode: "chat" },
        },
        {
          userId,
          sessionId,
          role: "ai",
          message: "Hi there!",
          metadata: { domain: "general", mode: "chat" },
        },
      ])
    })

    it("should get user chat sessions", async () => {
      const agent = AUTH_DISABLED
        ? request(app).get("/api/chat/sessions")
        : request(app).get("/api/chat/sessions").set("Authorization", `Bearer ${authToken}`)

      const response = await agent.expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.sessions).toBeDefined()
      expect(response.body.data.sessions.length).toBeGreaterThan(0)
    })

    ;(AUTH_DISABLED ? it.skip : it)("should not get sessions without authentication", async () => {
      const response = await request(app).get("/api/chat/sessions").expect(401)
      expect(response.body.success).toBe(false)
    })
  })

  describe("GET /api/chat/history/:userId", () => {
    let sessionId

    beforeEach(async () => {
      sessionId = `session_${userId}_${Date.now()}`
      await ChatMessage.create([
        {
          userId,
          sessionId,
          role: "user",
          message: "Hello",
          metadata: { domain: "general", mode: "chat" },
        },
        {
          userId,
          sessionId,
          role: "ai",
          message: "Hi there!",
          metadata: { domain: "general", mode: "chat" },
        },
      ])
    })

    it("should get user chat history", async () => {
      const agent = AUTH_DISABLED
        ? request(app).get(`/api/chat/history/${userId}`)
        : request(app).get(`/api/chat/history/${userId}`).set("Authorization", `Bearer ${authToken}`)

      const response = await agent.expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.messages).toBeDefined()
      expect(response.body.data.messages.length).toBe(2)
    })

    it("should get filtered chat history by session", async () => {
      const agent = AUTH_DISABLED
        ? request(app).get(`/api/chat/history/${userId}?sessionId=${sessionId}`)
        : request(app).get(`/api/chat/history/${userId}?sessionId=${sessionId}`).set("Authorization", `Bearer ${authToken}`)

      const response = await agent.expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.messages.length).toBe(2)
    })

    it("should not get other user's chat history", async () => {
      const otherUserId = new mongoose.Types.ObjectId()

      const agent = AUTH_DISABLED
        ? request(app).get(`/api/chat/history/${otherUserId}`)
        : request(app).get(`/api/chat/history/${otherUserId}`).set("Authorization", `Bearer ${authToken}`)

      const response = await agent.expect(403)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("Access denied")
    })
  })

  describe("DELETE /api/chat/session/:sessionId", () => {
    let sessionId

    beforeEach(async () => {
      sessionId = `session_${userId}_${Date.now()}`
      await ChatMessage.create([
        {
          userId,
          sessionId,
          role: "user",
          message: "Hello",
          metadata: { domain: "general", mode: "chat" },
        },
        {
          userId,
          sessionId,
          role: "ai",
          message: "Hi there!",
          metadata: { domain: "general", mode: "chat" },
        },
      ])
    })

    it("should delete chat session", async () => {
      const agent = AUTH_DISABLED
        ? request(app).delete(`/api/chat/session/${sessionId}`)
        : request(app).delete(`/api/chat/session/${sessionId}`).set("Authorization", `Bearer ${authToken}`)

      const response = await agent.expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.deletedMessages).toBe(2)

      // Verify messages are soft deleted
      const messages = await ChatMessage.find({ userId, sessionId })
      expect(messages.every((msg) => msg.isDeleted)).toBe(true)
    })

    it("should not delete non-existent session", async () => {
      const fakeSessionId = "fake_session_id"

      const agent = AUTH_DISABLED
        ? request(app).delete(`/api/chat/session/${fakeSessionId}`)
        : request(app).delete(`/api/chat/session/${fakeSessionId}`).set("Authorization", `Bearer ${authToken}`)

      const response = await agent.expect(404)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("not found")
    })
  })
})
