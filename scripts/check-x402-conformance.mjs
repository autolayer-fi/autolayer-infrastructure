const baseUrl = (process.argv[2] || process.env.X402_CONFORMANCE_URL || "http://localhost:5001").replace(/\/$/, "");
const response = await fetch(`${baseUrl}/supported`);
if (!response.ok) throw new Error(`/supported returned ${response.status}`);
const supported = await response.json();
for (const network of ["stellar:testnet", "stellar:pubnet"]) {
  const kind = supported.kinds?.find(value => value.x402Version === 2 && value.scheme === "exact" && value.network === network);
  if (!kind) throw new Error(`Missing exact ${network}`);
  if (kind.extra?.areFeesSponsored !== true) throw new Error(`${network} does not advertise sponsored fees`);
}
if (!Array.isArray(supported.extensions) || !supported.extensions.some(value => value === "bazaar" || value?.key === "bazaar")) throw new Error("Bazaar extension is not advertised");
console.log(JSON.stringify({ status: "pass", baseUrl, checkedAt: new Date().toISOString(), networks: ["stellar:testnet", "stellar:pubnet"], scheme: "exact" }, null, 2));
