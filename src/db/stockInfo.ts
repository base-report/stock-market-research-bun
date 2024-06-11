import type { BulkStockFundamentals } from "../schemas/BulkStockFundamentals";

import { db } from "./client";

const addBulkStockInfo = (bulkStockInfo: BulkStockFundamentals) => {
  if (bulkStockInfo.length === 0) return;

  const insertRow = db.prepare(
    "INSERT INTO stock_info (code, ipo_date, sector, industry, gic_sector, gic_group, gic_industry, gic_sub_industry, description, address, web_url, logo_url, full_time_employees, is_delisted) VALUES ($code, $ipo_date, $sector, $industry, $gic_sector, $gic_group, $gic_industry, $gic_sub_industry, $description, $address, $web_url, $logo_url, $full_time_employees, $is_delisted) ON CONFLICT(code) DO UPDATE SET ipo_date=excluded.ipo_date, sector=excluded.sector, industry=excluded.industry, gic_sector=excluded.gic_sector, gic_group=excluded.gic_group, gic_industry=excluded.gic_industry, gic_sub_industry=excluded.gic_sub_industry, description=excluded.description, address=excluded.address, web_url=excluded.web_url, logo_url=excluded.logo_url, full_time_employees=excluded.full_time_employees, is_delisted=excluded.is_delisted",
  );

  const insertAll = db.transaction((bulkStockInfo: BulkStockFundamentals) => {
    for (const stockInfo of bulkStockInfo) {
      insertRow.run({
        $code: stockInfo.code,
        $ipo_date: stockInfo.ipo_date,
        $sector: stockInfo.sector,
        $industry: stockInfo.industry,
        $gic_sector: stockInfo.gic_sector,
        $gic_group: stockInfo.gic_group,
        $gic_industry: stockInfo.gic_industry,
        $gic_sub_industry: stockInfo.gic_sub_industry,
        $description: stockInfo.description,
        $address: stockInfo.address,
        $web_url: stockInfo.web_url,
        $logo_url: stockInfo.logo_url,
        $full_time_employees: stockInfo.full_time_employees,
        $is_delisted: stockInfo.is_delisted,
      });
    }
    return bulkStockInfo.length;
  });

  insertAll(bulkStockInfo);
};

const getLeftoverStockInfoCodes = (): string[] => {
  const query = db.query(
    "SELECT code FROM symbols WHERE code NOT IN (SELECT code FROM stock_info)",
  );
  const symbols = query.values();
  return symbols.map(([code]) => code);
};

const getAllGICSubIndustries = (): string[] => {
  const query = db.query(
    "SELECT DISTINCT gic_sub_industry FROM stock_info WHERE gic_sub_industry IS NOT NULL ORDER BY gic_sub_industry",
  );
  const subIndustries = query.values();
  return subIndustries.map(([gic_sub_industry]) => gic_sub_industry);
};

const getALLGICIndustries = (): string[] => {
  const query = db.query(
    "SELECT DISTINCT gic_industry FROM stock_info WHERE gic_industry IS NOT NULL ORDER BY gic_industry",
  );
  const industries = query.values();
  return industries.map(([gic_industry]) => gic_industry);
};

const getALLGICGroups = (): string[] => {
  const query = db.query(
    "SELECT DISTINCT gic_group FROM stock_info WHERE gic_group IS NOT NULL ORDER BY gic_group",
  );
  const groups = query.values();
  return groups.map(([gic_group]) => gic_group);
};

const getALLGICSectors = (): string[] => {
  const query = db.query(
    "SELECT DISTINCT gic_sector FROM stock_info WHERE gic_sector IS NOT NULL ORDER BY gic_sector",
  );
  const sectors = query.values();
  return sectors.map(([gic_sector]) => gic_sector);
};

export {
  addBulkStockInfo,
  getLeftoverStockInfoCodes,
  getAllGICSubIndustries,
  getALLGICIndustries,
  getALLGICGroups,
  getALLGICSectors,
};
