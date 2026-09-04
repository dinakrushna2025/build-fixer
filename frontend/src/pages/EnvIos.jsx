import EnvActionPanel from "@/components/EnvActionPanel";
import { Apple } from "lucide-react";
export default function EnvIos() {
  return (
    <EnvActionPanel
      title="iOS rebuild"
      subtitle="Trigger a fresh iOS (EAS) build. Use after a cert or identity fix."
      path="/env/ios-build"
      okMsg="iOS build triggered"
      buttonLabel="Trigger iOS build"
      confirmText="This starts a fresh iOS EAS build for job {job}. It consumes build minutes."
      Icon={Apple}
    />
  );
}
