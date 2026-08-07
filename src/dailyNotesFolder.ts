export interface DailyNotesFolderVault {
  getAbstractFileByPath(path: string): unknown;
  createFolder(path: string): Promise<unknown>;
}

export class DailyNotesFolderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyNotesFolderError";
  }
}

export function normalizeConfiguredFolder(value: unknown): string {
  if (typeof value !== "string") {
    throw new DailyNotesFolderError("The core Daily Notes folder setting is invalid.");
  }
  if (value === "") return "";
  const normalized = value.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (
    normalized.startsWith("/") ||
    normalized.startsWith("~") ||
    /^[A-Za-z]:/.test(normalized) ||
    parts.some((part) => part.length === 0 || part === "." || part === ".." || part.includes("\0"))
  ) {
    throw new DailyNotesFolderError("The core Daily Notes folder setting must be a safe vault-relative folder.");
  }
  return normalized;
}

export async function ensureDailyNotesFolder(
  vault: DailyNotesFolderVault,
  configuredFolder: unknown,
  isFolder: (file: unknown) => boolean
): Promise<void> {
  const folder = normalizeConfiguredFolder(configuredFolder);
  if (!folder) return;

  const parts = folder.split("/");
  let currentPath = "";
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    const existing = vault.getAbstractFileByPath(currentPath);
    if (existing) {
      if (!isFolder(existing)) {
        throw new DailyNotesFolderError(`Daily Notes folder path is occupied by a file: ${currentPath}`);
      }
      continue;
    }
    try {
      await vault.createFolder(currentPath);
    } catch (error) {
      const raced = vault.getAbstractFileByPath(currentPath);
      if (raced && isFolder(raced)) continue;
      throw error;
    }
  }
}
