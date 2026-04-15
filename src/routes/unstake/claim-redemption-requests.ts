import * as BitGoJS from 'bitgo';
import { ethers } from 'ethers';

const {
  BITGO_ACCESS_TOKEN,
  BITGO_WALLET_ID,
  BITGO_WALLET_PASSPHRASE,
  RIVER_PROXY_ADDRESS,
  BLOCK_EXPLORER,
} = process.env;

const bitgo = new BitGoJS.BitGo({ env: 'test', accessToken: BITGO_ACCESS_TOKEN });

const riverABI = [
  'function claimRedeemRequests(uint32[] _redeemRequestIds, uint32[] _withdrawalEventIds) external returns (uint8[] claimStatuses)',
];
const iface = new ethers.Interface(riverABI);

export interface ClaimRedemptionResult {
  txid: string;
  explorerUrl: string;
  redeemRequestIds: number[];
  withdrawalEventIds: number[];
  claimStatuses: number[];
  balanceBeforeEth: string;
  balanceAfterEth: string;
  walletAddress: string;
}

export const handleClaimRedemptionRequests = async (
  redeemRequestIds: number[],
  withdrawalEventIds: number[],
): Promise<ClaimRedemptionResult> => {
  const wallet = await bitgo.coin('hteth').wallets().get({ id: BITGO_WALLET_ID });
  const balanceStr = await wallet.balanceString();
  const walletAddress = wallet.receiveAddress() ?? '';

  console.log('Wallet address:', walletAddress);
  console.log('Wallet explorer:', `${BLOCK_EXPLORER}/address/${walletAddress}`);
  console.log('Balance before claiming (ETH):', ethers.formatEther(balanceStr));

  console.log('\nCalling claimRedeemRequests...');
  console.log('Redeem request IDs:', redeemRequestIds);
  console.log('Withdrawal event IDs:', withdrawalEventIds);
  console.log('River contract:', `${BLOCK_EXPLORER}/address/${RIVER_PROXY_ADDRESS}`);

  const data = iface.encodeFunctionData('claimRedeemRequests', [
    redeemRequestIds,
    withdrawalEventIds,
  ]);

  const tx = await wallet.send({
    address: RIVER_PROXY_ADDRESS,
    amount: '0',
    data: data,
    walletPassphrase: BITGO_WALLET_PASSPHRASE,
    type: 'transfer',
  });

  console.log('\n✅ Claim submitted!');
  console.log('Tx hash:', tx.txid);
  console.log('Tx explorer:', `${BLOCK_EXPLORER}/tx/${tx.txid}`);
  console.log('ℹ️  Claim statuses: 0 = fully claimed, 1 = partially claimed, 2 = skipped');

  const updatedWallet = await bitgo.coin('hteth').wallets().get({ id: BITGO_WALLET_ID });
  const newBalanceStr = await updatedWallet.balanceString();
  console.log('Balance after claiming (ETH):', ethers.formatEther(newBalanceStr));

  return {
    txid: tx.txid,
    explorerUrl: `${BLOCK_EXPLORER}/tx/${tx.txid}`,
    redeemRequestIds,
    withdrawalEventIds,
    claimStatuses: [], // populated from tx receipt logs — see webhook
    balanceBeforeEth: ethers.formatEther(balanceStr),
    balanceAfterEth: ethers.formatEther(newBalanceStr),
    walletAddress,
  };
};
