import { NextResponse } from 'next/server';
import axios from 'axios';
import { apiUrl } from '@/lib/api';

/**
 * Referral stats proxy route.
 *
 * Fetches referral statistics and invited-user list for `userId` from the
 * backend referral service (`GET /api/v1/referrals/:userId`) and returns the
 * result to the caller.
 *
 * Authentication is forwarded so the backend can enforce ownership. If the
 * backend returns an error the status code is preserved so the UI can render
 * a distinct error state.
 *
 * Note: `useReferral.js` calls the backend directly via `apiClient`, so this
 * route is now only used by legacy callers. New code should call the backend
 * through `apiClient.get("/referrals/:id")` as documented in
 * `docs/api-conventions.md` (issue #510).
 */
export async function GET(request, { params }) {
  const { userId } = params;

  const authHeader = request.headers.get('authorization');
  const cookieHeader = request.headers.get('cookie');

  try {
    const backendUrl = apiUrl(`/referrals/${userId}`);
    const headers = {};
    if (authHeader) headers['authorization'] = authHeader;
    if (cookieHeader) headers['cookie'] = cookieHeader;

    const response = await axios.get(backendUrl, { headers });
    return NextResponse.json(response.data, { status: response.status });
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || { error: 'Failed to fetch referral data' };
    return NextResponse.json(data, { status });
  }
}
