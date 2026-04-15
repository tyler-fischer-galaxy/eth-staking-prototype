import { Router } from 'express';
import { registerWebhook } from './shared/register-webhook.util';

const { WEBHOOK_LISTENER_URL } = process.env;

const WEBHOOK_URL = `${WEBHOOK_LISTENER_URL}/webhook/pending-approval`;

export const registerPendingApprovalWebhook = () =>
  registerWebhook({
    type: 'pendingapproval',
    url: WEBHOOK_URL,
    label: 'staking-pending-approval',
  });

const handlePendingApprovalEvent = async (payload: any) => {
  const { pendingApproval } = payload;

  console.log('\n⏳ Pending approval webhook received');
  console.log('Approval ID:', pendingApproval?.id);
  console.log('Type:', pendingApproval?.type);
  console.log('Creator:', pendingApproval?.creator);
  console.log('State:', pendingApproval?.state);
  // TODO: auto-approve or alert ops depending on your flow
};

export const pendingApprovalWebhookRouter = Router();

pendingApprovalWebhookRouter.post('/', async (req, res) => {
  try {
    res.sendStatus(200);
    await handlePendingApprovalEvent(req.body);
  } catch (err: any) {
    console.error('Error handling pending approval webhook:', err?.message);
  }
});
