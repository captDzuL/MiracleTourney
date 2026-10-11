"use client";

import "./globals.css";

// Last resort when the root layout itself fails. The root layout is a passthrough with no <html>/<body>, so this
// boundary must supply its own. Messages come from the same words as messages/id.json ("errorPage").
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="id">
      <body className="flex min-h-screen items-center justify-center bg-[#080c0e] px-4 text-white">
        <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
          <h1 className="text-2xl font-semibold text-white">Halaman ini bermasalah</h1>
          <p className="text-sm text-slate-400">Data belum dapat dimuat. Coba lagi beberapa saat.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-2 rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            Coba lagi
          </button>
        </div>
      </body>
    </html>
  );
}
