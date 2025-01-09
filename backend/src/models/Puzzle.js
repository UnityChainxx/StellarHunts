const mongoose = require("mongoose");

const PuzzleSchema = new mongoose.Schema({
  clue: {
    type: String,
    required: true,
  },
  solution: {
    type: String,
    required: true,
  },
  active: {
    type: Boolean,
    default: true,
  },
  difficulty: {
    type: String,
    enum: ["easy", "medium", "hard"],
    default: "medium",
  },
});

module.exports = mongoose.model("Puzzle", PuzzleSchema);
