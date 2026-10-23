'use client';

import { useCallback, useEffect, useState } from 'react';
import useAuthStore from '../../../store/auth/auth-store';
import AdminLayout from '../../../components/admin/AdminLayout';
import { apiClient, ApiError } from '../../../lib/api';
import { Coins, History, Send } from 'lucide-react';

/**
 * Admin reward adjustments (#742).
 *
 * Grants or revokes reward points for a user with a mandatory reason, and
 * shows the immutable audit trail of past adjustments returned by the
 * admin audit-log endpoint (`action=reward_shop.points_adjusted`).
 */
export default function AdminRewardAdjustmentsPage() {
  const { user, isAuthenticated, getDecryptedToken } = useAuthStore();
  const [authorized, setAuthorized] = useState(false);

  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const isAdmin = user?.role === 'admin' || user?.roles?.includes('admin');
    if (!isAuthenticated || !isAdmin) {
      setAuthorized(false);
    } else {
      setAuthorized(true);
    }
  }, [isAuthenticated, user]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const token = await getDecryptedToken();
      const response = await apiClient.get(
        '/admin/audit-logs?action=reward_shop.points_adjusted&limit=20',
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      setHistory(response.data?.data ?? []);
    } catch (error) {
      setMessage({
        kind: 'error',
        text:
          error instanceof ApiError
            ? `Could not load audit history: ${error.message}`
            : 'Could not load audit history.',
      });
    } finally {
      setHistoryLoading(false);
    }
  }, [getDecryptedToken]);

  useEffect(() => {
    if (authorized) loadHistory();
  }, [authorized, loadHistory]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage(null);

    const parsedAmount = Number(amount);
    if (!userId.trim()) {
      setMessage({ kind: 'error', text: 'A user ID is required.' });
      return;
    }
    if (!Number.isInteger(parsedAmount) || parsedAmount === 0) {
      setMessage({
        kind: 'error',
        text: 'Amount must be a non-zero integer (positive to grant, negative to revoke).',
      });
      return;
    }
    if (!reason.trim() || reason.trim().length < 5) {
      setMessage({ kind: 'error', text: 'A reason of at least 5 characters is required.' });
      return;
    }

    setSubmitting(true);
    try {
      const token = await getDecryptedToken();
      const response = await apiClient.post(
        `/reward-shop/admin/users/${encodeURIComponent(userId.trim())}/adjust-points`,
        { amount: parsedAmount, reason: reason.trim() },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      setMessage({
        kind: 'success',
        text: `Adjustment applied: ${parsedAmount > 0 ? '+' : ''}${response.data.appliedAmount} points for ${response.data.userId}. New balance: ${response.data.points}.`,
      });
      setAmount('');
      setReason('');
      loadHistory();
    } catch (error) {
      setMessage({
        kind: 'error',
        text:
          error instanceof ApiError
            ? `Adjustment failed: ${error.message}`
            : 'Adjustment failed.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!authorized) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reward Adjustments</h1>
          <p className="mt-1 text-sm text-gray-500">
            Grant or revoke reward points with a mandatory reason. Every adjustment is recorded
            in the immutable audit log with your admin identity and the before/after balances.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Adjustment form */}
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <Coins className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Apply an adjustment</h2>
            </div>

            <div>
              <label htmlFor="adjust-user-id" className="block text-sm font-medium text-gray-700">
                User ID
              </label>
              <input
                id="adjust-user-id"
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g. userA or a UUID"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label htmlFor="adjust-amount" className="block text-sm font-medium text-gray-700">
                Amount (signed)
              </label>
              <input
                id="adjust-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 100 or -50"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Positive grants points; negative revokes them. Revocations are clamped at zero.
              </p>
            </div>

            <div>
              <label htmlFor="adjust-reason" className="block text-sm font-medium text-gray-700">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                id="adjust-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Why is this adjustment being made? (min. 5 characters, stored in the audit log)"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                required
              />
            </div>

            {message && (
              <p
                role="status"
                className={`text-sm rounded-md px-3 py-2 ${
                  message.kind === 'success'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700'
                }`}
              >
                {message.text}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
              {submitting ? 'Applying…' : 'Apply adjustment'}
            </button>
          </form>

          {/* Audit trail */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <History className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Recent adjustments</h2>
              </div>
              <button
                type="button"
                onClick={loadHistory}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                Refresh
              </button>
            </div>

            {historyLoading ? (
              <p className="mt-4 text-sm text-gray-500">Loading audit history…</p>
            ) : history.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">No adjustments recorded yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-gray-100">
                {history.map((entry) => (
                  <li key={entry.id} className="py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">
                        {entry.meta?.amount > 0 ? '+' : ''}
                        {entry.meta?.amount} → {entry.meta?.targetId}
                      </span>
                      <span className="text-xs text-gray-400">
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}
                      </span>
                    </div>
                    <p className="mt-1 text-gray-600">{entry.meta?.reason}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      by {entry.userId} · {entry.meta?.previousBalance} →{' '}
                      {entry.meta?.newBalance}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
