import { test, expect } from '@playwright/test';

import {
  createLocalFixtureHarness,
  createRunId,
  assertLocalMutationAllowed,
  withLocalFixtureHarness,
} from './local-fixture-harness';

test('fails closed unless mutation is explicitly enabled for localhost', () => {
  expect(() => assertLocalMutationAllowed('http://localhost:4200', {})).toThrow(
    'E2E_ALLOW_MUTATION=1 is required',
  );
  expect(() => assertLocalMutationAllowed('https://asistencia.sistemaslab.dev', { E2E_ALLOW_MUTATION: '1' })).toThrow(
    'must use localhost or 127.0.0.1',
  );
  expect(() => assertLocalMutationAllowed('http://127.0.0.1:4200', { E2E_ALLOW_MUTATION: '1' })).not.toThrow();
});

test('generates a unique run id for every fixture run', () => {
  const first = createRunId();
  const second = createRunId();

  expect(first).toMatch(/^client-qa-/);
  expect(second).toMatch(/^client-qa-/);
  expect(second).not.toBe(first);
});

test('tracks created records and restores only manifest entries during cleanup', async () => {
  const deletedEmployeeIds: string[] = [];
  const restoredHashes: Array<{ userId: string; hashedPassword: string }> = [];
  const harness = createLocalFixtureHarness({
    baseURL: 'http://localhost:4200',
    environment: { E2E_ALLOW_MUTATION: '1' },
    cleanup: {
      deleteEmployee: async (employeeId) => {
        deletedEmployeeIds.push(employeeId);
      },
      restorePasswordHash: async (userId, hashedPassword) => {
        restoredHashes.push({ userId, hashedPassword });
      },
    },
  });

  harness.trackEmployee('employee-created-by-this-run');
  harness.trackTemporaryPasswordHash('user-mutated-by-this-run', 'original-password-hash');

  expect(harness.manifest.created.employeeIds).toEqual(['employee-created-by-this-run']);

  await harness.cleanup();

  expect(deletedEmployeeIds).toEqual(['employee-created-by-this-run']);
  expect(restoredHashes).toEqual([
    { userId: 'user-mutated-by-this-run', hashedPassword: 'original-password-hash' },
  ]);
});

test('runs manifest cleanup from finally when a fixture scenario fails', async () => {
  const deletedEmployeeIds: string[] = [];

  await expect(
    withLocalFixtureHarness(
      {
        baseURL: 'http://localhost:4200',
        environment: { E2E_ALLOW_MUTATION: '1' },
        cleanup: {
          deleteEmployee: async (employeeId) => {
            deletedEmployeeIds.push(employeeId);
          },
          restorePasswordHash: async () => undefined,
        },
      },
      async (harness) => {
        harness.trackEmployee('employee-created-before-failure');
        throw new Error('scenario failed');
      },
    ),
  ).rejects.toThrow('scenario failed');

  expect(deletedEmployeeIds).toEqual(['employee-created-before-failure']);
});

test('attempts every cleanup operation before reporting failures', async () => {
  const calls: string[] = []; let clears = 0;
  const harness = createLocalFixtureHarness({
    baseURL: 'http://localhost:4200',
    environment: { E2E_ALLOW_MUTATION: '1' },
    cleanup: {
      deleteEmployee: async (id) => {
        calls.push(`delete:${id}`);
        if (id === 'first') throw new Error('delete failed');
      },
      restorePasswordHash: async (id) => void calls.push(`restore:${id}`),
    }, persistence: { persist: () => undefined, clear: () => void clears++ },
  });
  harness.trackEmployee('first');
  harness.trackEmployee('second');
  harness.trackTemporaryPasswordHash('user', 'hash');
  await expect(harness.cleanup()).rejects.toThrow('delete failed');
  expect(calls).toEqual(['delete:first', 'delete:second', 'restore:user']); expect(clears).toBe(0);
});

test('preserves scenario and cleanup failures', async () => {
  const failure = await withLocalFixtureHarness(
    {
      baseURL: 'http://localhost:4200',
      environment: { E2E_ALLOW_MUTATION: '1' },
      cleanup: { deleteEmployee: async () => Promise.reject(new Error('cleanup failed')), restorePasswordHash: async () => undefined },
    },
    async (harness) => {
      harness.trackEmployee('employee');
      throw new Error('scenario failed');
    },
  ).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors.map((error) => error.message)).toEqual(['scenario failed', 'cleanup failed']);
});

test('persists tracked mutations and clears only after successful cleanup', async () => {
  const persisted: string[] = []; let clears = 0;
  const harness = createLocalFixtureHarness({
    baseURL: 'http://localhost:4200',
    environment: { E2E_ALLOW_MUTATION: '1' },
    cleanup: { deleteEmployee: async () => undefined, restorePasswordHash: async () => undefined },
    persistence: { persist: (manifest) => void persisted.push(JSON.stringify(manifest)), clear: () => void clears++ },
  });

  harness.trackEmployee('employee');
  harness.trackTemporaryPasswordHash('user', 'hash');
  expect(persisted).toHaveLength(2);
  await harness.cleanup();
  expect(clears).toBe(1);
});
