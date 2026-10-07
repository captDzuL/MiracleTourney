const dateTimeInputPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function zonedParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function offsetAt(value: Date, timeZone: string) {
  const parts = zonedParts(value, timeZone);
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return representedAsUtc - value.getTime();
}

export function eventDateToLocalInput(value: Date, timeZone: string) {
  const parts = zonedParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function eventLocalInputToIso(value: string, timeZone: string) {
  if (!value) return null;
  const match = dateTimeInputPattern.exec(value);
  if (!match) throw new Error("Invalid event date and time");

  const [, year, month, day, hour, minute] = match;
  const localAsUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  let instant = new Date(localAsUtc - offsetAt(new Date(localAsUtc), timeZone));
  instant = new Date(localAsUtc - offsetAt(instant, timeZone));

  if (eventDateToLocalInput(instant, timeZone) !== value) {
    throw new Error("Event date and time does not exist in the selected timezone");
  }
  return instant.toISOString();
}
