# Comrade Principles

## Decision Framework

When considering new features or bug fixes:

- Is it easy to test? How can we make testing simpler? (e.g., automated UI testing with screenshots)
- Is there an existing equivalent for this feature? If so, use it. If not, how does it improve the experience for different user personas?
- If it's a bug, what were you testing? What were you trying to achieve? What did you observe? We need core understanding before proceeding.

## Constraints

- Work with **only the folders the user authorizes**.
- Treat **plugins, skills, commands, and integrations** as the primary extensibility system.

## Principles

- **Parity**: UI actions map directly to server APIs.
- **Transparency**: Plans, steps, tool calls, and permissions are visible.
- **Least privilege**: Only user-authorized folders + explicit approvals.
- **Prompt is the workflow**: Product logic lives in prompts, rules, and skills.
- **Graceful degradation**: If access is missing, guide the user.

## Security & Privacy

- Local-first by default.
- No secrets in git.
- Use OS keychain for credentials.
- Clear, explicit permissions.
- Exportable audit logs.
