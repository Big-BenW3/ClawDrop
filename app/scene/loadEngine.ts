/**
 * The engine touches `document` and WebGL at import time, so it must never be imported during
 * server rendering. Everything loads it through here, from an effect, on the client.
 */
type Engine = typeof import("./engine");
let loading: Promise<Engine> | null = null;
export const loadEngine = (): Promise<Engine> => (loading ??= import("./engine"));
