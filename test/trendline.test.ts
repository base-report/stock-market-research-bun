import { expect, test, describe } from "bun:test";
import { fitLine } from "../src/util/chart";

// Test cases for calculating a trendline using
// the Theil-Sen estimator

const mockData = [
  10.8, 10.1, 10.5, 10.3, 10.2, 10.9, 10.6, 10.7, 10.6, 10.8,
].map((high) => ({ high }));

describe("trendline", () => {
  test("should return a valid trendline", () => {
    const trendline = fitLine(mockData, (x) => x.high);
    console.log(trendline);
    expect(trendline).toStrictEqual({
      slope: 0.04285714285714296,
      intercept: 10.37142857142857,
    });
  });
});
