// PostgreSQL aborts these transactions completely. Retry the entire operation,
// including its authorization guards, never an individual mutation.
export async function retryStaffTransaction<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
      if (attempt >= 2 || (code !== "40P01" && code !== "40001")) throw error;
    }
  }
}
