import * as fs from 'fs';
import * as path from 'path';

const DB_DIR = path.resolve(__dirname, '../../db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const REDEEM_STORE_PATH = path.join(DB_DIR, 'redeem-requests.json');

export interface RedeemRequest {
txid: string
redeemRequestId: number | null;
  lsEthAmount: string;
  addedAt: string;
  claimed: boolean;
events: {}
}

export const loadRedeemStore = (): Record<string, RedeemRequest> => {
  if (!fs.existsSync(REDEEM_STORE_PATH)) return {};
  return JSON.parse(fs.readFileSync(REDEEM_STORE_PATH, 'utf-8'));
};

export const saveRedeemStore = (requests: Record<string, RedeemRequest>) => {
  fs.writeFileSync(REDEEM_STORE_PATH, JSON.stringify(requests, null, 2));
};

export const addRedeemRequest = (txid: string, lsEthAmount: string) => {
  const store = loadRedeemStore();
  if (store[txid]) {
    console.log(`ℹ️  Redeem request ${txid} already in store`);
    return;
  }
  store[txid] = {
    txid,
    lsEthAmount,
    addedAt: new Date().toISOString(),
    claimed: false,
    redeemRequestId: -1,
    events: {},
  };
  saveRedeemStore(store);
  console.log(`💾 Saved redeem request ${txid} to store`);
};
