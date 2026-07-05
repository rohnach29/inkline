export interface WorkoutRecord {
  activity: string;
  startUtc: number;
  endUtc: number;
  durationMin: number | null;
  km: number | null;
  indoor: boolean;
}

const APPLE_DATE_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/;

export function parseAppleDate(s: string): number {
  const m = s.match(APPLE_DATE_RE);
  if (!m) return NaN;
  return Date.parse(`${m[1]}T${m[2]}${m[3]}${m[4]}:${m[5]}`);
}

function attr(el: string, name: string): string | null {
  const m = el.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1]! : null;
}

export function parseWorkoutElement(el: string): WorkoutRecord | null {
  const activity = attr(el, "workoutActivityType");
  const start = attr(el, "startDate");
  const end = attr(el, "endDate");
  if (!activity || !start || !end) return null;
  const startUtc = parseAppleDate(start);
  const endUtc = parseAppleDate(end);
  if (Number.isNaN(startUtc) || Number.isNaN(endUtc)) return null;

  const duration = attr(el, "duration");
  let km: number | null = null;
  // relies on Apple's stable attribute order (sum before unit / key before value)
  const dist = el.match(
    /<WorkoutStatistics[^>]*DistanceWalkingRunning[^>]*\bsum="([\d.]+)"[^>]*\bunit="(km|mi)"/,
  );
  if (dist) {
    km = dist[2] === "km" ? parseFloat(dist[1]!) : parseFloat(dist[1]!) * 1.60934;
  } else {
    const legacy = attr(el, "totalDistance"); // older export format
    if (legacy) {
      const v = parseFloat(legacy);
      km = attr(el, "totalDistanceUnit") === "mi" ? v * 1.60934 : v;
    }
  }
  return {
    activity,
    startUtc,
    endUtc,
    durationMin: duration ? parseFloat(duration) : null,
    km,
    // relies on Apple's stable attribute order (sum before unit / key before value)
    indoor: /key="HKIndoorWorkout" value="1"/.test(el),
  };
}

const CLOSE = "</Workout>";
const MAX_BUFFER = 1_000_000;

/** Feed export.xml in chunks of any size; never holds the whole file. */
export class WorkoutScanner {
  private buf = "";
  readonly workouts: WorkoutRecord[] = [];

  push(chunk: string): void {
    this.buf += chunk;
    let closeIdx: number;
    while ((closeIdx = this.buf.indexOf(CLOSE)) !== -1) {
      const openIdx = this.buf.lastIndexOf("<Workout ", closeIdx);
      if (openIdx === -1) {
        this.buf = this.buf.slice(closeIdx + CLOSE.length);
        continue;
      }
      const el = this.buf.slice(openIdx, closeIdx + CLOSE.length);
      const w = parseWorkoutElement(el);
      if (w) this.workouts.push(w);
      this.buf = this.buf.slice(closeIdx + CLOSE.length);
    }
    // Bound memory: keep only from the last unclosed <Workout, or a tail.
    const lastOpen = this.buf.lastIndexOf("<Workout ");
    if (lastOpen > 0) {
      this.buf = this.buf.slice(lastOpen);
    }
    if (this.buf.length > MAX_BUFFER) {
      // Either no <Workout at all, or an unclosed/corrupt element larger than
      // any real workout — drop it, keep a tail to catch a split tag.
      this.buf = this.buf.slice(-CLOSE.length);
    }
  }
}
