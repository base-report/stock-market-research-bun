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

const calculateMovingAverage = (data, numberOfDays) => {
  let result = data.map((entry, index, array) => {
    if (index < numberOfDays - 1) {
      return null; // not enough data points to create the average
    }
    let sum = 0;
    for (let i = 0; i < numberOfDays; i++) {
      sum += array[index - i].close;
    }
    return {
      date: entry.date,
      average: sum / numberOfDays,
    };
  });
  return result.filter((d) => d !== null);
};

const findLongestUptrend = (data) => {
  const ma10 = calculateMovingAverage(data, 10);
  let longestUptrend = [];
  let currentUptrend = [];

  for (let i = 0; i < ma10.length; i++) {
    if (data[i + 9].close > ma10[i].average) {
      // Check if closing price is above MA10
      currentUptrend.push({
        date: ma10[i].date,
        open: data[i + 9].open,
        high: data[i + 9].high,
        low: data[i + 9].low,
        close: data[i + 9].close,
        volume: data[i + 9].volume,
        ma10: ma10[i].average,
      });
    } else {
      if (currentUptrend.length > longestUptrend.length) {
        longestUptrend = currentUptrend;
      }
      currentUptrend = [];
    }
  }

  // Check at the end to capture any uptrend that might be the longest and hasn't been reset
  if (currentUptrend.length > longestUptrend.length) {
    longestUptrend = currentUptrend;
  }

  return longestUptrend;
};

const formatVolume = (d) => {
  if (d >= 1e9) {
    return (d / 1e9).toFixed(0) + "B"; // Billions
  } else if (d >= 1e6) {
    return (d / 1e6).toFixed(0) + "M"; // Millions
  } else if (d >= 1e3) {
    return (d / 1e3).toFixed(0) + "K"; // Thousands
  }
  return d.toFixed(0); // Values less than 1000
};

