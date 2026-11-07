import type { JsonSchema } from "./llm";

export interface ToolContext {
    conversationId: string;
}

export interface AgentTool<TInput = Record<string, unknown>> {
    name: string;
    description: string;
    inputSchema: JsonSchema;
    handler: (input: TInput, ctx: ToolContext) => Promise<unknown>;
}

export interface ToolExecutionResult {
    content: string;
    isError: boolean;
}
