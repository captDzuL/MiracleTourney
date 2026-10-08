// Regenerates public/templates/registration-import-template.{csv,xlsx}.
// Headers must stay recognisable by suggestRegistrationMapping() in
// src/lib/imports/registration-intake.ts. Run: node scripts/generate-registration-template.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public/templates");
mkdirSync(outDir, { recursive: true });

const PLAYER_SLOTS = 5;
const headers = [
  "Nama Tim",
  "Tag",
  "Nama Kapten",
  "No WhatsApp Kapten",
  "Email Kapten",
  "Captain IGN",
  "Captain UID",
  "Kapten Juga Pemain",
  ...Array.from({ length: PLAYER_SLOTS }, (_, i) => [
    `Player ${i + 1} Nickname`,
    `Player ${i + 1} UID`,
    `Player ${i + 1} Role`,
  ]).flat(),
];

// Row 1: kapten ikut bermain (dihitung otomatis) + 4 pemain lain.
// Row 2: kapten hanya manajer (Tidak) + 5 pemain.
const rows = [
  ["Contoh Squad Alpha", "CSA", "Budi Santoso", "081234567890", "budi@example.com", "BudiPro", "100000001", "Ya",
    "RaffiX", "100000002", "Jungler", "DinoGG", "100000003", "Roamer", "AgusYT", "100000004", "Gold Lane", "SiskaQ", "100000005", "Mid Lane", "", "", ""],
  ["Contoh Squad Beta", "CSB", "Siti Aminah", "081298765432", "siti@example.com", "SitiManager", "200000001", "Tidak",
    "KevinZ", "200000002", "EXP Lane", "LarasA", "200000003", "Jungler", "RioM", "200000004", "Mid Lane", "TomiK", "200000005", "Gold Lane", "NandaP", "200000006", "Roamer"],
];

const csvCell = (value) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
// BOM supaya Excel membaca UTF-8; parser impor membuang BOM.
writeFileSync(resolve(outDir, "registration-import-template.csv"), `﻿${csv}`, "utf8");

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Peserta");
sheet.addRow(headers);
rows.forEach((row) => sheet.addRow(row));
sheet.getRow(1).font = { bold: true };
sheet.views = [{ state: "frozen", ySplit: 1 }];
headers.forEach((header, index) => {
  const column = sheet.getColumn(index + 1);
  column.width = Math.max(14, header.length + 4);
  column.numFmt = "@"; // teks: jaga angka 0 di depan nomor WhatsApp dan UID
});
// Pastikan sel contoh bertipe teks, bukan angka.
sheet.eachRow((row, rowNumber) => {
  if (rowNumber > 1) row.eachCell((cell) => { cell.numFmt = "@"; });
});

const guide = workbook.addWorksheet("Petunjuk");
[
  ["Petunjuk pengisian"],
  [""],
  ["Satu baris = satu tim. Baris pertama (judul kolom) wajib ada dan jangan diubah urutannya."],
  ["Hapus dua baris contoh sebelum mengunggah data asli. Hanya sheet pertama (\"Peserta\") yang dibaca."],
  [""],
  ["Kolom wajib: Nama Tim, Captain IGN, Captain UID, Nama Kapten, dan minimal satu kontak (No WhatsApp atau Email Kapten)."],
  ["Tag: opsional, 2-5 karakter huruf/angka. Jika kosong dibuat otomatis dari nama tim."],
  ["Kapten Juga Pemain: isi Ya atau Tidak. Jika Ya, kapten otomatis dihitung sebagai pemain (jangan ditulis ulang di kolom Player)."],
  ["Player N Nickname / UID / Role: isi sesuai jumlah anggota. Role boleh kosong. UID tidak boleh sama dalam satu tim."],
  ["Jumlah pemain harus sesuai batas roster event; kolom Player melebihi batas mode game akan diabaikan."],
  [""],
  ["Aturan file: CSV atau XLSX, maksimal 5 MB dan 500 baris data, tanpa formula."],
  ["Jangan awali isi sel dengan = + - @ (termasuk +62). Tulis nomor sebagai 0812..."],
  ["Jika nama kolom Anda berbeda, sistem akan meminta Anda memetakan kolom saat pratinjau."],
].forEach((row) => guide.addRow(row));
guide.getRow(1).font = { bold: true, size: 14 };
guide.getColumn(1).width = 120;

await workbook.xlsx.writeFile(resolve(outDir, "registration-import-template.xlsx"));
console.log(`Wrote templates to ${outDir}`);
