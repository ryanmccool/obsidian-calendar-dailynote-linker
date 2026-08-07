export interface PluginSettings {
  peopleFolder: string;
  sectionHeading: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  peopleFolder: "People",
  sectionHeading: "## Calendar"
};

export function normalizePeopleFolder(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_SETTINGS.peopleFolder;
  }
  const normalized = value.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    parts.some((part) => part.length === 0 || part === "." || part === ".." || part.includes("\0"))
  ) {
    return DEFAULT_SETTINGS.peopleFolder;
  }
  return normalized;
}

export function normalizeSectionHeading(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_SETTINGS.sectionHeading;
  }
  const heading = value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");
  if (!/^#{1,6}\s+\S/.test(heading) || heading.includes("<!--") || heading.includes("-->") || heading.includes("\0")) {
    return DEFAULT_SETTINGS.sectionHeading;
  }
  return heading;
}
