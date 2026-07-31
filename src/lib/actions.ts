"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  importTeamsFromRows,
  parseAndValidateTeamImport,
} from "@/lib/imports/team-import";
import { signInDemo, signOutDemo } from "@/lib/auth/session";
import {
  addPlayer,
  createEvent,
  getImportSnapshot,
  registerTeam,
  updateEventStream,
} from "@/lib/platform/demo-store";

export async function loginAction(formData: FormData) {
  const email = z.string().email().parse(formData.get("email"));
  const result = await signInDemo(email);

  if (!result.ok) {
    redirect("/login?error=invalid");
  }

  redirect(result.user.role === "admin" ? "/admin" : "/captain");
}

export async function logoutAction() {
  await signOutDemo();
  redirect("/");
}

export async function captainRegisterTeamAction(formData: FormData) {
  const input = z.object({
    eventId: z.string().min(1),
    captainId: z.string().min(1),
    name: z.string().min(2),
    tag: z.string().min(2).max(4),
  }).parse({
    eventId: formData.get("eventId"),
    captainId: formData.get("captainId"),
    name: formData.get("name"),
    tag: formData.get("tag"),
  });

  registerTeam(input);
  redirect("/captain?success=team-created");
}

export async function captainAddPlayerAction(formData: FormData) {
  const input = z.object({
    teamId: z.string().min(1),
    eventId: z.string().min(1),
    displayName: z.string().min(2),
    nickname: z.string().min(2),
    position: z.string().min(2),
  }).parse({
    teamId: formData.get("teamId"),
    eventId: formData.get("eventId"),
    displayName: formData.get("displayName"),
    nickname: formData.get("nickname"),
    position: formData.get("position"),
  });

  addPlayer(input);
  redirect("/captain?success=player-added");
}

export async function adminCreateEventAction(formData: FormData) {
  const input = z.object({
    name: z.string().min(3),
    slug: z.string().min(3),
    gameModeId: z.string().min(1),
    format: z.enum(["Single Elimination", "League"]),
    participantCap: z.union([z.literal(8), z.literal(12), z.literal(16), z.literal(24)]),
  }).parse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    gameModeId: formData.get("gameModeId"),
    format: formData.get("format"),
    participantCap: Number(formData.get("participantCap")),
  });

  createEvent(input);
  redirect("/admin?success=event-created");
}

export async function adminUpdateStreamAction(formData: FormData) {
  const input = z.object({
    eventId: z.string().min(1),
    url: z.string().url(),
    label: z.string().min(2),
  }).parse({
    eventId: formData.get("eventId"),
    url: formData.get("url"),
    label: formData.get("label"),
  });

  updateEventStream(input.eventId, input.url, input.label);
  redirect("/admin?success=stream-updated");
}

export async function adminImportTeamsCsvAction(formData: FormData) {
  const file = formData.get("csvFile");

  if (!(file instanceof File)) {
    redirect("/admin?error=csv-file-required");
  }

  const csvText = await file.text();
  const result = parseAndValidateTeamImport(csvText, getImportSnapshot());

  if (!result.ok) {
    redirect(`/admin?importError=${encodeURIComponent(result.errors.join(" | "))}`);
  }

  const imported = importTeamsFromRows(result.rows);
  redirect(`/admin?success=teams-imported&count=${imported.importedCount}`);
}
