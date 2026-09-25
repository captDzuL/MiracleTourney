"use client";

import { useEffect, useState } from "react";

export function HydrationGate(
  { children, className, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>,
): React.JSX.Element {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  return (
    <div
      {...props}
      aria-busy={!hydrated}
      className={`${className ?? ""} ${hydrated ? "" : "pointer-events-none"}`.trim()}
      data-hydration-ready={hydrated ? "true" : "false"}
      inert={hydrated ? undefined : true}
    >
      {children}
    </div>
  );
}
