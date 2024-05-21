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
    expect(trendline.slope.toFixed(2)).toBe("0.05");
    expect(trendline.intercept.toFixed(2)).toBe("10.35");
  });
});
