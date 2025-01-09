const express = require("express");
const router = express.Router();
const Puzzle = require("../models/Puzzle");

router.get("/current", async (req, res) => {
  try {
    const puzzle = await Puzzle.findOne({ active: true });
    res.json(puzzle);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/solve", async (req, res) => {
  try {
    const { puzzleId, solution, userId } = req.body;
    const puzzle = await Puzzle.findById(puzzleId);

    if (!puzzle) {
      return res.status(404).json({ message: "Puzzle not found" });
    }

    if (puzzle.solution.toLowerCase() === solution.toLowerCase()) {
      // TODO: Update user's score and progress
      res.json({ success: true, message: "Correct solution!" });
    } else {
      res.json({ success: false, message: "Incorrect solution. Try again!" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
