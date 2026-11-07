import Log from "../Log";
import cacheManager from "../managers/CacheManager";
import conversationManager from "../ai/ConversationManager";
import modelManager from "../ai/ModelManager";
import { registerTools, toolRegistry } from "../tools";
import { RateWatcher } from "../workers/RateWatcher";
import type { Worker } from "../workers/Worker";
import runtimeConfig, { configErrors, missingSettings } from "./runtimeConfig";
import type { AgentReply } from "../types/agent";

export class Agent {
    private workers: Worker[] = [];
    private started = false;

    async start(): Promise<void> {
        if (this.started) return;

        const errors = configErrors();
        if (errors.length) throw new Error(`Invalid configuration: ${errors.join("; ")}`);
        this.started = true;

        await cacheManager.initialize();
        registerTools();

        const missing = missingSettings();
        if (missing.length) Log.warn("Some settings are empty; related features are disabled", { missing: missing.join(", ") });

        this.workers = [new RateWatcher(runtimeConfig.loop.tickMs)];
        this.workers.forEach((w) => w.start());

        Log.success("Agent started", {
            env: runtimeConfig.env,
            network: runtimeConfig.stellar.network,
            provider: runtimeConfig.llm.provider,
            models: modelManager.all().map((p) => `${p.name}=${p.model}`).join(", "),
            tools: toolRegistry.list().join(", ") || "none"
        });
    }

    async handleMessage(conversationId: string, text: string): Promise<AgentReply> {
        return conversationManager.send(conversationId, text);
    }

    async stop(): Promise<void> {
        if (!this.started) return;
        this.started = false;
        this.workers.forEach((w) => w.stop());
        await cacheManager.shutdown();
        Log.info("Agent stopped");
    }
}
