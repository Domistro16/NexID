import { notFound } from "next/navigation";
import { cleanReferralCode } from "@/lib/referrals";
import { ReferralLandingClient } from "@/components/nexid/referrals/referral-landing-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";

export default async function ReferralLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = cleanReferralCode(rawCode);
  if (!code) notFound();

  return (
    <NexidAppShell>
      <ReferralLandingClient code={code} />
    </NexidAppShell>
  );
}
