"use client";

import { useEffect, useState } from "react";

export function HydrationGate({ children, className }: { children: React.ReactNode; className?: string }) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  return (
    <div
      aria-busy={!hydrated}
      className={`${className ?? ""} ${hydrated ? "" : "pointer-events-none"}`.trim()}
      inert={hydrated ? undefined : true}
    >
      {children}
    </div>
  );
}
