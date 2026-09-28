import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the transport layer so the real service module runs against a
// scripted `apiClient` — no HTTP, but the full payload/error mapping path
// of `puzzleDraftService` is exercised.
vi.mock('@/lib/api', () => {
  class ApiError extends Error {
    constructor(message, meta = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = meta.status;
      this.data = meta.data;
    }
  }
  return {
    ApiError,
    apiClient: {
      post: vi.fn(),
      patch: vi.fn(),
    },
  };
});

import { apiClient } from '@/lib/api';
import AdminPuzzleSubmission from '@/app/admin/puzzle-submission/page';

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminPuzzleSubmission />
    </QueryClientProvider>,
  );
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Riddle of the Ledger' },
  });
  fireEvent.change(screen.getByLabelText('Description'), {
    target: { value: 'A puzzle about invariants' },
  });
  fireEvent.change(screen.getByLabelText('Answer'), {
    target: { value: 'soroban' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  apiClient.post.mockResolvedValue({ data: { id: 'draft-1' } });
  apiClient.patch.mockResolvedValue({ data: { id: 'draft-1' } });
});

afterEach(cleanup);

describe('Admin puzzle submission form (issue #511)', () => {
  it('creates a draft through the backend on save', async () => {
    renderForm();
    fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(screen.getByTestId('draft-state')).toBeInTheDocument();
    });

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    const [path, payload] = apiClient.post.mock.calls[0];
    expect(path).toBe('/drafts');
    expect(payload).toEqual({
      title: 'Riddle of the Ledger',
      description: 'A puzzle about invariants',
      content: { answer: 'soroban', difficulty: 'easy' },
    });
  });

  it('updates the existing draft once one has been created', async () => {
    renderForm();
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(screen.getByTestId('draft-state')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Riddle, revised' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update draft/i }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledTimes(1);
    });
    const [path, payload] = apiClient.patch.mock.calls[0];
    expect(path).toBe('/drafts/draft-1');
    expect(payload.title).toBe('Riddle, revised');
    // The create endpoint is not hit a second time.
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  it('publishes through the backend publish endpoint', async () => {
    renderForm();
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(screen.getByTestId('draft-state')).toBeInTheDocument();
    });

    apiClient.post.mockResolvedValueOnce({ data: { event: 'PUZZLE_DRAFT_PUBLISHED' } });
    fireEvent.click(screen.getByRole('button', { name: /publish/i }));

    await waitFor(() => {
      expect(screen.getByText('Draft published successfully.')).toBeInTheDocument();
    });
    expect(apiClient.post).toHaveBeenLastCalledWith('/drafts/draft-1/publish');
    // A successful publish resets the form for the next puzzle.
    expect(screen.getByLabelText('Title')).toHaveValue('');
  });

  it('surfaces per-field validation errors and keeps the content on a failed save', async () => {
    renderForm();
    fillValidForm();

    // class-validator rejections arrive as an array of messages on
    // `response.data.message`; the ApiError mapping puts them on `.data`.
    // Persistent rejection (not `Once`): the shared mutation hook retries
    // once, and the retry must fail too for the error path to be exercised.
    apiClient.post.mockRejectedValue({
      status: 400,
      data: { message: ['content.answer must be a string', 'title must be longer than or equal to 3 characters'] },
    });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed to save draft.')).toBeInTheDocument();
    });
    expect(screen.getByText('content.answer must be a string')).toBeInTheDocument();
    expect(
      screen.getByText('title must be longer than or equal to 3 characters'),
    ).toBeInTheDocument();

    // The entered content survives the failure.
    expect(screen.getByLabelText('Title')).toHaveValue('Riddle of the Ledger');
    expect(screen.getByLabelText('Description')).toHaveValue('A puzzle about invariants');
    expect(screen.getByLabelText('Answer')).toHaveValue('soroban');
  });

  it('reports a failed publish and preserves the draft', async () => {
    renderForm();
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(screen.getByTestId('draft-state')).toBeInTheDocument();
    });

    apiClient.post.mockRejectedValue({
      status: 400,
      data: { message: ['Draft is missing required content fields'] },
    });

    fireEvent.click(screen.getByRole('button', { name: /publish/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed to publish draft.')).toBeInTheDocument();
    });
    // The draft is still present for a retry.
    expect(screen.getByTestId('draft-state')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Riddle of the Ledger');
  });

  it('rejects invalid NFT metadata JSON before any request is made', async () => {
    renderForm();
    fillValidForm();
    fireEvent.change(screen.getByLabelText('NFT Metadata (JSON)'), {
      target: { value: '{ not json' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(screen.getByText('NFT metadata must be valid JSON.')).toBeInTheDocument();
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
