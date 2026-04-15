import { Router } from 'express';
import { handleStake } from './stake.call';

export const stakeRouter = Router();

/**
 * POST /stake
 * Body: { amountEth?: string }  — defaults to '0.02' if not provided
 */
stakeRouter.post('/', async (req, res) => {
  try {
    const amountEth: string = req.body?.amountEth ?? '0.02';
    const result = await handleStake(amountEth);
    res.status(200).json(result);
  } catch (err: any) {
    console.error('Error handling stake request:', err?.message);
    res.status(500).json({ error: err?.message ?? 'Stake failed' });
  }
});
