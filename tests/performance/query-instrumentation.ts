export type OrganizerReaderQuery = Readonly<{
  model: string;
  method: string;
  args: Record<string, unknown>;
}>;

export async function countQueries<T>(
  work: () => Promise<T>,
  calls: readonly OrganizerReaderQuery[],
): Promise<Readonly<{ value: T; count: number; calls: readonly OrganizerReaderQuery[] }>> {
  const value = await work();
  return { value, count: calls.length, calls };
}
