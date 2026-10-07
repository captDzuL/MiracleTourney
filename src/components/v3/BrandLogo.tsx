import { cn } from "@/lib/utils";
import Image, { type ImageProps } from "next/image";

export type BrandLogoVariant = "horizontal" | "symbol";

const logoAssets: Record<BrandLogoVariant, { src: string; width: number; height: number }> = {
  horizontal: { src: "/logo/miracle-horizontal.svg", width: 164, height: 46 },
  symbol: { src: "/logo/miracle-symbol.svg", width: 48, height: 41 },
};

export type BrandLogoProps = Omit<ImageProps, "alt" | "height" | "src" | "width"> & {
  variant?: BrandLogoVariant;
  alt?: string;
};

export function BrandLogo({ alt = "Miracle", className, variant = "horizontal", ...props }: BrandLogoProps) {
  const asset = logoAssets[variant];

  return <Image {...props} alt={alt} className={cn("block h-auto", className)} height={asset.height} src={asset.src} width={asset.width} loading={props.loading ?? "eager"} unoptimized />;
}
