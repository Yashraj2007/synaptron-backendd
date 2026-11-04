// server/utils/openaiClient.js
const winston = require("winston");

// Logger for OpenAI operations
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.File({ filename: "logs/openai-error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/openai.log" }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  );
}

// ✅ Dynamic OpenAI client initialization for v4.104.0
let openaiClient = null;

const getOpenAIClient = async () => {
  if (!openaiClient) {
    try {
      // ✅ Dynamic import for ES module compatibility
      const { default: OpenAI } = await import('openai');
      
      openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": process.env.APP_URL || "http://localhost:5000",
          "X-Title": "Synaptron Backend",
        }
      });
      
      logger.info("OpenAI client initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize OpenAI client:", error.message);
      throw error;
    }
  }
  return openaiClient;
};

/**
 * Enhanced JSON parser (same as your existing)
 */
const cleanAndParseJSON = (responseText) => {
  try {
    let cleanedText = responseText.trim();
   cleanedText = cleanedText.replace(/```json\s*/gi, ''); // Remove ```
cleanedText = cleanedText.replace(/```\s*/gi, '');     // Remove ```
cleanedText = cleanedText.replace(/^Here are.*?:\s*/i, ''); // Remove intro text

    
    const jsonStart = cleanedText.indexOf('{');
    const jsonEnd = cleanedText.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
    }
    
    let parsed = JSON.parse(cleanedText);
    
    function fixStringifiedArrays(obj) {
      if (typeof obj !== 'object' || obj === null) return obj;
      
      if (Array.isArray(obj)) {
        return obj.map(fixStringifiedArrays);
      }
      
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && (value.startsWith('[') && value.endsWith(']'))) {
          try {
            let fixedValue = value.replace(/'/g, '"');
            fixedValue = fixedValue.replace(/([\{,]\s*)([a-zA-Z0-9_]+)(\s*):/g, '$1"$2"$3:');
            const parsedArray = JSON.parse(fixedValue);
            result[key] = fixStringifiedArrays(parsedArray);
          } catch (parseError) {
            logger.warn(`Failed to parse stringified array for key ${key}:`, parseError.message);
            result[key] = [];
          }
        } else if (typeof value === 'object') {
          result[key] = fixStringifiedArrays(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    }
    
    return fixStringifiedArrays(parsed);
    
  } catch (error) {
    logger.error("JSON parsing failed", { 
      error: error.message,
      responseText: responseText.substring(0, 200) + '...'
    });
    throw new Error(`Failed to parse AI response as JSON: ${error.message}`);
  }
};

/**
 * ✅ Send chat completion using OpenAI v4.104.0
 */
const sendChatCompletion = async (messages, options = {}) => {
  const startTime = Date.now();

  try {
    const {
      model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-405b-instruct:free",
      maxTokens = 1000,
      temperature = 0.7,
      presencePenalty = 0.1,
      frequencyPenalty = 0.1,
      stream = false,
      requireJSON = false,
      ...otherOptions
    } = options;

    logger.info("Sending chat completion request", {
      model,
      messageCount: messages.length,
      maxTokens,
      temperature,
      requireJSON
    });

    // Add JSON instruction if required
    if (requireJSON) {
      if (messages[0]?.role === 'system') {
        messages[0].content += '\n\nIMPORTANT: You must respond with valid JSON only. No markdown, no explanations outside the JSON object.';
      } else {
        messages.unshift({
          role: 'system',
          content: 'You must respond with valid JSON only. No markdown, no explanations outside the JSON object.'
        });
      }
    }

    // ✅ Get OpenAI client dynamically
    const openai = await getOpenAIClient();

    const completionOptions = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      presence_penalty: presencePenalty,
      frequency_penalty: frequencyPenalty,
      stream,
      ...otherOptions,
    };

    // Force JSON response format if required and supported
    if (requireJSON && (model.includes('gpt-4') || model.includes('gpt-3.5-turbo'))) {
      completionOptions.response_format = { type: "json_object" };
    }

    // ✅ v4.104.0 API call
    const completion = await openai.chat.completions.create(completionOptions);

    const processingTime = Date.now() - startTime;
    const responseContent = completion.choices[0]?.message?.content;

    logger.info("Chat completion successful", {
      model,
      processingTime,
      tokensUsed: completion.usage?.total_tokens || 0,
      finishReason: completion.choices[0]?.finish_reason,
    });

    // Parse JSON if required
    let parsedContent = responseContent;
    if (requireJSON && responseContent) {
      try {
        parsedContent = cleanAndParseJSON(responseContent);
      } catch (parseError) {
        logger.warn("JSON parsing failed, attempting fallback", { error: parseError.message });
        parsedContent = responseContent;
      }
    }

    return {
      success: true,
      data: completion,
      content: parsedContent,
      rawContent: responseContent,
      processingTime,
      tokensUsed: completion.usage?.total_tokens || 0,
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error("Chat completion failed", {
      error: error.message,
      code: error.code,
      type: error.type,
      processingTime,
      model: options.model || "default",
    });

    // Handle specific OpenAI/OpenRouter errors
    if (error.code === "insufficient_quota") {
      throw new Error("API quota exceeded. Please check your billing.");
    } else if (error.code === "invalid_api_key") {
      throw new Error("Invalid API key.");
    } else if (error.code === "model_not_found") {
      throw new Error(`Model ${options.model || "default"} not found.`);
    } else if (error.code === "context_length_exceeded") {
      throw new Error("Message too long for the model's context window.");
    }

    throw error;
  }
};

/**
 * ✅ Send chat completion with retry logic
 */
const sendChatCompletionWithRetry = async (messages, options = {}, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await sendChatCompletion(messages, options);
    } catch (error) {
      if ((error.message.includes('429') || 
           error.message.includes('Rate limit') || 
           error.message.includes('quota')) && 
          attempt < maxRetries) {
        
        const delay = Math.min(1000 * Math.pow(2, attempt), 15000);
        logger.warn(`Rate limited, retrying in ${delay}ms... (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
};

// All your other functions remain the same...
const generateCodeAnalysisPrompt = (code, language, framework = "", description = "") => {
  const systemPrompt = `You are an expert code reviewer and software architect with deep knowledge in ${language}${
    framework ? ` and ${framework}` : ""
  }.

IMPORTANT: You MUST respond with valid JSON only. Do not include any markdown formatting, explanations, or text outside the JSON object.

Analyze the provided code and return a comprehensive analysis in the following JSON format:

{
  "summary": "Brief overview of the code",
  "quality_score": 85,
  "issues": [
    {
      "type": "bug|security|performance|style|complexity",
      "severity": "low|medium|high|critical",
      "line": 10,
      "message": "Description of the issue",
      "suggestion": "How to fix it",
      "fixable": true
    }
  ],
  "suggestions": [
    {
      "category": "refactoring|optimization|security|best-practices",
      "priority": "low|medium|high|critical",
      "title": "Suggestion title",
      "description": "Detailed description",
      "impact": "Expected impact"
    }
  ],
  "metrics": {
    "complexity": 8,
    "maintainability": 75,
    "security_score": 90
  }
}

Focus on:
- Code quality and maintainability
- Security vulnerabilities
- Performance optimizations
- Best practices for ${language}
- Potential bugs and edge cases`;

  const userPrompt = `${description ? `Description: ${description}\n\n` : ""}${
    framework ? `Framework: ${framework}\n\n` : ""
  }Code to analyze:

\`\`\`${language}
${code}
\`\`\``;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
};

/**
 * generateChatPrompt — builds the message array for the AI.
 * Extended to support `smart-learning` and `quick-check` modes with
 * full domain/goal/concept-map context injection.
 *
 * @param {Array} chatHistory - Prior messages [{role, content}]
 * @param {string} domain - Subject domain
 * @param {string} mode - chat | code | debug | help | smart-learning | quick-check
 * @param {Object} context - { goal, conceptMap, gapStates } (optional, used by smart modes)
 */
const generateChatPrompt = (chatHistory, domain = "general", mode = "chat", context = {}) => {
  const { goal = "", conceptMap = [], gapStates = {} } = context;

  // Build concept context string for smart modes
  const buildConceptContext = () => {
    if (!conceptMap.length) return "";
    const conceptList = conceptMap
      .slice(0, 20) // cap to avoid bloating context
      .map(c => `  - ${c.name}${c.category ? ` (${c.category})` : ""}`)
      .join("\n");
    return `\n\nConcept map for this session:\n${conceptList}`;
  };

  const buildGapContext = () => {
    const gaps = Object.entries(gapStates)
      .filter(([, s]) => s && s.state && s.state !== "unconfirmed" && s.state !== "sufficient")
      .map(([id, s]) => `  - ${s.name || id}: ${s.state}${s.reason && s.reason !== "none" ? ` (${s.reason})` : ""}`)
      .join("\n");
    return gaps ? `\n\nKnown learning gaps (evidence-based, not from tests):\n${gaps}` : "";
  };

  // ── Synaptron Agent System Prompt ────────────────────────────────────────────
  // Applies to modes: smart-learning-agent, CLAIM_VERIFICATION,
  // PREREQUISITE_CHECK, MODULE_CHECK, quick-check.
  // Returns ONLY strict JSON — never plain text.
  const buildSynaptronPrompt = (resolvedMode) => {
    const modeFraming = {
      "CLAIM_VERIFICATION": `MODE: CLAIM_VERIFICATION\nThe learner checked a box claiming they already know this concept. Probe whether the claim holds up starting from an explain-it-yourself or apply-it prompt. Be respectful — this is a quick confirmation, not an accusation.`,
      "PREREQUISITE_CHECK": `MODE: PREREQUISITE_CHECK\nThe platform is about to move the learner into a new concept and needs to know if a specific prerequisite is solid enough. Frame your first question around that prerequisite specifically, not the upcoming concept.`,
      "MODULE_CHECK":       `MODE: MODULE_CHECK\nThe learner just finished a module. Your question(s) should be applied/practical where possible (use it, don't just state it), since the goal is checking usable understanding, not recall.`,
      "quick-check":        `MODE: PREREQUISITE_CHECK\nFocus on determining whether the learner has sufficient background for the next concept.`,
    };

    const framing = modeFraming[resolvedMode] || modeFraming["MODULE_CHECK"];

    return `## Identity and role
You are the Synaptron diagnostic and guidance agent. Your job is NOT to test the learner. Your job is to figure out, with the least friction possible, what a learner genuinely knows about a specific concept — and if there is a gap, exactly what kind it is — so the platform can decide what to teach next. You never grade. You gather evidence, interpret it separately, then hand off a recommended action.

${framing}

## Non-negotiable rules
1. Never ask multiple-choice questions. Every question must be open-ended — "explain," "why," "what would you do if," "apply this to."
2. Ask the FEWEST questions possible. If the first answer is clearly strong or clearly weak, stop immediately. Only ask a follow-up if the answer is genuinely ambiguous. Hard limit: 4 questions total.
3. Never output a verdict directly from an answer. Every turn must separate what the learner said (evidence_log) from your interpretation — two separate fields, never blended into the learner-facing message.
4. Never say "mastered." Internally use "sufficient evidence to proceed"; the learner sees only a short plain sentence.
5. On your FIRST turn for any concept, define exactly 3 sub-ideas central to genuinely knowing or applying that concept. Keep the SAME 3 in rubric across the whole exchange.
6. Never show your rubric, confidence, or reasoning process to the learner — those fields exist for the app only. The learner sees only the message field.
7. If the learner's answer is unrelated, refuses, or is empty, classify it as no_evidence — never as a failure.

## Interpretation categories (choose exactly one when resolving)
- forgotten — previously demonstrated, now can't recall
- never_learned — no prior sign of this ever being known
- prerequisite_gap — the issue traces back to an earlier concept, not this one
- theory_no_application — can describe correctly, cannot use it
- misconception — confidently states something incorrect
- sufficient — evidence supports real understanding
- no_evidence — inconclusive; do not force a label

## Action mapping
- forgotten → short_refresher
- never_learned / prerequisite_gap → step_back_to_prerequisite
- theory_no_application → practical_task
- misconception → direct_correction
- sufficient → proceed
- no_evidence → proceed_unconfirmed

## CRITICAL: Respond with ONLY this JSON — no markdown fences, no plain text outside it
{
  "rubric": ["sub-idea 1", "sub-idea 2", "sub-idea 3"],
  "covered": ["sub-ideas confirmed so far"],
  "turn_state": "probing | resolved",
  "message": "the next question (if probing) or a short 1-2 sentence plain summary for the learner (if resolved)",
  "questions_asked": <integer>,
  "evidence_log": "exact neutral summary of what the learner has said — no judgment words like weak or strong",
  "interpretation": "forgotten | never_learned | prerequisite_gap | theory_no_application | misconception | sufficient | no_evidence | null",
  "confidence": <0.0–1.0 when interpretation is not null, else null>,
  "action": "short_refresher | step_back_to_prerequisite | practical_task | direct_correction | proceed | proceed_unconfirmed | null"
}

rubric stays IDENTICAL across every turn in the same session.
evidence_log ACCUMULATES across turns — always neutral.
interpretation, confidence, and action are filled ONLY when turn_state becomes resolved.
Domain context: ${domain}${goal ? `\nLearner goal: "${goal}"` : ""}${buildConceptContext()}${buildGapContext()}`;
  };

  // ── Determine resolved mode ───────────────────────────────────────────────
  const agentModes = new Set([
    "smart-learning-agent", "smart-learning",
    "CLAIM_VERIFICATION", "PREREQUISITE_CHECK", "MODULE_CHECK", "quick-check"
  ]);
  const isAgentMode = agentModes.has(mode);

  const systemPrompts = {
    "smart-learning-agent": buildSynaptronPrompt("MODULE_CHECK"),
    "smart-learning":       buildSynaptronPrompt("MODULE_CHECK"),
    "CLAIM_VERIFICATION":   buildSynaptronPrompt("CLAIM_VERIFICATION"),
    "PREREQUISITE_CHECK":   buildSynaptronPrompt("PREREQUISITE_CHECK"),
    "MODULE_CHECK":         buildSynaptronPrompt("MODULE_CHECK"),
    "quick-check":          buildSynaptronPrompt("quick-check"),
    chat:  `You are Synaptron, a Socratic mentor in ${domain}. Ask open-ended questions to help the learner discover their own gaps. Never give quizzes or multiple-choice.`,
    code:  `You are Synaptron, a Socratic coding mentor in ${domain}. Ask about architecture and design before giving syntax.`,
    debug: `You are Synaptron, a debugging specialist in ${domain}. Ask the learner what they think the error means before giving the fix.`,
    help:  `You are Synaptron, a helpful Socratic mentor in ${domain}. Guide with leading questions.`,
  };

  const systemMessage = {
    role: "system",
    content: systemPrompts[mode] || systemPrompts.chat,
  };

  return [systemMessage, ...chatHistory];
};


/**
 * ✅ Validate API key using dynamic import
 */
const validateApiKey = async () => {
  try {
    await sendChatCompletion([
      { role: "user", content: "Hello" }
    ], {
      model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct:free",
      maxTokens: 5
    });
    
    logger.info("API key validation successful");
    return true;
  } catch (error) {
    logger.error("API key validation failed", { error: error.message });
    return false;
  }
};

const getAvailableModels = async () => {
  try {
    const openai = await getOpenAIClient();
    const response = await openai.models.list();
    const models = response.data
      .filter((model) => model.id.includes("gpt") || model.id.includes("llama"))
      .map((model) => ({
        id: model.id,
        created: model.created,
        owned_by: model.owned_by,
      }));

    logger.info("Retrieved available models", { count: models.length });
    return models;
  } catch (error) {
    logger.error("Failed to retrieve models", { error: error.message });
    
    // Fallback to common OpenRouter models
    const fallbackModels = [
      { id: "meta-llama/llama-3.1-405b-instruct:free", name: "Llama 3.1 405B (Free)" },
      { id: "meta-llama/llama-3.1-8b-instruct:free", name: "Llama 3.1 8B (Free)" },
      { id: "openai/gpt-4o-mini", name: "GPT-4 Omni Mini" },
      { id: "openai/gpt-4o", name: "GPT-4 Omni" },
      { id: "anthropic/claude-3-sonnet", name: "Claude 3 Sonnet" }
    ];
    
    return fallbackModels;
  }
};

const estimateTokenCount = (text) => {
  return Math.ceil(text.length / 4);
};

const truncateMessages = (messages, maxTokens = 3000) => {
  let totalTokens = 0;
  const truncatedMessages = [];

  if (messages[0]?.role === "system") {
    truncatedMessages.push(messages[0]);
    totalTokens += estimateTokenCount(messages[0].content);
  }

  for (let i = messages.length - 1; i >= 1; i--) {
    const messageTokens = estimateTokenCount(messages[i].content);
    if (totalTokens + messageTokens <= maxTokens) {
      truncatedMessages.unshift(messages[i]);
      totalTokens += messageTokens;
    } else {
      break;
    }
  }

  logger.info("Messages truncated", {
    original: messages.length,
    truncated: truncatedMessages.length,
    estimatedTokens: totalTokens,
  });

  return truncatedMessages;
};

const healthCheck = async () => {
  try {
    const isValid = await validateApiKey();
    return {
      status: isValid ? 'healthy' : 'unhealthy',
      apiKey: isValid ? 'valid' : 'invalid',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

// ✅ CommonJS exports with lazy-loaded openai client
module.exports = {
  getOpenAI: getOpenAIClient, // Export the client getter
  sendChatCompletion,
  sendChatCompletionWithRetry,
  generateCodeAnalysisPrompt,
  generateChatPrompt,
  validateApiKey,
  getAvailableModels,
  estimateTokenCount,
  truncateMessages,
  cleanAndParseJSON,
  healthCheck,
  logger,
};
