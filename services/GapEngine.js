const User = require("../models/User");
const { sendChatCompletion } = require("../utils/openaiClient");
const ActionMapper = require("./ActionMapper");
const { logger } = require("../utils/logger");

const log = {
  info: (...args) => (logger ? logger.info(...args) : console.log(...args)),
  warn: (...args) => (logger ? logger.warn(...args) : console.warn(...args)),
  error: (...args) => (logger ? logger.error(...args) : console.error(...args)),
};

function domainKey(domainName) {
  return domainName.toLowerCase().replace(/\s+/g, "_");
}

class GapEngine {
  /**
   * Build a goal-filtered concept map from the full domain structure.
   * Only concepts relevant to the learner's stated goal are included.
   */
  static buildGoalConceptMap(domainStructure, goal) {
    if (!domainStructure?.concepts?.length) return [];
    const goalLower = (goal || "").toLowerCase();
    if (!goalLower) {
      return domainStructure.concepts.filter(c => c.importance >= 0.7);
    }

    const goalKeywords = goalLower.split(/\W+/).filter(w => w.length > 3);
    const scored = domainStructure.concepts.map(concept => {
      const text = `${concept.name} ${concept.description} ${(concept.subtopics || []).join(" ")}`.toLowerCase();
      let score = concept.importance || 0.5;
      for (const kw of goalKeywords) {
        if (text.includes(kw)) score += 0.15;
      }
      if (concept.category === "foundation") score += 0.1;
      return { concept, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const threshold = Math.max(0.55, scored[Math.floor(scored.length * 0.4)]?.score || 0.55);
    const selected = new Set();

    for (const { concept, score } of scored) {
      if (score >= threshold || concept.category === "foundation") {
        selected.add(concept.id);
        for (const prereq of concept.prerequisites || []) selected.add(prereq);
      }
    }

    return domainStructure.concepts.filter(c => selected.has(c.id));
  }

  /**
   * Initialize digital twin + frontend profile from goal concept map.
   */
  static async initializeFromGoal(userId, domainName, goal, domainStructure) {
    const concepts = this.buildGoalConceptMap(domainStructure, goal);
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    const dtKey = domainKey(domainName);
    const nodes = concepts.map(c => ({
      conceptId: c.id,
      conceptName: c.name,
      state: "unconfirmed",
      reason: "none",
      confidence: 0,
      evidenceLog: [],
      lastAssessed: new Date(),
      skippedCheck: false,
    }));

    const digitalTwinData = {
      domainGoal: goal,
      conceptMapIds: concepts.map(c => c.id),
      nodes,
      lastUpdated: new Date(),
    };

    user.digitalTwin.set(dtKey, digitalTwinData);
    await user.save({ validateBeforeSave: false });

    return {
      domain: domainName,
      goal,
      conceptMap: concepts,
      profile: this.digitalTwinToProfile(domainName, goal, digitalTwinData, domainStructure),
    };
  }

  static digitalTwinToProfile(domainName, goal, digitalTwinData, domainStructure) {
    const topics = {};
    for (const node of digitalTwinData?.nodes || []) {
      const concept = domainStructure?.concepts?.find(c => c.id === node.conceptId);
      topics[node.conceptId] = {
        name: node.conceptName || concept?.name || node.conceptId,
        state: node.state,
        reason: node.reason,
        confidence: node.confidence || 0,
        lastAssessed: node.lastAssessed ? new Date(node.lastAssessed).getTime() : Date.now(),
        evidenceCount: node.evidenceLog?.length || 0,
      };
    }
    return { domain: domainName, goal, topics, lastUpdated: Date.now() };
  }

  static getDigitalTwin(user, domainName) {
    return user.digitalTwin?.get(domainKey(domainName)) || null;
  }

  /**
   * Stage 1: Evidence Logging — raw interaction only, no verdict.
   */
  static async logEvidence(userId, domainName, currentGoal, interaction) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error("User not found");

      const dtKey = domainKey(domainName);
      let digitalTwinData = user.digitalTwin.get(dtKey);

      if (!digitalTwinData) {
        digitalTwinData = {
          domainGoal: currentGoal,
          conceptMapIds: [],
          nodes: [],
          lastUpdated: new Date(),
        };
      } else {
        digitalTwinData.domainGoal = currentGoal;
      }

      const conceptIds = interaction.conceptIds?.length
        ? interaction.conceptIds
        : (interaction.inferredConceptIds || []);

      const targets = conceptIds.length ? conceptIds : ["general"];

      for (const conceptId of targets) {
        let node = digitalTwinData.nodes.find(n => n.conceptId === conceptId);
        if (!node) {
          node = {
            conceptId,
            conceptName: conceptId.replace(/_/g, " "),
            state: "unconfirmed",
            reason: "none",
            confidence: 0,
            evidenceLog: [],
            lastAssessed: new Date(),
            skippedCheck: false,
          };
          digitalTwinData.nodes.push(node);
        }

        node.evidenceLog.push({
          interaction: interaction.text,
          source: interaction.source || "chat",
          timestamp: new Date(),
        });
        node.lastAssessed = new Date();
      }

      digitalTwinData.lastUpdated = new Date();
      user.digitalTwin.set(dtKey, digitalTwinData);
      await user.save({ validateBeforeSave: false });
      log.info(`Evidence logged for user ${userId} in domain ${domainName}`);
      return { success: true, conceptIds: targets };
    } catch (error) {
      log.error("Error in GapEngine.logEvidence:", error);
      return { success: false };
    }
  }

  /**
   * Stage 2: Interpretation — separate from evidence logging.
   */
  static async interpretEvidence(userId, domainName, conceptId) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error("User not found");

      const digitalTwinData = user.digitalTwin.get(domainKey(domainName));
      if (!digitalTwinData) return null;

      const node = digitalTwinData.nodes.find(n => n.conceptId === conceptId);
      if (!node?.evidenceLog?.length) return null;

      const evidenceText = node.evidenceLog
        .map(e => `[${new Date(e.timestamp).toISOString()}] (${e.source || "chat"}) ${e.interaction}`)
        .join("\n");

      const systemPrompt = `You are an expert cognitive interpreter.
Analyze the evidence log for concept "${node.conceptName}".
Based ONLY on the evidence, interpret the learner's understanding.

States: sufficient | partial | weak-application | misconception | unconfirmed
Reasons: forgot terminology | can't apply it | misconception | prerequisite weak | sufficient evidence | none

Respond with valid JSON only:
{"state":"...","reason":"...","confidence":0.0-1.0}
Never use the word "mastered". Use "sufficient" when evidence supports proceeding.
DO NOT include markdown.`;

      const aiResult = await sendChatCompletion(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Evidence Log:\n${evidenceText}` },
        ],
        { requireJSON: true, model: "gpt-3.5-turbo", temperature: 0.1 }
      );

      let analysis = null;
      const raw = aiResult.data?.choices?.[0]?.message?.content || aiResult.content;
      if (typeof raw === "string") {
        try { analysis = JSON.parse(raw); } catch { analysis = null; }
      } else {
        analysis = raw;
      }

      if (!analysis?.state) {
        log.warn("Gap interpretation returned invalid JSON");
        return null;
      }

      node.state = analysis.state;
      node.reason = analysis.reason || "none";
      node.confidence = typeof analysis.confidence === "number" ? analysis.confidence : 0.5;
      node.lastAssessed = new Date();

      digitalTwinData.lastUpdated = new Date();
      user.digitalTwin.set(domainKey(domainName), digitalTwinData);
      await user.save({ validateBeforeSave: false });

      const action = ActionMapper.getActionForReason(node.reason);
      const formatted = ActionMapper.formatUserFacingMessage(node.state, node.reason);

      log.info(`Interpreted ${conceptId} -> ${node.state} (${node.reason})`);

      return {
        conceptId,
        conceptName: node.conceptName,
        state: node.state,
        reason: node.reason,
        confidence: node.confidence,
        action,
        userMessage: formatted,
      };
    } catch (error) {
      log.error("Error in GapEngine.interpretEvidence:", error);
      return null;
    }
  }

  /**
   * Decide if Synaptron can determine the next learning action without asking.
   */
  static canDecideNextAction(digitalTwinData, conceptMapIds) {
    if (!digitalTwinData?.nodes?.length) return false;

    const relevantNodes = digitalTwinData.nodes.filter(
      n => !conceptMapIds?.length || conceptMapIds.includes(n.conceptId)
    );

    const blocking = relevantNodes.find(node => {
      if (node.skippedCheck) return false;
      if (node.state === "misconception" || node.state === "weak-application") return true;
      if (node.state === "partial" && (node.confidence || 0) < 0.6) return true;
      if (node.state === "unconfirmed" && (node.evidenceLog?.length || 0) >= 2) return true;
      return false;
    });

    return !blocking;
  }

  /**
   * Strict trigger: only when next action cannot be decided.
   */
  static evaluateTriggerRule(digitalTwinData, conceptMapIds) {
    if (!digitalTwinData) return null;
    if (this.canDecideNextAction(digitalTwinData, conceptMapIds)) return null;

    const candidates = (digitalTwinData.nodes || [])
      .filter(n => {
        if (n.skippedCheck) return false;
        if (!conceptMapIds?.length || conceptMapIds.includes(n.conceptId)) {
          if (n.state === "unconfirmed" && (n.evidenceLog?.length || 0) < 3) return true;
          if (n.state === "partial" && (n.confidence || 0) < 0.6) return true;
          if (n.state === "weak-application" || n.state === "misconception") return true;
        }
        return false;
      })
      .sort((a, b) => {
        const severity = { misconception: 4, "weak-application": 3, partial: 2, unconfirmed: 1 };
        return (severity[b.state] || 0) - (severity[a.state] || 0);
      });

    return candidates[0] || null;
  }

  static markCheckSkipped(userId, domainName, conceptId) {
    return this._updateNode(userId, domainName, conceptId, { skippedCheck: true, state: "unconfirmed", reason: "none" });
  }

  static async _updateNode(userId, domainName, conceptId, updates) {
    const user = await User.findById(userId);
    if (!user) return null;
    const dtKey = domainKey(domainName);
    const digitalTwinData = user.digitalTwin.get(dtKey);
    if (!digitalTwinData) return null;
    const node = digitalTwinData.nodes.find(n => n.conceptId === conceptId);
    if (!node) return null;
    Object.assign(node, updates);
    digitalTwinData.lastUpdated = new Date();
    user.digitalTwin.set(dtKey, digitalTwinData);
    await user.save({ validateBeforeSave: false });
    return node;
  }

  /**
   * Full pipeline: log → interpret → map action → return profile update.
   */
  static async runPipeline(userId, domainName, goal, interaction, domainStructure) {
    await this.logEvidence(userId, domainName, goal, interaction);

    const results = [];
    const conceptIds = interaction.conceptIds?.length ? interaction.conceptIds : [];

    for (const conceptId of conceptIds) {
      const interpretation = await this.interpretEvidence(userId, domainName, conceptId);
      if (interpretation) results.push(interpretation);
    }

    const user = await User.findById(userId);
    const digitalTwinData = user?.digitalTwin?.get(domainKey(domainName));
    const profile = digitalTwinData
      ? this.digitalTwinToProfile(domainName, goal, digitalTwinData, domainStructure)
      : null;

    const trigger = this.evaluateTriggerRule(digitalTwinData, digitalTwinData?.conceptMapIds);

    return { interpretations: results, profile, quickCheckTrigger: trigger };
  }

  static getGapsFromProfile(profile, domainStructure) {
    if (!profile?.topics || !domainStructure?.concepts) return [];
    const weakStates = ["partial", "weak-application", "misconception"];
    return domainStructure.concepts
      .map(c => {
        const t = profile.topics[c.id];
        if (!t) return null;
        if (weakStates.includes(t.state)) {
          return {
            conceptId: c.id,
            conceptName: c.name,
            state: t.state,
            reason: t.reason,
            confidence: t.confidence,
            action: ActionMapper.getActionForReason(t.reason),
            userMessage: ActionMapper.formatUserFacingMessage(t.state, t.reason),
          };
        }
        return null;
      })
      .filter(Boolean);
  }
}

module.exports = GapEngine;
