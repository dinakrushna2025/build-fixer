import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
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
import { Toaster } from "@/components/ui/sonner";

function App() {
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
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}

export default App;
