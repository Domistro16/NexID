import type { Metadata } from "next";
import InterviewPage from "../../academy/interview/page";

export const metadata: Metadata = {
  title: "Chartered interview",
  robots: {
    index: false,
    follow: true,
  },
};

export default function RootInterviewPage() {
  return <InterviewPage />;
}
