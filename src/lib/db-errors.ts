export function friendlyDbError(message: string): string {
  if (/could not find the table/i.test(message)) {
    return "Database tables missing. Run: npm run db:push in your project folder.";
  }
  if (/bucket not found/i.test(message)) {
    return "Storage bucket missing. Run: npm run db:push to create buckets.";
  }
  return message;
}
