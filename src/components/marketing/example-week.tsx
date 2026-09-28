import { getFormatter, getTranslations } from "next-intl/server";

import { cn } from "@/lib/utils";

/**
 * A static illustration of a generated week, shown on the landing page so a
 * visitor can see what they get before signing up. Not real data and not
 * connected to anything — purely a picture of the output.
 */

const DAY_START_MINUTES = 8 * 60;
const DAY_END_MINUTES = 18 * 60;
const TOTAL_MINUTES = DAY_END_MINUTES - DAY_START_MINUTES;

type BlockType = "lecture" | "study" | "break" | "deadline";

type Block = {
  day: number;
  start: string;
  end: string;
  type: BlockType;
  course?: "statistics" | "databases";
};

const BLOCKS: readonly Block[] = [
  { day: 0, start: "09:00", end: "11:00", type: "lecture", course: "statistics" },
  { day: 0, start: "12:00", end: "13:00", type: "break" },
  { day: 0, start: "13:00", end: "14:30", type: "study", course: "statistics" },

  { day: 1, start: "10:00", end: "12:00", type: "lecture", course: "databases" },
  { day: 1, start: "12:00", end: "13:00", type: "break" },
  { day: 1, start: "14:00", end: "15:00", type: "study", course: "databases" },

  { day: 2, start: "09:00", end: "11:00", type: "study", course: "statistics" },
  { day: 2, start: "13:00", end: "15:00", type: "lecture", course: "statistics" },

  { day: 3, start: "10:00", end: "11:00", type: "study", course: "databases" },

  { day: 4, start: "09:00", end: "11:00", type: "study", course: "statistics" },
  { day: 4, start: "16:30", end: "17:00", type: "deadline", course: "databases" },
];

const BLOCK_STYLES: Record<BlockType, string> = {
  lecture: "bg-lecture-soft border-l-lecture",
  study: "bg-study-soft border-l-study",
  break: "bg-break-soft border-l-break",
  deadline: "bg-deadline-soft border-l-deadline",
};

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function position(block: Block) {
  const start = toMinutes(block.start);
  const end = toMinutes(block.end);
  return {
    top: `${((start - DAY_START_MINUTES) / TOTAL_MINUTES) * 100}%`,
    height: `${((end - start) / TOTAL_MINUTES) * 100}%`,
  };
}

export async function ExampleWeek() {
  const t = await getTranslations("landing.example");
  const format = await getFormatter();

  // 2024-01-01 was a Monday. Used only to get localised weekday names.
  const weekdays = Array.from({ length: 5 }, (_, i) =>
    format.dateTime(new Date(Date.UTC(2024, 0, 1 + i)), { weekday: "short" }),
  );

  const hourMarks = Array.from({ length: 6 }, (_, i) => 8 + i * 2);

  return (
    <div className="bg-card animate-in fade-in slide-in-from-bottom-2 overflow-hidden rounded-xl border duration-700">
      <div
        className="overflow-x-auto focus-visible:outline-ring focus-visible:outline-2 focus-visible:-outline-offset-2"
        tabIndex={0}
        role="group"
        aria-label={t("scrollLabel")}
      >
        {/* One grid so the hour gutter and the day tracks share the same row and
            therefore the same vertical origin. Laying them out separately makes
            the labels drift out of alignment with the blocks. */}
        <div className="grid min-w-[36rem] grid-cols-[2.25rem_repeat(5,minmax(0,1fr))] gap-x-1.5 gap-y-1.5 p-4">
          <div aria-hidden="true" />
          {weekdays.map((label) => (
            <span
              key={label}
              className="text-muted-foreground text-center text-[0.6875rem] font-medium"
            >
              {label}
            </span>
          ))}

          <div className="relative h-72">
            {hourMarks.map((hour) => (
              <span
                key={hour}
                className="text-muted-foreground absolute right-1 -translate-y-1/2 font-mono text-[0.625rem] tabular-nums"
                style={{ top: `${((hour * 60 - DAY_START_MINUTES) / TOTAL_MINUTES) * 100}%` }}
              >
                {String(hour).padStart(2, "0")}
              </span>
            ))}
          </div>

          {weekdays.map((label, dayIndex) => (
            <div key={label} className="bg-muted/40 relative h-72 rounded-md">
              {BLOCKS.filter((block) => block.day === dayIndex).map((block) => (
                <div
                  key={`${block.day}-${block.start}`}
                  className={cn(
                    "animate-in fade-in zoom-in-95 absolute inset-x-0 overflow-hidden rounded-[0.25rem] border-l-[3px] px-1.5 py-1 duration-500 fill-mode-both",
                    BLOCK_STYLES[block.type],
                  )}
                  style={{ ...position(block), animationDelay: `${BLOCKS.indexOf(block) * 60}ms` }}
                >
                  <span className="text-foreground block truncate text-[0.625rem] leading-tight font-medium">
                    {block.course ? t(`courses.${block.course}`) : t(`legend.${block.type}`)}
                  </span>
                  <span className="text-muted-foreground block truncate font-mono text-[0.5625rem] tabular-nums">
                    {block.start}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend. Each type is named in text, so colour is never the only signal. */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t px-4 py-3">
        {(["lecture", "study", "break", "deadline"] as const).map((type) => (
          <span key={type} className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span
              className={cn("size-2.5 rounded-[0.1875rem] border-l-[3px]", BLOCK_STYLES[type])}
              aria-hidden="true"
            />
            {t(`legend.${type}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
