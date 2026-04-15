import * as BitGoJS from 'bitgo';

const { BITGO_ACCESS_TOKEN, BITGO_WALLET_ID } = process.env;

const bitgo = new BitGoJS.BitGo({ env: 'test', accessToken: BITGO_ACCESS_TOKEN });

interface RegisterWebhookOptions {
  type: string;
  url: string;
  label: string;
  numConfirmations?: number;
}

export const registerWebhook = async (options: RegisterWebhookOptions) => {
  const wallet = await bitgo.coin('hteth').wallets().get({ id: BITGO_WALLET_ID });
  const existing = await wallet.listWebhooks();
  const alreadyRegistered = existing.webhooks?.some((w: any) => w.url === options.url);

  if (alreadyRegistered) {
    console.log(`⏭️  Webhook already registered: ${options.url}`);
    return;
  }

  await wallet.addWebhook(options);
  console.log(`✅ Webhook registered: ${options.type} → ${options.url}`);
};
