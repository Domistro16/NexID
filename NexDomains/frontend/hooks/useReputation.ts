import { useState, useCallback } from "react";
import type { ReputationResult } from "@/lib/reputation/types";

interface UseReputationOptions {
  chainId?: string;
}

interface UseReputationReturn {
  reputation: ReputationResult | null;
  isLoading: boolean;
  error: string | null;
  checkReputation: (address: string) => Promise<void>;
  reset: () => void;
}

export function useReputation(
  options: UseReputationOptions = {}
): UseReputationReturn {
  const [reputation, setReputation] = useState<ReputationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkReputation = useCallback(
    async (address: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (options.chainId) {
          params.set("chainId", options.chainId);
        }

        const url = `/api/reputation/${address}${params.toString() ? `?${params}` : ""}`;
        const response = await fetch(url);

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to check reputation");
        }

        const data: ReputationResult = await response.json();
        setReputation(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setReputation(null);
      } finally {
        setIsLoading(false);
      }
    },
    [options.chainId]
  );

  const reset = useCallback(() => {
    setReputation(null);
    setError(null);
  }, []);

  return {
    reputation,
    isLoading,
    error,
    checkReputation,
    reset,
  };
}
