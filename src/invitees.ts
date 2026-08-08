import type { TFile } from "obsidian";

export interface PeopleMarkdownFile {
  path: string;
  basename: string;
  file?: TFile;
  frontmatter?: Record<string, unknown>;
}

export interface PersonLinkTarget {
  path: string;
  basename: string;
  file?: TFile;
  /** Validated Obsidian link destination returned by metadataCache.fileToLinktext. */
  linkText?: string;
}

export interface PreparedPersonLink {
  linkText: string;
}

export interface PeopleIndex {
  byEmail: Map<string, PersonLinkTarget[]>;
  byName: Map<string, PersonLinkTarget[]>;
}

export function emptyPeopleIndex(): PeopleIndex {
  return { byEmail: new Map(), byName: new Map() };
}

export function preparePeopleIndexForImport(
  linkMatchingVaultNotes: boolean,
  load: () => PeopleIndex
): PeopleIndex {
  return linkMatchingVaultNotes ? load() : emptyPeopleIndex();
}

export interface AttendeeIdentity {
  displayName: string | null;
  email: string | null;
}

function addKey(map: Map<string, PersonLinkTarget[]>, key: string, target: PersonLinkTarget): void {
  if (!key) return;
  const current = map.get(key) ?? [];
  if (!current.some((candidate) => candidate.path === target.path)) {
    current.push(target);
    current.sort((left, right) => left.path.localeCompare(right.path));
  }
  map.set(key, current);
}

export function normalizeCaseFold(value: string): string {
  return value.normalize("NFKC").toLowerCase().replaceAll("ς", "σ");
}

export function normalizeName(value: string): string {
  return normalizeCaseFold(value).trim().replace(/\s+/gu, " ");
}

export function normalizeEmail(value: string): string {
  return normalizeCaseFold(value).trim().replace(/\s+/gu, "");
}

function frontmatterStrings(frontmatter: Record<string, unknown> | undefined, key: string): string[] {
  const value = frontmatter?.[key];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function targetFor(file: PeopleMarkdownFile): PersonLinkTarget {
  const path = file.path.replaceAll("\\", "/");
  const basename = file.basename || path.split("/").at(-1)?.replace(/\.md$/i, "") || "";
  return { path, basename, file: file.file };
}

function isExcludedPath(path: string, excludedFolders: readonly string[]): boolean {
  const normalizedPath = path.replaceAll("\\", "/");
  return excludedFolders.some((folder) => {
    const normalizedFolder = folder.replaceAll("\\", "/").replace(/\/+$/u, "");
    return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
  });
}

export function buildPeopleIndex(files: readonly PeopleMarkdownFile[], excludedFolders: readonly string[]): PeopleIndex {
  const byEmail = new Map<string, PersonLinkTarget[]>();
  const byName = new Map<string, PersonLinkTarget[]>();

  for (const file of files) {
    const path = file.path.replaceAll("\\", "/");
    if (!path.toLowerCase().endsWith(".md") || isExcludedPath(path, excludedFolders)) continue;
    const target = targetFor(file);
    addKey(byName, normalizeName(target.basename), target);
    for (const alias of frontmatterStrings(file.frontmatter, "aliases")) {
      addKey(byName, normalizeName(alias), target);
    }
    for (const email of [...frontmatterStrings(file.frontmatter, "email"), ...frontmatterStrings(file.frontmatter, "emails")]) {
      addKey(byEmail, normalizeEmail(email), target);
    }
  }
  return { byEmail, byName };
}

export function matchAttendee(index: PeopleIndex, attendee: AttendeeIdentity): PersonLinkTarget | null {
  const emailKey = attendee.email ? normalizeEmail(attendee.email) : "";
  if (emailKey) {
    const emailMatches = index.byEmail.get(emailKey);
    if (emailMatches?.length === 1) return emailMatches[0];
    if (emailMatches && emailMatches.length > 1) return null;
  }

  const nameKey = attendee.displayName ? normalizeName(attendee.displayName) : "";
  if (!nameKey) return null;
  const nameMatches = index.byName.get(nameKey);
  return nameMatches?.length === 1 ? nameMatches[0] : null;
}

export function preparePeopleLinks(
  index: PeopleIndex,
  prepareLink: (target: PersonLinkTarget) => PreparedPersonLink
): PeopleIndex {
  const prepared = new Map<string, PreparedPersonLink>();
  const validate = (target: PersonLinkTarget, link: PreparedPersonLink): PreparedPersonLink => {
    if (!link || typeof link.linkText !== "string") {
      throw new Error(`Vault note link data is invalid for ${target.path}.`);
    }
    if (
      !link.linkText.trim() ||
      /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(link.linkText) ||
      link.linkText.includes("<!-- calendar-daily-note-linker:start -->") ||
      link.linkText.includes("<!-- calendar-daily-note-linker:end -->")
    ) {
      throw new Error(`Vault note link data is unsafe for ${target.path}.`);
    }
    return { linkText: link.linkText };
  };
  const prepare = (targets: PersonLinkTarget[]): PersonLinkTarget[] => targets.map((target) => {
    let link = prepared.get(target.path);
    if (link === undefined) {
      link = validate(target, prepareLink(target));
      prepared.set(target.path, link);
    }
    return { ...target, ...link };
  });
  return {
    byEmail: new Map([...index.byEmail].map(([key, targets]) => [key, prepare(targets)])),
    byName: new Map([...index.byName].map(([key, targets]) => [key, prepare(targets)]))
  };
}
