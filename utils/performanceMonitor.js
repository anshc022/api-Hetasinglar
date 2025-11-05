/**
 * Performance monitoring utilities for API endpoints
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.slowQueryThreshold = 1000; // 1 second
    this.warningThreshold = 500; // 500ms
  }

  startTimer(requestId, operation) {
    const timer = {
      requestId,
      operation,
      startTime: Date.now(),
      phase: 'started'
    };
    
    this.metrics.set(requestId, timer);
    return timer;
  }

  recordPhase(requestId, phase, metadata = {}) {
    const timer = this.metrics.get(requestId);
    if (!timer) return;

    const now = Date.now();
    timer.phases = timer.phases || {};
    timer.phases[phase] = {
      timestamp: now,
      duration: now - timer.startTime,
      metadata
    };
  }

  endTimer(requestId, resultCount = 0, cached = false) {
    const timer = this.metrics.get(requestId);
    if (!timer) return null;

    const endTime = Date.now();
    const totalDuration = endTime - timer.startTime;
    
    const result = {
      requestId,
      operation: timer.operation,
      totalDuration,
      resultCount,
      cached,
      phases: timer.phases || {},
      timestamp: endTime,
      performance: this.categorizePerformance(totalDuration)
    };

    // Log based on performance
    this.logPerformance(result);
    
    // Clean up
    this.metrics.delete(requestId);
    
    return result;
  }

  categorizePerformance(duration) {
    if (duration > this.slowQueryThreshold) return 'slow';
    if (duration > this.warningThreshold) return 'warning';
    return 'good';
  }

  logPerformance(result) {
    const { requestId, operation, totalDuration, resultCount, cached, performance } = result;
    const cacheStatus = cached ? '(cached)' : '(db)';
    
    switch (performance) {
      case 'slow':
        console.error(`🐌 SLOW ${operation} [${requestId}]: ${totalDuration}ms ${cacheStatus} - ${resultCount} results`);
        break;
      case 'warning':
        console.warn(`⚠️ SLOW ${operation} [${requestId}]: ${totalDuration}ms ${cacheStatus} - ${resultCount} results`);
        break;
      case 'good':
        console.log(`✅ ${operation} [${requestId}]: ${totalDuration}ms ${cacheStatus} - ${resultCount} results`);
        break;
    }
  }

  // Get performance statistics
  getStats() {
    return {
      activeRequests: this.metrics.size,
      slowQueryThreshold: this.slowQueryThreshold,
      warningThreshold: this.warningThreshold
    };
  }

  // Generate a short request ID
  generateRequestId() {
    return Math.random().toString(36).substr(2, 9);
  }
}

// Singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = {
  PerformanceMonitor,
  performanceMonitor
};