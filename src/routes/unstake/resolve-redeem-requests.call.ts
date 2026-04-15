import * as BitGoJS from 'bitgo';
import { ethers } from 'ethers';

const {
  BITGO_ACCESS_TOKEN,
  BITGO_WALLET_ID,
  BITGO_WALLET_PASSPHRASE,
  REDEEM_MANAGER_ADDRESS,
  BLOCK_EXPLORER,
} = process.env;

const bitgo = new BitGoJS.BitGo({ env: 'test', accessToken: BITGO_ACCESS_TOKEN });

const redeemManagerABI = [
  'function resolveRedeemRequests(uint32[] _redeemRequestIds) external returns (int64[] _withdrawalEventIds)',
];
const iface = new ethers.Interface(redeemManagerABI);

export interface ResolveRedeemResult {
  txid: string;
  explorerUrl: string;
  redeemRequestIds: number[];
  withdrawalEventIds: string[];
}

export const handleResolveRedeemRequests = async (
  redeemRequestIds: number[],
): Promise<ResolveRedeemResult> => {
  const wallet = await bitgo.coin('hteth').wallets().get({ id: BITGO_WALLET_ID });
  const walletAddress = wallet.receiveAddress() ?? '';

  console.log('Wallet address:', walletAddress);
  console.log('Calling resolveRedeemRequests...');
  console.log('Redeem request IDs:', redeemRequestIds);
  console.log('RedeemManager contract:', `${BLOCK_EXPLORER}/address/${REDEEM_MANAGER_ADDRESS}`);

  const data = iface.encodeFunctionData('resolveRedeemRequests', [redeemRequestIds]);

  const tx = await wallet.send({
    address: REDEEM_MANAGER_ADDRESS,
    amount: '0',
    data: data,
    walletPassphrase: BITGO_WALLET_PASSPHRASE,
    type: 'transfer',
  });

  console.log('\n✅ resolveRedeemRequests submitted!');
  console.log('Tx hash:', tx.txid);
  console.log('Tx explorer:', `${BLOCK_EXPLORER}/tx/${tx.txid}`);
  console.log('ℹ️  withdrawalEventIds > 0 means request is satisfied and ready to claim.');

  return {
    txid: tx.txid,
    explorerUrl: `${BLOCK_EXPLORER}/tx/${tx.txid}`,
    redeemRequestIds,
    withdrawalEventIds: [], // populated from tx receipt logs — see webhook
  };
};
