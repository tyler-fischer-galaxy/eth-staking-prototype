process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import 'dotenv/config';
import * as BitGoJS from 'bitgo';
import { ethers } from 'ethers';
import { loadStakeStore, saveStakeStore } from '../store/stake.store';
import { loadRedeemStore, saveRedeemStore } from '../store/redeem.store';

const {
  BITGO_ACCESS_TOKEN,
  BITGO_WALLET_ID,
  BITGO_WALLET_PASSPHRASE,
  RIVER_PROXY_ADDRESS,
  BLOCK_EXPLORER,
  ALLUVIAL_API_URL,
  ALLUVIAL_OAUTH,
} = process.env;

const bitgo = new BitGoJS.BitGo({ env: 'test', accessToken: BITGO_ACCESS_TOKEN });

// ---------------------------------------------------------------------------
// Alluvial API — stake tx lookup
// ---------------------------------------------------------------------------
const getStakeTxFromAlluvial = async (
  walletAddress: string,
  txid: string
): Promise<{ lsEthMinted: string | undefined; alluvialResponse: any }> => {
  const res = await fetch(
    `${ALLUVIAL_API_URL}/eth/v0/wallet/${walletAddress}/transactions`,
    {
      headers: {
        Authorization: `Bearer ${ALLUVIAL_OAUTH}`,
        Accept: 'application/json',
      },
    }
  );
  if (!res.ok) return { lsEthMinted: undefined, alluvialResponse: null };

  const fullResponse = await res.json();
  const matchedTx = fullResponse?.data?.find(
    (t: any) =>
      t.transaction_hash?.toLowerCase() === txid.toLowerCase() &&
      t.transaction_type === 'Deposit'
  );

  return {
    lsEthMinted: matchedTx?.amount_lseth?.toString(),
    alluvialResponse: {
      matchedTx: matchedTx ?? null,
      fullResponse,
      fetchedAt: new Date().toISOString(),
    },
  };
};

// ---------------------------------------------------------------------------
// Alluvial API — redeem status
// ---------------------------------------------------------------------------
interface AlluvialRedeemResponse {
  id: number;
  withdrawal_event_id: number;
  total_amount_lseth: string;
  claimable_amount_lseth: string;
  claimed_amount_eth: string;
  max_redeemable_amount_eth: string;
  status_claim: 'NOT_CLAIMED' | 'PARTIALLY_CLAIMED' | 'FULLY_CLAIMED';
  status_satisfaction: 'PENDING_SATISFACTION' | 'PARTIALLY_SATISFIED' | 'FULLY_SATISFIED' | 'SATISFIED';
  requested_at: number;
}

