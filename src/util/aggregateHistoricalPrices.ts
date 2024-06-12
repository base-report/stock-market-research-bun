import type { AggregateHistoricalPrices } from "../schemas/HistoricalPrices";

import { roundTo } from "./number";

interface Ranges {
  [key: string]: {
    allTimeHigh: number;
  };
}

interface GroupedByDateHistoricalPrices {
  [date: string]: {
    [name: string]: [number, number, number, number, number];
  };
}

const getAggregatedHistoricalPrices = (
  historicalPricesList: AggregateHistoricalPrices[],
  alreadyAggregated: boolean = false,
): AggregateHistoricalPrices["daily"] => {
  let groupedByDate = {} as GroupedByDateHistoricalPrices;
  let ranges = {} as Ranges;

  for (const { name, daily } of historicalPricesList) {
    if (!ranges[name]) {
      ranges[name] = {
        allTimeHigh: 0,
      };
    }

    for (const [o, h, l, c, v, d] of daily) {
      if (!groupedByDate[d]) {
        groupedByDate[d] = {};
      }

      if (h > ranges[name].allTimeHigh) {
        ranges[name].allTimeHigh = h;
      }

      const data = [o, h, l, c, alreadyAggregated ? v : c * v] as [
        number,
        number,
        number,
        number,
        number,
      ];
      if (data.includes(NaN) || data.includes(Infinity)) {
        continue;
      }
      groupedByDate[d][name] = data;
    }
  }

  let aggregatedTimeseries = [] as AggregateHistoricalPrices["daily"];
  for (const [d, groupedByName] of Object.entries(groupedByDate)) {
    let totalDollarVolume = 0;

    for (const [, , , , dv] of Object.values(groupedByName)) {
      totalDollarVolume += dv;
    }

    let aggregated = [0, 0, 0, 0, 0, parseInt(d)];
    for (const [name, [o, h, l, c, dv]] of Object.entries(groupedByName)) {
      const weight = roundTo(dv / totalDollarVolume, 4);
      aggregated[0] = roundTo(
        aggregated[0] + (o / ranges[name].allTimeHigh) * weight,
        4,
      );
      aggregated[1] = roundTo(
        aggregated[1] + (h / ranges[name].allTimeHigh) * weight,
        4,
      );
      aggregated[2] = roundTo(
        aggregated[2] + (l / ranges[name].allTimeHigh) * weight,
        4,
      );
      aggregated[3] = roundTo(
        aggregated[3] + (c / ranges[name].allTimeHigh) * weight,
        4,
      );
      aggregated[4] = roundTo(aggregated[4] + dv, 4);
    }
    if (aggregated.includes(NaN) || aggregated.includes(Infinity)) {
      continue;
    }
    aggregatedTimeseries.push(aggregated);
  }

  return aggregatedTimeseries.sort((a, b) => a[5] - b[5]);
};

export { getAggregatedHistoricalPrices };
