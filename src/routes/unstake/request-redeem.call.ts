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
  'function requestRedeem(uint256 _lsETHAmount, address _recipient) external returns (uint32 _redeemRequestId)',
];
const iface = new ethers.Interface(riverABI);

export interface RequestRedeemResult {
  txid: string;
  explorerUrl: string;
  lsEthAmountRedeemed: string;
  recipient: string;
  balanceBeforeEth: string;
  balanceAfterEth: string;
  walletAddress: string;
}

export const handleRequestRedeem = async (lsEthAmount: string): Promise<RequestRedeemResult> => {
  const wallet = await bitgo.coin('hteth').wallets().get({ id: BITGO_WALLET_ID });
  const balanceStr = await wallet.balanceString();
  const walletAddress = wallet.receiveAddress() ?? '';

  console.log('Wallet address:', walletAddress);
  console.log('Wallet explorer:', `${BLOCK_EXPLORER}/address/${walletAddress}`);
  console.log('Balance before unstaking (ETH):', ethers.formatEther(balanceStr));

  const lsEthAmountWei = ethers.parseEther(lsEthAmount).toString();
  const data = iface.encodeFunctionData('requestRedeem', [
    lsEthAmountWei,
    walletAddress,
  ]);

  console.log('\nCalling requestRedeem...');
  console.log(`lsETH amount to redeem: ${lsEthAmount}`);
  console.log('Recipient (ETH claimant):', walletAddress);
  console.log('River contract:', `${BLOCK_EXPLORER}/address/${RIVER_PROXY_ADDRESS}`);

  const tx = await wallet.send({
    address: RIVER_PROXY_ADDRESS,
    amount: '0',
    data: data,
    walletPassphrase: BITGO_WALLET_PASSPHRASE,
    type: 'transfer',
  });

  console.log('\n✅ Redeem request submitted!');
  console.log('Tx hash:', tx.txid);
  console.log('Tx explorer:', `${BLOCK_EXPLORER}/tx/${tx.txid}`);
  console.log('ℹ️  ETH will be claimable once the redemption request is satisfied.');

  const updatedWallet = await bitgo.coin('hteth').wallets().get({ id: BITGO_WALLET_ID });
  const newBalanceStr = await updatedWallet.balanceString();
  console.log('Balance after request (ETH):', ethers.formatEther(newBalanceStr));

  return {
    txid: tx.txid,
    explorerUrl: `${BLOCK_EXPLORER}/tx/${tx.txid}`,
    lsEthAmountRedeemed: lsEthAmount,
    recipient: walletAddress,
    balanceBeforeEth: ethers.formatEther(balanceStr),
    balanceAfterEth: ethers.formatEther(newBalanceStr),
    walletAddress,
  };
};
