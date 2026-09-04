import EnvActionPanel from "@/components/EnvActionPanel";
import { Power } from "lucide-react";
export default function EnvWake() {
  return (
    <EnvActionPanel
      title="Wake / Restart"
      subtitle="Recreate the container. Fixes asleep, empty IP, bad gateway, or a wedged tool server."
      path="/env/restart"
      okMsg="Restart queued, preview waking"
      buttonLabel="Wake / Restart"
      Icon={Power}
    />
  );
}
