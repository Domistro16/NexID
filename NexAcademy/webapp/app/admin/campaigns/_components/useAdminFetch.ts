"use client";

import { useCallback } from "react";

export function useAdminFetch() {
  const authFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (init?.body && typeof init.body === "string") {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }
    return fetch(url, { ...init, headers });
  }, []);

  return { authFetch };
}
