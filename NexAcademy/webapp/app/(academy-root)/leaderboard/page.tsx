import type { Metadata } from "next";
import GlobalLeaderboardPage from "../../academy/leaderboard/page";

export const metadata: Metadata = {
  title: "Leaderboard",
  description:
    "See the top NexID learners, campaign rankings, badge density, and multiplier performance.",
  alternates: {
    canonical: "/leaderboard",
  },
};

export default function LeaderboardPage() {
  return <GlobalLeaderboardPage />;
}
