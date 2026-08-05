import React, { createContext, useContext, useEffect, useState } from "react";

const AppCtx = createContext(null);

export const AppProvider = ({ children }) => {
  const [jobId, setJobId] = useState(() => localStorage.getItem("mbr.jobId") || "");
  const [dark, setDark] = useState(
    () => localStorage.getItem("mbr.dark") === "1",
  );

  useEffect(() => {
    localStorage.setItem("mbr.jobId", jobId);
  }, [jobId]);
  useEffect(() => {
    localStorage.setItem("mbr.dark", dark ? "1" : "0");
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <AppCtx.Provider value={{ jobId, setJobId, dark, setDark }}>
      {children}
    </AppCtx.Provider>
  );
};

export const useApp = () => {
  const v = useContext(AppCtx);
  if (!v) throw new Error("useApp outside provider");
  return v;
};
