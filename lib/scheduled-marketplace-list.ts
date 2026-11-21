/** Scan bounded candidate pages because payment, verification and vehicle
 * compatibility cannot all be expressed in the Booking query. A cursor lets
 * the Driver continue beyond the per-request work budget. */
export async function scanScheduledMarketplace<T extends { id: string }, R>(input: {
  cursor: string | null;
  fetchPage: (cursor: string | null, take: number) => Promise<T[]>;
  eligible: (row: T) => Promise<boolean>;
  present: (row: T) => R;
}) {
  const pageSize = 100;
  const pageBudget = 5;
  const resultLimit = 50;
  const marketplace: R[] = [];
  let cursor = input.cursor;
  for (let page = 0; page < pageBudget; page++) {
    const rows = await input.fetchPage(cursor, pageSize);
    for (const row of rows) {
      cursor = row.id;
      if (await input.eligible(row)) marketplace.push(input.present(row));
      if (marketplace.length === resultLimit) return { marketplace, nextCursor: cursor };
    }
    if (rows.length < pageSize) return { marketplace, nextCursor: null };
  }
  return { marketplace, nextCursor: cursor };
}
