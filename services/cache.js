/**
 * Global Cache Service for Backend Performance
 * Provides in-memory caching with TTL support
 */
class CacheService {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0
    };
  }

  /**
   * Set a value in cache with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds
   */
  set(key, value, ttl = 300000) { // Default 5 minutes
    // Clear existing timer if exists
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Set the value
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });

    // Set expiration timer
    const timer = setTimeout(() => {
      this.delete(key);
    }, ttl);

    this.timers.set(key, timer);
    this.stats.sets++;

    console.log(`🗄️  Cached: ${key} (TTL: ${ttl}ms)`);
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null
   */
  get(key) {
    if (this.cache.has(key)) {
      this.stats.hits++;
      const cached = this.cache.get(key);
      console.log(`✅ Cache hit: ${key} (age: ${Date.now() - cached.timestamp}ms)`);
      return cached.value;
    }

    this.stats.misses++;
    console.log(`❌ Cache miss: ${key}`);
    return null;
  }

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    console.log(`🗑️  Cache deleted: ${key}`);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    console.log('🧹 Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits / (this.stats.hits + this.stats.misses) * 100;
    return {
      ...this.stats,
      hitRate: isNaN(hitRate) ? 0 : hitRate.toFixed(2),
      size: this.cache.size
    };
  }

  /**
   * Middleware to cache responses based on URL patterns
   */
  middleware(patterns = [], ttl = 300000) {
    return (req, res, next) => {
      const shouldCache = patterns.some(pattern => 
        req.path.includes(pattern) && req.method === 'GET'
      );

      if (!shouldCache) {
        return next();
      }

      const cacheKey = `${req.method}:${req.path}:${JSON.stringify(req.query)}`;
      const cached = this.get(cacheKey);

      if (cached) {
        try {
          res.set('X-Cache', 'HIT');
        } catch (e) {
          // Headers already sent, ignore
        }
        return res.json(cached);
      }

      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = (data) => {
        this.set(cacheKey, data, ttl);
        try {
          res.set('X-Cache', 'MISS');
        } catch (e) {
          // Headers already sent, ignore
        }
        return originalJson.call(res, data);
      };

      next();
    };
  }
}

module.exports = new CacheService();
