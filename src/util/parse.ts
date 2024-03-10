import Papaparse from "papaparse";

const parseCsv = <T>(text: string): T[] => {
  const parseOptions = {
    header: true,
    skipEmptyLines: true,
  };

  const { data } = Papaparse.parse(text, parseOptions);
  return data as T[];
};

export { parseCsv };
