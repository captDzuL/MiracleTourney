import { cn } from "@/lib/utils";

export type SurfaceVariant = "default" | "raised" | "inset";
export type SurfaceElement = "article" | "div" | "section";

const variantClasses: Record<SurfaceVariant, string> = {
  default: "border border-[var(--color-border)] bg-[var(--color-surface)]",
  raised:
    "border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg shadow-[var(--color-bg)]/20",
  inset: "bg-[var(--color-surface-subtle)]",
};

export type SurfaceProps = React.HTMLAttributes<HTMLElement> & {
  as?: SurfaceElement;
  variant?: SurfaceVariant;
};

export function Surface({ as: Element = "section", className, variant = "default", ...props }: SurfaceProps) {
  return (
    <Element
      {...props}
      className={cn("rounded-xl p-5", variantClasses[variant], className)}
    />
  );
}