const generateChart = (
  data: [number, number, number, number, number, number][],
) => {
  const { document } = new JSDOM("").window;

  const processedData = processData(data);
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

  // Add white background first before other elements
  svg
    .append("rect")
    .attr("x", -margin.left) // Extend the rectangle to cover the left margin
    .attr("y", -margin.top) // Extend the rectangle to cover the top margin
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .attr("fill", "white");
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
    .attr("stroke", "black")
    .attr("stroke-width", 0.5);

  // Plot moving averages
  const movingAverages10 = calculateMovingAverage(processedData, 10);
  const movingAverages20 = calculateMovingAverage(processedData, 20);
  const movingAverages50 = calculateMovingAverage(processedData, 50);

  const drawLine = (data, color) => {
    const line = d3
      .line()
      .x((d) => xScale(d.date) + xScale.bandwidth() / 2)
      .y((d) => yScale(d.average))
      .curve(d3.curveMonotoneX); // This makes the line smooth

    svg
      .append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 0.5)
      .attr("d", line);
  };

  // Drawing the moving average lines
  drawLine(movingAverages10, "blue"); // Change color as needed
  drawLine(movingAverages20, "purple"); // Change color as needed
  drawLine(movingAverages50, "orange"); // Change color as needed

  // plot uptrend
  const longestUptrend = findLongestUptrend(processedData);
  const uptrendStart = longestUptrend[0];
  const uptrendEnd = longestUptrend[longestUptrend.length - 1];

  const lineXStart = xScale(uptrendStart.date) - 10; // Offset to the left
  const lineXEnd = xScale(uptrendEnd.date) - 10; // Consistent offset to the left

  svg
    .append("line")
    .attr("x1", lineXStart)
    .attr("y1", yScale(uptrendStart.low))
    .attr("x2", lineXEnd)
    .attr("y2", yScale(uptrendEnd.high))
    .attr("stroke", "grey")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "5,5");

  // plot consolidation
  const highestHighCandle = longestUptrend.reduce(
    (acc, curr) => (curr.high > acc.high ? curr : acc),
    longestUptrend[0],
  );

  const highestHighIndex = processedData.findIndex(
    (d) => d.date === highestHighCandle.date,
  );
  const consolidationStartIndex = highestHighIndex;
  const minimumConsolidationLength = 10;

  const fitLine = (data, keyFunc) => {
    const calculateLine = (p1, p2) => {
      const slope = (keyFunc(p2) - keyFunc(p1)) / (p2.index - p1.index);
      const intercept = keyFunc(p1) - slope * p1.index;
      return { slope, intercept };
    };

    const countInliers = (line, data, threshold) => {
      let inlierCount = 0;
      data.forEach((point, index) => {
        const expectedY = line.slope * index + line.intercept;
        if (Math.abs(keyFunc(point) - expectedY) <= threshold) {
          inlierCount++;
        }
      });
      return inlierCount;
    };

    const stdDev = Math.sqrt(
      data.reduce(
        (acc, d) =>
          acc +
          Math.pow(
            keyFunc(d) - data.reduce((a, b) => a + keyFunc(b), 0) / data.length,
            2,
          ),
        0,
      ) / data.length,
    );

    let bestLine = null;
    let bestInlierCount = 0;
    const dynamicThreshold = stdDev * 0.5; // Threshold based on half the standard deviation

    for (let i = 0; i < 300; i++) {
      // Increased iterations to 300 for better sampling
      let sampleIndices = [
        Math.floor(Math.random() * data.length),
        Math.floor(Math.random() * data.length),
      ];
      while (sampleIndices[0] === sampleIndices[1]) {
        // Ensure different indices
        sampleIndices[1] = Math.floor(Math.random() * data.length);
      }

      const line = calculateLine(
        { index: sampleIndices[0], ...data[sampleIndices[0]] },
        { index: sampleIndices[1], ...data[sampleIndices[1]] },
      );
      const inlierCount = countInliers(line, data, dynamicThreshold);

      if (inlierCount > bestInlierCount) {
        bestLine = line;
        bestInlierCount = inlierCount;
      }
    }

    return bestLine;
  };

  let dayIndex = consolidationStartIndex + minimumConsolidationLength;
  let isConsolidationEnded = false;

  let consolidationData = [];
  let trendlineHighs = {};
  let trendlineLows = {};
  let isBreakout = false;
  while (!isConsolidationEnded && dayIndex < processedData.length) {
    consolidationData = processedData.slice(consolidationStartIndex, dayIndex);
    trendlineHighs = fitLine(consolidationData, (d) =>
      Math.max(d.open, d.close),
    );
    trendlineLows = fitLine(consolidationData, (d) =>
      Math.min(d.open, d.close),
    );

    // Extrapolate trendlines to next day
    const nextHighPredicted =
      trendlineHighs.slope * (dayIndex - consolidationStartIndex + 1) +
      trendlineHighs.intercept;
    const nextLowPredicted =
      trendlineLows.slope * (dayIndex - consolidationStartIndex + 1) +
      trendlineLows.intercept;
    const nextDayData = processedData[dayIndex];

    // Check for breakout or breakdown
    if (
      nextDayData.close > nextHighPredicted ||
      nextDayData.close < nextLowPredicted
    ) {
      isBreakout = nextDayData.close > nextHighPredicted;
      isConsolidationEnded = true; // End consolidation if breakout or breakdown occurs
    } else {
      dayIndex++; // Otherwise, continue to next day
    }
  }

  // Plotting trendlines
  const plotTrendline = (svg, data, trendline, color, opacity) => {
    const dataIndexStart =
      (data[0].date.getTime() - data[0].date.getTime()) / (1000 * 60 * 60 * 24); // This should be 0 if data[0].date is the start
    const dataIndexEnd =
      (data[data.length - 1].date.getTime() - data[0].date.getTime()) /
      (1000 * 60 * 60 * 24);

    const lineXStart = xScale(data[0].date);
    const lineXEnd = xScale(data[data.length - 1].date);

    const lineYStartDataValue =
      trendline.slope * dataIndexStart + trendline.intercept;
    const lineYEndDataValue =
      trendline.slope * dataIndexEnd + trendline.intercept;

    const lineYStart = yScale(lineYStartDataValue);
    const lineYEnd = yScale(lineYEndDataValue);

    svg
      .append("line")
      .attr("x1", lineXStart)
      .attr("y1", lineYStart)
      .attr("x2", lineXEnd)
      .attr("y2", lineYEnd)
      .attr("stroke", color)
      .attr("stroke-width", 2)
      .attr("opacity", opacity);

    // use processedData to extend the trendline by 5 days
    const additionalDays = 5;
    const extendedIndexStart = processedData.findIndex(
      (d) => d.date === data[data.length - 1].date,
    );
    const extendedIndexEnd = extendedIndexStart + additionalDays;
    const extendedData = processedData.slice(
      extendedIndexStart,
      extendedIndexEnd,
    );

    const lineXEndExtra = xScale(extendedData[extendedData.length - 1].date);
    const lineYEndExtraDataValue =
      trendline.slope * (dataIndexEnd + additionalDays) + trendline.intercept;
    const lineYEndExtra = yScale(lineYEndExtraDataValue);

    svg
      .append("line")
      .attr("x1", lineXEnd)
      .attr("y1", lineYEnd)
      .attr("x2", lineXEndExtra)
      .attr("y2", lineYEndExtra)
      .attr("stroke", color)
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "1.5")
      .attr("opacity", opacity);
  };

  // Drawing trendlines
  plotTrendline(
    svg,
    consolidationData,
    trendlineHighs,
    "green",
    isBreakout ? 1 : 0.3,
  );
  plotTrendline(
    svg,
    consolidationData,
    trendlineLows,
    "red",
    !isBreakout ? 1 : 0.3,
  );

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
  const volumeAxis = d3
    .axisRight(volumeScale)
    .tickFormat(formatVolume)
    .ticks(3);

  // Append volume y-axis to the SVG
  svg
    .append("g")
    .attr("transform", `translate(${width}, 0)`) // Use the right side of the main chart area
    .call(volumeAxis);

  // Add a dashed line above the volume bars
  svg
    .append("line")
    .attr("x1", 0 - margin.left)
    .attr("x2", width)
    .attr("y1", height)
    .attr("y2", height + margin.top)
    .attr("stroke", "black")
    .attr("stroke-dasharray", "5,5")
    .attr("opacity", 0.5);

  return d3.select(document.body).select("svg").node().outerHTML;
};

export { generateChart };
