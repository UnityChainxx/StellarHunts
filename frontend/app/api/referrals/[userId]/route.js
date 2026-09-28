import { NextResponse } from 'next/server';
import axios from 'axios';
import { apiUrl } from '@/lib/api';

/**
 * Referral stats proxy route — issue #497
 *
 * Proxies `GET /api/v1/referrals/:userId` from the backend referral service.
 * No hardcoded mock data is returned; the backend is the sole data source.
 *
 * If the backend is unreachable or returns an error the status code is
 * preserved so the UI can render a distinct error state rather than silently
 * displaying stale data.
 *
 * Authentication is forwarded so the backend can enforce ownership checks.
 *
 * Note: `useReferral.js` now calls the backend directly via `apiClient`, so
 * this route is kept for legacy compatibility only. New code should go through
 * `apiClient.get("/referrals/:id")` as documented in `docs/api-conventions.md`.
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
