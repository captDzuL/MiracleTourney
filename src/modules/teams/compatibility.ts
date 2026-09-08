import type { Player } from "@/lib/platform/types";

import { addPlayerWithoutActor as addPlayerWithoutActorInRepository } from "./repository";
import type { AddPlayerInput } from "./repository";

/** Compatibility-only actor-less mutation for registration/import code. */
export async function addPlayerWithoutActor(input: AddPlayerInput): Promise<Player> {
  return addPlayerWithoutActorInRepository(input);
}