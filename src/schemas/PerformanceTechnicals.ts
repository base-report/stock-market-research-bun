import { z } from "zod";

const DBPerformanceTechnicalsWriteSchema = z.object({
  name: z.string(),
  aggregate_type: z.string(),
  date: z.string(),

  adr_20_pct: z.number(),
  price_1: z.number(),
  high_20: z.number(),
  low_20: z.number(),
  high_50: z.number(),
  low_50: z.number(),
  high_200: z.number(),
  low_200: z.number(),
});

type DBPerformanceTechnicalsWrite = z.infer<
  typeof DBPerformanceTechnicalsWriteSchema
>;

const DBPerformanceTechnicalsReadSchema =
  DBPerformanceTechnicalsWriteSchema.extend({
    bpr: z.number(),
  });

type DBPerformanceTechnicalsRead = z.infer<
  typeof DBPerformanceTechnicalsReadSchema
>;

export type { DBPerformanceTechnicalsWrite, DBPerformanceTechnicalsRead };
export {
  DBPerformanceTechnicalsWriteSchema,
  DBPerformanceTechnicalsReadSchema,
};
