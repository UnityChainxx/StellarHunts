import React from "react";
import { Flame } from "lucide-react";
import RankBadge from "./RankBadge"; 

// PlayerCard renders a single row in a leaderboard: the player's rank,
// name, streak, stats, and score, with a subtle hover gradient effect.
// Props:
//   - player: object containing name, streak, challenges, nfts, score, and level
//   - rank: the player's numeric leaderboard position (1 = first place, etc.)
const PlayerCard = ({ player, rank }) => {
    return (
      <div className="relative group">
        {/* Animated background on hover */}
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/10 to-pink-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg" />
  
        <div className="relative flex items-center gap-4 p-4 backdrop-blur-sm bg-white/5 border border-white/10 rounded-lg">
          {/* Rank and Badge */}
          <div className="flex items-center gap-3">
            {/* Visual badge (e.g. medal/icon) that likely varies by rank tier */}
            <RankBadge rank={rank} />
            {/* Numeric rank, shown alongside the badge */}
            <span className="text-2xl font-bold text-white/80">#{rank}</span>
          </div>
  
          {/* Player Info */}
          <div className="flex-grow">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white">{player.name}</h3>
              {/* Only show the streak indicator if the player currently has an active streak */}
              {player.streak > 0 && (
                <div className="flex items-center text-orange-400 text-sm">
                  <Flame className="w-4 h-4 mr-1" />
                  {player.streak} day streak
                </div>
              )}
            </div>
            {/* Secondary stats: challenges completed and NFTs owned */}
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span>{player.challenges} challenges</span>
              <span>{player.nfts} NFTs</span>
            </div>
          </div>
  
          {/* Score */}
          <div className="text-right">
            {/* Score formatted with locale-aware thousands separators, styled with a gradient text fill */}
            <div className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              {player.score.toLocaleString()} pts
            </div>
            <div className="text-sm text-gray-400">Level {player.level}</div>
          </div>
        </div>
      </div>
    );
  };

  export default PlayerCard;