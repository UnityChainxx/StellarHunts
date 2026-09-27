import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { POST } from '../app/api/referrals/track/route';

vi.mock('axios');

describe('POST /api/referrals/track', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const request = {
      headers: {
        get: (h) => null,
      },
      cookies: {
        get: (c) => null,
      },
      json: async () => ({ referrerId: 'ref-1', newUserId: 'user-2' }),
    };

    const response = await POST(request as any);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toContain('Authentication required');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('forwards authenticated requests to the backend service', async () => {
    const request = {
      headers: {
        get: (h) => (h === 'authorization' ? 'Bearer valid-jwt-token' : null),
      },
      cookies: {
        get: (c) => null,
      },
      json: async () => ({ referrerId: 'ref-1', newUserId: 'user-2' }),
    };

    (axios.post as any).mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        isNew: true,
        message: 'Referral tracked successfully',
        invite: { id: 'inv-123' },
      },
    });

    const response = await POST(request as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.invite.id).toBe('inv-123');

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/referrals/track'),
      { referrerId: 'ref-1', newUserId: 'user-2' },
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer valid-jwt-token',
        }),
      }),
    );
  });
});
