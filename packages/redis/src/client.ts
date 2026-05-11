import { Redis } from "ioredis";

export type RedisClient = Redis;

function createClient(overrides?: Partial<Redis["options"]>): Redis {
  const client = new Redis({
    host:           process.env["REDIS_HOST"] ?? "localhost",
    port:           Number(process.env["REDIS_PORT"] ?? 6379),
    password:       process.env["REDIS_PASSWORD"],
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect:    false,
    ...overrides,
  });

  client.on("error", (err: unknown) => {
    console.error("[redis] connection error:", err);
  });

  return client;
}

// Singleton — shared across all modules in the same process
let _client: Redis | null = null;

export function getRedisClient(): Redis {
  if (!_client) {
    _client = createClient();
  }
  return _client;
}

export async function pingRedis(): Promise<boolean> {
  try {
    const result = await getRedisClient().ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

export async function closeRedisClient(): Promise<void> {
  if (_client) {
    await _client.quit();
    _client = null;
  }
}
