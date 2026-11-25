# Build from source (optional)

Normal installations use the [published image](../README.md#getting-started). Use this route for development or a local modification.

```sh
git clone https://github.com/wranglatang/UNRAID-Launcher.git
cd UNRAID-Launcher
cp .env.example .env
```

Edit `.env` with your server details. Build and start using the explicit Compose override:

```sh
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

The override builds `unraid-launcher:local` and preserves the base Compose ports, environment, security options, and volume. Always use both files when building or updating a local image. The default `compose.yaml` pulls the public image instead.

To update a Git checkout and rebuild, from the same directory:

```sh
git pull --ff-only
docker compose -f compose.yaml -f compose.build.yaml build --pull
docker compose -f compose.yaml -f compose.build.yaml up -d
```

Without Compose:

```sh
docker build --pull -t unraid-launcher:local .
docker run -d --name unraid-launcher --restart unless-stopped \
  --env-file .env -e DATA_DIR=/data -p 9999:3000 \
  -v unraid-launcher-data:/data \
  --security-opt=no-new-privileges:true --cap-drop=ALL \
  unraid-launcher:local
```

When switching between local and published images, stop/recreate the container and preserve its original volume mapping and project directory. Back up the data before upgrading. Never remove the volume just to switch images.
