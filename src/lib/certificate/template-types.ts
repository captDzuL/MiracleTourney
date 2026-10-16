// Input data of the certificate template.
// Moved out of template.ts without changes (refactor Phase 4, 4d-cert).


export interface CertificateData {
  eventName: string;
  gameId: string;
  gameName: string;
  teamName: string;
  accentColor: string;
  characterArtUrl: string | null;
  certId: string;
  date: string;
  eventSlug: string;
  baseUrl: string;
  mvpArtUrl?: string | null;
  mvpName?: string | null;
  mvpRoleLabel?: string | null;
}
