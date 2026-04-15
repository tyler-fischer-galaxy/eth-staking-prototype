import { Router } from 'express';
import { ethers } from 'ethers';
import { registerWebhook } from './shared/register-webhook.util';

const { BLOCK_EXPLORER, WEBHOOK_LISTENER_URL } = process.env;

const riverABI = [
  'function deposit() payable',
  'event Deposit(address indexed depositor, uint256 amount)',
];
const iface = new ethers.Interface(riverABI);

const WEBHOOK_URL = `${WEBHOOK_LISTENER_URL}/webhook/transfer`;

export const registerTransferWebhook = () =>
  registerWebhook({
    type: 'transfer',
    url: WEBHOOK_URL,
    label: 'staking-transfer-confirmed',
    numConfirmations: 1,
  });

const parseDepositEvent = (logs: any[]): { depositor: string; amount: string } | null => {
  const depositTopic = ethers.id('Deposit(address,uint256)');

  for (const log of logs ?? []) {
    if (log.topics?.[0] === depositTopic) {
      try {
        const decoded = iface.parseLog(log);
        if (decoded) {
          return {
            depositor: decoded.args.depositor,
            amount: ethers.formatEther(decoded.args.amount),
          };
        }
      } catch {
        // Not a River event — skip
      }
    }
  }

  return null;
};

const enrichTransfer = async (walletId: string, transferId: string) => {
  try {
    const { default: BitGoJS } = await import('bitgo');
    const bitgo = new BitGoJS.BitGo({ env: 'test', accessToken: process.env.BITGO_ACCESS_TOKEN });
    const wallet = await bitgo.coin('hteth').wallets().get({ id: walletId });
    const transfer = await wallet.getTransfer({ id: transferId });
    return transfer;
  } catch (err: any) {
    console.error('Failed to enrich transfer:', err?.message);
    return null;
  }
};


const handleTransferEvent = async (payload: any) => {
  const { type, transfer, wallet } = payload;

  console.log('\n📥 Transfer webhook received');
  console.log('Type:', type);
  console.log('State:', transfer?.state);
  console.log('Tx hash:', transfer?.txid);
  console.log('Direction:', transfer?.direction);
  console.log('Value (wei):', transfer?.value);
  console.log('Value (ETH):', transfer?.value ? ethers.formatEther(transfer.value) : 'n/a');

  if (transfer?.txid) {
    console.log('Explorer:', `${BLOCK_EXPLORER}/tx/${transfer.txid}`);
  }

  const enriched = await enrichTransfer(wallet, transfer?.id);

  if (enriched) {
    console.log('Confirmations:', enriched.confirmations);
    console.log('Block height:', enriched.height);

    const depositEvent = parseDepositEvent(enriched.entries ?? []);
    if (depositEvent) {
      console.log('\n📋 River Deposit event detected:');
      console.log('  Depositor:', depositEvent.depositor);
      console.log('  Amount (ETH):', depositEvent.amount);
    }

    if (transfer?.direction === 'receive' && enriched.confirmations >= 1) {
      console.log('\n✅ Inbound transfer confirmed — likely LsETH mint');
      console.log('  From:', enriched.entries?.[0]?.address);
      console.log('  Amount (wei):', enriched.value);
      // TODO: update staking record, publish Kafka event, notify be-staking
    }

    if (transfer?.direction === 'send' && enriched.confirmations >= 1) {
      console.log('\n✅ Outbound deposit confirmed on-chain');
      // TODO: update CryptoTransfers record status to CONFIRMED
      // TODO: notify be-staking to begin position processing
    }
  }
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const transferWebhookRouter = Router();

transferWebhookRouter.post('/', async (req, res) => {
  try {
    res.sendStatus(200);
    await handleTransferEvent(req.body);
  } catch (err: any) {
    console.error('Error handling transfer webhook:', err?.message);
  }
});
