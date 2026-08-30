import { PanelShell } from "@/components/panel/PanelShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
