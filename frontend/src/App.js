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
import ForkChain from "@/pages/ForkChain";
import Domain from "@/pages/Domain";
import Stripe from "@/pages/Stripe";
import EnvWake from "@/pages/EnvWake";
import EnvKick from "@/pages/EnvKick";
import EnvBump from "@/pages/EnvBump";
import EnvHitl from "@/pages/EnvHitl";
import DbManager from "@/pages/DbManager";
import AccessAdmin from "@/pages/AccessAdmin";
import Export from "@/pages/Export";
import DomainFix from "@/pages/DomainFix";
import DnsRecords from "@/pages/DnsRecords";
import CachePurge from "@/pages/CachePurge";
import SecretsView from "@/pages/SecretsView";
import Help from "@/pages/Help";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/context/AuthContext";
import { AccessProvider, useAccess } from "@/context/AccessContext";
import { Loader2 } from "lucide-react";

function NoAccess() {
  return (
    <div className="py-16 text-center text-muted-foreground">
      You do not have access to this tool. Ask an admin to grant it.
    </div>
  );
}

// Per-tab route guard: only render the page if the user is an admin or the tab
// is in their granted allowed_tabs. This stops a non-granted user from seeing a
// page by landing on its route directly (the sidebar already hides the link).
function RequireTab({ tab, children }) {
  const { access } = useAccess();
  const ok = !!access && (access.is_admin || (access.allowed_tabs || []).includes(tab));
  return ok ? children : <NoAccess />;
}

function RequireAdmin({ children }) {
  const { access } = useAccess();
  return access?.is_admin ? children : <NoAccess />;
}

// Default landing: send the user to their first granted tab, not a hardcoded one.
function Landing() {
  const { access } = useAccess();
  if (access?.is_admin) return <Navigate to="/diagnose" replace />;
  // Land on the FIRST tab in sidebar order that the user actually has, not just
  // whatever order the grant was saved in.
  const allowed = new Set(access?.allowed_tabs || []);
  const ordered = (access?.tabs || []).map((t) => t.key).filter((k) => allowed.has(k));
  const first = ordered[0] || (access?.allowed_tabs || [])[0];
  if (first) return <Navigate to={first} replace />;
  return (
    <div className="py-16 text-center text-muted-foreground">
      No tools assigned yet. Ask an admin to grant access.
    </div>
  );
}

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
            <Route path="/" element={<Landing />} />
            <Route path="/diagnose" element={<RequireTab tab="/diagnose"><Diagnose /></RequireTab>} />
            <Route path="/expo" element={<RequireTab tab="/expo"><FindExpo /></RequireTab>} />
            <Route path="/identity" element={<RequireTab tab="/identity"><FixIdentity /></RequireTab>} />
            <Route path="/keystore" element={<RequireTab tab="/keystore"><Keystore /></RequireTab>} />
            <Route path="/creds" element={<RequireTab tab="/creds"><CredsRetry /></RequireTab>} />
            <Route path="/fingerprint" element={<RequireTab tab="/fingerprint"><FingerprintPage /></RequireTab>} />
            <Route path="/pem" element={<RequireTab tab="/pem"><PemKms /></RequireTab>} />
            <Route path="/forkchain" element={<RequireTab tab="/forkchain"><ForkChain /></RequireTab>} />
            <Route path="/domain" element={<RequireTab tab="/domain"><Domain /></RequireTab>} />
            <Route path="/stripe" element={<RequireTab tab="/stripe"><Stripe /></RequireTab>} />
            <Route path="/env-wake" element={<RequireTab tab="/env-wake"><EnvWake /></RequireTab>} />
            <Route path="/env-kick" element={<RequireTab tab="/env-kick"><EnvKick /></RequireTab>} />
            <Route path="/env-bump" element={<RequireTab tab="/env-bump"><EnvBump /></RequireTab>} />
            <Route path="/env-hitl" element={<RequireTab tab="/env-hitl"><EnvHitl /></RequireTab>} />
            <Route path="/dbmgr" element={<RequireTab tab="/dbmgr"><DbManager /></RequireTab>} />
            <Route path="/export" element={<RequireTab tab="/export"><Export /></RequireTab>} />
            <Route path="/domainfix" element={<RequireTab tab="/domainfix"><DomainFix /></RequireTab>} />
            <Route path="/dns" element={<RequireTab tab="/dns"><DnsRecords /></RequireTab>} />
            <Route path="/cachepurge" element={<RequireTab tab="/cachepurge"><CachePurge /></RequireTab>} />
            <Route path="/secrets" element={<RequireTab tab="/secrets"><SecretsView /></RequireTab>} />
            <Route path="/access" element={<RequireAdmin><AccessAdmin /></RequireAdmin>} />
            <Route path="*" element={<Landing />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function Pending({ email }) {
  const { logout } = useAuth();
  return (
    <div className="h-screen w-screen grid place-items-center bg-background text-foreground p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="h-14 w-14 rounded-2xl bg-amber-100 grid place-items-center mx-auto"><Loader2 className="h-7 w-7 text-amber-600 animate-spin" /></div>
        <h1 className="text-xl font-semibold">Access pending approval</h1>
        <p className="text-sm text-muted-foreground">Your request has been sent to the admins. You will get access to your tools once an admin approves your account{email ? (" (" + email + ")") : ""}.</p>
        <button onClick={logout} className="text-sm text-primary hover:underline">Sign out</button>
      </div>
    </div>
  );
}

function Gate() {
  const { access, loading } = useAccess();
  if (loading || !access) {
    return (
      <div className="h-screen w-screen grid place-items-center bg-background text-muted-foreground">
        <div className="flex items-center gap-3"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Checking access…</span></div>
      </div>
    );
  }
  if (!access.is_admin && access.status !== "approved") {
    return <Pending email={access.email} />;
  }
  return <Shell />;
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
    return <Navigate to="/" replace />;
  }

  // Standalone docs page (opens in its own tab, no sidebar/topbar).
  if (location.pathname === "/help") {
    return (
      <>
        <div className="min-h-screen w-screen overflow-y-auto bg-background text-foreground">
          <div className="max-w-3xl mx-auto px-6 py-8">
            <Help />
          </div>
        </div>
        <Toaster position="top-right" richColors closeButton />
      </>
    );
  }

  return (
    <>
      <AccessProvider>
        <Gate />
      </AccessProvider>
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}

export default App;
