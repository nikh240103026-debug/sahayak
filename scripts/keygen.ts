/** npm run keygen — print fresh secrets to paste into .env.local and your hosts. */
import { randomBytes } from "node:crypto";

const lines = [
  `ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`,
  `WORKER_SHARED_SECRET=${randomBytes(32).toString("base64url")}`,
  `CRON_SECRET=${randomBytes(32).toString("base64url")}`,
];
console.log("# Paste these into .env.local (and into Vercel / the worker host). Keep them secret.");
console.log(lines.join("\n"));
console.log("# Store ENCRYPTION_KEY somewhere safe: without it, saved profiles cannot be decrypted.");
