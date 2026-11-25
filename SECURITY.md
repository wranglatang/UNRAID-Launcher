# Security

## Supported versions

Security fixes target the latest published stable release. Older release lines are not separately maintained. After a fix, pull the updated image and recreate your container following the README. Source builds should use the corresponding release tag.

## Report privately

Use [GitHub private vulnerability reporting](https://github.com/wranglatang/UNRAID-Launcher/security/advisories/new) when enabled. If unavailable, open an issue containing only a request for a private reporting channel. Do not post vulnerability details, exploits, or credentials publicly.

Include affected versions, reproduction steps, impact, and suggested mitigation in your private report. This community project has no guaranteed response time or support SLA.

## Deployment boundaries

- There is no authentication. Anyone who can reach the launcher can view and edit its shared dashboard. Use a trusted network or authenticated access layer.
- Publishing a Docker port may expose it on multiple server interfaces. Tailscale does not automatically restrict other access.
- Use an Unraid key with only the required Docker read permissions. Do not mount the Docker socket.
- The key stays in the backend environment. Docker administrators can inspect container environments; protect `.env`, container templates, and backups.
- Never commit credentials, dashboard data, private logs, or server backups. Scanners do not recognise every secret format.
- Revoke or rotate exposed credentials immediately. Deleting a file or rewriting Git history does not make the old key safe.

CodeQL, dependency auditing, Trivy, tests, and Docker checks supplement review. Clean results do not prove the absence of security flaws. Enable GitHub secret scanning and push protection too.
