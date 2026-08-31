"use client";
import React from "react";
import Link from "next/link";
import { Home, RefreshCcw } from "lucide-react";

export default function GlobalError({ error, reset }) {
  const reload = () => {
    if (typeof window !== 'undefined') {
      const count = parseInt(sessionStorage.getItem('error_retry_count') || '0', 10);
      if (count >= 3) {
        alert('Multiple errors occurred. Please try returning home or contacting support.');
        return;
      }
      sessionStorage.setItem('error_retry_count', (count + 1).toString());
      window.location.reload();
    }
  };

  return (
    <html>
      <body>
        <main className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-black via-purple-900 to-black">
          <div className="relative flex min-h-screen flex-col items-center justify-center p-6">
            <div className="backdrop-blur-lg bg-white/10 p-8 sm:p-12 rounded-2xl shadow-2xl border border-white/20 max-w-2xl w-full text-center">
              <h1 className="text-8xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">Error</h1>
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-4">Oh no!</h2>
                <p className="text-lg text-gray-300">A critical error occurred.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Link href="/" className="w-full sm:w-auto bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-4 px-8 rounded-lg shadow-lg hover:shadow-purple-500/50 flex items-center justify-center gap-2">
                  <Home size={20} /> Return Home
                </Link>
                <button onClick={reload} className="w-full sm:w-auto border border-white/20 text-white hover:bg-white/10 bg-transparent font-bold py-4 px-8 rounded-lg flex items-center justify-center gap-2">
                  <RefreshCcw size={20} /> Try Again
                </button>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
