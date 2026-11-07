import OpenAI from "openai";
import Log from "../../Log";
import type { ModelProfile } from "../../types/agent";
import type { LLMConversation, LLMProvider, LLMTurn, StopReason, ToolCall, ToolDefinition, ToolResult } from "../../types/llm";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatCreate = Pick<OpenAI["chat"]["completions"], "create">;

export interface OpenAIProviderOptions {
    baseUrl: string;
    apiKey?: string;
}

const STOP_REASONS: Record<string, StopReason> = {
    stop: "end_turn",
    tool_calls: "tool_use",
    function_call: "tool_use",
    length: "max_tokens",
    content_filter: "refusal"
};

function parseArguments(raw: string): Pick<ToolCall, "input" | "inputError"> {
    try {
        return { input: raw.trim() ? JSON.parse(raw) : {} };
    } catch (error) {
        return { input: {}, inputError: `Invalid JSON arguments: ${(error as Error).message}` };
    }
}

export class OpenAIConversation implements LLMConversation {
    private messages: ChatMessage[];

    constructor(private completions: ChatCreate, system: string, private profile: ModelProfile) {
        this.messages = [{ role: "system", content: system }];
    }

    addUserText(text: string): void {
        this.messages.push({ role: "user", content: text });
    }

    addToolResults(results: ToolResult[]): void {
        for (const r of results) this.messages.push({ role: "tool", tool_call_id: r.toolCallId, content: r.content });
    }

    async complete(tools: ToolDefinition[]): Promise<LLMTurn> {
        const started = Date.now();
        try {
            const completion = await this.completions.create({
                model: this.profile.model,
                messages: this.messages,
                ...(this.profile.maxTokens ? { max_completion_tokens: this.profile.maxTokens } : {}),
                ...(tools.length ? {
                    tools: tools.map((t) => ({
                        type: "function" as const,
                        function: { name: t.name, description: t.description, parameters: t.inputSchema }
                    }))
                } : {})
            });

            const choice = completion.choices[0];
            if (!choice) throw new Error("OpenAI endpoint returned no choices");
            const message = choice.message;
            const functionCalls = (message.tool_calls ?? []).filter((c) => c.type === "function");

            this.messages.push({
                role: "assistant",
                content: message.content ?? null,
                ...(functionCalls.length ? { tool_calls: functionCalls } : {})
            });

            Log.debug("LLM response", {
                provider: "openai",
                model: completion.model,
                finishReason: choice.finish_reason,
                ms: Date.now() - started,
                inputTokens: completion.usage?.prompt_tokens,
                outputTokens: completion.usage?.completion_tokens
            });

            const toolCalls: ToolCall[] = functionCalls.map((c) => ({ id: c.id, name: c.function.name, ...parseArguments(c.function.arguments) }));
            const stopReason = toolCalls.length ? "tool_use" : STOP_REASONS[choice.finish_reason ?? ""] ?? "other";
            if (stopReason === "refusal" || message.refusal) Log.warn("LLM refused the request", { refusal: message.refusal ?? null });

            return {
                model: completion.model,
                text: (message.content ?? message.refusal ?? "").trim(),
                toolCalls,
                stopReason
            };
        } catch (error) {
            if (error instanceof OpenAI.APIError) {
                Log.error(`OpenAI endpoint error ${error.status ?? "?"}`, error);
            } else {
                Log.error("OpenAI request failed", error instanceof Error ? error : null);
            }
            throw error;
        }
    }
}

export class OpenAIProvider implements LLMProvider {
    readonly name = "openai" as const;
    private completions: ChatCreate;

    constructor(options: OpenAIProviderOptions, completions?: ChatCreate) {
        if (!options.baseUrl) throw new Error("OPENAI_BASE_URL is required for the OpenAI provider");
        this.completions = completions ?? new OpenAI({ baseURL: options.baseUrl, apiKey: options.apiKey || "unused" }).chat.completions;
    }

    createConversation(system: string, profile: ModelProfile): LLMConversation {
        return new OpenAIConversation(this.completions, system, profile);
    }
}
