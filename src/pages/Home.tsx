import React from 'react';
import { Link } from 'react-router-dom';

function Home() {
  return (
    <div>
      <h1>Welcome to NFT Scavenger Hunt Game</h1>
      <p>Solve puzzles, follow clues, and earn exclusive NFTs!</p>
      <Link to="/game">Start Game</Link>
      <Link to="/leaderboard">View Leaderboard</Link>
    </div>
  );
}

export default Home;

