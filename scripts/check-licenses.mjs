import { execFileSync } from "node:child_process";

const report = JSON.parse(execFileSync("pnpm", ["licenses", "list", "--json", "--prod"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }));
const denied = /\b(AGPL|GPL|SSPL|EUPL|OSL|CPAL)\b/i;
const violations = [];
const uncertain = [];
let count = 0;
for (const [licenseGroup, packages] of Object.entries(report)) {
  for (const pkg of packages) {
    count += 1;
    const license = pkg.license || licenseGroup || "";
    const label = `${pkg.name}@${(pkg.versions || []).join(",")}`;
    if (!license || /unknown|unlicensed/i.test(license)) uncertain.push(label);
    else if (denied.test(license)) violations.push(`${label}: ${license}`);
  }
}
if (violations.length) {
  console.error("Strong-copyleft dependencies detected:\n" + violations.join("\n"));
  process.exit(1);
}
console.log(`License gate passed. Reachable production packages checked: ${count}. Strong-copyleft packages: 0. Uncertain: ${uncertain.length}.`);
if (uncertain.length) console.log(uncertain.sort().join("\n"));
