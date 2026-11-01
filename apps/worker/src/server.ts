import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import { WORKER_SIGNATURE_HEADER, verifyWorkerRequest } from "@app/shared/hmac";
import { egressAllowlist, env } from "./env";
import { createLlmClient } from "./llm";
import { JobLoop } from "./loop";
import { errorMessage, log } from "./logger";
import { SupabaseRunStore } from "./store/supabase";

/**
 * The worker exposes only GET /health and POST /wake (HMAC-signed). Everything
 * else is 404. It needs no other inbound traffic: work comes from the database.
 */

const e = env();
const workerId = e.WORKER_ID ?? `${hostname()}-${randomBytes(3).toString("hex")}`;
const store = new SupabaseRunStore(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);
const llm = createLlmClient(e);
const loop = new JobLoop(e, store, llm, egressAllowlist(e), workerId);

const MAX_BODY = 4096;

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://worker");
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, worker: workerId, busy: loop.isBusy, llm: llm.name });
    }
    if (req.method === "POST" && url.pathname === "/wake") {
      const body = await readBody(req);
      const sig = req.headers[WORKER_SIGNATURE_HEADER];
      if (!verifyWorkerRequest(e.WORKER_SHARED_SECRET, Array.isArray(sig) ? sig[0] : sig, body)) {
        return send(res, 401, { ok: false });
      }
      loop.wake();
      return send(res, 202, { ok: true });
    }
    return send(res, 404, { ok: false });
  } catch (err) {
    log.warn("request failed", { error: errorMessage(err) });
    return send(res, 400, { ok: false });
  }
});

server.listen(e.PORT, () => {
  log.info("worker listening", { port: e.PORT, worker: workerId, llm: llm.name });
  loop.start();
});

async function shutdown(signal: string) {
  log.info("shutting down", { signal });
  server.close();
  await loop.stop();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
