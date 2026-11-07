import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenAIProvider } from "../ai/providers/OpenAIProvider";
import type { ModelProfile } from "../types/agent";

const profile: ModelProfile = { name: "primary", model: "test-model", effort: "medium", maxTokens: null, supportsFallback: false };

function fakeCompletions(responses: any[]) {
    const requests: any[] = [];
    return {
        requests,
        create: (async (body: any) => {
            requests.push(structuredClone(body));
            return responses.shift();
        }) as any
    };
}

test("requires a base URL", () => {
    assert.throws(() => new OpenAIProvider({ baseUrl: "" }), /OPENAI_BASE_URL/);
});

test("maps tool calls, tool results and final text through the chat completions format", async () => {
    const fake = fakeCompletions([
        {
            model: "test-model",
            choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "get_current_time", arguments: "{\"timezone\":\"America/Bogota\"}" } }] } }]
        },
        { model: "test-model", choices: [{ finish_reason: "stop", message: { role: "assistant", content: "listo" } }] }
    ]);
    const conversation = new OpenAIProvider({ baseUrl: "http://localhost:1234/v1" }, fake).createConversation("system prompt", profile);
    const tools = [{ name: "get_current_time", description: "time", inputSchema: { type: "object" as const, properties: {}, additionalProperties: false } }];

    conversation.addUserText("hola");
    const first = await conversation.complete(tools);
    assert.equal(first.stopReason, "tool_use");
    assert.deepEqual(first.toolCalls, [{ id: "call_1", name: "get_current_time", input: { timezone: "America/Bogota" } }]);
    assert.equal(fake.requests[0].tools[0].function.name, "get_current_time");
    assert.equal(fake.requests[0].max_completion_tokens, undefined);

    conversation.addToolResults([{ toolCallId: "call_1", content: "{}", isError: false }]);
    const second = await conversation.complete(tools);
    assert.equal(second.stopReason, "end_turn");
    assert.equal(second.text, "listo");
    assert.deepEqual(fake.requests[1].messages.map((m: any) => m.role), ["system", "user", "assistant", "tool"]);
});

test("reports invalid tool-call JSON instead of throwing", async () => {
    const fake = fakeCompletions([
        { model: "m", choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "c", type: "function", function: { name: "x", arguments: "{bad" } }] } }] }
    ]);
    const conversation = new OpenAIProvider({ baseUrl: "http://localhost/v1" }, fake).createConversation("s", profile);
    conversation.addUserText("hi");
    const turn = await conversation.complete([]);
    assert.match(turn.toolCalls[0].inputError ?? "", /Invalid JSON/);
});
