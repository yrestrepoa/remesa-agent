import Log from "../Log";
import { createClient } from "redis";
import type { CacheEntry, RedisClient } from "../types/cache";

const KEY_PREFIX = process.env.CACHE_PREFIX?.trim() || "remesa:";

class CacheManager {
    private redisClient: RedisClient | null = null;
    private redisAvailable = false;
    private memoryCache = new Map<string, CacheEntry<any>>();
    private cleanupInterval: NodeJS.Timer | null = null;
    private redisProbeTimer: NodeJS.Timeout | null = null;
    private readonly REDIS_CONNECT_TIMEOUT = 1200;
    private readonly REDIS_OP_TIMEOUT = 100;
    private readonly REDIS_PROBE_MS = 5000;
    private readonly MEMORY_CLEANUP_INTERVAL = 60000;
    private readonly MAX_MEMORY_ENTRIES = 10000;

    private prefixed(key: string): string {
        return key.startsWith(KEY_PREFIX) ? key : `${KEY_PREFIX}${key}`;
    }

    async initialize(): Promise<void> {
        await this.initRedis();
        this.startMemoryCleanup();
    }

    private async initRedis(): Promise<void> {
        let client: RedisClient | null = null;
        try {
            const redisUrl = process.env.REDIS_URL ?? `redis://${process.env.REDIS_HOST ?? "127.0.0.1"}:${process.env.REDIS_PORT ?? "6379"}`;
            client = createClient({
                url: redisUrl,
                socket: {
                    connectTimeout: this.REDIS_CONNECT_TIMEOUT,
                    reconnectStrategy: () => false
                }
            }) as RedisClient;
            client.on("error", (error: any) => {
                this.redisAvailable = false;
                Log.warn("Redis cache disabled after error", { error: error?.message ?? error });
            });
            await Promise.race([
                client.connect(),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error("redis-connect-timeout")), this.REDIS_CONNECT_TIMEOUT))
            ]);
            this.redisClient = client;
            this.redisAvailable = true;
            Log.info("Redis cache enabled globally");
        }
        catch (error: any) {
            if (client) {
                try { await client.disconnect(); } catch { }
            }
            this.redisClient = null;
            this.redisAvailable = false;
            Log.info("Redis unavailable, using memory cache", { reason: error?.message ?? "unknown" });
        }
    }

    private startMemoryCleanup(): void {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            let expired = 0;
            for (const [key, entry] of this.memoryCache.entries()) {
                if (entry.expires > 0 && entry.expires <= now) {
                    this.memoryCache.delete(key);
                    expired++;
                }
            }
            if (this.memoryCache.size > this.MAX_MEMORY_ENTRIES) {
                const toDelete = this.memoryCache.size - this.MAX_MEMORY_ENTRIES;
                const keys = Array.from(this.memoryCache.keys()).slice(0, toDelete);
                keys.forEach(k => this.memoryCache.delete(k));
            }
        }, this.MEMORY_CLEANUP_INTERVAL);
    }

    private async withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<{ value: T | null; timedOut: boolean }> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                task.then(value => ({ value, timedOut: false })),
                new Promise<{ value: null; timedOut: boolean }>((resolve) => {
                    timer = setTimeout(() => resolve({ value: null, timedOut: true }), timeoutMs);
                })
            ]);
        }
        finally {
            if (timer) clearTimeout(timer);
        }
    }

    private markRedisDown(): void {
        this.redisAvailable = false;
        this.scheduleRedisProbe();
    }

    private scheduleRedisProbe(): void {
        if (this.redisProbeTimer || !this.redisClient) return;
        this.redisProbeTimer = setTimeout(async () => {
            this.redisProbeTimer = null;
            if (!this.redisClient) return;
            try {
                const result = await this.withTimeout(this.redisClient.ping(), this.REDIS_OP_TIMEOUT);
                if (result.timedOut) {
                    this.scheduleRedisProbe();
                } else {
                    this.redisAvailable = true;
                    Log.info("Redis cache connection restored");
                }
            } catch {
                this.scheduleRedisProbe();
            }
        }, this.REDIS_PROBE_MS);
    }

    private getMemoryValue<T>(key: string): T | null {
        const entry = this.memoryCache.get(key);
        if (!entry) return null;
        if (entry.expires > 0 && entry.expires <= Date.now()) {
            this.memoryCache.delete(key);
            return null;
        }
        this.memoryCache.delete(key);
        this.memoryCache.set(key, entry);
        return entry.value as T;
    }

    private setMemoryValue<T>(key: string, value: T, ttlMs?: number): void {
        const expires = ttlMs ? Date.now() + ttlMs : 0;
        this.memoryCache.delete(key);
        this.memoryCache.set(key, { value, expires });
    }

    async get<T>(key: string): Promise<T | null> {
        key = this.prefixed(key);
        if (this.redisAvailable && this.redisClient) {
            try {
                const result = await this.withTimeout(this.redisClient.get(key), this.REDIS_OP_TIMEOUT);
                if (result.timedOut) {
                    this.markRedisDown();
                } else if (result.value) {
                    try {
                        return JSON.parse(result.value as any) as T;
                    }
                    catch {
                        return result.value as any;
                    }
                } else {
                    return null;
                }
            }
            catch {
                this.markRedisDown();
            }
        }
        return this.getMemoryValue<T>(key);
    }

    async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
        key = this.prefixed(key);
        const payload = typeof value === "string" ? value : JSON.stringify(value);
        if (this.redisAvailable && this.redisClient) {
            try {
                const opts = ttlMs ? { PX: ttlMs } : undefined;
                const result = await this.withTimeout(this.redisClient.set(key, payload, opts), this.REDIS_OP_TIMEOUT);
                if (result.timedOut) this.markRedisDown();
            }
            catch {
                this.markRedisDown();
            }
        }
        this.setMemoryValue(key, value, ttlMs);
    }

    async delete(key: string | string[]): Promise<void> {
        const keys = (Array.isArray(key) ? key : [key]).map(k => this.prefixed(k));
        if (this.redisAvailable && this.redisClient) {
            try {
                const result = await this.withTimeout(this.redisClient.del(keys), this.REDIS_OP_TIMEOUT);
                if (result.timedOut) this.markRedisDown();
            }
            catch {
                this.markRedisDown();
            }
        }
        keys.forEach(k => this.memoryCache.delete(k));
    }

    async has(key: string): Promise<boolean> {
        const value = await this.get(key);
        return value !== null;
    }

    async increment(key: string, ttlMs?: number): Promise<number | null> {
        key = this.prefixed(key);
        if (this.redisAvailable && this.redisClient) {
            try {
                const result = await this.withTimeout(this.redisClient.incr(key), this.REDIS_OP_TIMEOUT);
                if (result.timedOut) {
                    this.markRedisDown();
                    return null;
                }
                const value = result.value;
                if (value === null) return null;
                if (ttlMs && value === 1) {
                    const expires = await this.withTimeout(this.redisClient.pExpire(key, ttlMs), this.REDIS_OP_TIMEOUT);
                    if (expires.timedOut) this.markRedisDown();
                }
                const existing = this.memoryCache.get(key);
                const keepExpires = existing && existing.expires > 0 ? existing.expires : (ttlMs ? Date.now() + ttlMs : 0);
                this.setMemoryValue(key, value, keepExpires > 0 ? Math.max(0, keepExpires - Date.now()) : undefined);
                return value;
            }
            catch {
                this.markRedisDown();
            }
        }
        const now = Date.now();
        const existing = this.memoryCache.get(key);
        if (!existing || (existing.expires > 0 && existing.expires <= now)) {
            const expires = ttlMs ? now + ttlMs : 0;
            this.memoryCache.set(key, { value: 1, expires });
            return 1;
        }
        const base = Number(existing.value);
        const nextValue = Number.isFinite(base) ? base + 1 : 1;
        this.memoryCache.set(key, { value: nextValue, expires: existing.expires });
        return nextValue;
    }

    async getTtlMs(key: string): Promise<number> {
        key = this.prefixed(key);
        if (this.redisAvailable && this.redisClient) {
            try {
                const result = await this.withTimeout(this.redisClient.pTTL(key), this.REDIS_OP_TIMEOUT);
                if (result.timedOut) {
                    this.markRedisDown();
                    return -2;
                }
                if (typeof result.value === "number") return result.value;
            }
            catch {
                this.markRedisDown();
            }
        }
        const entry = this.memoryCache.get(key);
        if (!entry) return -2;
        if (entry.expires <= 0) return -1;
        return Math.max(0, entry.expires - Date.now());
    }

    async setIfNotExists<T>(key: string, value: T, ttlMs?: number): Promise<boolean> {
        key = this.prefixed(key);
        const payload = typeof value === "string" ? value : JSON.stringify(value);
        if (this.redisAvailable && this.redisClient) {
            try {
                const opts = ttlMs ? { PX: ttlMs, NX: true } : { NX: true };
                const result = await this.withTimeout(this.redisClient.set(key, payload, opts), this.REDIS_OP_TIMEOUT);
                if (result.timedOut) {
                    this.markRedisDown();
                    return false;
                }
                if (result.value === "OK") {
                    this.setMemoryValue(key, value, ttlMs);
                    return true;
                }
                return false;
            }
            catch {
                this.markRedisDown();
            }
        }
        const now = Date.now();
        const existing = this.memoryCache.get(key);
        if (existing && (existing.expires <= 0 || existing.expires > now)) return false;
        this.setMemoryValue(key, value, ttlMs);
        return true;
    }

    getLocal<T>(key: string): T | null {
        return this.getMemoryValue<T>(this.prefixed(key));
    }

    setLocal<T>(key: string, value: T, ttlMs?: number): void {
        this.setMemoryValue(this.prefixed(key), value, ttlMs);
    }

    deleteLocal(key: string | string[]): void {
        const keys = (Array.isArray(key) ? key : [key]).map(k => this.prefixed(k));
        keys.forEach(k => this.memoryCache.delete(k));
    }

    deleteLocalByPrefix(prefix: string): number {
        prefix = this.prefixed(prefix);
        let deleted = 0;
        for (const key of this.memoryCache.keys()) {
            if (!key.startsWith(prefix)) continue;
            this.memoryCache.delete(key);
            deleted++;
        }
        return deleted;
    }

    async deleteRemoteByPrefix(prefix: string): Promise<number> {
        if (!(this.redisAvailable && this.redisClient)) return 0;
        prefix = this.prefixed(prefix);
        let deleted = 0;
        try {
            const keys: string[] = [];
            for await (const batch of this.redisClient.scanIterator({ MATCH: `${prefix}*`, COUNT: 500 })) keys.push(...batch);
            for (let i = 0; i < keys.length; i += 500) {
                const chunk = keys.slice(i, i + 500);
                const result = await this.withTimeout(this.redisClient.del(chunk), this.REDIS_OP_TIMEOUT * 5);
                if (result.timedOut) {
                    this.markRedisDown();
                    break;
                }
                deleted += typeof result.value === "number" ? result.value : 0;
            }
        }
        catch {
            this.markRedisDown();
        }
        return deleted;
    }

    async deleteByPrefix(prefix: string): Promise<number> {
        const localDeleted = this.deleteLocalByPrefix(prefix);
        const remoteDeleted = await this.deleteRemoteByPrefix(prefix);
        return localDeleted + remoteDeleted;
    }

    countLocalByPrefix(prefix: string): number {
        prefix = this.prefixed(prefix);
        let count = 0;
        for (const key of [...this.memoryCache.keys()]) {
            if (key.startsWith(prefix) && this.getMemoryValue(key) !== null) count++;
        }
        return count;
    }

    hasLocal(key: string): boolean {
        return this.getMemoryValue(this.prefixed(key)) !== null;
    }

    async remember<T>(key: string, ttlMs: number, resolver: () => Promise<T>): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached !== null) return cached;
        const value = await resolver();
        await this.set(key, value, ttlMs);
        return value;
    }

    rememberLocal<T>(key: string, ttlMs: number, resolver: () => T): T {
        const cached = this.getLocal<T>(key);
        if (cached !== null) return cached;
        const value = resolver();
        this.setLocal(key, value, ttlMs);
        return value;
    }

    async reprobeRedis(): Promise<boolean> {
        if (!this.redisClient) {
            this.redisAvailable = false;
            return false;
        }
        try {
            const result = await this.withTimeout(this.redisClient.ping(), this.REDIS_OP_TIMEOUT);
            if (result.timedOut) {
                this.markRedisDown();
                return false;
            }
            this.redisAvailable = true;
            return true;
        }
        catch {
            this.markRedisDown();
            return false;
        }
    }

    isRedisAvailable(): boolean {
        return this.redisAvailable;
    }

    getStats() {
        return {
            redisAvailable: this.redisAvailable,
            memoryCacheSize: this.memoryCache.size,
            maxMemoryEntries: this.MAX_MEMORY_ENTRIES
        };
    }

    async flush(): Promise<void> {
        this.memoryCache.clear();
        if (this.redisAvailable && this.redisClient) {
            try {
                const keys: string[] = [];
                for await (const batch of this.redisClient.scanIterator({ MATCH: `${KEY_PREFIX}*`, COUNT: 500 })) keys.push(...batch);
                for (let i = 0; i < keys.length; i += 500) {
                    const chunk = keys.slice(i, i + 500);
                    const result = await this.withTimeout(this.redisClient.del(chunk), this.REDIS_OP_TIMEOUT * 5);
                    if (result.timedOut) this.markRedisDown();
                }
            }
            catch {
                this.markRedisDown();
            }
        }
    }

    async shutdown(): Promise<void> {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval as any);
            this.cleanupInterval = null;
        }
        if (this.redisProbeTimer) {
            clearTimeout(this.redisProbeTimer);
            this.redisProbeTimer = null;
        }
        if (this.redisClient) {
            try {
                await this.redisClient.disconnect();
            }
            catch {}
            this.redisClient = null;
        }
        this.memoryCache.clear();
    }
}

const cacheManager = new CacheManager();
export default cacheManager;
