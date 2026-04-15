import 'dotenv/config';
import express from 'express';
import { pendingApprovalWebhookRouter, registerPendingApprovalWebhook } from './webhooks/pending-approval.webhook';
import { transferWebhookRouter, registerTransferWebhook } from './webhooks/transfer.webhook';
import { stakeRouter } from './routes/stake/stake.router';
import { unstakeRouter } from './routes/unstake/unstake.router';

const { WEBHOOK_LISTENER_URL, WEBHOOK_LISTENER_PORT = '3001' } = process.env;

const app = express();
app.use(express.json());

app.use('/stake', stakeRouter);
app.use('/unstake', unstakeRouter);
// app.use('/webhook/transfer', transferWebhookRouter);
// app.use('/webhook/pending-approval', pendingApprovalWebhookRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const start = async () => {
  const port = parseInt(WEBHOOK_LISTENER_PORT, 10);

  app.listen(port, async () => {
    console.log(`Webhook listener running on port ${port}`);
    console.log(`Health:               http://localhost:${port}/health`);
    console.log(`Transfer endpoint:    ${WEBHOOK_LISTENER_URL}/webhook/transfer`);
    console.log(`Approval endpoint:    ${WEBHOOK_LISTENER_URL}/webhook/pending-approval`);

    // await registerTransferWebhook();
    // await registerPendingApprovalWebhook();

    console.log('\nListening for staking events...\n');
  });
};

start().catch(console.error);
