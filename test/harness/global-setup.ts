import type { TestProject } from "vitest/node";
import {
  createDatabase,
  databaseUrl,
  dropDatabasesWithPrefix,
  migrate,
  startTestServer,
} from "./postgres";

export type TestDatabaseContext = {
  adminUrl: string;
  templateDatabase: string;
  runPrefix: string;
};

declare module "vitest" {
  export interface ProvidedContext {
    testDatabase: TestDatabaseContext;
  }
}

// Runs once per `vitest run`: starts (or connects to) a local Postgres,
// migrates a template database with the real migration history, and hands
// its coordinates to the test workers. Each test file then clones its own
// database from the template (see per-file-setup.ts), so files never share
// state and cloning costs milliseconds instead of a migration per file.
export default async function setup(project: TestProject) {
  const runPrefix = `cs_test_${Date.now().toString(36)}_${process.pid}`;
  const server = await startTestServer(runPrefix);

  const templateDatabase = `${runPrefix}_template`;
  try {
    await createDatabase(server.adminUrl, templateDatabase);
    await migrate(databaseUrl(server.adminUrl, templateDatabase));
  } catch (error) {
    await server.stop();
    throw error;
  }

  project.provide("testDatabase", {
    adminUrl: server.adminUrl,
    templateDatabase,
    runPrefix,
  });

  return async () => {
    try {
      await dropDatabasesWithPrefix(server.adminUrl, runPrefix);
    } finally {
      await server.stop();
    }
  };
}
