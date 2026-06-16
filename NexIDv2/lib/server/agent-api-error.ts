import { AgentLaunchError } from "@/lib/services/agentLaunchService";
import { jsonError } from "@/lib/server/validation";

export function agentApiError(error: unknown) {
  if (error instanceof AgentLaunchError) {
    return {
      body: {
        error: error.message,
        code: error.code,
        ...(error.action ? { action: error.action } : {})
      },
      status: error.status
    };
  }
  const body = jsonError(error);
  const message = typeof body.error === "string" ? body.error : "";
  const status = /required/i.test(message) ? 401 : /missing the required scope|disabled|invalid/i.test(message) ? 403 : 400;
  return { body, status };
}
