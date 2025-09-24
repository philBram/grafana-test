import { metrics, SpanStatusCode, trace, type Span } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';

const tracer = trace.getTracer('dice-lib', '1.0');
const meter = metrics.getMeter('dice-server', '1.0');
const logger = logs.getLogger('dice-server', '1.0');

const counter = meter.createCounter('diceLib.rolls.counter');

function rollOnce(i: number, min: number, max: number) {
  return tracer.startActiveSpan(`rollDice: ${i}`, (span: Span) => {
    const result =  Math.floor(Math.random() * (max - min + 1) + min);
    span.setAttribute('dicelib.rolled', result.toString());
    span.end();

    return result;
  })
}

export function rollTheDice(rolls: number, min: number, max: number) {
  return tracer.startActiveSpan(
    'rollTheDice',
    {attributes: {'dicelib.rolls': rolls.toString()}}, 
    (span: Span) => {
      const result: number[] = [];

      for (let i = 0; i < rolls; i++) {
        result.push(rollOnce(i, min, max));

        counter.add(1);
      }

      logger.emit({
        severityNumber: 0,
        severityText: 'info counter_increment',
        body: `Incremented counter for dice rolls by: ${rolls}`,
      });

      span.addEvent('hello I am a span event', {
        'log.severity': 'info',
      });
      span.setStatus({
        code: SpanStatusCode.OK,
        message: 'dice rolled successfully',
      })
      span.end();

      return result;
  });
}