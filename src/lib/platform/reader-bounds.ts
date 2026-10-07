export class ReaderResultOverflowError extends Error {
  readonly resource: string;
  readonly limit: number;

  constructor(resource: string, limit: number) {
    super(`${resource} returned more than ${limit} rows`);
    this.name = "ReaderResultOverflowError";
    this.resource = resource;
    this.limit = limit;
  }
}

export function readerProbeLimit(limit: number): number {
  return limit + 1;
}

export function assertReaderResultWithinLimit<T>(resource: string, rows: readonly T[], limit: number): readonly T[] {
  if (rows.length > limit) throw new ReaderResultOverflowError(resource, limit);
  return rows;
}
