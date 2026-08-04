import { WelcomeParty } from "@/components/onboarding/WelcomeParty";

export default function WelcomePartyProbe() {
  return (
    <WelcomeParty
      cobName="OTTO VALE"
      displayName="THIS ONE BUSINESS (SYNTHETIC CID-100011)"
      firstName="Cob"
      onRename={async () => ({ ok: true, cobName: "OTTO VALE" })}
      onDismiss={() => {}}
    />
  );
}
