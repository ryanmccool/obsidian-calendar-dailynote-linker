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

export type CalendarCommandRunner = (
  executable: string,
  args: string[],
  options: { encoding: "utf8"; timeout: number; maxBuffer: number; shell: false; windowsHide: boolean }
) => Promise<CalendarProcessResult>;

const defaultRunner: CalendarCommandRunner = async (executable, args, options) => (
  await execFileAsync(executable, args, options) as unknown as CalendarProcessResult
);

export class CalendarBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarBridgeError";
  }
}

export async function fetchCalendarPayload(targetDate: string, run: CalendarCommandRunner = defaultRunner): Promise<CalendarPayload> {
  try {
    validateTargetDate(targetDate);
  } catch (error) {
    throw new CalendarBridgeError(error instanceof Error ? error.message : "Calendar target date must be YYYY-MM-DD.");
  }
  let result: { stdout: string; stderr: string };
  try {
    result = await run("/usr/bin/osascript", ["-l", "JavaScript", "-e", CALENDAR_EVENTS_SCRIPT, targetDate], {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
      shell: false,
      windowsHide: true
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new CalendarBridgeError(
      "Calendar access failed. Allow Obsidian to control Calendar in System Settings > Privacy & Security > Automation, then try again. " + details
    );
  }

  const output = result.stdout.trim();
  if (!output) {
    const details = result.stderr.trim();
    throw new CalendarBridgeError(
      `Calendar bridge returned no data. Check Calendar and Automation permissions${details ? `: ${details}` : "."}`
    );
  }
  try {
    const payload = parseCalendarPayloadJson(output);
    if (payload.targetDate !== targetDate) {
      throw new Error(`Calendar bridge returned ${payload.targetDate} instead of ${targetDate}.`);
    }
    return payload;
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new CalendarBridgeError(`Calendar bridge returned malformed data: ${details}`);
  }
}
