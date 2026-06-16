#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";

const apiBase = (process.env.NEXMARKETS_API_URL || "http://localhost:3000").replace(/\/$/, "");
const agentKey = process.env.NEXMARKETS_AGENT_KEY || process.env.NEXMARKETS_AGENT_SHARED_SECRET || "";

function usage() {
  console.log([
    "Nex CLI launch-agent commands:",
    "  nex agents whoami",
    "  nex agents register --name <agent-id>",
    "  nex agents mint-id --name <agent-id> [--tx-hash <hash>]",
    "  nex markets search --q <query>",
    "  nex markets draft --thesis <text> [--arena crypto|football|culture] [--out draft.json]",
    "  nex markets validate --draft-file draft.json [--public]",
    "  nex markets preview --draft-file draft.json",
    "  nex markets launch --draft-file draft.json --confirm-bond [--idempotency-key key] [--mint-if-needed --agent-id <agent-id>]"
  ].join("\n"));
}

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function requireAgentKey() {
  if (!agentKey) {
    throw new Error("Set NEXMARKETS_AGENT_KEY before using agent launch commands.");
  }
}

async function request(path, options = {}) {
  requireAgentKey();
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${agentKey}`,
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed with ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function readDraftPayload() {
  const draftFile = arg("draft-file");
  if (!draftFile) throw new Error("Provide --draft-file draft.json.");
  const parsed = JSON.parse(readFileSync(draftFile, "utf8"));
  return parsed.draft ? { draftId: parsed.draftId, draft: parsed.draft } : { draft: parsed };
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function ensureAgentIdForLaunch() {
  const me = await request("/v1/agents/me");
  if (!me.requiresAgentIdForPublicLaunch) return me.profile;
  if (!flag("mint-if-needed")) {
    throw new Error("Public launch requires an agent .id. Re-run with --mint-if-needed --agent-id <name>.");
  }
  const name = arg("agent-id") || arg("name");
  if (!name) throw new Error("Provide --agent-id <name> for --mint-if-needed.");

  try {
    const registered = await request("/v1/agents/register", {
      method: "POST",
      body: JSON.stringify({ name })
    });
    console.error(`Registered ${registered.profile.agentIdLabel}. Continuing launch.`);
    return registered.profile;
  } catch (error) {
    if (error.body?.code !== "agent_id_not_minted") throw error;
  }

  const mint = await request("/v1/agents/mint-id", {
    method: "POST",
    body: JSON.stringify({ name })
  });
  print({
    message: "Agent .id mint is prepared. Sign this transaction, then run `nex agents mint-id --name <name> --tx-hash <hash>` and repeat the launch.",
    id: mint.id
  });
  process.exitCode = 2;
  return null;
}

async function main() {
  const [group, command] = process.argv.slice(2);
  if (!group || !command || flag("help")) {
    usage();
    return;
  }

  if (group === "agents" && command === "whoami") {
    print(await request("/v1/agents/me"));
    return;
  }
  if (group === "agents" && command === "register") {
    const name = arg("name");
    if (!name) throw new Error("Provide --name <agent-id>.");
    print(await request("/v1/agents/register", { method: "POST", body: JSON.stringify({ name }) }));
    return;
  }
  if (group === "agents" && command === "mint-id") {
    const name = arg("name");
    if (!name) throw new Error("Provide --name <agent-id>.");
    print(await request("/v1/agents/mint-id", {
      method: "POST",
      body: JSON.stringify({ name, txHash: arg("tx-hash") || undefined })
    }));
    return;
  }

  if (group === "markets" && command === "search") {
    const q = encodeURIComponent(arg("q", "") || "");
    print(await request(`/v1/markets/search?q=${q}`));
    return;
  }
  if (group === "markets" && command === "draft") {
    const rawThesis = arg("thesis");
    if (!rawThesis) throw new Error("Provide --thesis <text>.");
    const result = await request("/v1/markets/draft", {
      method: "POST",
      body: JSON.stringify({ rawThesis, arenaHint: arg("arena") || undefined })
    });
    const out = arg("out");
    if (out) writeFileSync(out, JSON.stringify(result, null, 2));
    print(result);
    return;
  }
  if (group === "markets" && command === "validate") {
    print(await request("/v1/markets/validate", {
      method: "POST",
      body: JSON.stringify({ ...readDraftPayload(), publicLaunchMode: flag("public"), forceCreate: flag("force-create") })
    }));
    return;
  }
  if (group === "markets" && command === "preview") {
    print(await request("/v1/markets/preview", {
      method: "POST",
      body: JSON.stringify({ ...readDraftPayload(), publicLaunchMode: true, forceCreate: flag("force-create") })
    }));
    return;
  }
  if (group === "markets" && command === "launch") {
    if (!flag("confirm-bond")) throw new Error("Public launch requires --confirm-bond for the $20 creator bond.");
    const profile = await ensureAgentIdForLaunch();
    if (!profile) return;
    const result = await request("/v1/markets/launch", {
      method: "POST",
      headers: { ...(arg("idempotency-key") ? { "Idempotency-Key": arg("idempotency-key") } : {}) },
      body: JSON.stringify({
        ...readDraftPayload(),
        forceCreate: flag("force-create"),
        confirmBond: true,
        idempotencyKey: arg("idempotency-key") || undefined
      })
    });
    print(result);
    return;
  }

  usage();
}

main().catch((error) => {
  console.error(error.message);
  if (error.body) console.error(JSON.stringify(error.body, null, 2));
  process.exit(1);
});
