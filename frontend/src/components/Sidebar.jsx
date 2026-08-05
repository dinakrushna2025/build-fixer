import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Stethoscope,
  Search,
  Fingerprint,
  KeyRound,
  RefreshCw,
  FileKey2,
  ShieldAlert,
  GitFork,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/diagnose", label: "Diagnose", icon: Stethoscope, testId: "nav-diagnose" },
  { to: "/expo", label: "Find Account", icon: Search, testId: "nav-expo" },
  { to: "/identity", label: "Fix App Identity", icon: FileKey2, testId: "nav-identity" },
  { to: "/keystore", label: "Keystore Manager", icon: KeyRound, testId: "nav-keystore" },
  { to: "/creds", label: "Creds & Retry (iOS)", icon: RefreshCw, testId: "nav-creds" },
  { to: "/fingerprint", label: "Signing Fingerprint", icon: Fingerprint, testId: "nav-fingerprint" },
  { to: "/pem", label: "PEM / KMS Tools", icon: ShieldAlert, testId: "nav-pem" },
  { to: "/forkchain", label: "Fork Chain", icon: GitFork, testId: "nav-forkchain" },
];

export default function Sidebar() {
  const loc = useLocation();
  return (
    <aside
      data-testid="sidebar"
      className="w-[248px] shrink-0 border-r border-border bg-card flex flex-col"
    >
      <div className="h-14 flex items-center gap-2 px-5 border-b border-border">
        <div className="h-7 w-7 rounded-md bg-primary text-primary-foreground grid place-items-center">
          <Terminal className="h-4 w-4" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">
            Mobile Build Resolver
          </div>
          <div className="text-[10px] text-muted-foreground mono uppercase tracking-widest">
            support tools
          </div>
        </div>
      </div>

      <nav className="p-3 space-y-0.5 flex-1">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            data-testid={n.testId}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground/70 hover:text-foreground hover:bg-secondary",
              )
            }
          >
            <n.icon className="h-4 w-4" />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-border text-[11px] text-muted-foreground leading-relaxed">
        <div className="mt-1">Behind VPN only — never exposed to end users.</div>
      </div>
    </aside>
  );
}
