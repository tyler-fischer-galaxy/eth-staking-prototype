import * as fs from 'fs';
import * as path from 'path';

const DB_DIR = path.resolve(__dirname, '../../db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const STAKE_STORE_PATH = path.join(DB_DIR, 'stake-txids.json');

export interface StakeTx {
  txid: string;
  amountEth: string;
  addedAt: string;
  confirmed: boolean;
  walletAddress?: string;
  explorerUrl?: string;
  balanceBeforeEth?: string;
  balanceAfterEth?: string;
  events: Record<string, any>;
}

export const loadStakeStore = (): Record<string, StakeTx> => {
  if (!fs.existsSync(STAKE_STORE_PATH)) return {};
  return JSON.parse(fs.readFileSync(STAKE_STORE_PATH, 'utf-8'));
};

export const saveStakeStore = (txs: Record<string, StakeTx>) => {
  fs.writeFileSync(STAKE_STORE_PATH, JSON.stringify(txs, null, 2));
};
