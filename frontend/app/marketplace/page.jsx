'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import useAuthStore from '../../store/auth/auth-store';
import { apiClient, ApiError } from '../../lib/api';
import { ArrowLeft, Loader2, Tags } from 'lucide-react';

/**
 * NFT transfer/trade marketplace (issue #735).
 *
 * Peer-to-peer trading of reward NFTs backed by the backend
 * `/api/v1/nft-marketplace` endpoints: offer/accept flow, escrowed
 * settlement, and configurable marketplace fees.
 */

const STATUS_STYLES = {
  listed: 'bg-emerald-100 text-emerald-700',
  escrowed: 'bg-amber-100 text-amber-700',
  sold: 'bg-gray-200 text-gray-600',
  cancelled: 'bg-gray-200 text-gray-500',
};

function formatXlm(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)} XLM` : `${value} XLM`;
}

export default function MarketplacePage() {
  const { user, isAuthenticated, getDecryptedToken } = useAuthStore();
  const userId = user?.id;

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [offerAmounts, setOfferAmounts] = useState({});
  const [newListing, setNewListing] = useState({ nftId: '', name: '', price: '' });
  const [myOffers, setMyOffers] = useState([]);

  const notify = (kind, text) => setMessage({ kind, text });

  const authHeaders = useCallback(async () => {
    if (!isAuthenticated) return {};
    const token = await getDecryptedToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [isAuthenticated, getDecryptedToken]);

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/nft-marketplace/listings');
      setListings(response.data ?? []);
    } catch (error) {
      notify('error', error instanceof ApiError ? error.message : 'Could not load listings.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMyOffers = useCallback(async () => {
    if (!isAuthenticated || !userId) return;
    try {
      const headers = await authHeaders();
      const response = await apiClient.get(
        `/nft-marketplace/users/${encodeURIComponent(userId)}/offers`,
        { headers },
      );
      setMyOffers(response.data ?? []);
    } catch {
      // Offers list is best-effort; the marketplace itself stays usable.
    }
  }, [isAuthenticated, userId, authHeaders]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  useEffect(() => {
    loadMyOffers();
  }, [loadMyOffers]);

  const handleCreateListing = async (event) => {
    event.preventDefault();
    const price = Number(newListing.price);
    if (!newListing.nftId.trim() || !newListing.name.trim() || !(price > 0)) {
      notify('error', 'NFT ID, name and a positive price are required.');
      return;
    }
    try {
      const headers = await authHeaders();
      await apiClient.post(
        '/nft-marketplace/listings',
        {
          nftId: newListing.nftId.trim(),
          name: newListing.name.trim(),
          price,
        },
        { headers },
      );
      notify('success', 'Listing created.');
      setNewListing({ nftId: '', name: '', price: '' });
      loadListings();
    } catch (error) {
      notify('error', error instanceof ApiError ? error.message : 'Could not create listing.');
    }
  };

  const handleMakeOffer = async (listing) => {
    const amount = Number(offerAmounts[listing.id]);
    if (!(amount > 0)) {
      notify('error', 'Enter a positive offer amount.');
      return;
    }
    try {
      const headers = await authHeaders();
      await apiClient.post(
        `/nft-marketplace/listings/${listing.id}/offers`,
        { amount },
        { headers },
      );
      notify('success', `Offer of ${formatXlm(amount)} sent.`);
      setOfferAmounts((prev) => ({ ...prev, [listing.id]: '' }));
      loadMyOffers();
    } catch (error) {
      notify('error', error instanceof ApiError ? error.message : 'Could not send offer.');
    }
  };

  const handleWithdrawOffer = async (offerId) => {
    try {
      const headers = await authHeaders();
      await apiClient.delete(`/nft-marketplace/offers/${offerId}`, { headers });
      notify('success', 'Offer withdrawn.');
      loadMyOffers();
    } catch (error) {
      notify('error', error instanceof ApiError ? error.message : 'Could not withdraw offer.');
    }
  };

  const handleRespond = async (listing, decision) => {
    try {
      const headers = await authHeaders();
      const offers = await apiClient.get(
        `/nft-marketplace/listings/${listing.id}/offers`,
        { headers },
      );
      const pending = (offers.data ?? []).find((o) => o.status === 'pending');
      if (!pending) {
        notify('error', 'No pending offer to respond to.');
        return;
      }
      await apiClient.post(
        `/nft-marketplace/offers/${pending.id}/respond`,
        { decision },
        { headers },
      );
      notify(
        'success',
        decision === 'accept'
          ? 'Offer accepted — the NFT is in escrow. Settle to complete the trade.'
          : 'Offer rejected.',
      );
      loadListings();
    } catch (error) {
      notify('error', error instanceof ApiError ? error.message : 'Could not respond to offer.');
    }
  };

  const handleSettle = async (listing) => {
    try {
      const headers = await authHeaders();
      const result = await apiClient.post(
        `/nft-marketplace/listings/${listing.id}/settle`,
        {},
        { headers },
      );
      notify(
        'success',
        `Escrow settled: seller receives ${formatXlm(result.data.sellerProceeds)} after a ${formatXlm(result.data.feeCharged)} fee.`,
      );
      loadListings();
    } catch (error) {
      notify('error', error instanceof ApiError ? error.message : 'Could not settle escrow.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
              <Tags className="h-7 w-7 text-indigo-600" />
              NFT Marketplace
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Trade reward NFTs peer-to-peer. Offers are settled through escrow with a
              configurable marketplace fee.
            </p>
          </div>
          <Link href="/" className="flex items-center gap-1 text-sm text-indigo-600 hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back home
          </Link>
        </div>

        {message && (
          <p
            role="status"
            className={`mt-4 rounded-md px-3 py-2 text-sm ${
              message.kind === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </p>
        )}

        {!isAuthenticated && (
          <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
            Sign in to list NFTs and make offers.
          </p>
        )}

        {/* List an NFT */}
        {isAuthenticated && (
          <form
            onSubmit={handleCreateListing}
            className="mt-6 grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-4"
          >
            <input
              type="text"
              value={newListing.nftId}
              onChange={(e) => setNewListing({ ...newListing, nftId: e.target.value })}
              placeholder="NFT ID"
              aria-label="NFT ID"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              required
            />
            <input
              type="text"
              value={newListing.name}
              onChange={(e) => setNewListing({ ...newListing, name: e.target.value })}
              placeholder="NFT name"
              aria-label="NFT name"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              required
            />
            <input
              type="number"
              step="any"
              min="0"
              value={newListing.price}
              onChange={(e) => setNewListing({ ...newListing, price: e.target.value })}
              placeholder="Asking price (XLM)"
              aria-label="Asking price in XLM"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              required
            />
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              List NFT
            </button>
          </form>
        )}

        {/* Listings */}
        {loading ? (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading listings…
          </div>
        ) : listings.length === 0 ? (
          <p className="mt-8 text-center text-sm text-gray-500">No open listings yet.</p>
        ) : (
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <li
                key={listing.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{listing.name}</h3>
                    <p className="text-xs text-gray-400">NFT #{listing.nftId}</p>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLES[listing.status] || 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {listing.status}
                  </span>
                </div>
                <p className="mt-2 text-lg font-bold text-gray-900">
                  {formatXlm(listing.price)}
                </p>
                <p className="text-xs text-gray-500">Seller: {listing.sellerId}</p>

                {listing.status === 'listed' && isAuthenticated && listing.sellerId !== userId && (
                  <div className="mt-3 flex gap-2">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={offerAmounts[listing.id] ?? ''}
                      onChange={(e) =>
                        setOfferAmounts((prev) => ({ ...prev, [listing.id]: e.target.value }))
                      }
                      placeholder="Your offer (XLM)"
                      aria-label={`Offer amount for ${listing.name}`}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => handleMakeOffer(listing)}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      Offer
                    </button>
                  </div>
                )}

                {isAuthenticated && listing.sellerId === userId && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {listing.status === 'listed' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleRespond(listing, 'accept')}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          Accept top offer
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRespond(listing, 'reject')}
                          className="rounded-md bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300"
                        >
                          Reject top offer
                        </button>
                      </>
                    )}
                    {listing.status === 'escrowed' && (
                      <button
                        type="button"
                        onClick={() => handleSettle(listing)}
                        className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                      >
                        Settle escrow
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* My offers */}
        {isAuthenticated && myOffers.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-gray-900">My offers</h2>
            <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {myOffers.map((offer) => (
                <li key={offer.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="text-gray-700">
                    {formatXlm(offer.amount)} on listing{' '}
                    <span className="font-mono text-xs">{offer.listingId}</span>
                    <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {offer.status}
                    </span>
                  </span>
                  {offer.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => handleWithdrawOffer(offer.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Withdraw
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
