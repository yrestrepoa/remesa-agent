import type { ModelProfile } from "./agent";

export type ProviderName = "anthropic" | "openai";

export interface JsonSchema {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
    [key: string]: unknown;
}

export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: JsonSchema;
}

export interface ToolCall {
    id: string;
    name: string;
    input: unknown;
    inputError?: string;
}

export interface ToolResult {
    toolCallId: string;
    content: string;
    isError: boolean;
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "pause_turn" | "other";

export interface LLMTurn {
    model: string;
    text: string;
    toolCalls: ToolCall[];
    stopReason: StopReason;
}

export interface LLMConversation {
    addUserText(text: string): void;
    addToolResults(results: ToolResult[]): void;
    complete(tools: ToolDefinition[]): Promise<LLMTurn>;
}

export interface LLMProvider {
    readonly name: ProviderName;
    createConversation(system: string, profile: ModelProfile): LLMConversation;
}
