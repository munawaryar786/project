/** A checked same-origin export; calendar import remains the Driver's choice. */
export async function downloadDriverCalendar(bookingId: string, reference: string, fetchCalendar: (url: string) => Promise<Response>, locale = "sk") {
  const response = await fetchCalendar(`/api/driver/scheduled-rides/${encodeURIComponent(bookingId)}/calendar?locale=${encodeURIComponent(locale)}`);
  if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "text/calendar") throw new Error("calendar_export_failed");
  const blob = await response.blob();
  if (!blob.size) throw new Error("calendar_export_failed");
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = objectUrl;
    anchor.download = `drivo-ride-${String(reference || bookingId).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64)}.ics`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Give Safari/iOS time to open the calendar file before releasing its URL.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}
