# Install through Unraid’s Docker screen

This installs the published x86-64 image without Docker Compose, a local build, or a separate environment file. Community Applications approved the repository on 25 November 2026. The app is awaiting the next catalogue build; until it appears in the Apps tab, you can import the same template manually.

## Install the template

Run in the Unraid terminal:

```sh
mkdir -p /boot/config/plugins/dockerMan/templates-user
curl -fL https://raw.githubusercontent.com/wranglatang/UNRAID-Launcher/main/deploy/unraid-launcher.xml -o /boot/config/plugins/dockerMan/templates-user/my-unraid-launcher.xml
```

Open **Docker → Add Container**, select the `unraid-launcher` user template, and fill in:

| Setting | What to enter |
| --- | --- |
| Repository | Keep `ghcr.io/wranglatang/unraid-launcher:latest` for stable updates. |
| Web interface | Host port `9999`, or another unused port; keep container port `3000`. |
| Dashboard data | Keep the default appdata folder for a new install, or choose your existing dashboard data folder. |
| Unraid WebGUI address | Your server HTTP/HTTPS origin, reachable from the container. Do not use localhost. |
| Unraid API key | A key with permission to read Docker container information. |
| Destination hostname | Your Tailscale MagicDNS hostname without scheme, port or path; leave empty to manage it in the app. |
| Demo mode | Keep `false` on your real server. |

Keep bridge networking and privileged mode off. Choose **Apply** to download and start the app. No registry login is required. Enable **Autostart** if desired.

The template runs as non-root UID/GID `99:100`, matching Unraid-created appdata folders. If you select a pre-existing folder, it must be writable by that identity. The key is visually masked in the form but stored in your container configuration; protect templates and backups.

Open the container’s **WebUI** and follow [Make it yours](../README.md#make-it-yours) to add favourites and folders.

## Migrate an existing installation

Back up your current saved dashboard and container settings first. Edit the existing container rather than adding another with the same name. Preserve its port, data directory/volume, API settings, and destination hostname.

For an older local-build or environment-file installation, changing just the image repository to the public `latest` reference preserves the existing environment-file setup and runtime identity. You do not have to replace that configuration to receive image updates.

If you also adopt the new template fields, copy values into the installation form privately and remove the old environment-file argument so it does not override them. The new template uses UID/GID `99:100`; an existing UID `1000` data directory and its files may need a targeted ownership change after backup. Never change ownership across the whole appdata share. Existing Compose/direct-Docker installations can keep UID/GID `1000:1000` and their original mapping.

## Updating and notifications

Use **Check for Updates** on Unraid’s Docker page. Publishing a new image under `latest` lets Unraid mark an older installed image as **update ready**. Installing it then recreates the container while retaining the mapped data.

For scheduled notifications, enable Docker update checks and notifications in your Unraid settings. Community Applications approval is not required for registry image update detection. A locally built image has no public registry update to compare against, and a fixed version tag does not follow newer releases.

To pin a release, use a version such as `ghcr.io/wranglatang/unraid-launcher:1.0.2`. `LAUNCHER_IMAGE` controls Compose only. Source builds remain available in [the optional build guide](../docs/BUILDING.md).

For direct Docker, pull the new image, stop/remove the container, and repeat your original run command with the same environment and volume. Never remove the data volume as part of a normal update.

## Backups and rollback

Back up `dashboard.json` from the mapped data directory/volume and protect your container configuration or `.env`. Stop the container while restoring data. Removing or recreating the container does not delete the mapped data folder.

Previous image versions remain available for rollback. Keep a backup from before upgrading: future saved-data formats may not support downgrading without restoring that backup.
