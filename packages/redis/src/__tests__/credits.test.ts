/**
 * Credit atomic decrement — race condition test.
 *
 * Unit tests: mock Redis, verify logic paths.
 * Integration tests (race): require a live Redis instance.
 *
 * Run unit:        npm run test:unit
 * Run integration: docker compose up redis -d && npm run test:integration
 */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Redis } from "ioredis";

// ─── Unit tests (mocked Redis) ────────────────────────────────────────────────

function makeMockRedis(
  balanceOrError: number | "NO_BALANCE" | "INSUFFICIENT_CREDITS",
): Partial<Redis> {
  return {
    eval: jest.fn().mockImplementation(() => {
      if (balanceOrError === "NO_BALANCE") {
        return Promise.reject(new Error("ERR NO_BALANCE"));
      }
      if (balanceOrError === "INSUFFICIENT_CREDITS") {
        return Promise.reject(new Error("ERR INSUFFICIENT_CREDITS"));
      }
      return Promise.resolve(balanceOrError);
    }),
    get:    jest.fn().mockResolvedValue(String(balanceOrError)),
    set:    jest.fn().mockResolvedValue("OK"),
    incrby: jest.fn().mockImplementation((_key: unknown, amount: unknown) =>
      Promise.resolve(Number(balanceOrError) + Number(amount)),
    ),
  };
}

describe("deductCredits — unit (mocked Redis)", () => {
  let deductCredits: typeof import("../credits.js").deductCredits;
  let setBalance: typeof import("../credits.js").setBalance;
  let getBalance: typeof import("../credits.js").getBalance;

  beforeEach(async () => {
    jest.resetModules();
    ({ deductCredits, setBalance, getBalance } = await import("../credits.js"));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns ok=true with remaining balance on success", async () => {
    const mock = makeMockRedis(95) as Redis;
    const result = await deductCredits("tenant-x", 5, mock);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.remaining).toBe(95);
  });

  it("returns ok=false with INSUFFICIENT_CREDITS when balance too low", async () => {
    const mock = makeMockRedis("INSUFFICIENT_CREDITS") as Redis;
    const result = await deductCredits("tenant-x", 100, mock);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("INSUFFICIENT_CREDITS");
  });

  it("returns ok=false with NO_BALANCE when key does not exist", async () => {
    const mock = makeMockRedis("NO_BALANCE") as Redis;
    const result = await deductCredits("tenant-x", 5, mock);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NO_BALANCE");
  });

  it("getBalance returns null when key does not exist", async () => {
    const mock = { get: jest.fn().mockResolvedValue(null) } as unknown as Redis;
    const balance = await getBalance("tenant-x", mock);
    expect(balance).toBeNull();
  });

  it("setBalance calls SET with the correct value", async () => {
    const mock = { set: jest.fn().mockResolvedValue("OK") } as unknown as Redis;
    await setBalance("tenant-x", 1000, mock);
    expect(mock.set).toHaveBeenCalledWith(
      expect.stringContaining("tenant-x"),
      1000,
    );
  });
});

// ─── Integration test: race condition (live Redis required) ───────────────────

const RUN_RACE = process.env["TEST_TYPE"] === "integration";

(RUN_RACE ? describe : describe.skip)(
  "deductCredits — race condition (live Redis)",
  () => {
    let Redis: typeof import("ioredis").default;
    let client: InstanceType<typeof import("ioredis").default>;
    let deductCredits: typeof import("../credits.js").deductCredits;
    let setBalance: typeof import("../credits.js").setBalance;
    let getBalance: typeof import("../credits.js").getBalance;

    const TENANT = "race-test-tenant";
    const INITIAL_BALANCE = 100;
    const COST_PER_REQUEST = 7;
    const CONCURRENCY = 30;

    beforeEach(async () => {
      ({ default: Redis } = await import("ioredis"));
      ({ deductCredits, setBalance, getBalance } = await import("../credits.js"));

      client = new Redis({
        host:     process.env["REDIS_HOST"] ?? "localhost",
        port:     Number(process.env["REDIS_PORT"] ?? 6379),
        password: process.env["REDIS_PASSWORD"],
      });

      await setBalance(TENANT, INITIAL_BALANCE, client);
    });

    afterEach(async () => {
      await client.del(`credit:${TENANT}:global`);
      await client.quit();
    });

    it("concurrent deductions never produce a negative balance", async () => {
      const results = await Promise.all(
        Array.from({ length: CONCURRENCY }, () =>
          deductCredits(TENANT, COST_PER_REQUEST, client),
        ),
      );

      const successes = results.filter((r) => r.ok);
      const failures  = results.filter((r) => !r.ok);

      const finalBalance = await getBalance(TENANT, client);

      // Max successful deductions = floor(100 / 7) = 14
      const maxSuccess = Math.floor(INITIAL_BALANCE / COST_PER_REQUEST);
      expect(successes.length).toBeLessThanOrEqual(maxSuccess);
      expect(failures.length).toBe(CONCURRENCY - successes.length);

      // Balance must never go negative
      expect(finalBalance).toBeGreaterThanOrEqual(0);

      // Exact accounting: initial - (successes × cost) = finalBalance
      expect(finalBalance).toBe(
        INITIAL_BALANCE - successes.length * COST_PER_REQUEST,
      );
    });

    it("lock prevents duplicate idempotency key execution", async () => {
      const { acquireLock } = await import("../lock.js");
      const KEY = "idem-test-key";

      const [first, second] = await Promise.all([
        acquireLock(KEY, 60, client),
        acquireLock(KEY, 60, client),
      ]);

      // Exactly one acquires the lock
      const acquired = [first, second].filter(Boolean);
      expect(acquired).toHaveLength(1);

      // Release
      await acquired[0]?.release();

      // Now acquirable again
      const third = await acquireLock(KEY, 60, client);
      expect(third).not.toBeNull();
      await third?.release();
    });
  },
);
