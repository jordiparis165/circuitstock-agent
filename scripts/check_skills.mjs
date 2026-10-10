const base = process.env.API_BASE_URL ?? "http://localhost:8787";

async function main() {
  const started = new Date().toISOString();
  const response = await fetch(`${base}/api/skills/check`);
  const body = await response.json();
  console.log(JSON.stringify({ at: started, base, status: response.status, ...body }, null, 2));
  if (!response.ok || !body.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
