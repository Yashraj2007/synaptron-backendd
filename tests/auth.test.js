const request = require("supertest")
const mongoose = require("mongoose")
const app = require("../index")
const User = require("../models/User")

// Test database
const MONGODB_URI = process.env.MONGODB_TEST_URI || "mongodb://localhost:27017/synaptron_test"

describe("Authentication Routes", () => {
  beforeAll(async () => {
    await mongoose.connect(MONGODB_URI)
  })

  afterAll(async () => {
    await mongoose.connection.close()
  })

  beforeEach(async () => {
    await User.deleteMany({})
  })

  describe("POST /api/auth/register", () => {
    const validUser = {
      name: "Test User",
      email: "test@example.com",
      password: "Password123",
      confirmPassword: "Password123",
    }

    it("should register a new user successfully", async () => {
      const response = await request(app).post("/api/auth/register").send(validUser).expect(201)

      expect(response.body.success).toBe(true)
      expect(response.body.message).toContain("registered successfully")
      expect(response.body.data.user.email).toBe(validUser.email)
      expect(response.body.data.user.name).toBe(validUser.name)
      expect(response.body.data.token).toBeDefined()
      expect(response.body.data.user.password).toBeUndefined()
    })

    it("should not register user with invalid email", async () => {
      const invalidUser = { ...validUser, email: "invalid-email" }

      const response = await request(app).post("/api/auth/register").send(invalidUser).expect(400)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("Validation failed")
    })

    it("should not register user with weak password", async () => {
      const weakPasswordUser = { ...validUser, password: "weak", confirmPassword: "weak" }

      const response = await request(app).post("/api/auth/register").send(weakPasswordUser).expect(400)

      expect(response.body.success).toBe(false)
      expect(response.body.errors).toBeDefined()
    })

    it("should not register user with mismatched passwords", async () => {
      const mismatchedUser = { ...validUser, confirmPassword: "DifferentPassword123" }

      const response = await request(app).post("/api/auth/register").send(mismatchedUser).expect(400)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("Validation failed")
    })

    it("should not register user with existing email", async () => {
      // First registration
      await request(app).post("/api/auth/register").send(validUser).expect(201)

      // Second registration with same email
      const response = await request(app).post("/api/auth/register").send(validUser).expect(400)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("already exists")
    })
  })

  describe("POST /api/auth/login", () => {
    const userData = {
      name: "Test User",
      email: "test@example.com",
      password: "Password123",
      confirmPassword: "Password123",
    }

    beforeEach(async () => {
      await request(app).post("/api/auth/register").send(userData)
    })

    it("should login user successfully", async () => {
      const loginData = {
        email: userData.email,
        password: userData.password,
      }

      const response = await request(app).post("/api/auth/login").send(loginData).expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.message).toContain("Login successful")
      expect(response.body.data.user.email).toBe(userData.email)
      expect(response.body.data.token).toBeDefined()
      expect(response.body.data.user.password).toBeUndefined()
    })

    it("should not login with invalid email", async () => {
      const loginData = {
        email: "nonexistent@example.com",
        password: userData.password,
      }

      const response = await request(app).post("/api/auth/login").send(loginData).expect(401)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("Invalid email or password")
    })

    it("should not login with invalid password", async () => {
      const loginData = {
        email: userData.email,
        password: "WrongPassword123",
      }

      const response = await request(app).post("/api/auth/login").send(loginData).expect(401)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("Invalid email or password")
    })

    it("should not login with missing credentials", async () => {
      const response = await request(app).post("/api/auth/login").send({}).expect(400)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("Validation failed")
    })
  })

  describe("GET /api/auth/profile", () => {
    let authToken
    let userId

    beforeEach(async () => {
      const userData = {
        name: "Test User",
        email: "test@example.com",
        password: "Password123",
        confirmPassword: "Password123",
      }

      const registerResponse = await request(app).post("/api/auth/register").send(userData)
      authToken = registerResponse.body.data.token
      userId = registerResponse.body.data.user.id
    })

    it("should get user profile successfully", async () => {
      const response = await request(app)
        .get("/api/auth/profile")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.user.id).toBe(userId)
      expect(response.body.data.user.email).toBe("test@example.com")
      expect(response.body.data.user.password).toBeUndefined()
    })

    it("should not get profile without token", async () => {
      const response = await request(app).get("/api/auth/profile").expect(401)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("Access denied")
    })

    it("should not get profile with invalid token", async () => {
      const response = await request(app)
        .get("/api/auth/profile")
        .set("Authorization", "Bearer invalid-token")
        .expect(401)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("Access denied")
    })
  })

  describe("PUT /api/auth/profile", () => {
    let authToken

    beforeEach(async () => {
      const userData = {
        name: "Test User",
        email: "test@example.com",
        password: "Password123",
        confirmPassword: "Password123",
      }

      const registerResponse = await request(app).post("/api/auth/register").send(userData)
      authToken = registerResponse.body.data.token
    })

    it("should update user profile successfully", async () => {
      const updateData = {
        name: "Updated Name",
        preferences: {
          theme: "dark",
          notifications: {
            email: false,
            push: true,
          },
        },
      }

      const response = await request(app)
        .put("/api/auth/profile")
        .set("Authorization", `Bearer ${authToken}`)
        .send(updateData)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.user.name).toBe("Updated Name")
      expect(response.body.data.user.preferences.theme).toBe("dark")
    })

    it("should not update profile with invalid data", async () => {
      const invalidData = {
        name: "A", // Too short
        email: "invalid-email",
      }

      const response = await request(app)
        .put("/api/auth/profile")
        .set("Authorization", `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("Validation failed")
    })
  })

  describe("PUT /api/auth/change-password", () => {
    let authToken

    beforeEach(async () => {
      const userData = {
        name: "Test User",
        email: "test@example.com",
        password: "Password123",
        confirmPassword: "Password123",
      }

      const registerResponse = await request(app).post("/api/auth/register").send(userData)
      authToken = registerResponse.body.data.token
    })

    it("should change password successfully", async () => {
      const passwordData = {
        currentPassword: "Password123",
        newPassword: "NewPassword123",
        confirmNewPassword: "NewPassword123",
      }

      const response = await request(app)
        .put("/api/auth/change-password")
        .set("Authorization", `Bearer ${authToken}`)
        .send(passwordData)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.message).toContain("Password changed successfully")
    })

    it("should not change password with wrong current password", async () => {
      const passwordData = {
        currentPassword: "WrongPassword123",
        newPassword: "NewPassword123",
        confirmNewPassword: "NewPassword123",
      }

      const response = await request(app)
        .put("/api/auth/change-password")
        .set("Authorization", `Bearer ${authToken}`)
        .send(passwordData)
        .expect(400)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain("Current password is incorrect")
    })
  })
})
