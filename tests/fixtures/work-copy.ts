// Work's text as it was before it was split into pages (ticket 55), pinned here word for word so a
// wording change in content.ts fails a test. Change it only on purpose.
export const WORK_COPY = [
  "Solace: Software Developer Co-op, Platform Engineering. Ottawa, Sep to Dec 2026.",
  "Made the EC2 proxies behind CI/CD builds self-healing. CloudWatch alarms defined in Terraform reboot an out-of-memory instance, and a Lambda posts its status to Slack. A failure that sat unnoticed for hours became an unattended recovery, since proven on a real outage.",
  "Provisioned an S3 artifact store in Terraform, with versioning and lifecycle rules, giving a customer-facing UI pinned releases that can be rolled back.",
  "Wrote a Python check that fails any pull request where a pipeline drifts from its template.",
  "Automated product offboarding in an internal security dashboard across UI, API, data model and scripts, ending 30 to 60 minutes of manual cleanup each time.",
  "Barracuda Networks: Software Engineer Co-op, BarracudaONE Platform. Ottawa, Sep 2025 to Aug 2026.",
  "Built a GitHub Actions workflow that opens hotfix branches from the commit actually in production, serving 18 service repos and saving 5 to 10 minutes per ticket.",
  "Authored Terraform for production AWS infrastructure: VPC, ALB, IAM, ECR and External Secrets.",
  "Set up a Grafana dashboard with threshold alerts on SaaS metrics, used daily by the team.",
  "Built a test-scenario generator on the Claude API and a Jira MCP server, adopted by all 15 developers, cutting test-note writing by roughly 40%.",
  "Delivered C# and .NET services and React/TypeScript UI across some 60 tickets, and brought open-source license scanning into CI.",
];
