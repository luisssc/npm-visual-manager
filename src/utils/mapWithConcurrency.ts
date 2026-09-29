/** Keep bounded workers busy as each task finishes, preserving result order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('Concurrency must be a positive integer');
  }
  const results = new Array<R>(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const index = currentIndex++;
      if (index >= items.length) {
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      results[index] = await mapper(items[index]!);
    }
  });

  await Promise.all(workers);
  return results;
}
