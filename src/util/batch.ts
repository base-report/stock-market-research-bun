const chunk = <T>(arr: T[], size: number): T[][] =>
  [...Array(Math.ceil(arr.length / size))].map((_, i) =>
    arr.slice(size * i, size + size * i),
  );

const processInBatches = async <T>(
  items: T[],
  processItem: (item: T) => Promise<any>,
  batchSize: number,
  onError: (item: T, error: any) => void,
  logBatch: boolean = false,
): Promise<void> => {
  const chunk = (arr: T[], size: number) =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_v, i) =>
      arr.slice(i * size, i * size + size),
    );

  const batches = chunk(items, batchSize);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    if (logBatch) {
      console.time(`Batch ${i + 1} of ${batches.length}`);
    }
    const promises = batch.map(processItem);
    const results = await Promise.allSettled(promises);

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        onError(batch[index], result.reason);
      }
    });
    if (logBatch) {
      console.timeEnd(`Batch ${i + 1} of ${batches.length}`);
    }
  }
};

export { chunk, processInBatches };
