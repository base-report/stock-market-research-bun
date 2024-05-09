import { z } from "zod";

const TrendlineSchema = z.object({
  slope: z.number(),
  intercept: z.number(),
});

type Trendline = z.infer<typeof TrendlineSchema>;

export type { Trendline };
export { TrendlineSchema };
