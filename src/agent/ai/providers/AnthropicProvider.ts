import Anthropic from "@anthropic-ai/sdk";
import Log from "../../Log";
import { FALLBACK_BETA, llmConfig } from "../config";
import type { ModelProfile } from "../../types/agent";
import type { LLMConversation, LLMProvider, LLMTurn, StopReason, ToolDefinition, ToolResult } from "../../types/llm";

const STOP_REASONS: Record<string, StopReason> = {
    end_turn: "end_turn",
    stop_sequence: "end_turn",
    tool_use: "tool_use",
    max_tokens: "max_tokens",
    refusal: "refusal",
    pause_turn: "pause_turn"
};

class AnthropicConversation implements LLMConversation {
    private messages: Anthropic.Beta.BetaMessageParam[] = [];

    constructor(private client: Anthropic, private system: string, private profile: ModelProfile) {}

    addUserText(text: string): void {
        this.messages.push({ role: "user", content: text });
    }

    addToolResults(results: ToolResult[]): void {
        this.messages.push({
            role: "user",
            content: results.map((r) => ({ type: "tool_result" as const, tool_use_id: r.toolCallId, content: r.content, is_error: r.isError }))
        });
    }

    async complete(tools: ToolDefinition[]): Promise<LLMTurn> {
        const useFallbacks = llmConfig.fallbacksEnabled && this.profile.supportsFallback;
        const started = Date.now();
        try {
            const stream = this.client.beta.messages.stream({
                model: this.profile.model,
                max_tokens: this.profile.maxTokens ?? llmConfig.maxTokens,
                thinking: { type: "adaptive" },
                output_config: { effort: this.profile.effort },
                cache_control: { type: "ephemeral" },
                system: this.system,
                messages: this.messages,
                ...(tools.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema, strict: true })) } : {}),
                ...(useFallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {})
            });
            const message = await stream.finalMessage();
            this.messages.push({ role: "assistant", content: message.content });

            Log.debug("LLM response", {
                provider: "anthropic",
                model: message.model,
                stopReason: message.stop_reason,
                ms: Date.now() - started,
                inputTokens: message.usage.input_tokens,
                cacheReadTokens: message.usage.cache_read_input_tokens,
                outputTokens: message.usage.output_tokens
            });
            if (message.stop_reason === "refusal") {
                Log.warn("LLM refused the request", { category: message.stop_details?.category ?? null });
            }

            return {
                model: message.model,
                text: message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim(),
                toolCalls: message.content
                    .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
                    .map((b) => ({ id: b.id, name: b.name, input: b.input })),
                stopReason: STOP_REASONS[message.stop_reason ?? ""] ?? "other"
            };
        } catch (error) {
            if (error instanceof Anthropic.AuthenticationError) {
                Log.error("Anthropic authentication failed; set ANTHROPIC_API_KEY or run `ant auth login`", error);
            } else if (error instanceof Anthropic.RateLimitError) {
                Log.error("Anthropic rate limit hit after SDK retries", error);
            } else if (error instanceof Anthropic.BadRequestError) {
                Log.error("Anthropic rejected the request", error);
            } else if (error instanceof Anthropic.APIError) {
                Log.error(`Anthropic API error ${error.status}`, error);
            } else {
                Log.error("Anthropic request failed", error instanceof Error ? error : null);
            }
            throw error;
        }
    }
}

export class AnthropicProvider implements LLMProvider {
    readonly name = "anthropic" as const;
    private client: Anthropic;

    constructor(client?: Anthropic) {
        this.client = client ?? new Anthropic();
    }

    createConversation(system: string, profile: ModelProfile): LLMConversation {
        return new AnthropicConversation(this.client, system, profile);
    }
}
