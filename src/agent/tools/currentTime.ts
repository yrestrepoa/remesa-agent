import type { AgentTool } from "../types/tools";

export const currentTimeTool: AgentTool<{ timezone: string }> = {
    name: "get_current_time",
    description: "Returns the current date and time in ISO 8601 and in the given IANA timezone (e.g. America/Bogota). Use it before reasoning about deadlines.",
    inputSchema: {
        type: "object",
        properties: {
            timezone: { type: "string", description: "IANA timezone name, e.g. America/Bogota" }
        },
        required: ["timezone"],
        additionalProperties: false
    },
    async handler({ timezone }) {
        const now = new Date();
        return {
            iso: now.toISOString(),
            local: now.toLocaleString("es-CO", { timeZone: timezone }),
            timezone
        };
    }
};
