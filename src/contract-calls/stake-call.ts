import 'dotenv/config';
import * as BitGoJS from 'bitgo';
import { ethers } from 'ethers';
const { BITGO_ACCESS_TOKEN, BITGO_WALLET_ID, BITGO_WALLET_PASSPHRASE, RIVER_PROXY_ADDRESS, BLOCK_EXPLORER } = process.env

const bitgo = new BitGoJS.BitGo({ env: 'test', accessToken: BITGO_ACCESS_TOKEN });

const riverABI = ['function deposit() payable'];
const iface = new ethers.Interface(riverABI);
const data = iface.encodeFunctionData('deposit', []);

const runStakingBatch = async () => {
  const wallet = await bitgo.coin('hteth').wallets().get({ id: BITGO_WALLET_ID });

  const balanceStr = await wallet.balanceString();
  const walletAddress = wallet.receiveAddress();

  console.log('Wallet address:', walletAddress);
  console.log('Wallet explorer:', `${BLOCK_EXPLORER}/address/${walletAddress}`);
  console.log('Balance before staking (ETH):', ethers.formatEther(balanceStr));

  const balance = BigInt(balanceStr);
  const gasBuffer = ethers.parseEther('0.01');

  if (balance <= gasBuffer) {
    console.error('Insufficient balance to stake after gas buffer');
    return;
  }

  const amountToStake = ethers.parseEther('0.02').toString();

  console.log('\nCalling staking deposit...');
  console.log('Amount to stake (ETH): 0.02');
  console.log('River contract:', `${BLOCK_EXPLORER}/address/${RIVER_PROXY_ADDRESS}`);

  const tx = await wallet.send({
    address: RIVER_PROXY_ADDRESS,
    amount: amountToStake,
    data: data,
    walletPassphrase: BITGO_WALLET_PASSPHRASE,
    type: 'transfer',
    metadata: {
      purpose: 'staking' // Explicitly defines the transaction intent
    },
  });

  console.log('\n✅ Staking successful!');
  console.log('Tx hash:', tx.txid);
  console.log('Tx explorer:', `${BLOCK_EXPLORER}/tx/${tx.txid}`);
  console.log('Amount staked (ETH): 0.02');

  const updatedWallet = await bitgo.coin('hteth').wallets().get({ id: BITGO_WALLET_ID });
  const newBalanceStr = await updatedWallet.balanceString();
  console.log('Balance after staking (ETH):', ethers.formatEther(newBalanceStr));
};

runStakingBatch().catch(console.error);
