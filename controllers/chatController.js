const { validationResult } = require("express-validator")
const OpenAI = require("openai")
const ChatMessage = require("../models/ChatMessage")
const User = require("../models/User")
const mongoose = require("mongoose") // Import mongoose
const { sendChatCompletion, generateChatPrompt, truncateMessages } = require("../utils/openaiClient")
const { logChat } = require("../utils/logger")
const { formatChatMessage, formatSuccessResponse } = require("../utils/formatters")

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://openrouter.ai/api/v1", // Add this line
})


// @desc    Send message to AI and get response
// @route   POST /api/chat/send
// @access  Private
const sendMessage = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "❌ Validation failed",
        errors: errors.array(),
      })
    }

    const {
      message, sessionId, domain, mode = "chat", attachments = [],
      conceptMap = [], gapStates = {}
    } = req.body
    let { currentGoal = "" } = req.body
    if (!currentGoal) currentGoal = `Master the domain of ${domain}`
    const userId = req.user._id

    // Generate session ID if not provided
    const chatSessionId = sessionId || `session_${userId}_${Date.now()}`

    // Save user message
    const userMessage = new ChatMessage({
      userId,
      sessionId: chatSessionId,
      role: "user",
      message,
      metadata: {
        domain,
        mode,
        attachments,
      },
    })

    await userMessage.save()

    // Get recent chat history for context
    const recentMessages = await ChatMessage.find({
      userId,
      sessionId: chatSessionId,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("role message")

    // Build context-aware prompt — inject domain/goal/conceptMap/gapStates for smart modes
    const messages = generateChatPrompt(
      recentMessages.reverse().map((msg) => ({
        role: msg.role === "ai" ? "assistant" : msg.role,
        content: msg.message,
      })),
      domain,
      mode,
      { goal: currentGoal, conceptMap, gapStates }
    )

    const agentModes = new Set([
      "smart-learning-agent", "smart-learning",
      "CLAIM_VERIFICATION", "PREREQUISITE_CHECK", "MODULE_CHECK", "quick-check"
    ])
    const isAgentMode = agentModes.has(mode)

    const truncatedMessages = truncateMessages(messages, isAgentMode ? 4000 : 3000)

    const aiResult = await sendChatCompletion(truncatedMessages, {
      model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct:free",
      maxTokens: isAgentMode ? 700 : 1000,
      temperature: isAgentMode ? 0.4 : 0.7,
    })


    const rawContent = aiResult.data.choices[0].message.content
    const processingTime = aiResult.processingTime

    // ── Parse agent JSON response ─────────────────────────────────────────
    let agentAnalysis = null
    let learnerMessage = rawContent

    if (isAgentMode) {
      try {
        // Strip possible markdown fences the model might add despite instructions
        const cleaned = rawContent.replace(/^```[a-z]*\n?/im, "").replace(/```$/m, "").trim()
        agentAnalysis = JSON.parse(cleaned)
        // Only show the message field to the learner
        learnerMessage = agentAnalysis.message || rawContent
      } catch {
        // Model returned plain text despite instructions — use as-is
        learnerMessage = rawContent
      }
    }

    // Log chat activity
    logChat("send", userId, chatSessionId, {
      domain,
      mode,
      tokensUsed: aiResult.tokensUsed,
      processingTime,
    })

    // Save AI response (store learner-facing message)
    const aiMessage = new ChatMessage({
      userId,
      sessionId: chatSessionId,
      role: "ai",
      message: learnerMessage,
      metadata: {
        domain,
        mode,
        aiModel: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct:free",
        tokens: {
          prompt: aiResult.data.usage?.prompt_tokens ?? 0,
          completion: aiResult.data.usage?.completion_tokens ?? 0,
          total: aiResult.data.usage?.total_tokens ?? 0,
        },
        responseTime: processingTime,
        // Agent analysis fields (null for non-agent modes)
        agentAnalysis: agentAnalysis || null,
      },
    })

    await aiMessage.save()

    // Update user stats
    await User.findByIdAndUpdate(userId, {
      $inc: { "stats.totalChats": 1 },
    })

    // Call GapEngine in the background to log evidence and interpret
    const GapEngine = require("../services/GapEngine")
    const activeConceptIds = req.body.activeConceptIds || []
    const ActionMapper = require("../services/ActionMapper")

    const domainStructure = req.body.domainStructure || { concepts: [] }
    GapEngine.logEvidence(userId, domain, currentGoal, { text: message, conceptIds: activeConceptIds }).then(async () => {
      const interpretations = []
      for (const conceptId of activeConceptIds) {
        try {
          const interpretation = await GapEngine.interpretEvidence(userId, domain, conceptId)
          if (interpretation) interpretations.push(interpretation)
          if (interpretation && interpretation.state !== "unconfirmed") {
            const formatted = ActionMapper.formatUserFacingMessage(interpretation.state, interpretation.reason)
            const io = req.app.get("io")
            if (io && formatted?.sentence) {
              io.to(`user-${userId}`).emit("new-ai-message", {
                message: {
                  role: "assistant",
                  message: formatted.sentence,
                  isInterpretation: true,
                },
                sessionId: chatSessionId,
              })
            }
          }
        } catch (err) {
          console.error(`Background Interpretation failed for ${conceptId}:`, err)
        }
      }
      const user = await User.findById(userId)
      const dtKey = domain.toLowerCase().replace(/\s+/g, "_")
      const digitalTwinData = user?.digitalTwin?.get(dtKey)
      if (digitalTwinData) {
        const profile = GapEngine.digitalTwinToProfile(domain, currentGoal, digitalTwinData, domainStructure)
        const io = req.app.get("io")
        if (io) {
          io.to(`user-${userId}`).emit("profile-updated", {
            profile,
            interpretations,
            quickCheckTrigger: GapEngine.evaluateTriggerRule(digitalTwinData, digitalTwinData.conceptMapIds),
          })
        }
      }
    }).catch(err => {
      console.error("Background Gap Logging failed:", err)
    })

    // Emit real-time message via Socket.IO
    const io = req.app.get("io")
    if (io) {
      io.to(`user-${userId}`).emit("new-ai-message", {
        message: aiMessage,
        sessionId: chatSessionId,
      })
    }

    res.status(200).json({
      success: true,
      message: "✅ Message sent successfully",
      data: {
        userMessage,
        // Return the learner-facing message plus the full agent analysis
        aiMessage: {
          ...aiMessage.toObject(),
          message: learnerMessage,
        },
        agentAnalysis,      // null for non-agent modes; full JSON for agent modes
        sessionId: chatSessionId,
        processingTime,
        tokensUsed: aiResult.data.usage?.total_tokens ?? 0,
      },
    })

  } catch (error) {
    console.error("🚨 Send Message Error:", error)

    // Handle OpenAI specific errors
    if (error.code === "insufficient_quota") {
      return res.status(429).json({
        success: false,
        message: "🤖 AI service quota exceeded. Please try again later.",
      })
    }

    res.status(500).json({
      success: false,
      message: "🔥 Failed to send message",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Verify a learner's claim of prior knowledge
// @route   POST /api/chat/verify-claim
// @access  Private
const verifyClaim = async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "❌ Validation failed",
        errors: errors.array(),
      })
    }

    const { conceptId, conceptName, domain, messages: conversationHistory, isModuleCheck } = req.body
    const userId = req.user._id

    // Check how many times the user has spoken
    const userMessageCount = conversationHistory.filter(m => m.role === 'user').length;

    const baseContext = isModuleCheck 
      ? `The learner has finished reviewing materials for this concept and is taking a practical module check.`
      : `The learner was asked to briefly explain this concept to verify their claim of prior knowledge.`;

    const systemPrompt = `You are an expert technical evaluator verifying a learner's understanding of a concept.
Domain: ${domain}
Concept: ${conceptName} (${conceptId})

${baseContext}
You must review the conversation history and decide dynamically:
1. If their understanding is clearly sufficient, partial, or a misconception, evaluate it.
2. If their understanding is ambiguous AND you have asked less than 3 questions (including the initial one), ask EXACTLY ONE open-ended follow-up question (e.g., "why does that happen?" or "what if X changed?"). Do NOT evaluate yet.
3. If this is their 3rd attempt, you MUST evaluate. Do NOT ask another question.

When evaluating, choose a state:
- sufficient (they clearly understand it)
- partial (they know some but missed key parts or details)
- misconception (they are wrong or fundamentally misunderstand it)
- unconfirmed (their answer is too vague or irrelevant to tell)

If sufficient, reason = "sufficient evidence".
If partial, reason = "forgot terminology" or "can't apply it".
If misconception, reason = "misconception".
If unconfirmed, reason = "none".

Return ONLY valid JSON matching this schema:
If asking a question:
{"question": "Your follow-up question string here"}
If evaluating:
{"evaluation": {"state":"...","reason":"...","confidence":0.0-1.0}}
`

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.map(m => ({ role: m.role, content: m.text }))
    ]

    const aiResult = await sendChatCompletion(messages, {
      model: "gpt-3.5-turbo",
      maxTokens: 250,
      temperature: 0.3,
      responseFormat: { type: "json_object" }
    })

    const aiResponse = aiResult.data.choices[0].message.content
    
    let interpretation;
    try {
      interpretation = JSON.parse(aiResponse);
    } catch (e) {
      interpretation = { evaluation: { state: "unconfirmed", reason: "none", confidence: 0 } };
    }

    // Ensure valid state if evaluating
    if (interpretation.evaluation) {
      const validStates = ["sufficient", "partial", "misconception", "unconfirmed"];
      if (!validStates.includes(interpretation.evaluation.state)) {
        interpretation.evaluation.state = "unconfirmed";
      }
    }

    res.status(200).json({
      success: true,
      data: interpretation
    })

  } catch (error) {
    console.error("🚨 Verify Claim Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to verify claim",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Get chat history for user
// @route   GET /api/chat/history/:userId
// @access  Private
const getChatHistory = async (req, res) => {
  try {
    const { userId } = req.params
    const { sessionId, limit = 50, page = 1, domain, role, startDate, endDate } = req.query

    // Check if user can access this chat history
    if (userId !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "🔒 Access denied. You can only view your own chat history.",
      })
    }

    const options = {
      sessionId,
      limit: Number.parseInt(limit),
      page: Number.parseInt(page),
      domain,
      role,
      startDate,
      endDate,
    }

    const chatHistory = await ChatMessage.getChatHistory(userId, options)

    res.status(200).json({
      success: true,
      message: "✅ Chat history retrieved successfully",
      data: chatHistory,
    })
  } catch (error) {
    console.error("🚨 Get Chat History Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to retrieve chat history",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Get user's chat sessions
// @route   GET /api/chat/sessions
// @access  Private
const getChatSessions = async (req, res) => {
  try {
    const userId = req.user._id
    const { limit = 20, page = 1 } = req.query

    const skip = (page - 1) * limit

    // Get unique sessions with latest message info
    const sessions = await ChatMessage.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: "$sessionId",
          lastMessage: { $last: "$message" },
          lastMessageTime: { $last: "$createdAt" },
          messageCount: { $sum: 1 },
          domain: { $last: "$metadata.domain" },
          mode: { $last: "$metadata.mode" },
        },
      },
      { $sort: { lastMessageTime: -1 } },
      { $skip: skip },
      { $limit: Number.parseInt(limit) },
    ])

    const total = await ChatMessage.distinct("sessionId", {
      userId,
      isDeleted: false,
    })

    res.status(200).json({
      success: true,
      message: "✅ Chat sessions retrieved successfully",
      data: {
        sessions,
        pagination: {
          current: Number.parseInt(page),
          total: Math.ceil(total.length / limit),
          hasNext: page < Math.ceil(total.length / limit),
          hasPrev: page > 1,
        },
        total: total.length,
      },
    })
  } catch (error) {
    console.error("🚨 Get Chat Sessions Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to retrieve chat sessions",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Delete chat session
// @route   DELETE /api/chat/session/:sessionId
// @access  Private
const deleteChatSession = async (req, res) => {
  try {
    const { sessionId } = req.params
    const userId = req.user._id

    // Soft delete all messages in the session
    const result = await ChatMessage.updateMany(
      { userId, sessionId, isDeleted: false },
      {
        isDeleted: true,
        deletedAt: new Date(),
      },
    )

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "🔍 Chat session not found",
      })
    }

    res.status(200).json({
      success: true,
      message: "✅ Chat session deleted successfully",
      data: {
        deletedMessages: result.modifiedCount,
      },
    })
  } catch (error) {
    console.error("🚨 Delete Chat Session Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to delete chat session",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Update message reaction
// @route   PUT /api/chat/message/:messageId/reaction
// @access  Private
const updateMessageReaction = async (req, res) => {
  try {
    const { messageId } = req.params
    const { liked, helpful, rating } = req.body
    const userId = req.user._id

    const message = await ChatMessage.findOne({
      _id: messageId,
      userId,
      isDeleted: false,
    })

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "🔍 Message not found",
      })
    }

    // Update reactions
    const updateData = {}
    if (typeof liked === "boolean") updateData["reactions.liked"] = liked
    if (typeof helpful === "boolean") updateData["reactions.helpful"] = helpful
    if (rating && rating >= 1 && rating <= 5) updateData["reactions.rating"] = rating

    const updatedMessage = await ChatMessage.findByIdAndUpdate(messageId, updateData, { new: true })

    res.status(200).json({
      success: true,
      message: "✅ Message reaction updated successfully",
      data: {
        message: updatedMessage,
      },
    })
  } catch (error) {
    console.error("🚨 Update Message Reaction Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to update message reaction",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

// @desc    Get session statistics
// @route   GET /api/chat/session/:sessionId/stats
// @access  Private
const getSessionStats = async (req, res) => {
  try {
    const { sessionId } = req.params
    const userId = req.user._id

    const stats = await ChatMessage.getSessionStats(userId, sessionId)

    res.status(200).json({
      success: true,
      message: "✅ Session statistics retrieved successfully",
      data: { stats },
    })
  } catch (error) {
    console.error("🚨 Get Session Stats Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to retrieve session statistics",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

const evaluateFinalTest = async (req, res) => {
  try {
    const { submission, domain } = req.body

    const systemPrompt = `You are a senior principal engineer evaluating a candidate's final practical synthesis on the domain of ${domain}.
The candidate was asked to describe the architecture, core components, and write pseudocode for a complete system in this domain.
Review their submission:
"${submission}"

Determine if they demonstrated a solid, practical synthesis of the domain concepts.
Return ONLY valid JSON matching this schema:
{"pass": true/false, "feedback": "Detailed feedback on what was good and what was missing."}`

    const messages = [{ role: "system", content: systemPrompt }]

    const aiResult = await sendChatCompletion(messages, {
      model: "gpt-3.5-turbo",
      maxTokens: 300,
      temperature: 0.3,
      responseFormat: { type: "json_object" }
    })

    const aiResponse = aiResult.data.choices[0].message.content
    let evaluation;
    try {
      evaluation = JSON.parse(aiResponse);
    } catch (e) {
      evaluation = { pass: false, feedback: "Unable to evaluate." };
    }

    res.status(200).json({
      success: true,
      data: evaluation
    })
  } catch (error) {
    console.error("🚨 Evaluate Final Test Error:", error)
    res.status(500).json({
      success: false,
      message: "🔥 Failed to evaluate final test",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    })
  }
}

module.exports = {
  sendMessage,
  getChatHistory,
  getChatSessions,
  deleteChatSession,
  updateMessageReaction,
  getSessionStats,
  verifyClaim,
  evaluateFinalTest,
}
