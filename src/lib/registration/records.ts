export type RegistrationSource =
  | "captain_registration"
  | "import_xlsx"
  | "import_csv"
  | "unknown_import";

export type RegistrationStatus =
  | "pending_payment"
  | "pending_review"
  | "accepted"
  | "rejected"
  | "draft"
  | "needs_correction";

export type RegistrationRequestStatus =
  | "pending_payment"
  | "pending_review"
  | "approved"
  | "rejected"
  | "expired";

export type RegistrationRecord = {
  id: string;
  eventId: string;
  teamId?: string;
  teamName: string;
  teamTag: string;
  captainName: string;
  captainContact?: string;
  captainIgn?: string;
  captainUid?: string;
  captainIsPlayer: boolean;
  rosterCount: number;
  source: RegistrationSource;
  status: RegistrationStatus;
  createdAt: Date | string;
  origin: string;
};

export type RegistrationRecordFilter = {
  status?: RegistrationStatus;
  source?: RegistrationSource;
  query?: string;
  page?: number;
  pageSize?: number;
};

export type RegistrationRecordPage = {
  items: RegistrationRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function normalizeRegistrationSource(
  teamSource: string | null | undefined,
  importSourceKind?: string | null,
): RegistrationSource {
  if (teamSource === "registration") return "captain_registration";
  if (teamSource === "csv-import") return "import_csv";
  if (teamSource === "registration-intake") {
    if (importSourceKind === "xlsx") return "import_xlsx";
    if (importSourceKind === "csv") return "import_csv";
  }
  return "unknown_import";
}

export function mapRequestStatus(status: RegistrationRequestStatus): RegistrationStatus {
  switch (status) {
    case "pending_payment":
      return "pending_payment";
    case "pending_review":
      return "pending_review";
    case "approved":
      return "accepted";
    case "rejected":
      return "rejected";
    case "expired":
      return "needs_correction";
    default:
      throw new Error(`Unknown registration request status: ${status}`);
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  const integer = Math.trunc(value as number);
  return integer > 0 ? integer : fallback;
}

function createdAtTimestamp(value: RegistrationRecord["createdAt"]) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function filterRegistrationRecords(
  records: readonly RegistrationRecord[],
  filter: RegistrationRecordFilter = {},
): RegistrationRecordPage {
  const query = filter.query?.trim().toLocaleLowerCase();
  const filtered = records.filter((record) => {
    if (filter.status && record.status !== filter.status) return false;
    if (filter.source && record.source !== filter.source) return false;
    if (!query) return true;

    return [record.teamName, record.captainName].some((value) => value.toLocaleLowerCase().includes(query));
  });

  const ordered = filtered
    .map((record, index) => ({ record, index, createdAt: createdAtTimestamp(record.createdAt) }))
    .sort((left, right) => right.createdAt - left.createdAt || left.index - right.index)
    .map(({ record }) => record);

  const pageSize = normalizePositiveInteger(filter.pageSize, 25);
  const total = ordered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = normalizePositiveInteger(filter.page, 1);
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * pageSize;

  return {
    items: ordered.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
  };
}
