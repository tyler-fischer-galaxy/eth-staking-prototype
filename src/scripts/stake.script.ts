import 'dotenv/config';

const { WEBHOOK_LISTENER_PORT = '3001' } = process.env;

const ethAmount = process.argv[2] ?? '0.01';

const run = async () => {
  console.log(`\n🚀 Staking ${ethAmount} ETH...`);
console.log(`http://localhost:${WEBHOOK_LISTENER_PORT}/stake/deposit`)
const res = await fetch(`http://localhost:${WEBHOOK_LISTENER_PORT}/stake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ethAmount }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('❌ Stake failed:', data);
    process.exit(1);
  }

  console.log('\n✅ Stake response:');
  console.log(JSON.stringify(data, null, 2));
};

run().catch(console.error);
