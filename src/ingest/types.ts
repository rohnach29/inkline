export interface TrackPoint {
  lat: number;
  lon: number;
  ele: number;
  /** epoch milliseconds, UTC */
  t: number;
}

export interface Run {
  id: string;
  startUtc: number;
  /** local wall-clock ISO-like string, e.g. "2025-10-26T10:49:03" */
  startLocal: string;
  /** IANA timezone derived from GPS (timezone law) */
  tz: string;
  timezoneUncertain: boolean;
  km: number;
  minutes: number;
  elevationGain: number;
  indoor: boolean;
  track?: TrackPoint[];
  placeId: string | null;
}

export interface Place {
  id: string;
  lat: number;
  lon: number;
  runCount: number;
}

export interface Year {
  runs: Run[];
  places: Place[];
  span: { firstUtc: number; lastUtc: number };
}
