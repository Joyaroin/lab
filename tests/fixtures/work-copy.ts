// Work's text as spec #165 words it, pinned here word for word so a wording change in content.ts
// fails a test. Change it only on purpose.
export const WORK_LEADS = [
  "Solace · Software Developer Co-op, Platform Engineering · Sep–Dec 2026",
  "Barracuda Networks · Software Engineer Co-op, BarracudaONE Platform · Sep 2025–Aug 2026",
];
export const WORK_COPY = [
  "I made the EC2 proxies behind CI/CD builds heal themselves: an out-of-memory instance reboots and reports to Slack on its own, since proven on a real outage.",
  "I built an S3 artifact store in Terraform that gives a customer-facing UI pinned releases it can roll back.",
  "I automated product offboarding across UI, API, data model and scripts, ending 30–60 minutes of manual cleanup each time.",
  "I built a hotfix workflow that branches from the commit actually in production. It's used by 18 service repos and saves 5–10 minutes per ticket.",
  "I built a Claude API test-scenario generator with a Jira MCP server. All 15 developers use it, and it cut test-note writing by about 40%.",
  "I wrote Terraform for production AWS (VPC, ALB, IAM, ECR, External Secrets) and shipped C#/.NET and React features across about 60 tickets.",
];
