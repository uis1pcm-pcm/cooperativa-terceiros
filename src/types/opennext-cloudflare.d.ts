declare module "@opennextjs/cloudflare" {
  export function getCloudflareContext(): { env: unknown };
  export function defineCloudflareConfig(config?: Record<string, unknown>): Record<string, unknown>;
}
