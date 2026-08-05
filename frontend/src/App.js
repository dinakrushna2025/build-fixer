import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import "@/App.css";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import Diagnose from "@/pages/Diagnose";
import FindExpo from "@/pages/FindExpo";
import FixIdentity from "@/pages/FixIdentity";
import Keystore from "@/pages/Keystore";
import CredsRetry from "@/pages/CredsRetry";
import FingerprintPage from "@/pages/Fingerprint";
import PemKms from "@/pages/PemKms";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

function Shell() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main
          data-testid="main"
          className="flex-1 overflow-y-auto thin-scroll px-8 py-6 max-w-[1440px] w-full mx-auto"
        >
          <Routes>
            <Route path="/" element={<Navigate to="/diagnose" replace />} />
            <Route path="/diagnose" element={<Diagnose />} />
            <Route path="/expo" element={<FindExpo />} />
            <Route path="/identity" element={<FixIdentity />} />
            <Route path="/keystore" element={<Keystore />} />
            <Route path="/creds" element={<CredsRetry />} />
            <Route path="/fingerprint" element={<FingerprintPage />} />
            <Route path="/pem" element={<PemKms />} />
            <Route path="*" element={<Navigate to="/diagnose" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Detect the OAuth return fragment SYNCHRONOUSLY (before any Route matching).
  // Playbook: `session_id=` lives in window.location.hash, not the URL path.
  if (typeof window !== "undefined" && window.location.hash?.includes("session_id=")) {
    return (
      <>
        <AuthCallback />
        <Toaster position="top-right" richColors closeButton />
      </>
    );
  }

  if (loading) {
    return (
      <div className="h-screen w-screen grid place-items-center bg-background text-muted-foreground">
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Checking session…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    // Only allow /login. Anything else redirects to /login.
    if (location.pathname !== "/login") {
      return <Navigate to="/login" replace />;
    }
    return (
      <>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
        <Toaster position="top-right" richColors closeButton />
      </>
    );
  }

  // Authenticated: if user somehow lands on /login, punt to /diagnose.
  if (location.pathname === "/login") {
    return <Navigate to="/diagnose" replace />;
  }

  return (
    <>
      <Shell />
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}

export default App;
