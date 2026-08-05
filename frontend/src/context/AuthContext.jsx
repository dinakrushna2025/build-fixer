import React from "react";
import axios from "axios";
import { API } from "@/api";

const AuthCtx = React.createContext(null);

/**
 * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH.
 *
 * State model (from Emergent Auth playbook):
 *   loading === true            -> still checking
 *   loading === false && !user  -> unauthenticated
 *   loading === false && user   -> authenticated
 *
 * Race-condition guard: if the URL fragment contains `session_id=`, the
 * AuthCallback screen handles the exchange. AuthProvider must SKIP the
 * /me check in that case so it doesn't 401 before the cookie is set.
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
    // CRITICAL: if returning from OAuth callback, skip /me — AuthCallback runs.
    if (typeof window !== "undefined" && window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
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
