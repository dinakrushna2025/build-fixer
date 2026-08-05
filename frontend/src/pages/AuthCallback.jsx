import React from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { API } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH.
 *
 * Renders when the URL fragment contains `session_id=`.
 *
 * Race conditions handled:
 *   - `hasProcessed` ref (per instance) guards StrictMode double-invoke.
 *   - `sessionStorage['mbr.auth.pending']` (module-lifetime) signals to
 *     AuthProvider that a /me check must be skipped until the exchange
 *     completes.
 *   - The hash is NOT stripped until AFTER the exchange resolves; `navigate()`
 *     replaces the URL on success (or the error screen navigates to /login),
 *     so a stray remount of AuthProvider still sees `session_id=` in the hash
 *     and defers to us.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = React.useRef(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    // Signal to AuthProvider that a session exchange is in flight. Set
    // synchronously so a StrictMode remount of AuthProvider observes it.
    try {
      window.sessionStorage?.setItem("mbr.auth.pending", "1");
    } catch {
      /* sessionStorage disabled — fall back to hash-based guard alone */
    }

    const clearPending = () => {
      try {
        window.sessionStorage?.removeItem("mbr.auth.pending");
      } catch {
        /* noop */
      }
    };

    const hash = window.location.hash || "";
    const m = hash.match(/session_id=([^&]+)/);
    const sid = m ? decodeURIComponent(m[1]) : null;

    if (!sid) {
      clearPending();
      setError("No session_id in the URL. Try signing in again.");
      return;
    }

    (async () => {
      try {
        const r = await axios.post(
          `${API}/auth/session`,
          {},
          {
            withCredentials: true,
            headers: { "X-Session-ID": sid },
          },
        );
        setUser(r.data);
        clearPending();
        // navigate() replaces the URL (including the fragment) — no need for
        // an explicit history.replaceState any more.
        navigate("/diagnose", { replace: true, state: { user: r.data } });
      } catch (e) {
        clearPending();
        const detail =
          e?.response?.data?.detail || e?.message || "Sign-in failed. Please try again.";
        setError(detail);
      }
    })();
  }, [navigate, setUser]);

  if (error) {
    return (
      <div className="h-screen w-screen grid place-items-center px-6 bg-background text-foreground">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 grid place-items-center">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Sign-in blocked</div>
              <div className="text-xs text-muted-foreground">Emergent Auth returned an error.</div>
            </div>
          </div>
          <div
            data-testid="auth-error"
            className="text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-3 rounded-md leading-relaxed"
          >
            {error}
          </div>
          <Button
            data-testid="auth-error-retry"
            className="w-full"
            onClick={() => navigate("/login", { replace: true })}
          >
            Back to sign-in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen grid place-items-center bg-background text-foreground">
      <div
        data-testid="auth-callback-loading"
        className="flex items-center gap-3 text-muted-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Signing you in…</span>
      </div>
    </div>
  );
}
