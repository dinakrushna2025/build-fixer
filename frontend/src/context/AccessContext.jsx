import React from "react";
import { safeCall, api } from "@/api";

const Ctx = React.createContext(null);

export function AccessProvider({ children }) {
  const [loading, setLoading] = React.useState(true);
  const [access, setAccess] = React.useState(null);

  // silent = background poll: do not flip the loading spinner, only update data
  const refresh = React.useCallback(async (silent = false) => {
    const r = await safeCall(() => api.get("/access/me"));
    setAccess((prev) => {
      const next = r.ok ? r.data : (prev || { is_admin: false, status: "error", allowed_tabs: [], tabs: [] });
      // avoid needless re-render if nothing actually changed
      if (prev && JSON.stringify(prev) === JSON.stringify(next)) return prev;
      return next;
    });
    if (!silent) setLoading(false);
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  // auto reload: keep polling so a newly granted/changed access shows up on its
  // own, no manual page refresh needed
  React.useEffect(() => {
    const id = setInterval(() => { refresh(true); }, 15_000);
    const onFocus = () => refresh(true);
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  return (
    <Ctx.Provider value={{ loading, access, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAccess() {
  return React.useContext(Ctx);
}
