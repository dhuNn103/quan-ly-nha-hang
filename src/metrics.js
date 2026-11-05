class MetricsTracker {
  constructor() {
    this.startTime = Date.now();
    this.totalRequests = 0;
    this.statusCodes = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    this.latencies = []; // circular buffer of last 100 requests
    this.maxLatencies = 100;
    this.minuteBuckets = new Map(); // minuteTimestamp -> count

    // Clean minute buckets older than 5 minutes
    setInterval(() => {
      const nowMin = Math.floor(Date.now() / 60000);
      for (const m of this.minuteBuckets.keys()) {
        if (nowMin - m > 5) this.minuteBuckets.delete(m);
      }
    }, 60000).unref();
  }

  recordRequest(method, path, statusCode, durationMs) {
    this.totalRequests++;

    const cat = `${Math.floor(statusCode / 100)}xx`;
    if (this.statusCodes[cat] !== undefined) {
      this.statusCodes[cat]++;
    }

    if (this.latencies.length >= this.maxLatencies) {
      this.latencies.shift();
    }
    this.latencies.push(durationMs);

    const nowMin = Math.floor(Date.now() / 60000);
    this.minuteBuckets.set(nowMin, (this.minuteBuckets.get(nowMin) || 0) + 1);
  }

  getStats() {
    const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
    const nowMin = Math.floor(Date.now() / 60000);
    const countThisMin = this.minuteBuckets.get(nowMin) || 0;
    const reqPerSec = parseFloat((countThisMin / 60).toFixed(2));

    let avgLatencyMs = 0;
    let minLatencyMs = 0;
    let maxLatencyMs = 0;
    let p95LatencyMs = 0;

    if (this.latencies.length > 0) {
      const sum = this.latencies.reduce((a, b) => a + b, 0);
      avgLatencyMs = parseFloat((sum / this.latencies.length).toFixed(2));
      minLatencyMs = parseFloat(Math.min(...this.latencies).toFixed(2));
      maxLatencyMs = parseFloat(Math.max(...this.latencies).toFixed(2));

      const sorted = [...this.latencies].sort((a, b) => a - b);
      const p95Idx = Math.floor(sorted.length * 0.95);
      p95LatencyMs = parseFloat(sorted[p95Idx].toFixed(2));
    }

    return {
      uptimeSeconds: uptimeSec,
      totalRequests: this.totalRequests,
      requestsPerSecond: reqPerSec,
      statusBreakdown: { ...this.statusCodes },
      latencyMs: {
        avg: avgLatencyMs,
        min: minLatencyMs,
        max: maxLatencyMs,
        p95: p95LatencyMs
      }
    };
  }
}

module.exports = new MetricsTracker();
