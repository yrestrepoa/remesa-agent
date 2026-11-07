import * as path from "path";
import * as dotenv from "dotenv";
import { envEnum, envInt, envOptionalInt, envString } from "../utils/env";
import type { Effort, FallbackMode, StellarNetwork } from "../types/agent";
import type { ProviderName } from "../types/llm";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

export const runtimeConfig = Object.freeze({
    env: envString("NODE_ENV", "development"),
    isProduction: envString("NODE_ENV") === "production",

    llm: Object.freeze({
        provider: envEnum<ProviderName>("AI_PROVIDER", ["anthropic", "openai"], "anthropic"),
        model: envString("AGENT_MODEL", "claude-opus-5-5"),
        lightModel: envString("AGENT_LIGHT_MODEL", "claude-haiku-5-5"),
        effort: envEnum<Effort>("AGENT_EFFORT", EFFORTS, "medium"),
        maxTokens: envInt("AGENT_MAX_TOKENS", 64000),
        maxToolIterations: envInt("AGENT_MAX_TOOL_ITERATIONS", 10),
        fallbacks: envEnum<FallbackMode>("AGENT_FALLBACKS", ["default", "off"], "default")
    }),

    openai: Object.freeze({
        baseUrl: envString("OPENAI_BASE_URL"),
        apiKey: envString("OPENAI_API_KEY"),
        model: envString("OPENAI_MODEL"),
        lightModel: envString("OPENAI_LIGHT_MODEL"),
        maxTokens: envOptionalInt("OPENAI_MAX_TOKENS")
    }),

    loop: Object.freeze({
        tickMs: envInt("AGENT_TICK_MS", 60000)
    }),

    stellar: Object.freeze({
        network: envEnum<StellarNetwork>("STELLAR_NETWORK", ["testnet", "mainnet"], "testnet"),
        sorobanRpcUrl: envString("SOROBAN_RPC_URL"),
        horizonUrl: envString("HORIZON_URL"),
        escrowContractId: envString("ESCROW_CONTRACT_ID"),
        agentSecretKey: envString("AGENT_SECRET_KEY")
    }),

    notify: Object.freeze({
        providerKey: envString("NOTIFY_PROVIDER_KEY")
    })
});

export type RuntimeConfig = typeof runtimeConfig;

export function configErrors(): string[] {
    const errors: string[] = [];
    if (runtimeConfig.llm.provider === "openai") {
        if (!runtimeConfig.openai.baseUrl) errors.push("OPENAI_BASE_URL is required when AI_PROVIDER=openai");
        if (!runtimeConfig.openai.model) errors.push("OPENAI_MODEL is required when AI_PROVIDER=openai");
    }
    return errors;
}

export function missingSettings(): string[] {
    const missing: string[] = [];
    const s = runtimeConfig.stellar;
    if (!s.sorobanRpcUrl) missing.push("SOROBAN_RPC_URL");
    if (!s.horizonUrl) missing.push("HORIZON_URL");
    if (!s.escrowContractId) missing.push("ESCROW_CONTRACT_ID");
    if (!s.agentSecretKey) missing.push("AGENT_SECRET_KEY");
    if (!runtimeConfig.notify.providerKey) missing.push("NOTIFY_PROVIDER_KEY");
    return missing;
}

export default runtimeConfig;
