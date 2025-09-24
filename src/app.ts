import { metrics, ValueType } from '@opentelemetry/api';
import express, { type Express } from 'express';
import { rollTheDice } from './dice';
import { logs } from '@opentelemetry/api-logs';

const meter = metrics.getMeter('dice-server', '1.0');
const logger = logs.getLogger('dice-server', '1.0');

const PORT: number = parseInt(process.env.PORT || '8080');
const app: Express = express();

app.get('/rolldice', (req, res) => {
  const histogram = meter.createHistogram('diceServer.request.duration', {
    description: 'Duration of dice roll requests',
    unit: 'ms',
    valueType: ValueType.INT,
  });
  const startTime = new Date().getTime();
  const rolls = req.query.rolls ? parseInt(req.query.rolls.toString()) : NaN;

  if (isNaN(rolls)) {
    res
      .status(400)
      .send("Request parameter 'rolls' is missing or not a number.");
    return;
  }
  const endTime = new Date().getTime();
  const executionTime = endTime - startTime;

  histogram.record(executionTime);

  res.send(JSON.stringify(rollTheDice(rolls, 1, 6)));
});

app.listen(PORT, () => {
  logger.emit({
    severityNumber: 0,
    severityText: 'info server_start',
    body: `Listening for requests on http://localhost:${PORT}`
  });
});
