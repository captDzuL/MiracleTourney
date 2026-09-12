"use client";

import { Check, LinkIcon } from "lucide-react";
import { useState } from "react";

export function CopyRegistrationLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const url = new URL(path, window.location.origin).toString();
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={copyLink}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-400 px-3.5 text-sm font-semibold text-cyan-950 shadow-sm transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
    >
      {copied ? <Check className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
      {copied ? "Link tersalin" : "Copy Registration Link"}
    </button>
  );
}
