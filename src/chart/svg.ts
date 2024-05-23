import type { NonNullableDailyPricesObject } from "../schemas/HistoricalPrices";
import type { Trendline } from "../schemas/Trendline";

import * as d3 from "d3";
import { JSDOM } from "jsdom";
import { calculateMovingAverage, formatVolume } from "../util/chart";

const drawLine = (
  svg: d3.Selection<SVGElement, unknown, null, undefined>,
  xScale: d3.ScaleBand<string>,
  yScale: d3.ScaleLinear<number, number>,
  data: { date: Date; average: number }[],
  color: string | d3.ValueFn<SVGPathElement, unknown, string> | undefined,
) => {
  const line = d3
    .line()
    .x((d) => xScale(d.date) + xScale.bandwidth() / 2)
    .y((d) => yScale(d.average))
    .curve(d3.curveMonotoneX); // apply smoothing to the line

  svg
    .append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", color)
    .attr("stroke-width", 1)
    .attr("d", line);
};

const plotTrendline = (
  svg: d3.Selection<SVGElement, unknown, null, undefined>,
  xScale: d3.ScaleBand<string>,
  yScale: d3.ScaleLinear<number, number>,
  data: NonNullableDailyPricesObject[],
  trendline: Trendline,
  color: string | d3.ValueFn<SVGPathElement, unknown, string> | undefined,
  strokeWidth: number,
) => {
  const halfCandleWidth = xScale.bandwidth() / 2;

  const xStart = xScale(data[0].date) + halfCandleWidth;
  const xEnd = xScale(data[data.length - 1].date) + halfCandleWidth;

  const yStartPrice = trendline.slope + trendline.intercept;
  const yEndPrice = (data.length - 1) * trendline.slope + trendline.intercept;

  const yStart = yScale(yStartPrice);
  const yEnd = yScale(yEndPrice);

  svg
    .append("line")
    .attr("x1", xStart)
    .attr("y1", yStart)
    .attr("x2", xEnd)
    .attr("y2", yEnd)
    .attr("stroke", color)
    .attr("stroke-width", strokeWidth);

  // Extrapolate the trendline to the right for 3 more candles
  // use dashed line to indicate extrapolation
  const xExtrapolated = xEnd + halfCandleWidth * 6;
  const yExtrapolated = yEndPrice + 3 * trendline.slope;

  svg
    .append("line")
    .attr("x1", xEnd)
    .attr("y1", yEnd)
    .attr("x2", xExtrapolated)
    .attr("y2", yScale(yExtrapolated))
    .attr("stroke", color)
    .attr("stroke-dasharray", "3")
    .attr("stroke-width", strokeWidth);
};

const plotVolume = (
  svg: d3.Selection<SVGElement, unknown, null, undefined>,
  xScale: d3.ScaleBand<string>,
  width: number,
  height: number,
  margin: { top: number; right: number; bottom: number; left: number },
  processedData: NonNullableDailyPricesObject[],
) => {
  // Create volume bars
  const volumeScale = d3
    .scaleLinear()
    .range([height, height - 100]) // Adjust height for volume bars
    .domain([0, d3.max(processedData, (d) => d.volume)]);

  svg
    .append("g")
    .attr("class", "volume")
    .selectAll("rect")
    .data(processedData)
    .enter()
    .append("rect")
    .attr("x", (d) => xScale(d.date))
    .attr("y", (d) => volumeScale(d.volume))
    .attr("width", xScale.bandwidth() * 0.8)
    .attr("height", (d) => volumeScale(0) - volumeScale(d.volume)) // Corrects the height calculation

    .attr("fill", (d) => (d.open > d.close ? "#EC3323" : "#71FA4C"))
    .attr("opacity", 0.7);

  // Define a separate volume y-axis using the left side
  const volumeAxis = d3
    .axisRight(volumeScale)
    .tickFormat(formatVolume)
    .ticks(3);

  // Append volume y-axis to the SVG
  svg
    .append("g")
    .attr("transform", `translate(${width}, 0)`) // Use the right side of the main chart area
    .call(volumeAxis)
    .selectAll("text")
    .attr("fill", "white");

  // Add a dashed line above the volume bars
  svg
    .append("line")
    .attr("x1", 0 - margin.left)
    .attr("x2", width)
    .attr("y1", height - 100)
    .attr("y2", height - 100)
    .attr("stroke", "white")
    .attr("stroke-dasharray", "5,5")
    .attr("opacity", 0.5);
};

const plotEntryExit = (
  svg: d3.Selection<SVGElement, unknown, null, undefined>,
  xScale: d3.ScaleBand<string>,
  yScale: d3.ScaleLinear<number, number>,
  entryIndex: number,
  exitIndex: number,
  processedData: NonNullableDailyPricesObject[],
) => {
  const entry = processedData[entryIndex];
  const exit = processedData[exitIndex];

  const entryX = xScale(entry.date) + xScale.bandwidth() / 2;
  const entryY = yScale(entry.low * 0.97);

  const exitX = xScale(exit.date) + xScale.bandwidth() / 2;
  const exitY = yScale(exit.low * 0.97);

  const triangleSymbol = d3.symbol().type(d3.symbolTriangle).size(42);
  svg
    .append("path")
    .attr("d", triangleSymbol)
    .attr("transform", `translate(${entryX}, ${entryY}) rotate(0)`)
    .attr("fill", "#71FA4C");

  svg
    .append("path")
    .attr("d", triangleSymbol)
    .attr("transform", `translate(${exitX}, ${exitY}) rotate(0)`)
    .attr("fill", "#EC3323");
};

