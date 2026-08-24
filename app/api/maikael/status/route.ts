import { MAIKAEL_DAILY_LIMIT, getDailyCount } from '@/app/lib/maikaelLimits';

export async function GET() {
  const dailyCount = await getDailyCount();
  const dailyRemaining = Math.max(0, MAIKAEL_DAILY_LIMIT - dailyCount);
  return Response.json({ dailyRemaining });
}
