export interface PluginSettings {
  excludedVaultFolders: string[];
  sectionHeading: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  excludedVaultFolders: [],
  sectionHeading: "## Calendar"
};

export class ExcludedVaultFolderError extends Error {
  constructor() {
    super("Vault folder exclusions are malformed. Correct them in settings before importing Calendar events.");
    this.name = "ExcludedVaultFolderError";
  }
}

function normalizeFolderPath(value: string): string | undefined {
  const normalized = value.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    parts.some((part) => part.length === 0 || part === "." || part === ".." || part.includes("\0"))
  ) {
    return undefined;
  }
  return normalized;
}

export function tryNormalizeExcludedVaultFolders(value: unknown): string[] | undefined {
  const isArrayInput = Array.isArray(value);
  const lines = typeof value === "string"
    ? value.split(/\r\n?|\n|\u2028|\u2029/gu)
    : isArrayInput && value.every((item) => typeof item === "string")
      ? value as string[]
      : undefined;
  if (!lines) return undefined;

  const normalized: string[] = [];
  for (const line of lines) {
    if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(line)) return undefined;
    if (!line.trim()) continue;
    const path = normalizeFolderPath(line);
    if (!path) return undefined;
    if (!normalized.includes(path)) normalized.push(path);
  }
  return normalized;
}

export function normalizeExcludedVaultFolders(value: unknown): string[] {
  if (value === undefined) return DEFAULT_SETTINGS.excludedVaultFolders;
  const normalized = tryNormalizeExcludedVaultFolders(value);
  if (!normalized) throw new ExcludedVaultFolderError();
  return normalized;
}

export interface PersistedExcludedVaultFolders {
  folders: string[];
  malformed: boolean;
  rawInput?: string;
}

export function parsePersistedExcludedVaultFolders(value: unknown): PersistedExcludedVaultFolders {
  if (value === undefined) return { folders: [], malformed: false };
  const normalized = tryNormalizeExcludedVaultFolders(value);
  if (normalized) return { folders: normalized, malformed: false };
  return {
    folders: [],
    malformed: true,
    rawInput: typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value.map(String).join("\n")
        : String(value)
  };
}

export function tryNormalizeSectionHeading(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const heading = value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");
  if (!/^#{1,6}\s+\S/.test(heading) || heading.includes("<!--") || heading.includes("-->") || heading.includes("\0")) {
    return undefined;
  }
  return heading;
}

export function normalizeSectionHeading(value: unknown): string {
  return tryNormalizeSectionHeading(value) ?? DEFAULT_SETTINGS.sectionHeading;
}
