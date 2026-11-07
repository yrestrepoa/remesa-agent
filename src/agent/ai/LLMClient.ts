import runtimeConfig from "../agent/runtimeConfig";
import modelManager from "./ModelManager";
import { SYSTEM_PROMPT, llmConfig } from "./config";
import { AnthropicProvider } from "./providers/AnthropicProvider";
import { OpenAIProvider } from "./providers/OpenAIProvider";
import type { ModelProfileName } from "../types/agent";
import type { LLMConversation, LLMProvider } from "../types/llm";

class LLMClient {
    private provider: LLMProvider | null = null;

    getProvider(): LLMProvider {
        if (!this.provider) {
            this.provider = llmConfig.provider === "openai"
                ? new OpenAIProvider({ baseUrl: runtimeConfig.openai.baseUrl, apiKey: runtimeConfig.openai.apiKey })
                : new AnthropicProvider();
        }
        return this.provider;
    }

    createConversation(profile: ModelProfileName = "primary", system: string = SYSTEM_PROMPT): LLMConversation {
        return this.getProvider().createConversation(system, modelManager.get(profile));
    }
}

const llmClient = new LLMClient();
export default llmClient;
