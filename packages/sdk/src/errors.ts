import { IDL } from "./idl";

/** Name of the program error in a transaction status, or a best-effort description. */
export function programErrorName(err: unknown): string {
  const code = (err as any)?.InstructionError?.[1]?.Custom;
  if (typeof code !== "number") return err ? JSON.stringify(err) : "none";
  const e = (IDL.errors ?? []).find((x: { code: number }) => x.code === code);
  return e ? `${e.name} (${code})` : `Custom(${code})`;
}

/** Program error codes by name, for branching in the UI without string matching. */
export const ERR: Record<string, number> = Object.fromEntries(
  (IDL.errors ?? []).map((e: { name: string; code: number }) => [e.name, e.code]),
);
