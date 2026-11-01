import { redactObject, redactText } from "@app/shared";

/** Structured JSON logs. Every field is redacted; never pass raw profile values here. */
type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  const line = {
    level,
    time: new Date().toISOString(),
    msg: redactText(msg),
    ...(fields ? (redactObject(fields) as Record<string, unknown>) : {}),
  };
  const out = JSON.stringify(line);
  if (level === "error" || level === "warn") console.error(out);
  else console.log(out);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => {
    if (process.env.LOG_LEVEL === "debug") write("debug", msg, fields);
  },
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
