import EnvActionPanel from "@/components/EnvActionPanel";
import { Smartphone } from "lucide-react";
export default function EnvAndroid() {
  return (
    <EnvActionPanel
      title="Android rebuild"
      subtitle="Trigger a fresh Android (EAS) build. Use after a keystore or config fix."
      path="/env/android-build"
      buildBody={() => ({ build_type: "both" })}
      okMsg="Android build triggered"
      buttonLabel="Trigger Android build"
      confirmText="This starts a fresh Android EAS build for job {job}. It consumes build minutes."
      Icon={Smartphone}
    />
  );
}
