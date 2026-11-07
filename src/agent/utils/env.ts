export function envString(name: string, fallback = ""): string {
    const value = process.env[name];
    return value === undefined || value.trim() === "" ? fallback : value.trim();
}

export function envInt(name: string, fallback: number): number {
    const parsed = parseInt(process.env[name] ?? "", 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function envOptionalInt(name: string): number | null {
    const parsed = parseInt(process.env[name] ?? "", 10);
    return Number.isFinite(parsed) ? parsed : null;
}

export function envBool(name: string, fallback: boolean): boolean {
    const value = process.env[name]?.trim().toLowerCase();
    if (!value) return fallback;
    return !["false", "0", "no", "off"].includes(value);
}

export function envEnum<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
    const value = envString(name) as T;
    return allowed.includes(value) ? value : fallback;
}
