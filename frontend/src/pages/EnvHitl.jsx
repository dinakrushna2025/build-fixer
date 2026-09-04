import EnvActionPanel from "@/components/EnvActionPanel";
import { RotateCw } from "lucide-react";
export default function EnvHitl() {
  return (
    <EnvActionPanel
      title="HITL continue"
      subtitle="Unstick a hung or paused agent. NOT for poisoned-trajectory wedges (those need a new chat)."
      path="/env/hitl"
      okMsg="HITL continue queued"
      buttonLabel="HITL continue"
      confirmText="This re-queues a continue for job {job}. Do NOT use on poisoned-trajectory wedges."
      Icon={RotateCw}
    />
  );
}
