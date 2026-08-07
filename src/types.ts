export interface CalendarAttendee {
  displayName: string | null;
  email: string | null;
  status: string | null;
}

export interface CalendarEvent {
  id: string | null;
  calendar: string | null;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  url: string | null;
  location: string | null;
  notes: null;
  attendees: CalendarAttendee[];
}

export interface CalendarPayload {
  schemaVersion: 1;
  source: string;
  targetDate: string;
  range: {
    start: string;
    end: string;
    timeZone: string;
  };
  events: CalendarEvent[];
  warnings: string[];
}
