import type { ActorContext } from "@/modules/identity";

export type RegistrationActor = ActorContext;

export type RegisterTeamInput = {
  eventId: string;
  captainId: string;
  name?: string;
  tag?: string;
  draftTeamId?: string;
};

export type PaymentSettingsInput = {
  qrisImageUrl?: string | null;
  instructions?: string | null;
};