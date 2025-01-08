'use client'

import { useState, useEffect } from 'react'
import { connect } from '@starknet-react/core'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"

export default function Game() {
  const [currentPuzzle, setCurrentPuzzle] = useState(null)
  const [solution, setSolution] = useState('')
  const { account } = connect()

  useEffect(() => {
    // TODO: Fetch current puzzle from smart contract
    setCurrentPuzzle({
      id: 1,
      clue: "What's the first block in a blockchain called?",
      hint: "It's the beginning of everything in the chain."
    })
  }, [account])

  const handleSubmit = (e) => {
    e.preventDefault()
    // TODO: Submit solution to smart contract
    console.log('Submitted solution:', solution)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>NFT Scavenger Hunt</CardTitle>
          <CardDescription>Solve the puzzle to earn NFTs!</CardDescription>
        </CardHeader>
        <CardContent>
          {currentPuzzle ? (
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <p className="text-lg font-medium">{currentPuzzle.clue}</p>
                <Input
                  type="text"
                  placeholder="Enter your answer"
                  value={solution}
                  onChange={(e) => setSolution(e.target.value)}
                />
              </div>
            </form>
          ) : (
            <p>Loading puzzle...</p>
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" onClick={handleSubmit}>Submit Answer</Button>
        </CardFooter>
      </Card>
    </main>
  )
}

