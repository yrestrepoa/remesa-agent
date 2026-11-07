import Log from "../Log";
import { errorMessage } from "../utils/errors";

export abstract class Worker {
    abstract readonly name: string;
    private timer: NodeJS.Timeout | null = null;
    private running = false;

    constructor(protected readonly intervalMs: number) {}

    protected abstract tick(): Promise<void>;

    start(): void {
        if (this.timer) return;
        Log.info(`Worker ${this.name} started`, { intervalMs: this.intervalMs });
        this.timer = setInterval(() => void this.runTick(), this.intervalMs);
        void this.runTick();
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    private async runTick(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            await this.tick();
        } catch (error) {
            Log.warn(`Worker ${this.name} tick failed`, { error: errorMessage(error) });
        } finally {
            this.running = false;
        }
    }
}
