import React from "react";
import { safeCall, api } from "@/api";

const Ctx = React.createContext(null);

export function AccessProvider({ children }) {
  const [loading, setLoading] = React.useState(true);
  const [access, setAccess] = React.useState(null);

  const refresh = React.useCallback(async () => {
    const r = await safeCall(() => api.get("/access/me"));
    setAccess(r.ok ? r.data : { is_admin: false, status: "error", allowed_tabs: [], tabs: [] });
    setLoading(false);
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  return (
    <Ctx.Provider value={{ loading, access, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAccess() {
  return React.useContext(Ctx);
}
