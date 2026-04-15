process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import 'dotenv/config';
import * as BitGoJS from 'bitgo';
import { ethers } from 'ethers';
import { getAlluvialToken } from './shared/alluvial-auth';

const {
  BITGO_ACCESS_TOKEN,
  BITGO_WALLET_ID,
  ALLUVIAL_API_URL,
  BLOCK_EXPLORER,
} = process.env;

const bitgo = new BitGoJS.BitGo({ env: 'test', accessToken: BITGO_ACCESS_TOKEN });

const run = async () => {
  console.log('\n📊 Fetching wallet status...\n');

  const token = await getAlluvialToken();

  // --- BitGo wallet info ---
  const wallet = await bitgo.coin('hteth').wallets().get({ id: BITGO_WALLET_ID });
  const walletAddress = wallet.receiveAddress() ?? '';
  const balanceStr = await wallet.balanceString();
  const confirmedBalanceStr = await wallet.confirmedBalanceString();
  const spendableBalanceStr = await wallet.spendableBalanceString();

  console.log('🔑 Wallet');
  console.log(`   Address:            ${walletAddress}`);
  console.log(`   Explorer:           ${BLOCK_EXPLORER}/address/${walletAddress}`);
  console.log(`   Balance (ETH):      ${ethers.formatEther(balanceStr)}`);
  console.log(`   Confirmed (ETH):    ${ethers.formatEther(confirmedBalanceStr)}`);
  console.log(`   Spendable (ETH):    ${ethers.formatEther(spendableBalanceStr)}`);

  // --- Alluvial lsETH balance ---
  const balanceRes = await fetch(
    `${ALLUVIAL_API_URL}/eth/v0/balances/${walletAddress}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  );

  if (balanceRes.ok) {
    const balanceData = await balanceRes.json();
    console.log('\n🪙 lsETH Balance');
    console.log(`   lsETH held:         ${balanceData.balance ? ethers.formatEther(balanceData.balance) : '0'}`);
    console.log(`   As of block:        ${balanceData.block_number}`);
  } else {
    console.log(`\n🪙 lsETH Balance`);
    console.log(`   ❌ ${balanceRes.status} ${balanceRes.statusText}`);
  }

  // --- Alluvial protocol status ---
  const protocolRes = await fetch(
    `${ALLUVIAL_API_URL}/eth/v0/protocol`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  );

  if (protocolRes.ok) {
    const protocol = await protocolRes.json();
    console.log('\n🌊 Protocol');
    console.log(`   Conversion rate:    ${protocol.conversion_rate}`);
    console.log(`   Total ETH staked:   ${protocol.total_eth_balance ? ethers.formatEther(protocol.total_eth_balance) : 'n/a'}`);
    console.log(`   Total lsETH supply: ${protocol.total_supply ? ethers.formatEther(protocol.total_supply) : 'n/a'}`);
    console.log(`   Active validators:  ${protocol.active_validator_count}`);
    console.log(`   Pending validators: ${protocol.pending_validator_count}`);
    console.log(`   Exiting validators: ${protocol.stopped_validator_count}`);
  } else {
    console.log(`\n🌊 Protocol ❌ ${protocolRes.status} ${protocolRes.statusText}`);
  }

  // --- Alluvial pending redeems ---
  const redeemsRes = await fetch(
    `${ALLUVIAL_API_URL}/eth/v0/redeems?owner=${walletAddress}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  );

  if (redeemsRes.ok) {
    const redeems = await redeemsRes.json();
    const pending = redeems.filter((r: any) => r.status_claim === 'NOT_CLAIMED');
    const claimed = redeems.filter((r: any) => r.status_claim === 'CLAIMED');

    console.log('\n📤 Redeem Requests');
    console.log(`   Total:              ${redeems.length}`);
    console.log(`   Pending:            ${pending.length}`);
    console.log(`   Claimed:            ${claimed.length}`);

    if (pending.length > 0) {
      console.log('\n   Pending requests:');
      for (const r of pending) {
        console.log(`     ID ${r.id}:`);
        console.log(`       lsETH amount:       ${r.total_amount_lseth ? ethers.formatEther(r.total_amount_lseth) : r.total_amount_lseth}`);
        console.log(`       max redeemable ETH: ${r.max_redeemable_amount_eth ? ethers.formatEther(r.max_redeemable_amount_eth) : r.max_redeemable_amount_eth}`);
        console.log(`       satisfaction:       ${r.status_satisfaction}`);
        console.log(`       withdrawal event:   ${r.withdrawal_event_id}`);
      }
    }
  } else {
    console.log(`\n📤 Redeem Requests ❌ ${redeemsRes.status} ${redeemsRes.statusText}`);
  }

  // --- Alluvial recent transactions ---
  const txRes = await fetch(
    `${ALLUVIAL_API_URL}/eth/v0/wallet/${walletAddress}/transactions`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  );

  if (txRes.ok) {
    const txData = await txRes.json();
    const txs = txData?.data ?? [];
    const deposits = txs.filter((t: any) => t.transaction_type === 'Deposit');
    const redeems = txs.filter((t: any) => t.transaction_type === 'Redeem');

    console.log('\n📋 Transaction History');
    console.log(`   Total txs:          ${txs.length}`);
    console.log(`   Deposits:           ${deposits.length}`);
    console.log(`   Redeems:            ${redeems.length}`);

    if (deposits.length > 0) {
      console.log('\n   Recent deposits:');
      for (const d of deposits.slice(0, 5)) {
        console.log(`     ${d.date}`);
        console.log(`       ETH deposited: ${d.amount_eth}`);
        console.log(`       lsETH minted:  ${d.amount_lseth}`);
        console.log(`       conv. rate:    ${d.conversion_rate}`);
        console.log(`       tx:            ${BLOCK_EXPLORER}/tx/${d.transaction_hash}`);
      }
    }
  } else {
    console.log(`\n📋 Transaction History ❌ ${txRes.status} ${txRes.statusText}`);
  }

  // --- Alluvial rewards ---
  const rewardsRes = await fetch(
    `${ALLUVIAL_API_URL}/eth/v0/wallet/${walletAddress}/rewards`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  );

  if (rewardsRes.ok) {
    const rewardsData = await rewardsRes.json();
    const reports = rewardsData?.data?.daily_reports ?? [];
    const totalRewards = rewardsData?.data?.total_rewards_eth;

    console.log('\n🏆 Rewards');
    console.log(`   Total rewards ETH:  ${totalRewards ?? '0'}`);

    if (reports.length > 0) {
      console.log('\n   Recent daily reports:');
      for (const r of reports.slice(0, 5)) {
        console.log(`     ${r.date}`);
        console.log(`       rewards ETH:   ${r.rewards_eth}`);
        console.log(`       balance lsETH: ${r.balance_lseth}`);
        console.log(`       conv. rate:    ${r.conversion_rate}`);
      }
    }
  } else {
    console.log(`\n🏆 Rewards ❌ ${rewardsRes.status} ${rewardsRes.statusText}`);
  }

  console.log('\n✅ Done\n');
};

run().catch(console.error);
