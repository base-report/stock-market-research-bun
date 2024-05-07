import * as d3 from "d3";
import { JSDOM } from "jsdom";

const processData = (
  data: [number, number, number, number, number, number][],
) =>
  data.map((d) => ({
    date: new Date(d[5]),
    open: d[0],
    high: d[1],
    low: d[2],
    close: d[3],
    volume: d[4],
  }));

const generateChart = (
  data: [number, number, number, number, number, number][],
) => {
  const { document } = new JSDOM("").window;

  const processedData = processData(data);
  const margin = { top: 20, right: 30, bottom: 30, left: 40 };
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

  // Define scales
  const xScale = d3.scaleBand().range([0, width]).padding(0.1);
  const yScale = d3.scaleLinear().range([height - 100, 0]);

  // Set the domains
  xScale.domain(processedData.map((d) => d.date));
  yScale.domain([
    d3.min(processedData, (d) => d.low),
    d3.max(processedData, (d) => d.high),
  ]);

  // Add axes
  // svg
  //   .append("g")
  //   .attr("transform", `translate(0,${height})`)
  //   .call(d3.axisBottom(xScale).tickFormat(d3.timeFormat("%Y-%m-%d")));

  // Calculate tick values for dates
  const tickValues = processedData
    .map((d, i) => ({ date: d.date, index: i }))
    .filter((_, i, a) => i % Math.floor(a.length / 10) === 0) // Adjust to get roughly 10 ticks
    .map((d) => d.date);

  svg
    .append("g")
    .attr("transform", `translate(0,${height})`)
    .call(
      d3
        .axisBottom(xScale)
        .tickValues(tickValues)
        .tickFormat(d3.timeFormat("%Y-%m-%d")),
    );
  svg
    .append("g")
    .attr("transform", `translate(${width}, 0)`)
    .call(d3.axisRight(yScale));

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
    .attr("stroke", "black");

  // Draw open-close rectangles
  candlesticks
    .append("rect")
    .attr("class", "box")
    .attr("y", (d) => yScale(Math.max(d.open, d.close)))
    .attr("height", (d) => Math.abs(yScale(d.open) - yScale(d.close)) || 1)
    .attr("width", xScale.bandwidth() * 0.8)
    .attr("fill", (d) => (d.open > d.close ? "red" : "green"))
    .attr("stroke", "black");

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

    .attr("fill", (d) => (d.open > d.close ? "red" : "green"))
    .attr("opacity", 0.5);

  // Define a separate volume y-axis using the left side
  const volumeAxis = d3.axisRight(volumeScale).ticks(3);

  // Append volume y-axis to the SVG
  svg
    .append("g")
    .attr("transform", `translate(${width}, 0)`) // Use the right side of the main chart area
    .call(volumeAxis);

  // Add a dashed line above the volume bars
  svg
    .append("line")
    .attr("x1", 0)
    .attr("x2", width)
    .attr("y1", height - 100)
    .attr("y2", height - 100)
    .attr("stroke", "black")
    .attr("stroke-dasharray", "5,5")
    .attr("opacity", 0.5);

  return d3.select(document.body).select("svg").node().outerHTML;
};

export { generateChart };
