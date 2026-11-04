const GapEngine = require("../services/GapEngine");
const ActionMapper = require("../services/ActionMapper");
const User = require("../models/User");

const getDomainStructureFromBody = (body) => {
  if (body.domainStructure?.concepts) return body.domainStructure;
  return { concepts: body.concepts || [] };
};

const initializeGapProfile = async (req, res) => {
  try {
    const { domain, goal, domainStructure } = req.body;
    if (!domain) {
      return res.status(400).json({ success: false, message: "Domain is required" });
    }

    const structure = getDomainStructureFromBody(req.body);
    const result = await GapEngine.initializeFromGoal(
      req.user._id,
      domain,
      goal || "",
      structure
    );

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("Initialize gap profile error:", error);
    res.status(500).json({ success: false, message: "Failed to initialize learning profile" });
  }
};

const getGapProfile = async (req, res) => {
  try {
    const domain = decodeURIComponent(req.params.domain);
    const user = await User.findById(req.user._id);
    const dtKey = domain.toLowerCase().replace(/\s+/g, "_");
    const digitalTwinData = user?.digitalTwin?.get(dtKey);

    if (!digitalTwinData) {
      return res.status(404).json({ success: false, message: "No profile found for this domain" });
    }

    const profile = GapEngine.digitalTwinToProfile(
      domain,
      digitalTwinData.domainGoal,
      digitalTwinData,
      { concepts: digitalTwinData.nodes.map(n => ({ id: n.conceptId, name: n.conceptName })) }
    );

    const gaps = GapEngine.getGapsFromProfile(profile, {
      concepts: digitalTwinData.nodes.map(n => ({
        id: n.conceptId,
        name: n.conceptName,
      })),
    });

    const quickCheckTrigger = GapEngine.evaluateTriggerRule(
      digitalTwinData,
      digitalTwinData.conceptMapIds
    );

    res.status(200).json({
      success: true,
      data: { profile, gaps, quickCheckTrigger, canDecideNext: GapEngine.canDecideNextAction(digitalTwinData, digitalTwinData.conceptMapIds) },
    });
  } catch (error) {
    console.error("Get gap profile error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch profile" });
  }
};

const checkTrigger = async (req, res) => {
  try {
    const domain = decodeURIComponent(req.params.domain);
    const user = await User.findById(req.user._id);
    const dtKey = domain.toLowerCase().replace(/\s+/g, "_");
    const digitalTwinData = user?.digitalTwin?.get(dtKey);

    if (!digitalTwinData) {
      return res.status(200).json({ success: true, data: { trigger: null, canDecideNext: false } });
    }

    const trigger = GapEngine.evaluateTriggerRule(digitalTwinData, digitalTwinData.conceptMapIds);
    res.status(200).json({
      success: true,
      data: {
        trigger: trigger ? { conceptId: trigger.conceptId, conceptName: trigger.conceptName, state: trigger.state } : null,
        canDecideNext: GapEngine.canDecideNextAction(digitalTwinData, digitalTwinData.conceptMapIds),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Trigger check failed" });
  }
};

const skipQuickCheck = async (req, res) => {
  try {
    const { domain, conceptId } = req.body;
    await GapEngine.markCheckSkipped(req.user._id, domain, conceptId);
    res.status(200).json({ success: true, message: "Marked as unconfirmed, continuing" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to skip check" });
  }
};

const logAndInterpret = async (req, res) => {
  try {
    const { domain, goal, message, conceptIds, domainStructure, source } = req.body;
    const structure = getDomainStructureFromBody(req.body);

    const result = await GapEngine.runPipeline(
      req.user._id,
      domain,
      goal,
      { text: message, conceptIds, source: source || "chat" },
      structure
    );

    const io = req.app.get("io");
    if (io && result.profile) {
      io.to(`user-${req.user._id}`).emit("profile-updated", {
        profile: result.profile,
        interpretations: result.interpretations,
        quickCheckTrigger: result.quickCheckTrigger,
      });
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("Log and interpret error:", error);
    res.status(500).json({ success: false, message: "Pipeline failed" });
  }
};

const getLearningPathFromGaps = async (req, res) => {
  try {
    const domain = decodeURIComponent(req.params.domain);
    const { domainStructure } = req.body;
    const user = await User.findById(req.user._id);
    const dtKey = domain.toLowerCase().replace(/\s+/g, "_");
    const digitalTwinData = user?.digitalTwin?.get(dtKey);
    const structure = domainStructure || { concepts: digitalTwinData?.nodes?.map(n => ({ id: n.conceptId, name: n.conceptName, prerequisites: [], importance: 0.7, category: "core", estimatedHours: 5 })) || [] };

    const profile = GapEngine.digitalTwinToProfile(domain, digitalTwinData?.domainGoal, digitalTwinData, structure);
    const gaps = GapEngine.getGapsFromProfile(profile, structure);

    const path = gaps.map((g, idx) => ({
      conceptId: g.conceptId,
      conceptName: g.conceptName,
      state: g.state,
      reason: g.reason,
      priority: g.state === "misconception" ? "critical" : g.state === "weak-application" ? "high" : "medium",
      whyItMatters: typeof g.userMessage === "object" ? g.userMessage.sentence : g.userMessage,
      recommendedAction: g.action,
      completed: false,
      order: idx + 1,
    }));

    res.status(200).json({ success: true, data: { path, gaps, profile } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to build learning path" });
  }
};

module.exports = {
  initializeGapProfile,
  getGapProfile,
  checkTrigger,
  skipQuickCheck,
  logAndInterpret,
  getLearningPathFromGaps,
};
