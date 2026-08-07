export interface ActiveDailyNoteFile {
  path: string;
  basename: string;
  extension: string;
}

export interface CoreDailyNoteSettings {
  folder?: string;
  format?: string;
  template?: string;
}

export interface ParsedDailyDate {
  isValid(): boolean;
  format(format: string): string;
}

export class ActiveDailyNoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActiveDailyNoteError";
  }
}

function configuredFolder(folder: string | undefined): string {
  return (folder ?? "").replaceAll("\\", "/").replace(/\/+$/u, "");
}

function numericDateTokens(format: string): Array<{ token: string; start: number; end: number }> {
  const tokens: Array<{ token: string; start: number; end: number }> = [];
  let index = 0;
  while (index < format.length) {
    if (format[index] === "\\") {
      index += 2;
      continue;
    }
    if (format[index] === "[") {
      const literalEnd = format.indexOf("]", index + 1);
      index = literalEnd === -1 ? format.length : literalEnd + 1;
      continue;
    }
    if (/[YMD]/u.test(format[index])) {
      const start = index;
      const tokenChar = format[index];
      while (index < format.length && format[index] === tokenChar && index - start < 5) index += 1;
      tokens.push({ token: format.slice(start, index), start, end: index });
      continue;
    }
    index += 1;
  }
  return tokens;
}

export function isUnambiguousDailyFormat(format: unknown): format is string {
  if (typeof format !== "string" || !format) return false;
  const dateTokens = numericDateTokens(format);
  const dayTokens = dateTokens.filter(({ token }) => token.startsWith("D"));
  const hasDayOfYear = dayTokens.some(({ token }) => token.length >= 3);
  const hasDayOfMonth = dayTokens.some(({ token }) => token.length <= 2);
  const hasMonth = dateTokens.some(({ token }) => token.startsWith("M"));
  const hasYear = dateTokens.some(({ token }) => token.startsWith("Y"));
  if (!hasYear || !(hasDayOfYear || (hasMonth && hasDayOfMonth))) return false;

  // Collision proof below, rather than token adjacency, decides whether a
  // particular active path maps to exactly one day.
  return dateTokens.some(({ token }) => token === "YYYY");
}

function relativeStemFor(filePath: string, folder: string): string {
  const path = filePath.replaceAll("\\", "/");
  const prefix = folder ? `${folder}/` : "";
  if (folder && !path.startsWith(prefix)) {
    throw new ActiveDailyNoteError("The active note is outside the configured core Daily Notes folder.");
  }
  const relativePath = path.slice(prefix.length);
  if (!relativePath.endsWith(".md")) {
    throw new ActiveDailyNoteError("The active note must be a Markdown Daily Note.");
  }
  return relativePath.slice(0, -3);
}

