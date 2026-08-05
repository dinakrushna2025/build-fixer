import React from "react";
import axios from "axios";
import { API } from "@/api";

const AuthCtx = React.createContext(null);

// Module-level guard: survives StrictMode double-invoke. `/me` must fire at most
// once per full page load, otherwise a late 401 can overwrite the setUser done
// by AuthCallback and log the operator out immediately after a successful login.
let checkAuthRan = false;

/**
 * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH.
 *
 * State model (from Emergent Auth playbook):
 *   loading === true            -> still checking
 *   loading === false && !user  -> unauthenticated
 *   loading === false && user   -> authenticated
 *
 * Race-condition guards (both required):
 *   (1) When the URL fragment contains `session_id=`, skip `/me` — AuthCallback
 *       handles the exchange and calls setUser directly.
 *   (2) `sessionStorage['mbr.auth.pending'] === '1'` is set by AuthCallback
 *       synchronously and cleared on success/failure. Skip `/me` while it's set.
 *   (3) Module-level `checkAuthRan` prevents the effect from re-firing under
 *       React 19 StrictMode's double-invoke.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  const checkAuth = React.useCallback(async () => {
    try {
      const r = await axios.get(`${API}/auth/me`, { withCredentials: true });
      setUser(r.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (checkAuthRan) return;
    checkAuthRan = true;

    if (typeof window !== "undefined") {
      // CRITICAL: if returning from OAuth callback, skip /me — AuthCallback runs.
      if (window.location.hash?.includes("session_id=")) {
        setLoading(false);
        return;
      }
      // CRITICAL: if AuthCallback marked exchange as in-flight, skip /me.
      try {
        if (window.sessionStorage?.getItem("mbr.auth.pending") === "1") {
          setLoading(false);
          return;
        }
      } catch {
        /* sessionStorage disabled -> fall through to /me */
      }
    }
    checkAuth();
  }, [checkAuth]);

  const logout = React.useCallback(async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  const value = React.useMemo(
    () => ({ user, loading, setUser, checkAuth, logout }),
    [user, loading, checkAuth, logout],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => {
  const v = React.useContext(AuthCtx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
};
