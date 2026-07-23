import { randomUUID } from 'node:crypto';

export interface FixtureCleanup {
  deleteEmployee(employeeId: string): Promise<void>;
  restorePasswordHash(userId: string, hashedPassword: string): Promise<void>;
}

export interface LocalFixtureOptions {
  baseURL: string;
  environment: Record<string, string | undefined>;
  cleanup: FixtureCleanup;
  persistence?: { persist(manifest: FixtureManifest): void; clear(): void };
}

export interface FixtureManifest {
  runId: string;
  created: {
    employeeIds: string[];
  };
  temporaryPasswordHashes: Array<{ userId: string; hashedPassword: string }>;
}

export function assertLocalMutationAllowed(
  baseURL: string,
  environment: Record<string, string | undefined>,
): void {
  if (environment.E2E_ALLOW_MUTATION !== '1') {
    throw new Error('E2E_ALLOW_MUTATION=1 is required before fixture mutation');
  }

  const { hostname } = new URL(baseURL);
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new Error('Fixture mutation must use localhost or 127.0.0.1');
  }
}

export function createRunId(): string {
  return `client-qa-${Date.now()}-${randomUUID()}`;
}

export function createLocalFixtureHarness(options: LocalFixtureOptions) {
  assertLocalMutationAllowed(options.baseURL, options.environment);
  const manifest: FixtureManifest = {
    runId: createRunId(),
    created: { employeeIds: [] },
    temporaryPasswordHashes: [],
  };

  return {
    manifest,
    trackEmployee(employeeId: string): void {
      manifest.created.employeeIds.push(employeeId);
      options.persistence?.persist(manifest);
    },
    trackTemporaryPasswordHash(userId: string, hashedPassword: string): void {
      manifest.temporaryPasswordHashes.push({ userId, hashedPassword });
      options.persistence?.persist(manifest);
    },
    async cleanup(): Promise<void> {
      const results = await Promise.allSettled([
        ...manifest.created.employeeIds.map((id) => options.cleanup.deleteEmployee(id)),
        ...manifest.temporaryPasswordHashes.map(({ userId, hashedPassword }) =>
          options.cleanup.restorePasswordHash(userId, hashedPassword),
        ),
      ]);
      const errors = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, 'Fixture cleanup failed');
      options.persistence?.clear();
    },
  };
}

export async function withLocalFixtureHarness<T>(
  options: LocalFixtureOptions,
  run: (harness: ReturnType<typeof createLocalFixtureHarness>) => Promise<T>,
): Promise<T> {
  const harness = createLocalFixtureHarness(options);
  let result!: T;
  let scenarioError: unknown;
  try {
    result = await run(harness);
  } catch (error) {
    scenarioError = error;
  }
  try {
    await harness.cleanup();
  } catch (cleanupError) {
    if (scenarioError) {
      throw new AggregateError([scenarioError, cleanupError], 'Fixture scenario and cleanup failed');
    }
    throw cleanupError;
  }
  if (scenarioError) throw scenarioError;
  return result;
}
