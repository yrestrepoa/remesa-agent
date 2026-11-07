import Log from "../Log";
import llmClient from "./LLMClient";
import { llmConfig } from "./config";
import toolRegistry from "../tools/registry";
import type { AgentReply, ModelProfileName } from "../types/agent";
import type { LLMConversation, ToolResult } from "../types/llm";

class ConversationManager {
    private conversations = new Map<string, LLMConversation>();

    reset(conversationId: string): void {
        this.conversations.delete(conversationId);
    }

    private get(conversationId: string, profile: ModelProfileName): LLMConversation {
        let conversation = this.conversations.get(conversationId);
        if (!conversation) {
            conversation = llmClient.createConversation(profile);
            this.conversations.set(conversationId, conversation);
        }
        return conversation;
    }

    async send(conversationId: string, userText: string, profile: ModelProfileName = "primary"): Promise<AgentReply> {
        const conversation = this.get(conversationId, profile);
        conversation.addUserText(userText);

        const tools = toolRegistry.definitions();
        let toolCalls = 0;

        for (let iteration = 0; iteration < llmConfig.maxToolIterations; iteration++) {
            const turn = await conversation.complete(tools);

            if (turn.stopReason === "pause_turn") continue;
            if (turn.stopReason !== "tool_use") {
                return { conversationId, text: turn.text, stopReason: turn.stopReason, toolCalls };
            }

            toolCalls += turn.toolCalls.length;
            const results = await Promise.all(turn.toolCalls.map(async (call): Promise<ToolResult> => {
                if (call.inputError) return { toolCallId: call.id, content: call.inputError, isError: true };
                const result = await toolRegistry.execute(call.name, call.input, { conversationId });
                return { toolCallId: call.id, content: result.content, isError: result.isError };
            }));
            conversation.addToolResults(results);
        }

        Log.warn("Tool loop hit the iteration limit", { conversationId, limit: llmConfig.maxToolIterations });
        return { conversationId, text: "", stopReason: "max_tool_iterations", toolCalls };
    }
}

const conversationManager = new ConversationManager();
export default conversationManager;
