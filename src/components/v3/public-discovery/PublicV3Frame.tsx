import type { ReactNode } from "react";
import { BrandLogo } from "@/components/v3/BrandLogo";
import { cn } from "@/lib/utils";
import type { PublicV3NavigationItem } from "./PublicV3Primitives";

export type PublicV3FrameProps = {
  children: ReactNode;
  brandHref: string;
  homeLabel: string;
  skipLabel: string;
  navigationLabel: string;
  navigation: readonly PublicV3NavigationItem[];
  headerEnd?: ReactNode;
  footer?: ReactNode;
  mainId?: string;
  className?: string;
};

/** Owns public landmarks; compose outside any existing main/header shell. */
export function PublicV3Frame({ children, brandHref, homeLabel, skipLabel, navigationLabel, navigation, headerEnd, footer, mainId = "mpv3-main", className }: PublicV3FrameProps) {
  const brandIsCurrent = navigation.some((item) => item.active && item.href === brandHref);
  return <div className={cn("miracle-public-v3", className)}>
    <a className="mpv3-skip" href={`#${mainId}`}>{skipLabel}</a>
    <header className="mpv3-header flex"><div className="mpv3-wrap mpv3-header-inner">
      <a className="mpv3-brand" href={brandHref} aria-label={homeLabel} aria-current={brandIsCurrent ? "page" : undefined}><BrandLogo /></a>
      <nav className="mpv3-global-nav" aria-label={navigationLabel}>{navigation.map((item) => <a key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}>{item.label}</a>)}</nav>
      {headerEnd && <div className="mpv3-header-end">{headerEnd}</div>}
    </div></header>
    <main className="mpv3-wrap mpv3-main" id={mainId} tabIndex={-1}>{children}</main>
    {footer && <footer className="mpv3-wrap mpv3-footer">{footer}</footer>}
  </div>;
}
