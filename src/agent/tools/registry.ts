import Log from "../Log";
import type { ToolDefinition } from "../types/llm";
import { errorMessage } from "../utils/errors";
import type { AgentTool, ToolContext, ToolExecutionResult } from "../types/tools";

export class ToolRegistry {
    private tools = new Map<string, AgentTool<any>>();

    register<T>(tool: AgentTool<T>): this {
        if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
        this.tools.set(tool.name, tool);
        return this;
    }

    has(name: string): boolean {
        return this.tools.has(name);
    }

    list(): string[] {
        return [...this.tools.keys()].sort();
    }

    definitions(): ToolDefinition[] {
        return this.list().map((name) => {
            const tool = this.tools.get(name)!;
            return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
        });
    }

    async execute(name: string, input: unknown, ctx: ToolContext): Promise<ToolExecutionResult> {
        const tool = this.tools.get(name);
        if (!tool) return { content: `Unknown tool: ${name}`, isError: true };
        const started = Date.now();
        try {
            const output = await tool.handler(input as any, ctx);
            Log.debug(`Tool ${name} ok`, { ms: Date.now() - started });
            return { content: typeof output === "string" ? output : JSON.stringify(output), isError: false };
        } catch (error) {
            Log.warn(`Tool ${name} failed`, { ms: Date.now() - started, error: errorMessage(error) });
            return { content: `Tool error: ${errorMessage(error)}`, isError: true };
        }
    }
}

const toolRegistry = new ToolRegistry();
export default toolRegistry;
