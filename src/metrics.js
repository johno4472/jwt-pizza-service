const { send } = require("process");
const config = require("./config");
const os = require("os");

// Metrics stored in memory
const requests = {};
let pizzas_sold = 0;
let pizza_failures = 0;
let total_revenue = 0;
let activeUsers = 0;
let allRequests = 0;
let metrics = [];

function reset() {
  // requests = {};
  // pizzas_sold = 0;
  // pizza_failures = 0;
  // total_revenue = 0;
  allRequests = 0;
  metrics = [];
}

function authEvent(status) {
  if (status == "Success") {
    activeUsers += 1;
    metrics.push(
      createMetric("authentication_actions", 1, "1", "sum", "asInt", {
        type: "success",
      })
    );
  } else {
    metrics.push(
      createMetric("authentication_actions", 1, "1", "sum", "asInt", {
        type: "failure",
      })
    );
  }
}

function logoutEvent() {
  activeUsers -= 1;
}

latencyTracker = (req, res, next) => {
  const dateNow = Date.now();
  let send = res.send;
  res.send = (resBody) => {
    metrics.push(
      createMetric(
        "request_latency",
        Date.now() - dateNow,
        "ms",
        "gauge",
        "asDouble"
      )
    );
    res.send = send;
    return res.send(resBody);
  };
  next();
};

// Middleware to track requests
function requestTracker(req, res, next) {
  const endpoint = `[${req.method}]`;
  requests[endpoint] = (requests[endpoint] || 0) + 1;
  next();
}

function pizzaPurchase(status, latency, price, quantity) {
  if (status == "success") {
    metrics.push(
      createMetric("pizza_purchases", quantity, "1", "sum", "asInt", {
        type: "pizza_success",
      })
    );
    metrics.push(createMetric("total_revenue", price, "1", "sum", "asDouble"));
    metrics.push(
      createMetric("pizza_latency", latency, "ms", "gauge", "asDouble")
    );
  } else {
    pizza_failures += 1;
    metrics.push(
      createMetric("pizza_purchases", pizza_failures, "1", "sum", "asInt", {
        type: "pizza_failure",
      })
    );
  }
}

// This will periodically send metrics to Grafana
setInterval(() => {
  metrics.push(
    createMetric(
      "active_users", // metricName
      activeUsers, // metricValue
      "1", // metricUnit (percentage)
      "gauge", // metricType (gauges represent instantaneous values)
      "asInt"
    )
  );
  metrics.push(
    createMetric(
      "CPU Usage", // metricName
      getCpuUsagePercentage(), // metricValue
      "%", // metricUnit (percentage)
      "gauge", // metricType (gauges represent instantaneous values)
      "asDouble"
    )
  );

  metrics.push(
    createMetric(
      "Memory Usage", // metricName
      getMemoryUsagePercentage(), // metricValue
      "%", // metricUnit (percentage)
      "gauge", // metricType (gauges represent instantaneous values)
      "asDouble"
    )
  );
  allRequests = 0;
  Object.keys(requests).forEach((endpoint) => {
    allRequests += requests[endpoint];
    metrics.push(
      createMetric("requests", requests[endpoint], "1", "sum", "asInt", {
        endpoint,
      })
    );
  });
  metrics.push(
    createMetric("requests", allRequests, "1", "sum", "asInt", {
      endpoint: "all",
    })
  );

  sendMetricToGrafana(metrics);
  reset();
}, 30000);

setInterval(() => {
  if (activeUsers >= 1) {
    activeUsers -= 1;
  }
}, 300000);

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
        throw new Error(`HTTP status: ${response.status}`);
      }
    })
    .catch((error) => {
      console.error("Error pushing metrics:", error);
    });
}

module.exports = {
  requestTracker,
  pizzaPurchase,
  authEvent,
  latencyTracker,
  logoutEvent,
};
