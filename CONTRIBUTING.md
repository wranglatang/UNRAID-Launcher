# Contributing

Bug reports, documentation improvements, and focused fixes are welcome.

Read the README's troubleshooting section before opening an issue. Include installation method, Unraid/API version if known, browser, expected behaviour, actual behaviour, and reproduction steps. Remove credentials and personal information. Follow [SECURITY.md](SECURITY.md) for vulnerabilities.

## Make a change

1. Fork the repository and create a branch.
2. Use Node.js 24 and run `npm ci`.
3. Copy `.env.example` to `.env`. Use `DEMO_MODE=true` with no real key for UI development.
4. Run `npm run dev` and make a focused change.
5. Run `npm test`, `npm run build`, and `npm audit --audit-level=high`.
6. For container changes, build the image and verify startup and persistent data. Keep non-root operation and read-only API access intact.
7. Open a pull request describing the problem, resulting behaviour, and verification.

Add meaningful regression coverage for behaviour changes. Preserve existing saved data across upgrades and document configuration changes. Never commit generated builds, credentials, local data, or dependency directories.

Contributions are distributed under the project's MIT licence. Third-party material must retain required attribution and compatible licensing.
