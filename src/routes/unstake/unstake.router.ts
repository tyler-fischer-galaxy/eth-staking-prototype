import { Router } from 'express';
import { handleRequestRedeem } from './request-redeem.call';
import { handleResolveRedeemRequests } from './resolve-redeem-requests.call';
import { handleClaimRedemptionRequests } from './claim-redemption-requests.call';

export const unstakeRouter = Router();

/**
 * POST /unstake/request-redeem
 * Body: { lsEthAmount?: string }  — defaults to '0.02' if not provided
 */
unstakeRouter.post('/request-redeem', async (req, res) => {
  try {
    const lsEthAmount: string = req.body?.lsEthAmount ?? '0.02';
    const result = await handleRequestRedeem(lsEthAmount);
    res.status(200).json(result);
  } catch (err: any) {
    console.error('Error handling requestRedeem:', err?.message);
    res.status(500).json({ error: err?.message ?? 'requestRedeem failed' });
  }
});

/**
 * POST /unstake/resolve-redeem-requests
 * Body: { redeemRequestIds: number[] }
 */
unstakeRouter.post('/resolve-redeem-requests', async (req, res) => {
  try {
    const { redeemRequestIds } = req.body;
    if (!redeemRequestIds?.length) {
      res.status(400).json({ error: 'redeemRequestIds is required' });
      return;
    }
    const result = await handleResolveRedeemRequests(redeemRequestIds);
    res.status(200).json(result);
  } catch (err: any) {
    console.error('Error handling resolveRedeemRequests:', err?.message);
    res.status(500).json({ error: err?.message ?? 'resolveRedeemRequests failed' });
  }
});

/**
 * POST /unstake/claim-redemption-requests
 * Body: { redeemRequestIds: number[], withdrawalEventIds: number[] }
 */
unstakeRouter.post('/claim-redemption-requests', async (req, res) => {
  try {
    const { redeemRequestIds, withdrawalEventIds } = req.body;
    if (!redeemRequestIds?.length || !withdrawalEventIds?.length) {
      res.status(400).json({ error: 'redeemRequestIds and withdrawalEventIds are required' });
      return;
    }
    const result = await handleClaimRedemptionRequests(redeemRequestIds, withdrawalEventIds);
    res.status(200).json(result);
  } catch (err: any) {
    console.error('Error handling claimRedemptionRequests:', err?.message);
    res.status(500).json({ error: err?.message ?? 'claimRedemptionRequests failed' });
  }
});
