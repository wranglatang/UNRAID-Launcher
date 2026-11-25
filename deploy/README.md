# Install through Unraid’s Docker screen

This guide uses a locally built image and Unraid’s Docker screen, without Docker Compose. The template in this folder is for local installation, not the future Community Applications submission.

## 1. Prepare the files

Follow the main README to download or clone the source into:

```text
/mnt/user/appdata/unraid-launcher/source
```

In the Unraid terminal:

```sh
mkdir -p /mnt/user/appdata/unraid-launcher/data
cp /mnt/user/appdata/unraid-launcher/source/.env.example /mnt/user/appdata/unraid-launcher/.env
chmod 600 /mnt/user/appdata/unraid-launcher/.env
chown 1000:1000 /mnt/user/appdata/unraid-launcher/data
chmod 700 /mnt/user/appdata/unraid-launcher/data
```

Run the copy step only for a new installation; do not overwrite an existing `.env`. The ownership command applies to this app’s data directory only. The container runs as UID/GID `1000:1000`.

Edit `/mnt/user/appdata/unraid-launcher/.env` with your Unraid URL, Docker-read API key, and destination hostname. Keep `DEMO_MODE=false`. See the [configuration instructions](../README.md#3-configure-your-server).

The template reads these values using `--env-file`; it does not duplicate the key in the XML. Protect the environment file and server backups. Docker administrators can still inspect the container environment.

## 2. Build the local image

```sh
docker build --pull -t unraid-launcher:local /mnt/user/appdata/unraid-launcher/source
```

## 3. Install the Docker-screen template

```sh
mkdir -p /boot/config/plugins/dockerMan/templates-user
cp /mnt/user/appdata/unraid-launcher/source/deploy/unraid-launcher.xml /boot/config/plugins/dockerMan/templates-user/my-unraid-launcher.xml
```

In Unraid, open **Docker → Add Container**, select the `unraid-launcher` user template, and check:

| Setting | Value |
| --- | --- |
| Repository | `unraid-launcher:local` |
| Network | `bridge` |
| Privileged | Off |
| Web interface | Host `9999` → container `3000` |
| Dashboard data | `/mnt/user/appdata/unraid-launcher/data` → `/data` |
| Extra parameters | Environment-file path, no-new-privileges, and dropped capabilities from the template |

Choose **Apply**, then enable **Autostart** for the container on the Docker page if desired. If port `9999` is occupied, edit the host-side port here; `LAUNCHER_PORT` controls Compose only.

Open the container’s **WebUI** or browse to your server on port `9999`. Follow [Make it yours](../README.md#make-it-yours) to add favourite apps and folders.

## Updating

For a Git checkout:

```sh
cd /mnt/user/appdata/unraid-launcher/source
git pull --ff-only
docker build --pull -t unraid-launcher:local .
```

For a ZIP installation, replace the source with the new download and run the same build command. Preserve `.env` and `data` in the parent directory.

Edit the container on Unraid’s Docker page and choose **Apply** to recreate it using the rebuilt image. Apply container changes after editing `.env` too: a restart alone does not reload its values. A local image is not updated by pulling from a public registry.

For the direct Docker command from the main README, preserve its named volume when recreating:

```sh
docker build --pull -t unraid-launcher:local .
docker stop unraid-launcher
docker rm unraid-launcher
```

Then repeat the original `docker run` command from the same directory with the same `.env`, port, and `unraid-launcher-data` volume. Do not remove the volume.

## Backups

Back up the `data` directory and protect `.env` with your server configuration backups. Stop the container while restoring data. Removing or recreating the container does not delete the bind-mounted data folder. Keep the same mapping when changing installation methods so your dashboard is retained.
