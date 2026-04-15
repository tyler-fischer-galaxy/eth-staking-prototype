import { Router } from 'express';
import { handleStake } from './stake.call';
import { loadStakeStore, saveStakeStore } from '../../store/stake.store';

export const stakeRouter = Router();

/**
 * POST /stake
 * Body: { amountEth?: string }  — defaults to '0.02' if not provided
 */
stakeRouter.post('/', async (req, res) => {
  try {
    const amountEth: string = req.body?.amountEth ?? '0.02';
    const result = await handleStake(amountEth);

    // persist to db
    const store = loadStakeStore();
store[result.txid] = {
  txid: result.txid,
  amountEth: result.amountStakedEth,
  addedAt: new Date().toISOString(),
  confirmed: false,
  walletAddress: result.walletAddress,
  explorerUrl: result.explorerUrl,
  balanceBeforeEth: result.balanceBeforeEth,
  balanceAfterEth: result.balanceAfterEth,
  events: {
    '1-stake_initiated': {
      ...result,
      recordedAt: new Date().toISOString(),
    },
  },
};
    saveStakeStore(store);

    res.status(200).json(result);
  } catch (err: any) {
    console.error('Error handling stake request:', err?.message);
    res.status(500).json({ error: err?.message ?? 'Stake failed' });
  }
});
