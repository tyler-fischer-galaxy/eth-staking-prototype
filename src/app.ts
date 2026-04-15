import 'dotenv/config';
import express from 'express';
import { pendingApprovalWebhookRouter, registerPendingApprovalWebhook } from './webhooks/pending-approval.webhook';
import { transferWebhookRouter, registerTransferWebhook } from './webhooks/transfer.webhook';
import { stakeRouter } from './routes/stake/stake.router';
import { unstakeRouter } from './routes/unstake/unstake.router';

const { WEBHOOK_LISTENER_URL, WEBHOOK_LISTENER_PORT = '3001' } = process.env;

const app = express();

// bypass localtunnel password screen
app.use((_req, res, next) => {
  res.setHeader('Bypass-Tunnel-Reminder', 'true');
  next();
});

app.use(express.json());

app.use('/stake', stakeRouter);
app.use('/unstake', unstakeRouter);

app.use('/webhook/transfer', transferWebhookRouter);
app.use('/webhook/pending-approval', pendingApprovalWebhookRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const start = async () => {
  const port = parseInt(WEBHOOK_LISTENER_PORT, 10);
  app.listen(port, async () => {
    console.log(`Webhook listener running on port ${port}`);
    console.log(`Health:                         http://localhost:${port}/health`);
    console.log(`Transfer endpoint:              ${WEBHOOK_LISTENER_URL}/webhook/transfer`);
    console.log(`Approval endpoint:              ${WEBHOOK_LISTENER_URL}/webhook/pending-approval`);

    console.log('\n--- Stake Routes ---');
    console.log(`POST deposit:                   http://localhost:${port}/stake/deposit`);

    console.log('\n--- Unstake Routes ---');
    console.log(`POST request-redeem:            http://localhost:${port}/unstake/request-redeem`);
    console.log(`POST resolve-redeem-requests:   http://localhost:${port}/unstake/resolve-redeem-requests`);
    console.log(`POST claim-redemption-requests: http://localhost:${port}/unstake/claim-redemption-requests`);

    await registerTransferWebhook();
    await registerPendingApprovalWebhook();

    console.log('\nListening for staking events...\n');
  });
};

start().catch(console.error);