const generateChart = (
  processedData,
  priorMoveStartIndex,
  priorMoveEndIndex,
  consolidationStartIndex,
  consolidationEndIndex,
  entryIndex,
  exitIndex,
  trendline,
) => {
  const { document } = new JSDOM("").window;

  const margin = { top: 20, right: 50, bottom: 30, left: 40 };
  const width = 1000 - margin.left - margin.right;
  const height = 600 - margin.top - margin.bottom;

  // Create SVG element
  const svg = d3
    .select(document.body)
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Add dark background
  svg
    .append("rect")
    .attr("x", -margin.left)
    .attr("y", -margin.top)
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .attr("fill", "black");

  // Define scales
  const xScale = d3.scaleBand().range([0, width]).padding(0.1);
  const yScale = d3.scaleLinear().range([height - 100, 0]);

  // Set the domains
  xScale.domain(processedData.map((d) => d.date));
  yScale.domain([
    d3.min(processedData, (d) => d.low),
    d3.max(processedData, (d) => d.high),
  ]);

  // Calculate tick values for dates
  const tickValues = processedData
    .map((d, i) => ({ date: d.date, index: i }))
    .filter((_, i, a) => i % Math.floor(a.length / 10) === 0)
    .map((d) => d.date);

  svg
    .append("g")
    .attr("transform", `translate(0,${height})`)
    .call(
      d3
        .axisBottom(xScale)
        .tickValues(tickValues)
        .tickFormat(d3.timeFormat("%Y-%m-%d")),
    )
    .selectAll("text")
    .attr("fill", "white");

  svg
    .append("g")
    .attr("transform", `translate(${width}, 0)`)
    .call(d3.axisRight(yScale))
    .selectAll("text")
    .attr("fill", "white");

  // Plot volume
  plotVolume(svg, xScale, width, height, margin, processedData);

  // make axis lines and ticks white
  svg.selectAll("path").attr("stroke", "white");
  svg.selectAll("line").attr("stroke", "white");

  // Create candlesticks
  const candlesticks = svg
    .selectAll(".candlestick")
    .data(processedData)
    .enter()
    .append("g")
    .attr("class", "candlestick")
    .attr("transform", (d) => `translate(${xScale(d.date)}, 0)`);

  // Draw high-low lines
  candlesticks
    .append("line")
    .attr("class", "stem")
    .attr("x1", (xScale.bandwidth() * 0.8) / 2)
    .attr("x2", (xScale.bandwidth() * 0.8) / 2)
    .attr("y1", (d) => yScale(d.high))
    .attr("y2", (d) => yScale(d.low))
    .attr("stroke", (d) => (d.open > d.close ? "#EC3323" : "#71FA4C"));

  // Draw open-close rectangles
  candlesticks
    .append("rect")
    .attr("class", "box")
    .attr("y", (d) => yScale(Math.max(d.open, d.close)))
    .attr("height", (d) => Math.abs(yScale(d.open) - yScale(d.close)) || 1)
    .attr("width", xScale.bandwidth() * 0.8)
    .attr("fill", (d) => (d.open > d.close ? "#EC3323" : "#71FA4C"))
    .attr("stroke", (d) => (d.open > d.close ? "#EC3323" : "#71FA4C"))
    .attr("stroke-width", 0.5);

  // Plot moving averages
  const movingAverages10 = calculateMovingAverage(processedData, 10);
  const movingAverages20 = calculateMovingAverage(processedData, 20);
  const movingAverages50 = calculateMovingAverage(processedData, 50);

  // Drawing the moving average lines
  const lineColors = ["#C931CC", "#FFFC4A", "#CF2E13", "#3D6BD4", "#01C5C4"];
  drawLine(svg, xScale, yScale, movingAverages10, lineColors[0]);
  drawLine(svg, xScale, yScale, movingAverages20, lineColors[1]);
  drawLine(svg, xScale, yScale, movingAverages50, lineColors[2]);

  // plot uptrend
  const uptrendStart = processedData[priorMoveStartIndex];
  const uptrendEnd = processedData[priorMoveEndIndex];

  if (!uptrendStart || !uptrendEnd) {
    return;
  }

  const lineXStart = xScale(uptrendStart.date) + xScale.bandwidth() / 2;
  const lineXEnd = xScale(uptrendEnd.date) + xScale.bandwidth() / 2;

  svg
    .append("line")
    .attr("x1", lineXStart)
    .attr("y1", yScale(uptrendStart.low))
    .attr("x2", lineXEnd)
    .attr("y2", yScale(uptrendEnd.high))
    .attr("stroke", "white")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "5,5")
    .attr("opacity", 0.7);

  // plot consolidation
  const consolidationData = processedData.slice(
    consolidationStartIndex,
    consolidationEndIndex,
  );

  plotTrendline(
    svg,
    xScale,
    yScale,
    consolidationData,
    trendline,
    "white",
    1.5,
  );

  // Plot entry and exit points
  if (!processedData[entryIndex] || !processedData[exitIndex]) {
    return;
  }
  plotEntryExit(svg, xScale, yScale, entryIndex, exitIndex, processedData);

  return d3.select(document.body).select("svg").node().outerHTML;
};

export { generateChart };
