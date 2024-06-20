import { db } from "./client";

const populateBprPercentiles = () => {
  const query = db.query(`
    INSERT INTO bpr_percentiles (date, min_bpr, max_bpr, percentile)
    WITH ranked_data AS (
        SELECT
            date,
            bpr,
            ROW_NUMBER() OVER (PARTITION BY date ORDER BY bpr) AS row_num,
            COUNT(*) OVER (PARTITION BY date) AS total_count
        FROM
            performance_technicals
        WHERE
            aggregate_type = 'none'
            AND bpr IS NOT NULL
            AND bpr != 'NaN'
            AND bpr < 1
            AND bpr > -1
            AND price_1 >= 0
    ),
    percentile_data AS (
        SELECT
            date,
            bpr,
            (row_num - 1) * 100 / total_count + 1 AS percentile
        FROM
            ranked_data
    )
    SELECT
        date,
        MIN(bpr) AS min_bpr,
        MAX(bpr) AS max_bpr,
        percentile
    FROM
        percentile_data
    GROUP BY
        date, percentile
    ORDER BY
        date, percentile DESC;
  `);
  query.run();
};

export { populateBprPercentiles };
