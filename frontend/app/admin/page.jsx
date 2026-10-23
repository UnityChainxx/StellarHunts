'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useAuthStore from '../../store/auth/auth-store';
import AdminLayout from '../../components/admin/AdminLayout';
import { Sliders, FileText, PlusCircle, ShieldCheck, Coins } from 'lucide-react';

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const isAdmin = user?.role === 'admin' || user?.roles?.includes('admin');
    if (!isAuthenticated || !isAdmin) {
      router.push('/login');
    } else {
      setAuthorized(true);
    }
  }, [isAuthenticated, user, router]);

  if (!authorized) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Control Center</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage puzzles, review community submissions, and tune difficulty based on on-chain telemetry.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link
            href="/admin/puzzle-difficulty"
            className="block p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-indigo-500 hover:shadow-md transition-all group"
          >
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg w-fit group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <Sliders className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">Difficulty Auto-Suggestion</h3>
            <p className="mt-2 text-sm text-gray-500">
              Analyze puzzle success rates from attempt event logs and rebalance tiers out of bounds.
            </p>
          </Link>

          <Link
            href="/admin/puzzle-review"
            className="block p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-indigo-500 hover:shadow-md transition-all group"
          >
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg w-fit group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">Puzzle Review & Moderation</h3>
            <p className="mt-2 text-sm text-gray-500">
              Review and moderate submitted community puzzles, solutions, and hints.
            </p>
          </Link>

          <Link
            href="/admin/reward-adjustments"
            className="block p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-amber-500 hover:shadow-md transition-all group"
          >
            <div className="p-3 bg-amber-50 text-amber-600 rounded-lg w-fit group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <Coins className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">Reward Adjustments</h3>
            <p className="mt-2 text-sm text-gray-500">
              Grant or revoke player points with a mandatory reason; every change is audit-logged.
            </p>
          </Link>

          <Link
            href="/admin/puzzle-submission"
            className="block p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-indigo-500 hover:shadow-md transition-all group"
          >
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg w-fit group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <PlusCircle className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">Create New Puzzle</h3>
            <p className="mt-2 text-sm text-gray-500">
              Author and publish new cryptographic puzzles directly to the platform.
            </p>
          </Link>
        </div>
      </div>
    </AdminLayout>
  );
}
