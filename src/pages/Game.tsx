import React, { useState, useEffect } from 'react';
import { connect } from '@starknet-react/core';

function Game() {
  const [currentPuzzle, setCurrentPuzzle] = useState(null);
  const { account } = connect();

  useEffect(() => {
    // TODO: Fetch current puzzle from smart contract
  }, [account]);

  return (
    <div>
      <h2>NFT Scavenger Hunt</h2>
      {currentPuzzle ? (
        <div>
          <p>{currentPuzzle.clue}</p>
          {/* Add puzzle solving interface here */}
        </div>
      ) : (
        <p>Loading puzzle...</p>
      )}
    </div>
  );
}

export default Game;

