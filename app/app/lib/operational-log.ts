type SafeContext = Record<string, string | number | boolean | null | undefined>;

export function errorCategory(error: unknown) {
  return error instanceof Error && error.name ? error.name : "UnknownError";
}

export function logOperationalError(operation: string, context: SafeContext = {}) {
  console.error("[replacement-radar] operation_failed", { operation, ...context });
}
