# Install through Unraid’s Docker screen

This installs the published x86-64 image without Docker Compose or a local build. The template currently reads a private environment file. A self-contained Community Applications installer is a separate next step.

## 1. Prepare configuration and storage

For a new installation, run in the Unraid terminal:

```sh
mkdir -p /mnt/user/appdata/unraid-launcher/data
curl -fL https://raw.githubusercontent.com/wranglatang/UNRAID-Launcher/main/.env.example -o /mnt/user/appdata/unraid-launcher/.env
chmod 600 /mnt/user/appdata/unraid-launcher/.env
chown 1000:1000 /mnt/user/appdata/unraid-launcher/data
chmod 700 /mnt/user/appdata/unraid-launcher/data
```

**Existing installation:** preserve your existing `.env` and data directory; do not run the download command over your real configuration. Keep the same data mapping when changing from a local image or another installation method.

Edit `/mnt/user/appdata/unraid-launcher/.env` with your Unraid URL, Docker-read API key, and destination hostname. Keep `DEMO_MODE=false`. See the [configuration instructions](../README.md#3-configure-your-server).

The container runs as UID/GID `1000:1000`. The ownership command applies only to this app’s data directory. The template uses `--env-file` so the key is not duplicated in XML; protect the file and backups. Docker administrators can still inspect the container environment.

## 2. Install the Docker-screen template

```sh
mkdir -p /boot/config/plugins/dockerMan/templates-user
curl -fL https://raw.githubusercontent.com/wranglatang/UNRAID-Launcher/main/deploy/unraid-launcher.xml -o /boot/config/plugins/dockerMan/templates-user/my-unraid-launcher.xml
```

In Unraid, open **Docker → Add Container**, select the `unraid-launcher` user template, and check:

| Setting | Value |
| --- | --- |
| Repository | `ghcr.io/wranglatang/unraid-launcher:latest` |
| Network | `bridge` |
| Privileged | Off |
| Web interface | Host `9999` → container `3000` |
| Dashboard data | `/mnt/user/appdata/unraid-launcher/data` → `/data` |
| Extra parameters | Environment-file path, no-new-privileges, and dropped capabilities from the template |

Choose **Apply** to download and start the image. No registry login is required. Enable **Autostart** on the Docker page if desired. If `9999` is occupied, change the host-side port here; `LAUNCHER_PORT` controls Compose only.

Open the container’s **WebUI** or browse to your server on port `9999`. Follow [Make it yours](../README.md#make-it-yours) to add favourites and folders.

To migrate an existing Docker-screen installation, edit that existing container, replace `unraid-launcher:local` with the published image reference, preserve all environment-file, port, and data mappings, and choose **Apply**. Do not add a second container with the same name.

## Updating

Use **Check for Updates** and the available update action on Unraid’s Docker page. `latest` follows the stable release. To pin a release, set the Repository field to a version such as `ghcr.io/wranglatang/unraid-launcher:1.0.1`; `LAUNCHER_IMAGE` controls Compose only.

After editing `.env`, apply the container settings to recreate it. A plain restart does not reload environment values. Source builds remain available in [the optional build guide](../docs/BUILDING.md).

For the direct Docker command in the main README:

```sh
docker pull ghcr.io/wranglatang/unraid-launcher:latest
docker stop unraid-launcher
docker rm unraid-launcher
```

Repeat the original `docker run` command from the same directory, using the same `.env`, port, and `unraid-launcher-data` volume. Do not remove the volume.

## Backups and rollback

Back up `dashboard.json` from the mapped data directory/volume and protect `.env`. Stop the container while restoring data. Removing or recreating the container does not delete a bind-mounted data folder.

Previous image versions remain available for rollback. Keep a backup from before upgrading; future saved-data formats may not support downgrading without restoring that backup. Always preserve the original data mapping when switching installation methods.
