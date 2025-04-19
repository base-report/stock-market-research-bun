/**
 * A simple cache for expensive calculations
 * This helps avoid recalculating the same values multiple times
 */
export class CalculationCache {
  private static instance: CalculationCache;
  private cache: Map<string, any> = new Map();
  
  private constructor() {}
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): CalculationCache {
    if (!CalculationCache.instance) {
      CalculationCache.instance = new CalculationCache();
    }
    return CalculationCache.instance;
  }
  
  /**
   * Get a value from the cache or calculate it if not present
   * @param key Cache key
   * @param calculator Function to calculate the value if not in cache
   * @returns The cached or calculated value
   */
  public getOrCalculate<T>(key: string, calculator: () => T): T {
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }
    
    const value = calculator();
    this.cache.set(key, value);
    return value;
  }
  
  /**
   * Clear the cache
   */
  public clear(): void {
    this.cache.clear();
  }
  
  /**
   * Clear cache entries that match a prefix
   * @param prefix Key prefix to match
   */
  public clearByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Get the calculation cache instance
 */
export const getCache = (): CalculationCache => {
  return CalculationCache.getInstance();
};
