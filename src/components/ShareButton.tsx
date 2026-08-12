"use client";

import { Share2 } from "lucide-react";

export function ShareButton({ label = "Bagikan" }: { label?: string }) {
  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: document.title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700"
    >
      <Share2 className="h-4 w-4" />
      {label}
    </button>
  );
}
