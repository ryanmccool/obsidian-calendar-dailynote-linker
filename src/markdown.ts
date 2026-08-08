export interface ParsedAtxHeading {
  text: string;
  start: number;
  contentEnd: number;
}

function isControlCharacter(value: string): boolean {
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value);
}

/** Validate a single ATX heading after incidental outer whitespace is removed. */
export function isStandaloneAtxHeadingText(value: string): boolean {
  if (!value || /[\r\n\u2028\u2029]/u.test(value) || isControlCharacter(value)) return false;
  return /^#{1,6}[ \t]+\S(?:.*)$/u.test(value.trim());
}

function fenceOpening(line: string): { character: "`" | "~"; length: number } | null {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/u.exec(line);
  if (!match) return null;
  const run = match[2];
  return { character: run[0] as "`" | "~", length: run.length };
}

function closesFence(line: string, fence: { character: "`" | "~"; length: number }): boolean {
  const pattern = new RegExp(`^ {0,3}${fence.character}{${fence.length},}[ \\t]*$`, "u");
  return pattern.test(line);
}

/**
 * Parse only real standalone ATX headings. YAML frontmatter, fenced code,
 * and indented code are deliberately skipped so vault and editor insertion
 * use the same destination rules.
 */
export function parseStandaloneAtxHeadings(noteContent: string): ParsedAtxHeading[] {
  const rawLines = noteContent.split("\n");
  const headings: ParsedAtxHeading[] = [];
  let offset = 0;
  let frontmatter = rawLines.length > 0 && rawLines[0].replace(/^\ufeff/u, "").trim() === "---";
  let fence: { character: "`" | "~"; length: number } | null = null;

  for (const rawLine of rawLines) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const contentEnd = offset + line.length;

    if (frontmatter) {
      if (offset !== 0 && (line.trim() === "---" || line.trim() === "...")) frontmatter = false;
      offset += rawLine.length + 1;
      continue;
    }

    if (fence) {
      if (closesFence(line, fence)) fence = null;
      offset += rawLine.length + 1;
      continue;
    }

    const opening = fenceOpening(line);
    if (opening) {
      // Backtick info strings cannot contain another backtick; treating such a
      // line as ordinary text avoids accidentally hiding a real later heading.
      const info = line.replace(/^ {0,3}(`{3,}|~{3,})/u, "");
      if (opening.character === "~" || !info.includes("`")) fence = opening;
      offset += rawLine.length + 1;
      continue;
    }

    if (/^(?: {4}|\t)/u.test(line)) {
      offset += rawLine.length + 1;
      continue;
    }

    const text = line.trim();
    if (isStandaloneAtxHeadingText(text)) headings.push({ text, start: offset, contentEnd });
    offset += rawLine.length + 1;
  }
  return headings;
}
