"use client";

import { useEffect } from "react";
import { cleanReferralCode, REFERRAL_STORAGE_KEY } from "@/lib/referrals";

export function ReferralCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incoming = cleanReferralCode(params.get("ref"));
    if (incoming) {
      window.localStorage.setItem(REFERRAL_STORAGE_KEY, incoming);
    }
  }, []);

  return null;
}
