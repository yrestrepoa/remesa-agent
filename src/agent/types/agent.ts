export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type FallbackMode = "default" | "off";
export type StellarNetwork = "testnet" | "mainnet";

export type ModelProfileName = "primary" | "light";

export interface ModelProfile {
    name: ModelProfileName;
    model: string;
    effort: Effort;
    maxTokens: number | null;
    supportsFallback: boolean;
}

export interface AgentReply {
    conversationId: string;
    text: string;
    stopReason: string | null;
    toolCalls: number;
}
