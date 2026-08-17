"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className, pendingLabel = "Memproses...", title }: { children: React.ReactNode; className?: string; pendingLabel?: string; title?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className} title={title}>
      {pending ? pendingLabel : children}
    </button>
  );
}
