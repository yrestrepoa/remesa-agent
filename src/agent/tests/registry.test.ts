import { test } from "node:test";
import assert from "node:assert/strict";
import { ToolRegistry } from "../tools/registry";
import { currentTimeTool } from "../tools/currentTime";

test("registry exposes provider-neutral tool definitions", () => {
    const registry = new ToolRegistry().register(currentTimeTool);
    const defs = registry.definitions();
    assert.equal(defs.length, 1);
    assert.equal(defs[0].name, "get_current_time");
    assert.equal(defs[0].inputSchema.additionalProperties, false);
});

test("registry rejects duplicate names", () => {
    const registry = new ToolRegistry().register(currentTimeTool);
    assert.throws(() => registry.register(currentTimeTool));
});

test("execute returns an error result for unknown tools and handler failures", async () => {
    const registry = new ToolRegistry().register({
        name: "boom",
        description: "always fails",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        handler: async () => { throw new Error("nope"); }
    });
    assert.deepEqual(await registry.execute("missing", {}, { conversationId: "t" }), { content: "Unknown tool: missing", isError: true });
    const failed = await registry.execute("boom", {}, { conversationId: "t" });
    assert.equal(failed.isError, true);
    assert.match(failed.content, /nope/);
});

test("execute serializes handler output", async () => {
    const registry = new ToolRegistry().register(currentTimeTool);
    const result = await registry.execute("get_current_time", { timezone: "America/Bogota" }, { conversationId: "t" });
    assert.equal(result.isError, false);
    assert.equal(JSON.parse(result.content).timezone, "America/Bogota");
});
