import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseCalendarPayloadJson } from "./calendarPayload";
import { CALENDAR_EVENTS_SCRIPT } from "./calendarEventsSource";
import { validateTargetDate } from "./calendarPayload";
import type { CalendarPayload } from "./types";

const execFileAsync = promisify(execFile);

export interface CalendarProcessResult {
  stdout: string;
  stderr: string;
}

export interface CalendarInfo {
  id: string;
  title: string;
  source: string | null;
}

export type CalendarCommandRunner = (
  executable: string,
  args: string[],
  options: { encoding: "utf8"; timeout: number; maxBuffer: number; shell: false; windowsHide: boolean }
) => Promise<CalendarProcessResult>;

const defaultRunner: CalendarCommandRunner = async (executable, args, options) => (
  await execFileAsync(executable, args, options) as unknown as CalendarProcessResult
);

export class CalendarBridgeError extends Error {
  readonly isPermissionFailure: boolean;

  constructor(message: string, isPermissionFailure = false) {
    super(message);
    this.name = "CalendarBridgeError";
    this.isPermissionFailure = isPermissionFailure;
  }
}

const permissionCodePattern = /\bEVENTKIT_PERMISSION_(?:DENIED|RESTRICTED|WRITE_ONLY|REQUEST_TIMEOUT|UNAVAILABLE)\b/;

function sanitizedDetails(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 500);
}

function permissionCode(value: unknown): string | null {
  const match = typeof value === "string" ? value.match(permissionCodePattern) : null;
  return match?.[0] ?? null;
}

function permissionMessage(code: string): string {
  return `EventKit Calendar permission failed (${code}). Allow Calendar access in System Settings → Privacy & Security → Calendars, then try again.`;
}

function nativeFailureMessage(details: string): string {
  return `EventKit bridge failed: ${details || "no diagnostic details were returned."}`;
}

function rejectedCommandDetails(error: unknown): { details: string; code: string | null } {
  const record = error as { stderr?: unknown; message?: unknown };
  const stderr = sanitizedDetails(record?.stderr);
  const message = sanitizedDetails(record?.message);
  return {
    details: stderr || message,
    code: permissionCode(`${stderr} ${message}`)
  };
}

function calendarArgs(targetDate: string, selectedCalendarIds: string[] | null): string[] {
  return selectedCalendarIds === null
    ? ["-l", "JavaScript", "-e", CALENDAR_EVENTS_SCRIPT, targetDate]
    : ["-l", "JavaScript", "-e", CALENDAR_EVENTS_SCRIPT, targetDate, JSON.stringify(selectedCalendarIds)];
}

function parseCalendarList(output: string): CalendarInfo[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("EventKit returned invalid calendar data.");
  }
  if (!Array.isArray(parsed)) throw new Error("EventKit returned invalid calendar data.");
  const calendars: CalendarInfo[] = [];
  for (const calendar of parsed) {
    if (typeof calendar !== "object" || calendar === null || Array.isArray(calendar)) {
      throw new Error("EventKit returned invalid calendar data.");
    }
    const { id, title, source } = calendar as Record<string, unknown>;
    if (
      typeof id !== "string" || !id || /[\u0000-\u001f\u007f-\u009f]/u.test(id) ||
      typeof title !== "string" || !title || /[\u0000-\u001f\u007f-\u009f]/u.test(title) ||
      (source !== null && (typeof source !== "string" || /[\u0000-\u001f\u007f-\u009f]/u.test(source)))
    ) {
      throw new Error("EventKit returned invalid calendar data.");
    }
    calendars.push({ id, title, source });
  }
  return calendars;
}

export async function fetchAvailableCalendars(run: CalendarCommandRunner = defaultRunner): Promise<CalendarInfo[]> {
  let result: CalendarProcessResult;
  try {
    // osascript parses a leading hyphen in positional arguments as an option.
    result = await run("/usr/bin/osascript", ["-l", "JavaScript", "-e", CALENDAR_EVENTS_SCRIPT, "--", "--list-calendars"], {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
      shell: false,
      windowsHide: true
    });
  } catch (error) {
    const failure = rejectedCommandDetails(error);
    if (failure.code) throw new CalendarBridgeError(permissionMessage(failure.code), true);
    throw new CalendarBridgeError(nativeFailureMessage(failure.details));
  }
  const output = result.stdout.trim();
  if (!output) {
    const code = permissionCode(result.stderr);
    if (code) throw new CalendarBridgeError(permissionMessage(code), true);
    throw new CalendarBridgeError(nativeFailureMessage(sanitizedDetails(result.stderr)));
  }
  try {
    return parseCalendarList(output);
  } catch (error) {
    throw new CalendarBridgeError(nativeFailureMessage(sanitizedDetails(error instanceof Error ? error.message : String(error))));
  }
}

export async function fetchCalendarPayload(
  targetDate: string,
  selectedCalendarIdsOrRun: string[] | null | CalendarCommandRunner = null,
  suppliedRun: CalendarCommandRunner = defaultRunner
): Promise<CalendarPayload> {
  const selectedCalendarIds = typeof selectedCalendarIdsOrRun === "function" ? null : selectedCalendarIdsOrRun;
  const run = typeof selectedCalendarIdsOrRun === "function" ? selectedCalendarIdsOrRun : suppliedRun;
  try {
    validateTargetDate(targetDate);
  } catch (error) {
    throw new CalendarBridgeError(error instanceof Error ? error.message : "Calendar target date must be YYYY-MM-DD.");
  }
  let result: { stdout: string; stderr: string };
  try {
    result = await run("/usr/bin/osascript", calendarArgs(targetDate, selectedCalendarIds), {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
      shell: false,
      windowsHide: true
    });
  } catch (error) {
    const failure = rejectedCommandDetails(error);
    if (failure.code) throw new CalendarBridgeError(permissionMessage(failure.code), true);
    throw new CalendarBridgeError(nativeFailureMessage(failure.details));
  }

  const output = result.stdout.trim();
  if (!output) {
    const details = sanitizedDetails(result.stderr);
    const code = permissionCode(result.stderr);
    if (code) throw new CalendarBridgeError(permissionMessage(code), true);
    throw new CalendarBridgeError(nativeFailureMessage(details));
  }
  try {
    const payload = parseCalendarPayloadJson(output);
    if (payload.targetDate !== targetDate) {
      throw new Error(`Calendar bridge returned ${payload.targetDate} instead of ${targetDate}.`);
    }
    return payload;
  } catch (error) {
    const validationDetails = sanitizedDetails(error instanceof Error ? error.message : String(error));
    const stderrDetails = sanitizedDetails(result.stderr);
    const code = permissionCode(`${stderrDetails} ${validationDetails}`);
    if (code) throw new CalendarBridgeError(permissionMessage(code), true);
    throw new CalendarBridgeError(nativeFailureMessage([stderrDetails, validationDetails].filter(Boolean).join(" | ")));
  }
}
