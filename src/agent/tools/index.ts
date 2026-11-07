import toolRegistry from "./registry";
import { currentTimeTool } from "./currentTime";

export function registerTools(): void {
    if (!toolRegistry.has(currentTimeTool.name)) toolRegistry.register(currentTimeTool);
}

export { toolRegistry };
