import { parseCsv } from "./parse";

const fetchCsv = async <T>(url: string): Promise<T[]> =>
  fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(response.statusText);
    }

    const text = await response.text();
    return parseCsv<T>(text);
  });

export { fetchCsv };
