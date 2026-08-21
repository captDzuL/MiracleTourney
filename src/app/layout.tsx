import "./globals.css";

// Root layout is a passthrough — <html> and <body> live in [locale]/layout.tsx
// so the lang attribute can be set dynamically per locale.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
