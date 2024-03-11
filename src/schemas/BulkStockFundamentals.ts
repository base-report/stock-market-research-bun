import { z } from "zod";
import { getValidDateOrNull } from "../util/date";

const GeneralSchema = z
  .object({
    Code: z.string(),
    IPODate: z.union([z.string(), z.null()]),
    Sector: z.union([z.string(), z.null()]),
    Industry: z.union([z.string(), z.null()]),
    GicSector: z.union([z.string(), z.null()]),
    GicGroup: z.union([z.string(), z.null()]),
    GicIndustry: z.union([z.string(), z.null()]),
    GicSubIndustry: z.union([z.string(), z.null()]),
    Description: z.union([z.string(), z.null()]),
    Address: z.union([z.string(), z.null()]),
    WebURL: z.union([z.string(), z.null()]),
    LogoURL: z.union([z.string(), z.null()]),
    FullTimeEmployees: z.union([z.number(), z.null()]),
    IsDelisted: z.union([z.boolean(), z.null()]),
  })
  .transform((x) => ({
    code: x.Code,
    ipo_date: getValidDateOrNull(x.IPODate),
    sector: x.Sector,
    industry: x.Industry,
    gic_sector: x.GicSector,
    gic_group: x.GicGroup,
    gic_industry: x.GicIndustry,
    gic_sub_industry: x.GicSubIndustry,
    description: x.Description,
    address: x.Address,
    web_url: x.WebURL,
    logo_url: x.LogoURL,
    full_time_employees: x.FullTimeEmployees,
    is_delisted: x.IsDelisted,
  }));

type General = z.infer<typeof GeneralSchema>;

const BulkStockFundamentalsEntrySchema = z
  .object({
    General: GeneralSchema,
  })
  .transform((x) => ({
    ...x.General,
  }));

type BulkStockFundamentalsEntry = z.infer<
  typeof BulkStockFundamentalsEntrySchema
>;

const BulkStockFundamentalsSchema = z.array(BulkStockFundamentalsEntrySchema);

type BulkStockFundamentals = z.infer<typeof BulkStockFundamentalsSchema>;

export type { General, BulkStockFundamentals, BulkStockFundamentalsEntry };
export {
  GeneralSchema,
  BulkStockFundamentalsSchema,
  BulkStockFundamentalsEntrySchema,
};
