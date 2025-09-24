import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { metrics, type ObservableResult } from '@opentelemetry/api';
import os from 'os';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import dotenv from 'dotenv';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';

dotenv.config();

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'roll-a-die',
    [ATTR_SERVICE_VERSION]: '1.0.0',
  }),
  traceExporter: new OTLPTraceExporter({
    //url: 'http://localhost:4318/v1/traces',
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT + '/v1/traces',
    headers: {
      Authorization: process.env.OTEL_EXPORTER_OTLP_TOKEN!
    }
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      //url: 'http://localhost:4318/v1/metrics',
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT + '/v1/metrics',
      headers: {
        Authorization: process.env.OTEL_EXPORTER_OTLP_TOKEN!
      }
    }),
    exportIntervalMillis: 100,
  }),
  logRecordProcessors: [
    new SimpleLogRecordProcessor(
      new OTLPLogExporter({
        //url: 'http://localhost:4318/v1/logs',
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT + '/v1/logs',
        headers: {
          Authorization: process.env.OTEL_EXPORTER_OTLP_TOKEN!
        }
      })
    ),
  ],
  instrumentations: [
    getNodeAutoInstrumentations(),
    new RuntimeNodeInstrumentation({ enabled: true })
  ],
});

sdk.start();

const meter = metrics.getMeter('infra', '1.0.0');
let lastCpuUsage = process.cpuUsage();
let lastHr = process.hrtime();

// CPU metrics
const cpuUtilGauge = meter.createObservableGauge('process.cpu.utilization', { description: 'Process CPU fraction (0-1)' });
cpuUtilGauge.addCallback((obs: ObservableResult) => {
  const cur = process.cpuUsage();
  const hr = process.hrtime();
  const userDelta = cur.user - lastCpuUsage.user;
  const sysDelta = cur.system - lastCpuUsage.system;
  const elapsedMicros = (hr[0] - lastHr[0]) * 1e6 + (hr[1] - lastHr[1]) / 1e3;
  const cores = os.cpus().length || 1;
  const util = elapsedMicros > 0 ? (userDelta + sysDelta) / (elapsedMicros * cores) : 0;
  obs.observe(util);
  lastCpuUsage = cur;
  lastHr = hr;
});

const loadGauge = meter.createObservableGauge('system.load.1m', { description: 'System 1m load average' });
loadGauge.addCallback((obs: ObservableResult) => {
  const loads = os.loadavg();
  const v: number = Array.isArray(loads) && typeof loads[0] === 'number' ? loads[0] : 0;
  obs.observe(v);
});

const cpuCountGauge = meter.createObservableGauge('system.cpu.count', { description: 'Logical CPU count' });
cpuCountGauge.addCallback((obs: ObservableResult) => { obs.observe(os.cpus().length); });

const userCpuTimeGauge = meter.createObservableGauge('process.cpu.time.user', { description: 'Cumulative user CPU time (s)' });
userCpuTimeGauge.addCallback((obs: ObservableResult) => { obs.observe(process.cpuUsage().user / 1e6); });

const sysCpuTimeGauge = meter.createObservableGauge('process.cpu.time.system', { description: 'Cumulative system CPU time (s)' });
sysCpuTimeGauge.addCallback((obs: ObservableResult) => { obs.observe(process.cpuUsage().system / 1e6); });

// memory metrics
const memRssGauge = meter.createObservableGauge('process.memory.rss.bytes', { description: 'Resident Set Size in bytes' });
memRssGauge.addCallback((obs: ObservableResult) => {
  const m = process.memoryUsage();
  obs.observe(m.rss);
});

const memHeapUsedGauge = meter.createObservableGauge('process.memory.heap.used.bytes', { description: 'V8 heap used bytes' });
memHeapUsedGauge.addCallback((obs: ObservableResult) => {
  const m = process.memoryUsage();
  obs.observe(m.heapUsed);
});

const memHeapUtilGauge = meter.createObservableGauge('process.memory.heap.utilization', { description: 'Heap used / heap total fraction (0-1)' });
memHeapUtilGauge.addCallback((obs: ObservableResult) => {
  const m = process.memoryUsage();
  const frac = m.heapTotal > 0 ? m.heapUsed / m.heapTotal : 0;
  obs.observe(frac);
});

const memExternalGauge = meter.createObservableGauge('process.memory.external.bytes', { description: 'External memory used (C++ bindings etc.)' });
memExternalGauge.addCallback((obs: ObservableResult) => {
  const m = process.memoryUsage();
  obs.observe(m.external);
});

const memArrayBuffersGauge = meter.createObservableGauge('process.memory.array_buffers.bytes', { description: 'Memory used by ArrayBuffers' });
memArrayBuffersGauge.addCallback((obs: ObservableResult) => {
  const m = process.memoryUsage();
  if (typeof m.arrayBuffers === 'number') {
    obs.observe(m.arrayBuffers);
  }
});

// System RAM metrics
const sysMemTotalGauge = meter.createObservableGauge('system.memory.total.bytes', { description: 'Total system memory in bytes' });
sysMemTotalGauge.addCallback((obs: ObservableResult) => { obs.observe(os.totalmem()); });

const sysMemFreeGauge = meter.createObservableGauge('system.memory.free.bytes', { description: 'Free system memory in bytes' });
sysMemFreeGauge.addCallback((obs: ObservableResult) => { obs.observe(os.freemem()); });

const sysMemUsedGauge = meter.createObservableGauge('system.memory.used.bytes', { description: 'Used system memory in bytes (total - free)' });
sysMemUsedGauge.addCallback((obs: ObservableResult) => { obs.observe(os.totalmem() - os.freemem()); });

const sysMemUtilGauge = meter.createObservableGauge('system.memory.utilization', { description: 'Used system memory fraction (0-1)' });
sysMemUtilGauge.addCallback((obs: ObservableResult) => {
  const total = os.totalmem();
  const free = os.freemem();
  const usedFrac = total > 0 ? (total - free) / total : 0;
  obs.observe(usedFrac);
});
