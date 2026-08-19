"use client";

import { useMemo, useState } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];
const TIMEZONES = [
  "Asia/Kolkata",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Build an ISO string that Date() parses as local wall time for the chosen calendar day/hour/minute. */
function toLocalIso(date: string, hour: number, minute: number) {
  return `${date}T${pad(hour)}:${pad(minute)}:00`;
}

export function MeetingScheduleFields({
  googleConfigured,
  teamsConfigured,
  defaultTitle,
  defaultAttendees = "",
}: {
  googleConfigured: boolean;
  teamsConfigured: boolean;
  defaultTitle: string;
  defaultAttendees?: string;
}) {
  const [date, setDate] = useState(todayIsoDate());
  const [startHour, setStartHour] = useState(10);
  const [startMinute, setStartMinute] = useState(0);
  const [endHour, setEndHour] = useState(11);
  const [endMinute, setEndMinute] = useState(0);
  const [timezone, setTimezone] = useState("Asia/Kolkata");

  const startsAt = useMemo(
    () => toLocalIso(date, startHour, startMinute),
    [date, startHour, startMinute],
  );
  const endsAt = useMemo(() => toLocalIso(date, endHour, endMinute), [date, endHour, endMinute]);

  return (
    <>
      <input type="hidden" name="startsAt" value={startsAt} />
      <input type="hidden" name="endsAt" value={endsAt} />
      <input type="hidden" name="attendees" value={defaultAttendees} />

      <div className="md:col-span-2">
        <label className="label" htmlFor="eventTitle">
          Title
        </label>
        <input className="input" id="eventTitle" name="title" defaultValue={defaultTitle} required />
      </div>

      <div>
        <label className="label" htmlFor="eventDate">
          Date
        </label>
        <input
          className="input"
          id="eventDate"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="timezone">
          Timezone
        </label>
        <select
          className="input"
          id="timezone"
          name="timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="startHour">
            Start hour
          </label>
          <select
            className="input"
            id="startHour"
            value={startHour}
            onChange={(e) => setStartHour(Number(e.target.value))}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {pad(h)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="startMinute">
            Start minute
          </label>
          <select
            className="input"
            id="startMinute"
            value={startMinute}
            onChange={(e) => setStartMinute(Number(e.target.value))}
          >
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                {pad(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="endHour">
            End hour
          </label>
          <select
            className="input"
            id="endHour"
            value={endHour}
            onChange={(e) => setEndHour(Number(e.target.value))}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {pad(h)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="endMinute">
            End minute
          </label>
          <select
            className="input"
            id="endMinute"
            value={endMinute}
            onChange={(e) => setEndMinute(Number(e.target.value))}
          >
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                {pad(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="md:col-span-2 space-y-2 rounded-lg border border-[var(--border)] p-3">
        <p className="text-sm font-medium">Online meeting</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="createGoogleMeet"
            value="true"
            defaultChecked={googleConfigured}
            disabled={!googleConfigured}
          />
          Create Google Meet link
          {!googleConfigured ? (
            <span className="text-[var(--muted)]">(not configured)</span>
          ) : null}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="createTeamsMeeting"
            value="true"
            defaultChecked={teamsConfigured}
            disabled={!teamsConfigured}
          />
          Create Teams meeting link
          {!teamsConfigured ? (
            <span className="text-[var(--muted)]">(not configured)</span>
          ) : null}
        </label>
        <p className="text-xs text-[var(--muted)]">
          If auto-create is unavailable, paste links below. The meeting is still saved either way.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="googleMeetUrl">
          Google Meet URL (optional)
        </label>
        <input className="input" id="googleMeetUrl" name="googleMeetUrl" placeholder="https://meet.google.com/…" />
      </div>
      <div>
        <label className="label" htmlFor="teamsJoinUrl">
          Teams join URL (optional)
        </label>
        <input className="input" id="teamsJoinUrl" name="teamsJoinUrl" placeholder="https://teams.microsoft.com/…" />
      </div>
      <div className="md:col-span-2">
        <label className="label" htmlFor="room">
          Room / location (optional)
        </label>
        <input className="input" id="room" name="room" placeholder="Conference room A" />
      </div>
    </>
  );
}
