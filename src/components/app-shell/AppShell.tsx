import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";
import "./AppShell.css";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-shell__body">
        <Sidebar />
        <main className="app-shell__content">{children}</main>
      </div>
    </div>
  );
}
