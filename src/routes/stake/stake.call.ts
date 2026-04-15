import * as BitGoJS from 'bitgo';
import { ethers } from 'ethers';
import { addStakeTx } from '../../cron/cron';

const {
  BITGO_ACCESS_TOKEN,
  BITGO_WALLET_ID,
  BITGO_WALLET_PASSPHRASE,
  RIVER_PROXY_ADDRESS,
  BLOCK_EXPLORER,
} = process.env;

const bitgo = new BitGoJS.BitGo({ env: 'test', accessToken: BITGO_ACCESS_TOKEN });

const riverABI = ['function deposit() payable'];
const iface = new ethers.Interface(riverABI);
const data = iface.encodeFunctionData('deposit', []);

export interface StakeResult {
  txid: string;
  explorerUrl: string;
  amountStakedEth: string;
  balanceBeforeEth: string;
  balanceAfterEth: string;
  walletAddress: string;
}

export const handleStake = async (amountEth: string): Promise<StakeResult> => {
  const wallet = await bitgo.coin('hteth').wallets().get({ id: BITGO_WALLET_ID });
  const balanceStr = await wallet.balanceString();
  const walletAddress = wallet.receiveAddress();

  console.log('Wallet address:', walletAddress);
  console.log('Wallet explorer:', `${BLOCK_EXPLORER}/address/${walletAddress}`);
  console.log('Balance before staking (ETH):', ethers.formatEther(balanceStr));

  const balance = BigInt(balanceStr);
  const gasBuffer = ethers.parseEther('0.01');
  if (balance <= gasBuffer) {
    throw new Error('Insufficient balance to stake after gas buffer');
  }

  const amountToStake = ethers.parseEther(amountEth).toString();

  console.log('\nCalling staking deposit...');
  console.log(`Amount to stake (ETH): ${amountEth}`);
  console.log('River contract:', `${BLOCK_EXPLORER}/address/${RIVER_PROXY_ADDRESS}`);

  const tx = await wallet.send({
    address: RIVER_PROXY_ADDRESS,
    amount: amountToStake,
    data: data,
    walletPassphrase: BITGO_WALLET_PASSPHRASE,
    type: 'transfer',
    metadata: { purpose: 'staking' },
  });

  console.log('\n✅ Staking successful!');
  console.log('Tx hash:', tx.txid);
  console.log('Tx explorer:', `${BLOCK_EXPLORER}/tx/${tx.txid}`);

  // save txid so cron can poll for lsETH mint event
  addStakeTx(tx.txid, amountEth);

  const updatedWallet = await bitgo.coin('hteth').wallets().get({ id: BITGO_WALLET_ID });
  const newBalanceStr = await updatedWallet.balanceString();
  console.log('Balance after staking (ETH):', ethers.formatEther(newBalanceStr));

  return {
    txid: tx.txid,
    explorerUrl: `${BLOCK_EXPLORER}/tx/${tx.txid}`,
    amountStakedEth: amountEth,
    balanceBeforeEth: ethers.formatEther(balanceStr),
    balanceAfterEth: ethers.formatEther(newBalanceStr),
    walletAddress: walletAddress ?? '',
  };
};
