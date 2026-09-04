import EnvActionPanel from "@/components/EnvActionPanel";
import { Cpu } from "lucide-react";
export default function EnvBump() {
  return (
    <EnvActionPanel
      title="Bump to large"
      subtitle="Heavy or OOM job. Raises the machine to large, then run Wake to apply."
      path="/env/bump"
      buildBody={() => ({ machine_type: "large" })}
      okMsg="Machine bumped to large"
      buttonLabel="Bump to large"
      confirmText="This raises the machine size to large for job {job}, then run Wake to apply."
      Icon={Cpu}
    />
  );
}
