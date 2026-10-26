export const number = (value: number | null | undefined, digits = 0) =>
  value == null
    ? "—"
    : value.toLocaleString("en-GB", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      });
export const gw = (value: number | null | undefined) =>
  value == null ? "—" : number(value / 1000, 2);
export const signed = (value: number | null | undefined) =>
  value == null ? "—" : `${value > 0 ? "+" : ""}${number(value)}`;
export const hourLabel = (hour: number) =>
  `${String(hour).padStart(2, "0")}:00`;
export const dateLabel = (
  value: string,
  options?: Intl.DateTimeFormatOptions,
) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString(
    "en-GB",
    options ?? { day: "numeric", month: "short", year: "numeric" },
  );
export const timeLabel = (value: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("en-GB", {
        timeZone: "Europe/London",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
export const timestampLabel = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
