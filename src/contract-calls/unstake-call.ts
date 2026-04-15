import 'dotenv/config';
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

const LS_ETH_AMOUNT = '0.02'; // lsETH amount to redeem

const runUnstakingBatch = async () => {
  const wallet = await bitgo.coin('hteth').wallets().get({ id: BITGO_WALLET_ID });
  const balanceStr = await wallet.balanceString();
  const walletAddress = wallet.receiveAddress();

  console.log('Wallet address:', walletAddress);
  console.log('Wallet explorer:', `${BLOCK_EXPLORER}/address/${walletAddress}`);
  console.log('Balance before unstaking (ETH):', ethers.formatEther(balanceStr));

  const lsEthAmountWei = ethers.parseEther(LS_ETH_AMOUNT).toString();

  const data = iface.encodeFunctionData('requestRedeem', [
    lsEthAmountWei,
    walletAddress, // recipient of ETH when redemption is claimed
  ]);

  console.log('\nCalling requestRedeem...');
  console.log('lsETH amount to redeem:', LS_ETH_AMOUNT);
  console.log('Recipient (ETH claimant):', walletAddress);
  console.log('River contract:', `${BLOCK_EXPLORER}/address/${RIVER_PROXY_ADDRESS}`);

  const tx = await wallet.send({
    address: RIVER_PROXY_ADDRESS,
    amount: '0', // no ETH sent — lsETH is burned by the contract
    data: data,
    walletPassphrase: BITGO_WALLET_PASSPHRASE,
    type: 'transfer',
  });

  console.log('\n✅ Redeem request submitted!');
  console.log('Tx hash:', tx.txid);
  console.log('Tx explorer:', `${BLOCK_EXPLORER}/tx/${tx.txid}`);
  console.log('lsETH redeemed:', LS_ETH_AMOUNT);
  console.log('\nℹ️  ETH will be claimable once the redemption request is satisfied.');
  console.log('   Monitor via the unstake-event webhook (see unstake-event.md).');

  const updatedWallet = await bitgo.coin('hteth').wallets().get({ id: BITGO_WALLET_ID });
  const newBalanceStr = await updatedWallet.balanceString();
  console.log('\nBalance after request (ETH):', ethers.formatEther(newBalanceStr));
};

runUnstakingBatch().catch(console.error);
