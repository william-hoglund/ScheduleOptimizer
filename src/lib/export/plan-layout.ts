/**
 * Turning a list of scheduled things into a paginated document.
 *
 * Pure, and deliberately free of dates, locales and translation: the caller has
 * already formatted every label in the student's language and timezone. What is
 * left is layout — which rows go on which page — and that is the part worth
 * testing, because it is the part that silently drops a session off the bottom
 * of a page when it goes wrong.
 *
 * Both exports render from this: the PDF paginates it, the PNG flattens it.
 */

export type ExportEntry = {
  /** "YYYY-MM-DD" in the student's zone. Groups rows into days. */
  dayKey: string;
  dayLabel: string;
  timeLabel: string;
  title: string;
  /** Course, location, duration — whatever fits on the second line. */
  meta: string;
  kind: "session" | "event";
};

export type ExportRow = {
  timeLabel: string;
  title: string;
  meta: string;
  kind: "session" | "event";
};

export type ExportDay = {
  heading: string;
  /** True when this day's rows spill onto a second page. */
  continued: boolean;
  rows: ExportRow[];
};

export type ExportDocument = {
  title: string;
  subtitle: string;
  emptyLabel: string;
  pages: ExportDay[][];
  totalRows: number;
};

export type BuildExportDocumentInput = {
  title: string;
  subtitle: string;
  emptyLabel: string;
  entries: readonly ExportEntry[];
  /** Rows a page holds, counting each day heading as one. `Infinity` for one page. */
  rowsPerPage?: number;
};

/**
 * Page budgeting, in units of one row.
 *
 * Taken from the PDF's real geometry: an A4 page has about 672pt of usable
 * height, a row is 26pt and a day heading with its rule is 34pt — so a heading
 * costs a little over one row, not exactly one. Counting it as one wastes a
 * quarter of every page; counting it too cheaply overflows.
 */
const DEFAULT_ROWS_PER_PAGE = 25;
const HEADING_UNITS = 34 / 26;

export function buildExportDocument(input: BuildExportDocumentInput): ExportDocument {
  const rowsPerPage = input.rowsPerPage ?? DEFAULT_ROWS_PER_PAGE;

  const sorted = [...input.entries].sort(
    (a, b) => a.dayKey.localeCompare(b.dayKey) || a.timeLabel.localeCompare(b.timeLabel),
  );

  const grouped: { heading: string; rows: ExportRow[] }[] = [];
  let currentKey: string | null = null;

  for (const entry of sorted) {
    if (entry.dayKey !== currentKey) {
      grouped.push({ heading: entry.dayLabel, rows: [] });
      currentKey = entry.dayKey;
    }
    grouped[grouped.length - 1]?.rows.push({
      timeLabel: entry.timeLabel,
      title: entry.title,
      meta: entry.meta,
      kind: entry.kind,
    });
  }

  const pages: ExportDay[][] = [];
  let page: ExportDay[] = [];
  let used = 0;

  const startNewPage = () => {
    if (page.length > 0) pages.push(page);
    page = [];
    used = 0;
  };

  for (const day of grouped) {
    let remaining = day.rows;
    let continued = false;

    while (remaining.length > 0) {
      // A heading alone at the foot of a page is worse than a page break.
      if (used + HEADING_UNITS + 1 > rowsPerPage) startNewPage();

      const capacity = Math.floor(rowsPerPage - used - HEADING_UNITS);
      const take = remaining.slice(0, Math.max(1, capacity));

      page.push({ heading: day.heading, continued, rows: take });
      used += take.length + HEADING_UNITS;
      remaining = remaining.slice(take.length);
      continued = true;

      if (remaining.length > 0) startNewPage();
    }
  }

  if (page.length > 0) pages.push(page);

  return {
    title: input.title,
    subtitle: input.subtitle,
    emptyLabel: input.emptyLabel,
    pages: pages.length > 0 ? pages : [[]],
    totalRows: grouped.reduce((sum, day) => sum + day.rows.length, 0),
  };
}
