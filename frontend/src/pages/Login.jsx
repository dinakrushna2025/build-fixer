import React from "react";
import { Terminal, ShieldCheck, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH.
 *
 * Sends the user to Emergent's Google SSO. We ONLY use window.location.origin +
 * "/diagnose" as the redirect_url — no env fallback, no hardcoded host.
 */
export default function Login() {
  const startLogin = () => {
    const redirectUrl = window.location.origin + "/";
    window.location.href =
      "https://auth.emergentagent.com/?redirect=" + encodeURIComponent(redirectUrl);
  };

  return (
    <div className="h-screen w-screen bg-background text-foreground flex items-center justify-center px-6 grid-backdrop">
      <div
        data-testid="login-card"
        className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-primary text-primary-foreground grid place-items-center">
            <Terminal className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Support Build Resolver</h1>
            <p className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              internal support tools
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Continue with your Emergent Google account. Access is limited to{" "}
            <span className="mono text-foreground">@emergent.sh</span> addresses.
          </p>
        </div>

        <Button
          data-testid="login-btn"
          onClick={startLogin}
          className="mt-6 w-full h-11 gap-2 text-sm font-medium"
        >
          <LogIn className="h-4 w-4" /> Continue with Emergent
        </Button>

        <div className="mt-8 rounded-md border border-border bg-secondary/40 px-3 py-2.5 flex items-start gap-2.5 text-[12px] text-muted-foreground leading-relaxed">
          <ShieldCheck className="h-4 w-4 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            VPN-only tool. Session is HttpOnly, Secure, and expires after 7 days. Every action is
            audit-logged against your @emergent.sh identity.
          </span>
        </div>
      </div>
    </div>
  );
}
