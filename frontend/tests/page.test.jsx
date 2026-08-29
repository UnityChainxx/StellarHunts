import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import HomePage from '@/app/page.tsx';

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: null,
    status: 'unauthenticated',
  }),
}));

describe('Home Page', () => {
  it('boots and renders the Home page successfully', () => {
    render(<HomePage />);

    // Check main heading
    expect(screen.getByRole('heading', { level: 1, name: /Welcome to StellarHunts/i })).toBeInTheDocument();

    // Check description text
    expect(screen.getByText(/Solve cryptographic puzzles and blockchain challenges/i)).toBeInTheDocument();

    // Check key navigation links
    expect(screen.getByText('Puzzles')).toBeInTheDocument();
    expect(screen.getByText('Leaderboard')).toBeInTheDocument();
    expect(screen.getByText('Rewards')).toBeInTheDocument();
    expect(screen.getByText('Get Started')).toBeInTheDocument();
  });
});
