"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";

export function RootChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname?.startsWith("/internal")) {
    return <>{children}</>;
  }

  return <NexidAppShell>{children}</NexidAppShell>;
}
