const express = require("express");
const router = express.Router();
const User = require("../models/User");

router.get("/", async (req, res) => {
  try {
    const leaderboard = await User.find().sort({ score: -1 }).limit(10);
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
