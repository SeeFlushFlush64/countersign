// Classifies a Postgres connection string as local or remote without ever
// echoing it: connection strings carry credentials and hostnames, so callers
// only get a label back. Used by the test harness and the seed script to
// refuse to touch anything that isn't a throwaway local database unless the
// caller explicitly opts in.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type DatabaseTarget = "local" | "remote" | "invalid";

export function describeDatabaseTarget(url: string | undefined): DatabaseTarget {
  if (!url) return "invalid";
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname) ? "local" : "remote";
  } catch {
    return "invalid";
  }
}

export function assertLocalDatabaseUrl(url: string | undefined, context: string): string {
  const target = describeDatabaseTarget(url);
  if (target !== "local") {
    throw new Error(
      `${context}: refusing to use a ${target} database. Only localhost connection strings are allowed here.`,
    );
  }
  return url!;
}
