import { redirect } from "next/navigation";
import { loginInternalAdmin } from "@/app/internal/auth-actions";
import { internalAdminDefaultPath, safeInternalReturnPath } from "@/lib/internal/admin-auth";
import { isInternalAdminConfigured, readInternalAdminCookie, verifyInternalAdminToken } from "@/lib/server/internal-admin-auth";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function errorCopy(error?: string) {
  if (error === "not-configured") {
    return "Internal admin access is not configured. Set INTERNAL_ADMIN_TOKEN before using this console.";
  }
  if (error === "invalid") {
    return "That admin token does not match this deployment.";
  }
  return "";
}

export default async function InternalLoginPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = safeInternalReturnPath(firstParam(params?.returnTo) ?? internalAdminDefaultPath);
  const configured = isInternalAdminConfigured();
  const cookie = await readInternalAdminCookie();

  if (configured && verifyInternalAdminToken(cookie)) {
    redirect(returnTo);
  }

  const message = errorCopy(firstParam(params?.error));

  return (
    <main className="internal-login-shell">
      <section className="internal-login-stage">
        <div className="eyebrow"><i className="dot" /> Internal access</div>
        <h1>NexID command gate</h1>
        <p>Admin tools are restricted to operators with the deployment token.</p>
      </section>
      <form action={loginInternalAdmin} className="internal-login-card">
        <input type="hidden" name="returnTo" value={returnTo} />
        <div>
          <span>Protected console</span>
          <h2>Enter admin token</h2>
          <p>{configured ? "Your session will be stored in an HTTP-only cookie for this browser." : "The token is missing from the environment, so login is disabled."}</p>
        </div>
        <label>
          <span>Admin token</span>
          <input name="token" type="password" autoComplete="current-password" disabled={!configured} required />
        </label>
        {message ? <div className="internal-login-error">{message}</div> : null}
        <button type="submit" className="primary" disabled={!configured}>Enter internal</button>
      </form>
    </main>
  );
}
