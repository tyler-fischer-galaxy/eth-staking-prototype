import { Router } from 'express';
import { ethers } from 'ethers';
import { registerWebhook } from './shared/register-webhook.util';

const { BLOCK_EXPLORER, WEBHOOK_LISTENER_URL, RIVER_PROXY_ADDRESS, REDEEM_MANAGER_ADDRESS } = process.env;

const riverABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event RequestedRedeem(address indexed recipient, uint256 height, uint256 amount, uint256 maxRedeemableEth, uint32 id)',
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

// from == address(0) means it's a mint
const parseLsEthMintEvent = (logs: any[]): { recipient: string; amount: string } | null => {
  const transferTopic = ethers.id('Transfer(address,address,uint256)');
  const ZERO_ADDRESS = ethers.ZeroAddress;

  for (const log of logs ?? []) {
    if (
      log.topics?.[0] === transferTopic &&
      log.address?.toLowerCase() === RIVER_PROXY_ADDRESS?.toLowerCase()
    ) {
      try {
        const decoded = iface.parseLog(log);
        if (decoded && decoded.args.from === ZERO_ADDRESS) {
          return {
            recipient: decoded.args.to,
            amount: ethers.formatEther(decoded.args.value),
          };
        }
      } catch {
        // Not a Transfer event — skip
      }
    }
  }
  return null;
};

const parseRequestedRedeemEvent = (
  logs: any[]
): { recipient: string; amount: string; maxRedeemableEth: string; redeemRequestId: number } | null => {
  const redeemTopic = ethers.id('RequestedRedeem(address,uint256,uint256,uint256,uint32)');

  for (const log of logs ?? []) {
    if (
      log.topics?.[0] === redeemTopic &&
      log.address?.toLowerCase() === REDEEM_MANAGER_ADDRESS?.toLowerCase()
    ) {
      try {
        const decoded = iface.parseLog(log);
        if (decoded) {
          return {
            recipient: decoded.args.recipient,
            amount: ethers.formatEther(decoded.args.amount),
            maxRedeemableEth: ethers.formatEther(decoded.args.maxRedeemableEth),
            redeemRequestId: Number(decoded.args.id),
          };
        }
      } catch {
        // Not a RequestedRedeem event — skip
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

  if (transfer?.txid) {
    console.log('Explorer:', `${BLOCK_EXPLORER}/tx/${transfer.txid}`);
  }

  const enriched = await enrichTransfer(wallet, transfer?.id);
  if (!enriched) return;

  console.log('Confirmations:', enriched.confirmations);
  console.log('Block height:', enriched.height);

  const logs = enriched.entries ?? [];

  // --- Stake: lsETH mint ---
  const mintEvent = parseLsEthMintEvent(logs);
  if (mintEvent) {
    console.log('\n✅ lsETH mint detected:');
    console.log('  Recipient:    ', mintEvent.recipient);
    console.log('  lsETH minted:', mintEvent.amount);
    // TODO: update staking record with minted lsETH amount
    // TODO: publish Kafka event for be-staking
  }

  // --- Unstake: redeem request submitted ---
  const redeemEvent = parseRequestedRedeemEvent(logs);
  if (redeemEvent) {
    console.log('\n✅ Redeem request detected:');
    console.log('  Recipient:         ', redeemEvent.recipient);
    console.log('  LsETH amount:      ', redeemEvent.amount);
    console.log('  Max redeemable ETH:', redeemEvent.maxRedeemableEth);
    console.log('  Redeem Request ID: ', redeemEvent.redeemRequestId);
    // TODO: persist redeemRequestId to DB
    // TODO: trigger scheduled job to poll resolveRedeemRequests
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
