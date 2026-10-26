import process from 'process';
import { diag, DiagConsoleLogger, DiagLogLevel, trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

// Enable diagnostic logging for development when OTEL_DEBUG env is set.
if (process.env.OTEL_DEBUG) {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

// Guard so tracing can be enabled optionally.
const enabled = process.env.OTEL_ENABLED === '1' || process.env.OTEL_ENABLED === 'true';

let sdk;
let tracer;

if (enabled) {
  const exporterEndpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'river-review',
  });
  const exporter = new OTLPTraceExporter({ url: exporterEndpoint });

  sdk = new NodeSDK({
    resource,
    traceExporter: exporter,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  // Start the SDK
  sdk.start();
  tracer = trace.getTracer('river-review');

  // Graceful shutdown
  const shutdown = async () => {
    try {
      await sdk.shutdown();
      // eslint-disable-next-line no-console
      console.log('Tracing shutdown completed.');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error during tracing shutdown:', e);
    }
  };
  process.once('beforeExit', shutdown);
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} else {
  tracer = trace.getTracer('river-review-disabled');
}

export { tracer, enabled };
