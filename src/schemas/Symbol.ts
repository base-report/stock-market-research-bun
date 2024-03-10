import { z } from "zod";

const SymbolSchema = z
  .object({
    Code: z.string(),
    Name: z.string(),
    Exchange: z.string(),
    Isin: z.union([z.null(), z.string()]),
  })
  .transform((x) => ({
    code: x.Code,
    name: x.Name,
    exchange: x.Exchange,
    isin: x.Isin,
  }));

type Symbol = z.infer<typeof SymbolSchema>;

export type { Symbol };
export { SymbolSchema };
