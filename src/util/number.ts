const parseNumber = (
  value: string | number | null | undefined,
): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const roundTo = (num: number, decimalsPlaces = 2): number => {
  const multiplier = 10 ** decimalsPlaces;
  return Math.round(num * multiplier) / multiplier;
};

export { parseNumber, roundTo };
