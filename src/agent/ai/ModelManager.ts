import runtimeConfig from "../agent/runtimeConfig";
import { FALLBACK_CAPABLE_MODELS, llmConfig } from "./config";
import type { ModelProfile, ModelProfileName } from "../types/agent";

function buildProfiles(): Record<ModelProfileName, ModelProfile> {
    if (llmConfig.provider === "openai") {
        const openai = runtimeConfig.openai;
        return {
            primary: { name: "primary", model: openai.model, effort: llmConfig.effort, maxTokens: openai.maxTokens, supportsFallback: false },
            light: { name: "light", model: openai.lightModel || openai.model, effort: "low", maxTokens: openai.maxTokens, supportsFallback: false }
        };
    }
    return {
        primary: {
            name: "primary",
            model: llmConfig.model,
            effort: llmConfig.effort,
            maxTokens: llmConfig.maxTokens,
            supportsFallback: FALLBACK_CAPABLE_MODELS.has(llmConfig.model)
        },
        light: {
            name: "light",
            model: llmConfig.lightModel,
            effort: "low",
            maxTokens: 16000,
            supportsFallback: FALLBACK_CAPABLE_MODELS.has(llmConfig.lightModel)
        }
    };
}

class ModelManager {
    private profiles: Record<ModelProfileName, ModelProfile> | null = null;

    private load(): Record<ModelProfileName, ModelProfile> {
        if (!this.profiles) this.profiles = buildProfiles();
        return this.profiles;
    }

    get(name: ModelProfileName = "primary"): ModelProfile {
        return this.load()[name];
    }

    all(): ModelProfile[] {
        return Object.values(this.load());
    }
}

const modelManager = new ModelManager();
export default modelManager;
