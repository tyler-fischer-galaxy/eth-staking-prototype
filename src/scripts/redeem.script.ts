import 'dotenv/config';

const { WEBHOOK_LISTENER_PORT = '3001' } = process.env;

const lsEthAmount = process.argv[2] ?? '0.02';

const run = async () => {
  console.log(`\n🔁 Requesting redeem for ${lsEthAmount} lsETH...`);

  const res = await fetch(`http://localhost:${WEBHOOK_LISTENER_PORT}/unstake/request-redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lsEthAmount }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('❌ Redeem request failed:', data);
    process.exit(1);
  }

  console.log('\n✅ Redeem response:');
  console.log(JSON.stringify(data, null, 2));
};

run().catch(console.error);
