import 'dotenv/config';
import * as BitGoJS from 'bitgo';
import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';

const {
  BITGO_ACCESS_TOKEN,
  BITGO_WALLET_ID,
  BITGO_WALLET_PASSPHRASE,
  RIVER_PROXY_ADDRESS,
  BLOCK_EXPLORER,
  ALLUVIAL_API_URL,
  ALLUVIAL_API_TOKEN,
} = process.env;

const bitgo = new BitGoJS.BitGo({ env: 'test', accessToken: BITGO_ACCESS_TOKEN });

// ---------------------------------------------------------------------------
// DB directory
// ---------------------------------------------------------------------------
const DB_DIR = path.resolve(__dirname, '../../db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Stake JSON store
// ---------------------------------------------------------------------------
const STAKE_STORE_PATH = path.join(DB_DIR, 'stake-txids.json');

interface StakeTx {
  txid: string;
  amountEth: string;
  addedAt: string;
  confirmed: boolean;
  lsEthMinted?: string;
  alluvialResponse?: any;
}

const loadStakeStore = (): StakeTx[] => {
  if (!fs.existsSync(STAKE_STORE_PATH)) return [];
  return JSON.parse(fs.readFileSync(STAKE_STORE_PATH, 'utf-8'));
};

const saveStakeStore = (txs: StakeTx[]) => {
  fs.writeFileSync(STAKE_STORE_PATH, JSON.stringify(txs, null, 2));
};

export const addStakeTx = (txid: string, amountEth: string) => {
  const store = loadStakeStore();
  const already = store.find((t) => t.txid === txid);
  if (already) {
    console.log(`ℹ️  Stake tx ${txid} already in store`);
    return;
  }
  store.push({ txid, amountEth, addedAt: new Date().toISOString(), confirmed: false });
  saveStakeStore(store);
  console.log(`💾 Saved stake txid ${txid} to store`);
};

// ---------------------------------------------------------------------------
// Redeem JSON store
// ---------------------------------------------------------------------------
const REDEEM_STORE_PATH = path.join(DB_DIR, 'redeem-requests.json');

interface RedeemRequest {
  redeemRequestId: number;
  lsEthAmount: string;
  addedAt: string;
  claimed: boolean;
}

const loadRedeemStore = (): RedeemRequest[] => {
  if (!fs.existsSync(REDEEM_STORE_PATH)) return [];
  return JSON.parse(fs.readFileSync(REDEEM_STORE_PATH, 'utf-8'));
};

const saveRedeemStore = (requests: RedeemRequest[]) => {
  fs.writeFileSync(REDEEM_STORE_PATH, JSON.stringify(requests, null, 2));
};

export const addRedeemRequest = (redeemRequestId: number, lsEthAmount: string) => {
  const store = loadRedeemStore();
  const already = store.find((r) => r.redeemRequestId === redeemRequestId);
  if (already) {
    console.log(`ℹ️  Redeem request ${redeemRequestId} already in store`);
    return;
  }
  store.push({ redeemRequestId, lsEthAmount, addedAt: new Date().toISOString(), claimed: false });
  saveRedeemStore(store);
  console.log(`💾 Saved redeemRequestId ${redeemRequestId} to store`);
};

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
        Authorization: `Bearer ${ALLUVIAL_API_TOKEN}`,
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
  status_claim: 'NOT_CLAIMED' | 'CLAIMED';
  status_satisfaction: 'PENDING_SATISFACTION' | 'SATISFIED';
  requested_at: number;
}

const getRedeemStatus = async (redeemRequestId: number): Promise<AlluvialRedeemResponse> => {
  const res = await fetch(`${ALLUVIAL_API_URL}/eth/v0/redeems/${redeemRequestId}`, {
    headers: {
      Authorization: `Bearer ${ALLUVIAL_API_TOKEN}`,
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
  const stakeTxs = loadStakeStore();
  const pendingStakes = stakeTxs.filter((t) => !t.confirmed);

  if (pendingStakes.length > 0) {
    console.log(`\n[${timestamp}] Checking ${pendingStakes.length} pending stake tx(s)...`);

    for (const stake of pendingStakes) {
      const confirmed = await checkStakeTxConfirmed(stake.txid);

      if (!confirmed) {
        console.log(`  ⏳ Stake tx not confirmed yet: ${stake.txid}`);
        continue;
      }

      // tx confirmed — fetch Alluvial tx record for lsETH mint amount
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

      // only mark confirmed once Alluvial has indexed it
      const updated = stakeTxs.map((t) =>
        t.txid === stake.txid
          ? { ...t, confirmed: true, lsEthMinted, alluvialResponse }
          : t
      );
      saveStakeStore(updated);
      console.log(`💾 Stored full Alluvial response for tx ${stake.txid}`);
    }
  }

  // --- Redeem poll ---
  const redeemStore = loadRedeemStore();
  const pendingRedeems = redeemStore.filter((r) => !r.claimed);

  if (pendingRedeems.length === 0 && pendingStakes.length === 0) {
    console.log(`[${timestamp}] No pending stake or redeem requests`);
    return;
  }

  if (pendingRedeems.length > 0) {
    console.log(`\n[${timestamp}] Checking ${pendingRedeems.length} pending redeem request(s)...`);

    const readyIds: number[] = [];
    const readyEventIds: number[] = [];

    for (const request of pendingRedeems) {
      try {
        const status = await getRedeemStatus(request.redeemRequestId);

        console.log(`  Request ${request.redeemRequestId}:`);
        console.log(`    satisfaction:        ${status.status_satisfaction}`);
        console.log(`    claim:               ${status.status_claim}`);
        console.log(`    withdrawal_event_id: ${status.withdrawal_event_id}`);

        if (
          status.status_satisfaction === 'SATISFIED' &&
          status.status_claim === 'NOT_CLAIMED' &&
          status.withdrawal_event_id >= 0
        ) {
          console.log(`  ✅ Request ${request.redeemRequestId} ready to claim!`);
          readyIds.push(request.redeemRequestId);
          readyEventIds.push(status.withdrawal_event_id);
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
        const updated = redeemStore.map((r) =>
          readyIds.includes(r.redeemRequestId) ? { ...r, claimed: true } : r
        );
        saveRedeemStore(updated);
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
