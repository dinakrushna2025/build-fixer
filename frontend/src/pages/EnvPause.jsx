import EnvActionPanel from "@/components/EnvActionPanel";
import { Pause } from "lucide-react";
export default function EnvPause() {
  return (
    <EnvActionPanel
      title="Pause"
      subtitle="Pause a stuck running env before Wake (public edge, token)."
      path="/env/pause"
      okMsg="Pause sent"
      buttonLabel="Pause"
      Icon={Pause}
    />
  );
}
