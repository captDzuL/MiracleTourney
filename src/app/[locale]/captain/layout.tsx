import { PanelShell } from "@/components/panel/PanelShell";

export default function CaptainLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
