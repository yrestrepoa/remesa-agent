import "./agent/runtimeConfig";
import * as readline from "readline";
import Log from "./Log";
import { Agent } from "./agent/Agent";
import { errorMessage } from "./utils/errors";

const agent = new Agent();
let shuttingDown = false;

async function shutdown(reason: string, code = 0): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    Log.info(`Shutting down (${reason})`);
    try {
        await agent.stop();
    } finally {
        process.exit(code);
    }
}

function startChat(): void {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "tú › " });
    const conversationId = "cli";
    rl.prompt();
    rl.on("line", async (line) => {
        const text = line.trim();
        if (!text) return rl.prompt();
        if (text === "/exit") return void shutdown("chat exit");
        rl.pause();
        try {
            const reply = await agent.handleMessage(conversationId, text);
            console.log(`agente › ${reply.text || `(sin texto, stop_reason=${reply.stopReason})`}`);
        } catch (error) {
            console.log(`agente › error: ${errorMessage(error)}`);
        }
        rl.resume();
        rl.prompt();
    });
    rl.on("close", () => void shutdown("chat closed"));
}

async function main(): Promise<void> {
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("unhandledRejection", (error) => Log.error("Unhandled rejection", error instanceof Error ? error : new Error(String(error))));

    await agent.start();

    if (process.argv.includes("--chat") && process.stdin.isTTY) startChat();
}

main().catch((error) => {
    Log.error("Fatal error during startup", error instanceof Error ? error : null);
    void shutdown("startup failure", 1);
});
