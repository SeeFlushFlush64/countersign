// Reserved example domains (RFC 2606 / RFC 6761): example.com, example.net,
// example.org and their subdomains, and anything under .example, .test,
// .invalid or .localhost. In a demo epoch, counterparty emails must use one,
// so a public demo never stores a real person's address. The database
// enforces the same rule (countersign_is_example_email, demo_epochs
// migration); test/demo-epochs.test.ts keeps the two in agreement.

const EXAMPLE_DOT_TLD = /^([a-z0-9-]+\.)*example\.(com|net|org)$/;
const RESERVED_TLD = /^([a-z0-9-]+\.)+(example|test|invalid|localhost)$/;

export function isReservedExampleEmail(email: string): boolean {
  const domain = (email.split("@")[1] ?? "").toLowerCase();
  return EXAMPLE_DOT_TLD.test(domain) || RESERVED_TLD.test(domain);
}

export const EXAMPLE_DOMAIN_MESSAGE =
  "This demo never sends email, so use an example address: one ending in .example or .test, or at example.com (for instance legal@company.example).";
