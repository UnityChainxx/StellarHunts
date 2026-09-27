import { NextResponse } from 'next/server';
import axios from 'axios';
import { apiUrl } from '@/lib/api';

/**
 * Authenticated proxy for referral tracking.
 *
 * Forwards referral attribution to the backend single-writer service
 * (`POST /api/v1/referrals/track`), binding the attribution to the caller's
 * verified identity (JWT Bearer token or session cookie).
 *
 * Unauthenticated requests are rejected with 401 to prevent arbitrary attribution.
 */
export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization');
    const cookieHeader = request.headers.get('cookie');
    const cookieToken =
      request.cookies.get('token')?.value ||
      request.cookies.get('jwt')?.value ||
      request.cookies.get('access_token')?.value;

    if (!authHeader && !cookieToken && !cookieHeader) {
      return NextResponse.json(
        { error: 'Authentication required to attribute a referral' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { referrerId, newUserId } = body;

    if (!referrerId) {
      return NextResponse.json(
        { error: 'referrerId is required' },
        { status: 400 }
      );
    }

    const backendUrl = apiUrl('/referrals/track');
    const headers = {};

    if (authHeader) {
      headers['authorization'] = authHeader;
    } else if (cookieToken) {
      headers['authorization'] = `Bearer ${cookieToken}`;
    }

    if (cookieHeader) {
      headers['cookie'] = cookieHeader;
    }

    try {
      const response = await axios.post(
        backendUrl,
        { referrerId, newUserId },
        { headers, withCredentials: true }
      );

      return NextResponse.json(response.data, { status: response.status });
    } catch (backendError) {
      const status = backendError.response?.status || 500;
      const data = backendError.response?.data || { error: 'Failed to track referral' };
      return NextResponse.json(data, { status });
    }
  } catch (error) {
    console.error('Error tracking referral:', error);
    return NextResponse.json(
      { error: 'Failed to track referral' },
      { status: 500 }
    );
  }
}