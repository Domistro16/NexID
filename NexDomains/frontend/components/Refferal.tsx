import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CopyIcon } from "lucide-react";
import { useAccount, useReadContract } from "wagmi";
import { constants } from "@/constant";

const getCode = [
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "getCode",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const ReferralProgress = ({ referrals }: { referrals: number }) => {
  const { address } = useAccount();
  const tiers = [
    {
      label: "🥈 Silver",
      threshold: 15,
      percent: 25,
      unlocked: referrals >= 0,
    },
    { label: "🥇 Gold", threshold: 5, percent: 30, unlocked: referrals >= 5 },
  ];

  const { data } = useReadContract({
    abi: getCode,
    address: constants.Referral,
    args: [address],
    functionName: "getCode",
  });

  const nextTier = tiers.find((t) => !t.unlocked);
  const currentTier = [...tiers].reverse().find((t) => t.unlocked);
  const progressToNext = nextTier
    ? (referrals / nextTier.threshold) * 100
    : 100;

  const referralLink = `https://names.nexdomains.com/?ref=${data as string}`;

  return (
    <Card className="w-full mx-auto p-4 mt-3 bg-neutral-900 border-[0.5px] border-neutral-500 text-gray-300">
      {" "}
      <CardContent>
        {" "}
        <h2 className="text-xl font-bold mb-2">Referral Bonus Progress</h2>{" "}
        <div className="mb-4">
          {" "}
          <p className="text-base">
            {" "}
            You’re currently on <Badge>{currentTier?.label} Tier</Badge> —
            earning <strong>{currentTier?.percent}%</strong> referral bonus{" "}
            {(currentTier?.percent as number) > 15 &&
              ", including lifetime renewals"}
            .{" "}
          </p>{" "}
        </div>
        {nextTier && (
          <div>
            <p className="text-sm mb-1">
              {nextTier.threshold - referrals} referrals away from{" "}
              <strong>{nextTier.label} Tier</strong> —
              <span className="ml-1">
                {nextTier.percent}% + lifetime renewals
              </span>
            </p>
            <Progress value={progressToNext} className="h-4 bg-gray-300" />
            <p className="text-xs text-gray-500 mt-1">
              {referrals} / {nextTier.threshold} referrals
            </p>
          </div>
        )}
        {!nextTier && (
          <div className="text-green-600 font-semibold mt-4">
            🎉 You’ve unlocked the highest tier — 🥇 Gold! Thanks for being a
            top supporter.
          </div>
        )}
        <div className="font-semibold mt-4 flex gap-2 ">
          Referral Link:{" "}
          {data ? (
            <span className="text-green-600">{referralLink}</span>
          ) : (
            "No Referral Link"
          )}
          <CopyIcon
            className="cursor-pointer hover:scale-110"
            onClick={() => navigator.clipboard.writeText(referralLink)}
          />
        </div>
        <div className="font-semibold mt-4 flex gap-2 text-[12px]">
          If your Referral Link is Missing, raise a ticket in our{" "}
          <a href="https://discord.gg/rTAd8jas8">discord</a> server
        </div>
      </CardContent>
    </Card>
  );
};

export default ReferralProgress;
