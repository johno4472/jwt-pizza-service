const { get } = require("http");
const config = require("./config");

// Metrics stored in memory
const requests = {};
let greetingChangedCount = 0;

// Function to track when the greeting is changed
function greetingChanged() {
  greetingChangedCount++;
}

// Middleware to track requests
function requestTracker(req, res, next) {
  const endpoint = `[${req.method}] ${req.path}`;
  requests[endpoint] = (requests[endpoint] || 0) + 1;
  next();
}

//alternate way to send metrics periodically to grafana
function sendMetricsPeriodically(period) {
  const timer = setInterval(() => {
    try {
      const metrics = new OtelMetricBuilder();
      metrics.add(httpMetrics);
      metrics.add(systemMetrics);
      metrics.add(userMetrics);
      metrics.add(purchaseMetrics);
      metrics.add(authMetrics);

      metrics.sendToGrafana();
    } catch (error) {
      console.log("Error sending metrics", error);
    }
  }, period);
}
// This will periodically send metrics to Grafana
setInterval(() => {
  const metrics = [];
  metrics.push(createMetric("CPU Usage", getCpuUsagePercentage()));
  metrics.push("Memory Usage", getMemoryUsagePercentage());
  Object.keys(requests).forEach((endpoint) => {
    metrics.push(
      createMetric("requests", requests[endpoint], "1", "sum", "asInt", {
        endpoint,
      })
    );
  });

  sendMetricToGrafana(metrics);
}, 10000);

const os = require("os");

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

function createMetric(
  metricName,
  metricValue,
  metricUnit,
  metricType,
  valueType,
  attributes
) {
  attributes = { ...attributes, source: config.metrics.source };

  const metric = {
    name: metricName,
    unit: metricUnit,
    [metricType]: {
      dataPoints: [
        {
          [valueType]: metricValue,
          timeUnixNano: Date.now() * 1000000,
          attributes: [],
        },
      ],
    },
  };

  Object.keys(attributes).forEach((key) => {
    metric[metricType].dataPoints[0].attributes.push({
      key: key,
      value: { stringValue: attributes[key] },
    });
  });

  if (metricType === "sum") {
    metric[metricType].aggregationTemporality =
      "AGGREGATION_TEMPORALITY_CUMULATIVE";
    metric[metricType].isMonotonic = true;
  }

  return metric;
}

function sendMetricToGrafana(metrics) {
  const body = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics,
          },
        ],
      },
    ],
  };

  fetch(`${config.metrics.url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${config.metrics.apiKey}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `HTTP status: ${response.status} url->${config.metrics.url}`
        );
      }
    })
    .catch((error) => {
      console.error("Error pushing metrics:", error);
    });
}

module.exports = { requestTracker, greetingChanged };
