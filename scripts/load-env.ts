import { existsSync, readFileSync } from "node:fs";

/** Load .env.local / .env into process.env for scripts (existing variables win). */
export function loadEnvFiles(files = [".env.local", ".env"]): string[] {
  const loaded: string[] = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    loaded.push(file);
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || line.trim().startsWith("#")) continue;
      const value = m[2]!.replace(/^(['"])(.*)\1$/, "$2");
      if (process.env[m[1]!] === undefined) process.env[m[1]!] = value;
    }
  }
  return loaded;
}