const getRedeemStatus = async (redeemRequestId: number): Promise<AlluvialRedeemResponse> => {
  const res = await fetch(`${ALLUVIAL_API_URL}/eth/v0/redeems/${redeemRequestId}`, {
    headers: {
      Authorization: `Bearer ${ALLUVIAL_OAUTH}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Alluvial API error: ${res.status} ${res.statusText}`);
  return res.json();
};

// ---------------------------------------------------------------------------
// BitGo — check stake tx confirmation
// ---------------------------------------------------------------------------
const checkStakeTxConfirmed = async (txid: string): Promise<boolean> => {
  try {
    const wallet = await bitgo.coin('hteth').wallets().get({ id: BITGO_WALLET_ID });
    const transfers = await wallet.transfers({ txHash: txid });
    const transfer = transfers?.transfers?.[0];
    return transfer?.state === 'confirmed';
  } catch (err: any) {
    console.error(`  ❌ Failed to check stake tx ${txid}:`, err?.message);
    return false;
  }
};

// ---------------------------------------------------------------------------
// Claim via BitGo
// ---------------------------------------------------------------------------
const riverABI = [
  'function claimRedeemRequests(uint32[] _redeemRequestIds, uint32[] _withdrawalEventIds) external returns (uint8[] claimStatuses)',
];
const claimIface = new ethers.Interface(riverABI);

const claimRequests = async (redeemRequestIds: number[], withdrawalEventIds: number[]) => {
  const wallet = await bitgo.coin('hteth').wallets().get({ id: BITGO_WALLET_ID });

  const data = claimIface.encodeFunctionData('claimRedeemRequests', [
    redeemRequestIds,
    withdrawalEventIds,
  ]);

  const tx = await wallet.send({
    address: RIVER_PROXY_ADDRESS,
    amount: '0',
    data,
    walletPassphrase: BITGO_WALLET_PASSPHRASE,
    type: 'transfer',
  });

  console.log(`✅ Claimed redeemRequestIds: ${redeemRequestIds}`);
  console.log(`   Tx: ${BLOCK_EXPLORER}/tx/${tx.txid}`);
};

// ---------------------------------------------------------------------------
// Poll tick
// ---------------------------------------------------------------------------
const poll = async () => {
  const timestamp = new Date().toISOString();

  // --- Stake poll ---
  const stakeStore = loadStakeStore();
  const pendingStakes = Object.values(stakeStore).filter((t) => !t.confirmed);

  if (pendingStakes.length > 0) {
    console.log(`\n[${timestamp}] Checking ${pendingStakes.length} pending stake tx(s)...`);

    for (const stake of pendingStakes) {
      const confirmed = await checkStakeTxConfirmed(stake.txid);

      if (!confirmed) {
        console.log(`  ⏳ Stake tx not confirmed yet: ${stake.txid}`);
        continue;
      }

      const wallet = await bitgo.coin('hteth').wallets().get({ id: BITGO_WALLET_ID });
      const walletAddress = wallet.receiveAddress() ?? '';
      const { lsEthMinted, alluvialResponse } = await getStakeTxFromAlluvial(walletAddress, stake.txid);

      console.log(`\n✅ Stake confirmed: ${BLOCK_EXPLORER}/tx/${stake.txid}`);
      console.log(`   ETH staked:   ${stake.amountEth} ETH`);
      console.log(`   lsETH minted: ${lsEthMinted ?? 'pending alluvial indexing'} lsETH`);

      if (alluvialResponse?.matchedTx) {
        console.log(`   conversion rate: ${alluvialResponse.matchedTx.conversion_rate}`);
      }

      if (!lsEthMinted) {
        console.log(`   ℹ️  Alluvial hasn't indexed this tx yet — will retry next tick`);
        continue;
      }

      saveStakeStore({
        ...stakeStore,
        [stake.txid]: {
          ...stake,
          confirmed: true,
          events: {
            ...stake.events,
            '2-alluvial_deposit_confirmed': {
              ...alluvialResponse.matchedTx,
              recordedAt: new Date().toISOString(),
            },
          },
        },
      });
      console.log(`💾 Stored full Alluvial response for tx ${stake.txid}`);
    }
  }

  // --- Redeem tx confirmation poll (get redeemRequestId from Alluvial) ---
  const redeemStore = loadRedeemStore();
  const unconfirmedRedeems = Object.values(redeemStore).filter(
    (r) => r.redeemRequestId === null && !r.claimed
  );

  if (unconfirmedRedeems.length > 0) {
    console.log(`\n[${timestamp}] Checking ${unconfirmedRedeems.length} unconfirmed redeem tx(s)...`);

    const wallet = await bitgo.coin('hteth').wallets().get({ id: BITGO_WALLET_ID });
    const walletAddress = wallet.receiveAddress() ?? '';

    const alluvialRedeemsRes = await fetch(
      `${ALLUVIAL_API_URL}/eth/v0/redeems?owner=${walletAddress}`,
      {
        headers: {
          Authorization: `Bearer ${ALLUVIAL_OAUTH}`,
          Accept: 'application/json',
        },
      }
    );

    const alluvialRedeems: any[] = alluvialRedeemsRes.ok
      ? await alluvialRedeemsRes.json()
      : [];

    console.log(`  📋 Alluvial has ${alluvialRedeems.length} redeem request(s) for wallet`);

    const trackedIds = new Set(
      Object.values(redeemStore)
        .map((r) => r.redeemRequestId)
        .filter((id) => id !== null)
    );

    const untrackedAlluvialRedeems = alluvialRedeems.filter(
      (r) => !trackedIds.has(r.id)
    );

    for (const redeem of unconfirmedRedeems) {
      try {
        const transfers = await wallet.transfers({ txHash: redeem.txid });
        const transfer = transfers?.transfers?.[0];

        if (transfer?.state !== 'confirmed') {
          console.log(`  ⏳ Redeem tx not confirmed yet: ${redeem.txid}`);
          continue;
        }

        console.log(`  ✅ Redeem tx confirmed: ${redeem.txid}`);

        const matched = untrackedAlluvialRedeems.find(
          (r) => ethers.parseEther(redeem.lsEthAmount).toString() === r.total_amount_lseth
        );

        if (!matched) {
          console.log(`  ℹ️  No matching Alluvial redeem found for ${redeem.txid} — will retry next tick`);
          continue;
        }

        const redeemRequestId = matched.id;
        console.log(`  🎯 Matched redeemRequestId: ${redeemRequestId}`);

        trackedIds.add(redeemRequestId);

        const updatedStore = loadRedeemStore();
        updatedStore[redeem.txid] = {
          ...redeem,
          redeemRequestId,
          events: {
            ...redeem.events,
            '2-redeem_confirmed': {
              redeemRequestId,
              alluvialRedeem: matched,
              recordedAt: new Date().toISOString(),
            },
          },
        };
        saveRedeemStore(updatedStore);
        console.log(`💾 Saved redeemRequestId ${redeemRequestId} for tx ${redeem.txid}`);

      } catch (err: any) {
        console.error(`  ❌ Failed to check redeem tx ${redeem.txid}:`, err?.message);
      }
    }
  }

  // --- Redeem satisfaction poll ---
  const freshRedeemStore = loadRedeemStore();
  const pendingRedeems = Object.values(freshRedeemStore).filter(
    (r) => !r.claimed && r.redeemRequestId !== null
  );

  if (pendingRedeems.length === 0 && pendingStakes.length === 0 && unconfirmedRedeems.length === 0) {
    console.log(`[${timestamp}] No pending stake or redeem requests`);
    return;
  }

  if (pendingRedeems.length > 0) {
    console.log(`\n[${timestamp}] Checking ${pendingRedeems.length} pending redeem request(s)...`);

    const readyIds: number[] = [];
    const readyEventIds: number[] = [];
    const readyTxids: string[] = [];

    for (const request of pendingRedeems) {
      try {
        const status = await getRedeemStatus(request.redeemRequestId!);

        console.log(`  Request ${request.redeemRequestId}:`);
        console.log(`    satisfaction:        ${status.status_satisfaction}`);
        console.log(`    claim:               ${status.status_claim}`);
        console.log(`    withdrawal_event_id: ${status.withdrawal_event_id}`);

        if (
          (status.status_satisfaction === 'SATISFIED' ||
            status.status_satisfaction === 'FULLY_SATISFIED' ||
            status.status_satisfaction === 'PARTIALLY_SATISFIED') &&
          status.status_claim === 'NOT_CLAIMED' &&
          status.withdrawal_event_id >= 0
        ) {
          console.log(`  ✅ Request ${request.redeemRequestId} ready to claim!`);
          readyIds.push(request.redeemRequestId!);
          readyEventIds.push(status.withdrawal_event_id);
          readyTxids.push(request.txid);
        } else {
          console.log(`  ⏳ Request ${request.redeemRequestId} not ready yet`);
        }
      } catch (err: any) {
        console.error(`  ❌ Failed to check request ${request.redeemRequestId}:`, err?.message);
      }
    }

    if (readyIds.length > 0) {
      try {
        await claimRequests(readyIds, readyEventIds);
        const updatedRedeems = loadRedeemStore();
        for (const txid of readyTxids) {
          updatedRedeems[txid] = {
            ...updatedRedeems[txid],
            claimed: true,
            events: {
              ...updatedRedeems[txid].events,
              '3-redeem_claimed': {
                recordedAt: new Date().toISOString(),
              },
            },
          };
        }
        saveRedeemStore(updatedRedeems);
        console.log(`💾 Marked ${readyIds.length} request(s) as claimed in store`);
      } catch (err: any) {
        console.error('❌ Failed to claim:', err?.message);
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const INTERVAL_MS = 20_000;

console.log(`🕐 Cron starting — polling every ${INTERVAL_MS / 1000}s`);
poll();
setInterval(poll, INTERVAL_MS);
