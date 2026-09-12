// Real build fingerprint — see the `define` block in vite.config.ts. Shows
// which exact git commit produced the code currently running, so you can
// tell at a glance whether a deploy (e.g. an AI Studio preview) is stale.
export const BUILD_COMMIT = __BUILD_COMMIT__;
export const BUILD_TIME = __BUILD_TIME__;

export function formatBuildLabel(): string {
  let when = BUILD_TIME;
  try {
    when = new Date(BUILD_TIME).toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    // Keep the raw ISO string if it fails to parse for any reason.
  }
  return `${BUILD_COMMIT} · ${when}`;
}
