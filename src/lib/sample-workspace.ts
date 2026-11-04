// The sample workspace's one-click entry. It signs in as the sample company's
// designated countersigner without a password, so there is no published
// credential. It exists only where the sample workspace does: a deployment
// with DEMO_MODE=1, or any non-production environment. Anywhere else the
// provider refuses and only real company accounts can sign in.

export const SAMPLE_COUNTERSIGNER_EMAIL = "demo@countersign.dev";

export function sampleSignInEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEMO_MODE === "1" || env.NODE_ENV !== "production";
}
