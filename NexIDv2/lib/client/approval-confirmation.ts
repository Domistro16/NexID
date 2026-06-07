type WaitForAllowanceConfirmationInput = {
  readAllowance: () => Promise<bigint>;
  requiredAllowance: bigint;
  attempts?: number;
  delayMs?: number;
  onRetry?: (attempt: number, latestAllowance: bigint) => void;
};

type AllowanceConfirmationResult = {
  allowance: bigint;
  reflected: boolean;
  attempts: number;
  readErrors: number;
};

const DEFAULT_ATTEMPTS = 8;
const DEFAULT_DELAY_MS = 1_500;

function sleep(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function waitForAllowanceConfirmation(input: WaitForAllowanceConfirmationInput): Promise<AllowanceConfirmationResult> {
  const attempts = input.attempts ?? DEFAULT_ATTEMPTS;
  const delayMs = input.delayMs ?? DEFAULT_DELAY_MS;
  let latestAllowance = BigInt(0);
  let readErrors = 0;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      latestAllowance = await input.readAllowance();
      if (latestAllowance >= input.requiredAllowance) {
        return {
          allowance: latestAllowance,
          reflected: true,
          attempts: attempt,
          readErrors
        };
      }
    } catch {
      readErrors += 1;
    }

    if (attempt < attempts) {
      input.onRetry?.(attempt, latestAllowance);
      await sleep(delayMs);
    }
  }

  return {
    allowance: latestAllowance,
    reflected: latestAllowance >= input.requiredAllowance,
    attempts,
    readErrors
  };
}
