# Maintaining Unraid Launcher

## Repository settings

These settings require GitHub owner access; workflow files cannot enable them themselves.

- Enable two-factor authentication on the GitHub account.
- Enable Issues and private vulnerability reporting.
- Enable the dependency graph, Dependabot alerts, Dependabot security updates, secret scanning, and push protection where offered.
- Use the committed CodeQL workflow (advanced setup), without a duplicate default-setup configuration.
- Keep Actions' default workflow permissions read-only. CodeQL explicitly requests security-event upload permission. The publishing job alone receives package write permission through GitHub’s temporary token; ordinary checks have no publishing credentials.
- Protect `main` with required pull requests, resolved conversations, and successful checks. Block force pushes and deletion. A solo maintainer should not require another person's approval unless a reviewer is available.
- After their first successful runs, require `Test and build (Node 22)`, `Test and build (Node 24)`, `Test and build (Node 26)`, `Docker startup and persistence`, `Analyse JavaScript`, `Audit npm dependencies`, `Scan source for secrets`, and `Scan freshly built container`.
- Prefer squash merges and deletion of merged branches. Keep the repository public for Community Applications.
- Enable notifications for failed workflows, security alerts, and issues.

## Current automation

Pull requests and pushes to `main` run tests, builds, XML parsing, a real container startup/persistence check, CodeQL, npm auditing, and Trivy source/container scans. npm audit fails on high or critical advisories; the image scan fails on high or critical findings including unfixed vulnerabilities. Review failures rather than suppressing them broadly.

Weekly security jobs rescan current source, a freshly rebuilt image, and the published stable image. The published-image job also verifies anonymous pulls and persistence. Dependabot proposes npm, Dockerfile, and workflow updates every Tuesday. Changes require review; stable version tags trigger tested, scanned publication. See [RELEASING.md](RELEASING.md).

Actions are pinned to commit references. Dependabot proposes new references. Review workflow changes as carefully as application code.

Vite and its React plugin are grouped together because major updates can require matching versions. The Node 26 container runtime is covered by the test matrix alongside Node 22 and 24. Local development needs Node 22.12 or newer for the current build tools.

## Monthly review

1. Check failed Actions runs, security alerts, dependency updates, and user reports.
2. Confirm scheduled workflows are enabled and have run recently. GitHub can disable public-repository schedules after 60 days without repository activity; scheduled runs alone are not a permanent keepalive.
3. Review updates and rebuild the container to pick up base-image fixes.
4. Verify discovery and links on real Unraid, particularly after Unraid/API updates.
5. Check backup/restore instructions still match supported installation methods.

For long inactive periods, configure an external trigger and monitor its success. Do not claim unattended maintenance based only on GitHub schedules.

## Community Applications submission and upkeep

The root `ca_profile.xml` and `deploy/unraid-launcher.xml` provide repository metadata and a self-contained installation form. The template uses the public stable image, a masked API-key field, bridge networking, dropped capabilities, and non-root UID/GID `99:100`. CI verifies persistent bind-mounted data owned by that identity as well as the image-default named volume.

- Keep the public image available for anonymous pulls and retain fixed versions for rollback.
- Run Validate and Scan in the [Community Applications submission flow](https://ca.unraid.net/submit/help) after meaningful XML changes, then submit for review.
- The submission flow requires the Unraid Community Apps GitHub App with Contents read and Issues write access for this repository. Review its repository-health issues and respond to moderator requests.
- Do not mark an Apps-tab installation available in the README until the listing is approved and visible.
- Test real Unraid installation, persistence and update detection. Record tested versions from actual checks rather than guessing compatibility.
- Keep account two-factor authentication enabled, and maintain the support URL and repository health.

Keep read-only Unraid API access, non-root execution, and backend credential handling. Avoid the Docker socket and preserve user data.
