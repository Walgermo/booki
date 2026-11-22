/** Throws the reason when a person's method is denied by role. For use inside a primitive's api. */
export function refuseDenied(options: { denied?: Record<string, string> }, method: string): void {
  const reason = options.denied?.[method];
  if (reason) throw new Error(reason);
}
