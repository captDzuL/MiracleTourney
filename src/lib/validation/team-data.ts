import { containsProfanity } from "./profanity";

export type TeamDataInput = {
  teamName: string;
  teamTag: string;
  captainName: string;
  captainContact?: string;
};
export type ValidationError = { field: string; message: string };

export function validateTeamData(input: TeamDataInput): ValidationError[] {
  const errors: ValidationError[] = [];

  if (input.teamName.trim().length < 2 || input.teamName.trim().length > 64) {
    errors.push({ field: "team_name", message: "Nama tim harus antara 2-64 karakter" });
  } else if (containsProfanity(input.teamName)) {
    errors.push({ field: "team_name", message: "Nama tim mengandung kata yang tidak diizinkan" });
  }

  if (!/^[A-Z0-9]{2,5}$/.test(input.teamTag)) {
    errors.push({ field: "team_tag", message: "Tag tim harus 2-5 karakter kapital atau angka" });
  } else if (containsProfanity(input.teamTag)) {
    errors.push({ field: "team_tag", message: "Tag tim mengandung kata yang tidak diizinkan" });
  }

  if (input.captainName.trim().length < 2 || input.captainName.trim().length > 64) {
    errors.push({ field: "captain_name", message: "Nama kapten harus antara 2-64 karakter" });
  } else if (containsProfanity(input.captainName)) {
    errors.push({ field: "captain_name", message: "Nama kapten mengandung kata yang tidak diizinkan" });
  }

  return errors;
}
