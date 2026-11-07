import Log from "../Log";
import { Worker } from "./Worker";

export class RateWatcher extends Worker {
    readonly name = "rate-watcher";

    protected async tick(): Promise<void> {
        Log.debug("Rate watcher tick (no price source configured yet)");
    }
}
