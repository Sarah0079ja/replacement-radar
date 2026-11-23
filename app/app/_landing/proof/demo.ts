// Illustrative "This Week" data for the landing-page product preview. Addresses are made up and owner details use
// the product's own "Owner details hidden" mode. Every string is formatted the way the dashboard formats it
// (app/dashboard/page.tsx: priorityLabel, formatPermitDate, formatElapsedYears, hvacEventLabel, contractorSummary,
// formatWeekRange), so the preview reads exactly like the real screen. Nothing here touches real data or the API.

export type Status = "NEW" | "CONTACTED" | "APPOINTMENT" | "WON" | "NOT INTERESTED";
export const STATUSES: Status[] = ["NEW", "CONTACTED", "APPOINTMENT", "WON", "NOT INTERESTED"];

export type Tone = "high" | "medium" | "low";
export type TagTone = "verified" | "inference" | "unknown";

export interface DemoHome {
  address: string;
  zip: string;
  tone: Tone;
  /** formatPermitDate(latest_permit_date), or null for "No recorded event". */
  permitDate: string | null;
  /** formatElapsedYears(...) */
  elapsed: string;
  /** hvacEventLabel(...) */
  event: string;
  eventYear: number | null;
  issued: string | null;
  sqft: string;
  built: number;
  occupancy: string | null;
  sameStreet: boolean;
  status: Status;
}

export const PRIORITY: Record<Tone, string> = { high: "HIGH PRIORITY", medium: "MEDIUM PRIORITY", low: "LOW PRIORITY" };

/** formatWeekRange("2026-11-16") */
export const WEEK = "Nov 16–22, 2026";

export const HOMES: DemoHome[] = [
  {
    address: "4127 Hollow Ridge Dr",
    zip: "75229",
    tone: "high",
    permitDate: "Apr 12, 2011",
    elapsed: "15 years ago",
    event: "Replacement",
    eventYear: 2011,
    issued: "2011-04-12",
    sqft: "1,840 sq ft",
    built: 1971,
    occupancy: "Likely owner occupied",
    sameStreet: false,
    status: "NEW",
  },
  {
    address: "7310 Larkspur Ln",
    zip: "75230",
    tone: "high",
    permitDate: "Aug 3, 2012",
    elapsed: "14 years ago",
    event: "Replacement",
    eventYear: 2012,
    issued: "2012-08-03",
    sqft: "2,120 sq ft",
    built: 1968,
    occupancy: "Likely owner occupied",
    sameStreet: true,
    status: "NEW",
  },
  {
    address: "9542 Alder Bend Ct",
    zip: "75243",
    tone: "medium",
    permitDate: null,
    elapsed: "",
    event: "",
    eventYear: null,
    issued: null,
    sqft: "1,610 sq ft",
    built: 1984,
    occupancy: null,
    sameStreet: false,
    status: "CONTACTED",
  },
  {
    address: "6218 Quail Hollow Rd",
    zip: "75240",
    tone: "medium",
    permitDate: "Jun 21, 2016",
    elapsed: "10 years ago",
    event: "Installation",
    eventYear: 2016,
    issued: "2016-06-21",
    sqft: "2,460 sq ft",
    built: 1979,
    occupancy: "Likely absentee owner",
    sameStreet: false,
    status: "NEW",
  },
  {
    address: "3806 Fenwick Pl",
    zip: "75229",
    tone: "high",
    permitDate: "Feb 9, 2013",
    elapsed: "13 years ago",
    event: "Replacement",
    eventYear: 2013,
    issued: "2013-02-09",
    sqft: "1,975 sq ft",
    built: 1974,
    occupancy: "Likely owner occupied",
    sameStreet: false,
    status: "APPOINTMENT",
  },
  {
    address: "11427 Briar Glen Dr",
    zip: "75243",
    tone: "low",
    permitDate: "Mar 2, 2021",
    elapsed: "5 years ago",
    event: "Replacement",
    eventYear: 2021,
    issued: "2021-03-02",
    sqft: "1,720 sq ft",
    built: 1989,
    occupancy: null,
    sameStreet: false,
    status: "NEW",
  },
];

/** The home the demonstration focuses on. */
export const FOCUS = 1;

/** The cohort the This Week preview stands in for (its table shows the first rows of it). Pipeline counts are
 *  totals, as on the real progress strip. */
export const COHORT = { size: 50, remaining: 46, contacted: 3, appointments: 1, won: 0 };

/** contractorSummary(property) */
export function whyItStandsOut(h: DemoHome) {
  const clauses: string[] = [];
  clauses.push(h.built < 2000 ? `Older home built ${h.built}` : `Home built ${h.built}`);
  if (h.eventYear) clauses.push(`with a recorded HVAC ${h.event.toLowerCase()} from ${h.eventYear}`);
  else clauses.push("with no recorded HVAC replacement permit in the supported records");
  if (h.sameStreet) clauses.push("and recent HVAC activity on the same street");
  return `${clauses.join(" ")}.`;
}

/** The drawer's source-evidence rows for a home (owner rows are omitted, as in "Owner details hidden" mode). */
export function evidence(h: DemoHome): { tone: TagTone; label: string; title: string; value: string; source?: string }[] {
  return [
    { tone: "verified", label: "VERIFIED DATA", title: "Property year built", value: String(h.built), source: "DCAD parcel record" },
    {
      tone: h.occupancy ? "inference" : "unknown",
      label: h.occupancy ? "INFERENCE" : "UNKNOWN",
      title: "Owner occupancy",
      value: h.occupancy ?? "Not available",
      source: "Derived from mailing/site address comparison",
    },
    {
      tone: h.issued ? "verified" : "unknown",
      label: h.issued ? "VERIFIED DATA" : "UNKNOWN",
      title: "Mechanical permit",
      value: h.issued ? "REPLACE OR MODIFY EXISTING HVAC" : "No HVAC replacement/install event found",
      source: h.issued ? `Issued ${h.issued}` : "Verified source record",
    },
    {
      tone: h.eventYear ? "inference" : "unknown",
      label: h.eventYear ? "INFERENCE" : "UNKNOWN",
      title: "Years since known HVAC event",
      value: h.eventYear ? `${h.elapsed.replace(" ago", "")} since ${h.eventYear}` : "Cannot be estimated",
      source: "Not verified current equipment age",
    },
    { tone: "unknown", label: "UNKNOWN", title: "Current installed system", value: "Cannot be verified from public records" },
  ];
}
