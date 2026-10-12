// Entity id check shared by the server actions. Plain module on purpose: not a server action file.
// Moved out of actions.ts without changes (refactor PR 1.5).


export function isSafeEntityId(id: string) {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}
