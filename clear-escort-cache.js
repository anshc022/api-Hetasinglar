const cache = require('./services/cache');

console.log('🗑️ Clearing all cache...');
console.log('📊 Cache stats before clear:', cache.getStats());

// Clear all cache entries (including escort profiles)
cache.clear();

console.log('✅ All cache cleared successfully!');
console.log('🔄 New API requests will fetch fresh data with description fields.');