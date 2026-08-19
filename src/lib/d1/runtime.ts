import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "./types";
import { DatabaseUnavailableError } from "@/lib/databaseUnavailable";

type RuntimeEnv = { DB?: D1Database };

/** Returns the native server-side D1 binding supplied by OpenNext/Cloudflare. */
export function getD1(): D1Database {
  const env = getCloudflareContext().env as RuntimeEnv;
  if (!env.DB) throw new DatabaseUnavailableError("D1 binding DB is not available in the Cloudflare runtime.");
  return env.DB;
}
