const express = require("express");
const { body } = require("express-validator");
const {
  initializeGapProfile,
  getGapProfile,
  checkTrigger,
  skipQuickCheck,
  logAndInterpret,
  getLearningPathFromGaps,
} = require("../controllers/gapController");
const { verifyToken } = require("../middlewares/authMiddleware");

const router = express.Router();

router.post("/initialize", verifyToken, [
  body("domain").trim().notEmpty(),
], initializeGapProfile);

router.get("/profile/:domain", verifyToken, getGapProfile);
router.get("/trigger/:domain", verifyToken, checkTrigger);
// Accept both /skip and /skip-check for backwards compatibility
router.post("/skip-check", verifyToken, skipQuickCheck);
router.post("/skip", verifyToken, skipQuickCheck);
router.post("/pipeline", verifyToken, logAndInterpret);
router.post("/learning-path/:domain", verifyToken, getLearningPathFromGaps);

module.exports = router;