export function resolveActiveDailyDate(
  file: ActiveDailyNoteFile,
  settings: CoreDailyNoteSettings,
  parseDateFromPath: (relativeStem: string, format: string, strict?: boolean) => ParsedDailyDate | null,
  getDateFromFile?: (file: ActiveDailyNoteFile, granularity: "day") => ParsedDailyDate | null,
  createDateFromIso?: (isoDate: string) => ParsedDailyDate | null
): string {
  if (file.extension.toLowerCase() !== "md") {
    throw new ActiveDailyNoteError("Open an existing core Daily Note before running this command.");
  }
  if (!isUnambiguousDailyFormat(settings.format)) {
    throw new ActiveDailyNoteError("The core Daily Notes filename format cannot identify one calendar date.");
  }

  const folder = configuredFolder(settings.folder);
  const format = settings.format;
  const relativeStem = relativeStemFor(file.path, folder);
  let parsedDate = parseDateFromPath(relativeStem, format, true);
  if (!parsedDate?.isValid() || parsedDate.format(format) !== relativeStem) {
    if (!createDateFromIso) {
      throw new ActiveDailyNoteError("The active note path is not the canonical core Daily Note for one date.");
    }
    const looseDate = parseDateFromPath(relativeStem, format, false);
    if (!looseDate?.isValid()) {
      throw new ActiveDailyNoteError("The active note path is not the canonical core Daily Note for one date.");
    }
    const candidates = matchingDates(relativeStem, format, looseDate.format("YYYY-MM-DD"), createDateFromIso);
    if (candidates.length !== 1) {
      throw new ActiveDailyNoteError("The active note path can represent more than one calendar date.");
    }
    parsedDate = candidates[0];
  }
  const formattedPath = `${folder ? `${folder}/` : ""}${parsedDate.format(format)}.md`;
  if (file.path.replaceAll("\\", "/") !== formattedPath) {
    throw new ActiveDailyNoteError("The active note path is not the canonical core Daily Note path.");
  }
  if (!createDateFromIso || hasDatePathCollision(relativeStem, format, parsedDate, createDateFromIso)) {
    throw new ActiveDailyNoteError("The active note path can represent more than one calendar date.");
  }

  // Keep the interface's canonical date parser as a consistency check, but
  // never use its basename-only result as proof of the configured path.
  // The interface helper is basename-oriented and cannot prove formats whose
  // date is distributed across configured path segments (for example
  // YYYY/MM/DD). Use it as a consistency check only for filename-only formats.
  if (getDateFromFile && !format.includes("/")) {
    const interfaceDate = getDateFromFile(file, "day");
    if (interfaceDate?.isValid() && interfaceDate.format("YYYY-MM-DD") !== parsedDate.format("YYYY-MM-DD")) {
      throw new ActiveDailyNoteError("The active note date could not be confirmed by core Daily Notes.");
    }
  }
  const targetDate = parsedDate.format("YYYY-MM-DD");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(targetDate)) {
    throw new ActiveDailyNoteError("The active note did not resolve to one calendar date.");
  }
  return targetDate;
}

function isoDate(year: number, dayOfYear: number): string {
  const date = new Date(Date.UTC(year, 0, 1 + dayOfYear));
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function matchingDates(
  relativeStem: string,
  format: string,
  seedIso: string,
  createDateFromIso: (isoDate: string) => ParsedDailyDate | null
): ParsedDailyDate[] {
  const targetYear = Number(seedIso.slice(0, 4));
  const matches: ParsedDailyDate[] = [];
  const years = [targetYear - 100, targetYear - 1, targetYear, targetYear + 1, targetYear + 100];
  for (const year of years) {
    const daysInYear = new Date(Date.UTC(year, 1, 29)).getUTCDate() === 29 ? 366 : 365;
    for (let dayOfYear = 0; dayOfYear < daysInYear; dayOfYear += 1) {
      const candidate = createDateFromIso(isoDate(year, dayOfYear));
      if (candidate?.isValid() && candidate.format(format) === relativeStem) matches.push(candidate);
    }
  }
  return matches;
}

function hasDatePathCollision(
  relativeStem: string,
  format: string,
  parsedDate: ParsedDailyDate,
  createDateFromIso: (isoDate: string) => ParsedDailyDate | null
): boolean {
  const targetIso = parsedDate.format("YYYY-MM-DD");
  const matches = matchingDates(relativeStem, format, targetIso, createDateFromIso);
  return matches.some((candidate) => candidate.format("YYYY-MM-DD") !== targetIso);
}

export function assertActiveDailyNoteUnchanged(
  initialFile: ActiveDailyNoteFile,
  currentFile: ActiveDailyNoteFile | null,
  initialSettings: CoreDailyNoteSettings,
  currentSettings: CoreDailyNoteSettings,
  initialDate: string,
  currentDate: string
): void {
  if (
    !currentFile ||
    currentFile !== initialFile ||
    currentFile.path !== initialFile.path ||
    currentFile.basename !== initialFile.basename
  ) {
    throw new ActiveDailyNoteError("The active Daily Note changed, moved, or was deleted; import aborted before writing.");
  }
  const settingsChanged =
    (initialSettings.folder ?? "") !== (currentSettings.folder ?? "") ||
    (initialSettings.format ?? "") !== (currentSettings.format ?? "") ||
    (initialSettings.template ?? "") !== (currentSettings.template ?? "");
  if (settingsChanged || initialDate !== currentDate) {
    throw new ActiveDailyNoteError("The active Daily Note or core Daily Notes configuration changed; import aborted before writing.");
  }
}
