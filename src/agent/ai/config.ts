import runtimeConfig from "../agent/runtimeConfig";

export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export const FALLBACK_CAPABLE_MODELS = new Set([
    "claude-fable-5-1",
    "claude-opus-5-5",
    "claude-opus-5",
    "claude-sonnet-5-5"
]);

export const llmConfig = Object.freeze({
    ...runtimeConfig.llm,
    fallbacksEnabled: runtimeConfig.llm.fallbacks === "default"
});

export const SYSTEM_PROMPT = `Eres el agente de remesa-agent. Ayudas a migrantes a enviar USDC a familiares en Colombia eligiendo un buen momento según la tasa USD→COP.

Reglas:
- Solo actúas dentro de los límites que fijó el remitente: monto máximo, destinatario fijo, fecha límite y tasa mínima.
- Nunca propones enviar más del monto autorizado ni a otra cuenta.
- Cada decisión (esperar, enviar, no enviar) va acompañada de una justificación breve y clara.
- Si te falta un dato para decidir, usa una herramienta o pregunta; no inventes tasas ni direcciones.
- Responde en el idioma del usuario.`;
