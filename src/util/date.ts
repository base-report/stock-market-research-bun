import { DateTime } from "luxon";

const NY_ZONE = "America/New_York";

const getValidDateOrNull = (date: string | null): string | null => {
  if (date === null || isNaN(Date.parse(date))) {
    return null;
  }

  return date;
};

const parseDateWithUsaClosingTime = (dateString: string): Date => {
  const usaClosingTime = DateTime.fromISO(dateString, {
    zone: NY_ZONE,
  }).set({ hour: 16, minute: 0, second: 0 });

  return usaClosingTime.toJSDate();
};

const getCurrentIsoDate = (): string =>
  DateTime.now().setZone(NY_ZONE).toISODate() as string;

const getIsoDatesNowAndOneWeekAgo = (): { from: string; to: string } => {
  // Get the current date in New York in YYYY-MM-DD format for 'today'
  const to = getCurrentIsoDate();

  // Get the date one week ago in New York in YYYY-MM-DD format
  const from = DateTime.now()
    .setZone(NY_ZONE)
    .minus({ weeks: 1 })
    .toISODate() as string;

  return { from, to };
};

export {
  getValidDateOrNull,
  parseDateWithUsaClosingTime,
  getCurrentIsoDate,
  getIsoDatesNowAndOneWeekAgo,
};
