import type { AppUser, TeamRegistrationRequestStatus } from "@/lib/platform/types";
import { getRegistrationImportHistoryForEvent, getRegistrationRecordsForEvent } from "@/lib/imports/repository";
import { assertUserCanManageEvent } from "@/lib/platform/shared/authz";
import { getEventPaymentSettingsForManager, getPaymentReviewForEvent } from "@/lib/registration/review-repository";
import {
  filterRegistrationRecords,
  type RegistrationRecordFilter,
  type RegistrationRecordPage,
  type RegistrationSource,
  type RegistrationStatus,
} from "@/lib/registration/records";
import type { RegistrationImportHistoryEntry } from "@/lib/imports/repository";
import type { EventPaymentManagerSettings, PaymentReviewEntry } from "@/lib/registration/review-repository";

export type OrganizerRegistrationQueueInput = {
  user: AppUser;
  eventId: string;
  status?: RegistrationStatus;
  source?: RegistrationSource;
  query?: string;
  page?: number;
  pageSize?: number;
};

export type OrganizerPaymentReviewInput = {
  user: AppUser;
  eventId: string;
  status?: TeamRegistrationRequestStatus;
};

export async function getEventRegistrationQueue(input: OrganizerRegistrationQueueInput): Promise<RegistrationRecordPage> {
  await assertUserCanManageEvent(input.user, input.eventId);
  const records = await getRegistrationRecordsForEvent(input.user, input.eventId);
  const filter: RegistrationRecordFilter = {
    status: input.status,
    source: input.source,
    query: input.query,
    page: input.page,
    pageSize: input.pageSize,
  };
  return filterRegistrationRecords(records, filter);
}

export async function getEventImportHistory(input: { user: AppUser; eventId: string }): Promise<RegistrationImportHistoryEntry[]> {
  await assertUserCanManageEvent(input.user, input.eventId);
  return getRegistrationImportHistoryForEvent(input.user, input.eventId);
}

export async function getEventPaymentReview(input: OrganizerPaymentReviewInput): Promise<PaymentReviewEntry[]> {
  await assertUserCanManageEvent(input.user, input.eventId);
  return getPaymentReviewForEvent(input.user, input.eventId, input.status);
}

export async function getEventQris(input: { user: AppUser; eventId: string }): Promise<EventPaymentManagerSettings> {
  await assertUserCanManageEvent(input.user, input.eventId);
  return getEventPaymentSettingsForManager(input.user, input.eventId);
}
