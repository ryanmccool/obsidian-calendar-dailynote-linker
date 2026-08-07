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
  markdownLink?: string;
}

export interface PeopleIndex {
  byEmail: Map<string, PersonLinkTarget[]>;
  byName: Map<string, PersonLinkTarget[]>;
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

export function normalizeName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

export function normalizeEmail(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, "").toLowerCase();
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

export function buildPeopleIndex(files: readonly PeopleMarkdownFile[], peopleFolder: string): PeopleIndex {
  const byEmail = new Map<string, PersonLinkTarget[]>();
  const byName = new Map<string, PersonLinkTarget[]>();
  const normalizedFolder = peopleFolder.replaceAll("\\", "/").replace(/\/+$/u, "");
  const prefix = `${normalizedFolder}/`;

  for (const file of files) {
    const path = file.path.replaceAll("\\", "/");
    if (!path.startsWith(prefix) || !path.toLowerCase().endsWith(".md")) continue;
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

export function matchEventAttendees(index: PeopleIndex, attendees: readonly AttendeeIdentity[]): PersonLinkTarget[] {
  const matches: PersonLinkTarget[] = [];
  for (const attendee of attendees) {
    const match = matchAttendee(index, attendee);
    if (match && !matches.some((candidate) => candidate.path === match.path)) {
      matches.push(match);
    }
  }
  return matches;
}

export function preparePeopleLinks(
  index: PeopleIndex,
  generateMarkdownLink: (target: PersonLinkTarget) => string
): PeopleIndex {
  const generated = new Map<string, string>();
  const prepare = (targets: PersonLinkTarget[]): PersonLinkTarget[] => targets.map((target) => {
    let markdownLink = generated.get(target.path);
    if (markdownLink === undefined) {
      markdownLink = generateMarkdownLink(target);
      generated.set(target.path, markdownLink);
    }
    return { ...target, markdownLink };
  });
  return {
    byEmail: new Map([...index.byEmail].map(([key, targets]) => [key, prepare(targets)])),
    byName: new Map([...index.byName].map(([key, targets]) => [key, prepare(targets)]))
  };
}
