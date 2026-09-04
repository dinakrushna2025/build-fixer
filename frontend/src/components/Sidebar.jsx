import React from "react";
import { NavLink } from "react-router-dom";
import {
  Stethoscope, Search, Fingerprint, KeyRound, RefreshCw, FileKey2, ShieldAlert,
  GitFork, Power, Globe, CreditCard, Zap, Cpu, RotateCw, HardDrive, Terminal,
  PanelLeftClose, PanelLeftOpen, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccess } from "@/context/AccessContext";

const NAV = [
  { to: "/diagnose", label: "Diagnose", icon: Stethoscope, testId: "nav-diagnose" },
  { to: "/expo", label: "Find Account", icon: Search, testId: "nav-expo" },
  { to: "/identity", label: "Fix App Identity", icon: FileKey2, testId: "nav-identity" },
  { to: "/keystore", label: "Keystore Manager", icon: KeyRound, testId: "nav-keystore" },
  { to: "/creds", label: "Creds & Retry (iOS)", icon: RefreshCw, testId: "nav-creds" },
  { to: "/fingerprint", label: "Signing Fingerprint", icon: Fingerprint, testId: "nav-fingerprint" },
  { to: "/pem", label: "PEM / KMS Tools", icon: ShieldAlert, testId: "nav-pem" },
  { to: "/forkchain", label: "Fork Chain", icon: GitFork, testId: "nav-forkchain" },
  { to: "/domain", label: "Domain Remove", icon: Globe, testId: "nav-domain" },
  { to: "/stripe", label: "Stripe Sandbox", icon: CreditCard, testId: "nav-stripe" },
  { to: "/env-wake", label: "Wake / Restart", icon: Power, testId: "nav-env-wake" },
  { to: "/env-kick", label: "Kick", icon: Zap, testId: "nav-env-kick" },
  { to: "/env-bump", label: "Bump to large", icon: Cpu, testId: "nav-env-bump" },
  { to: "/env-hitl", label: "HITL continue", icon: RotateCw, testId: "nav-env-hitl" },
  { to: "/dbmgr", label: "DB Manager", icon: HardDrive, testId: "nav-dbmgr" },
];

export default function Sidebar() {
  const [open, setOpen] = React.useState(true);
  const acc = useAccess();
  const access = acc?.access;
  const isAdmin = !!access?.is_admin;
  const allowed = new Set(access?.allowed_tabs || []);
  const items = NAV.filter((n) => isAdmin || allowed.has(n.to));

  return (
    <aside
      data-testid="sidebar"
      className={cn(
        "shrink-0 border-r border-border bg-card flex flex-col transition-all duration-200",
        open ? "w-[248px]" : "w-16",
      )}
    >
      <div className={cn("h-14 flex items-center border-b border-border", open ? "gap-2 px-5" : "justify-center px-0")}>
        {open && (
          <>
            <div className="h-7 w-7 rounded-md bg-primary text-primary-foreground grid place-items-center">
              <Terminal className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Mobile Build Resolver</div>
              <div className="text-[10px] text-muted-foreground mono uppercase tracking-widest">support tools</div>
            </div>
          </>
        )}
        <button
          onClick={() => setOpen(!open)}
          data-testid="sidebar-toggle"
          title={open ? "Collapse sidebar" : "Expand sidebar"}
          className={cn("text-muted-foreground hover:text-foreground", open ? "ml-auto" : "")}
        >
          {open ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
        </button>
      </div>

      <nav className={cn("space-y-0.5 flex-1 overflow-y-auto", open ? "p-3" : "p-2")}>
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            data-testid={n.testId}
            title={n.label}
            className={({ isActive }) =>
              cn(
                "group flex items-center rounded-md text-sm transition-colors",
                open ? "gap-3 px-3 py-2" : "justify-center px-0 py-2",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground/70 hover:text-foreground hover:bg-secondary",
              )
            }
          >
            <n.icon className="h-4 w-4 shrink-0" />
            {open && <span>{n.label}</span>}
          </NavLink>
        ))}
        {!items.length && open && (
          <p className="text-xs text-muted-foreground px-3 py-3">No tools assigned yet.</p>
        )}
      </nav>

      {isAdmin && (
        <div className={cn("border-t border-border", open ? "p-3" : "p-2")}>
          <NavLink
            to="/access"
            data-testid="nav-access"
            title="Access requests"
            className={({ isActive }) => cn(
              "w-full flex items-center rounded-md text-sm",
              open ? "gap-3 px-3 py-2" : "justify-center px-0 py-2",
              isActive ? "bg-primary/10 text-primary font-medium" : "text-foreground/80 hover:text-foreground hover:bg-secondary",
            )}
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            {open && <span>Access requests</span>}
          </NavLink>
        </div>
      )}

      {open && (
        <div className="p-3 border-t border-border text-[11px] text-muted-foreground leading-relaxed">
          <div className="mt-1">Behind VPN only — never exposed to end users.</div>
        </div>
      )}

    </aside>
  );
}
