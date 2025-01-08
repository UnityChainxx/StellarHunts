import React, { useState, useEffect } from 'react';

function Leaderboard() {
  const [leaders, setLeaders] = useState([]);

  useEffect(() => {
    // TODO: Fetch leaderboard data from smart contract
  }, []);

  return (
    <div>
      <h2>Leaderboard</h2>
      <ul>
        {leaders.map((leader, index) => (
          <li key={index}>
            {leader.name} - {leader.score} points
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Leaderboard;

