export function friendlyDbError(message: string): string {
  if (/could not find the table/i.test(message)) {
    return "Database tables missing. Run: npm run db:push in your project folder.";
  }
  if (/bucket not found/i.test(message)) {
    return "Storage bucket missing. Run: npm run db:push to create buckets.";
  }
  if (/single JSON object/i.test(message)) {
    return "Database permission error. Run the Go RLS fix migration in Supabase (see supabase/migrations/20260701130000_go_games_rls_fix.sql).";
  }
  return message;
}
