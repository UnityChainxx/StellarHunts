// pages/success.js
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function NFTSuccessPage() {
  const router = useRouter();

  // --- Mock Data (Replace with real props or query params if needed) ---
  const mockNFT = {
    name: 'OnlyDust Genesis NFT',
    tokenId: '1024',
    image: 'https://via.placeholder.com/400x400.png?text=OnlyDust+NFT',
    explorerUrl: 'https://etherscan.io/token/0x1234567890abcdef?a=1024',
  };

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading delay
    const timeout = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timeout);
  }, []);

  if (!router.isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen text-white bg-gray-900">
        <p>Loading transaction details...</p>
      </div>
    );
  }

  const isConfirmed = router.query.status === 'confirmed';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-white bg-gray-900">
        <p>Loading NFT details...</p>
      </div>
    );
  }

  if (!isConfirmed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-emerald-900 text-white flex items-center justify-center px-6">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-4">
          <h1 className="text-3xl font-bold text-amber-400">Transaction pending</h1>
          <p className="text-gray-300">
            We only show the NFT success screen after the on-chain transaction is confirmed.
          </p>
          <button
            onClick={() => router.push('/')}
            className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-xl transition"
          >
            Go to Homepage
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-emerald-900 text-white flex items-center justify-center px-6">
      <div className="bg-gray-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-6">
        <h1 className="text-3xl font-bold text-green-400">🎉 NFT Minted Successfully!</h1>

        <div className="mt-4">
          <Image
            src={mockNFT.image}
            alt={mockNFT.name || 'Minted NFT'}
            width={400}
            height={400}
            className="w-full rounded-xl shadow-lg"
          />
          <p className="mt-4 text-lg font-semibold">{mockNFT.name}</p>
          <p className="text-sm text-gray-300">Token ID: #{mockNFT.tokenId}</p>
        </div>

        <div className="flex flex-col gap-4 mt-6">
          <a
            href={mockNFT.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-xl transition"
          >
            View on Explorer
          </a>
          <button
            onClick={() => router.push('/')}
            className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-xl transition"
          >
            Go to Homepage
          </button>
        </div>
      </div>
    </div>
  );
}
