const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  score: {
    type: Number,
    default: 0,
  },
  solvedPuzzles: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Puzzle",
    },
  ],
});

module.exports = mongoose.model("User", UserSchema);
