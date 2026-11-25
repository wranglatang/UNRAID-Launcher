# Publishing a container release

The `Publish container` workflow builds an x86-64 (`linux/amd64`) image for Unraid and publishes it to `ghcr.io/wranglatang/unraid-launcher`.

## Release process

1. Update `package.json` and `package-lock.json` to the intended version in a pull request. Describe user-visible changes and migration requirements.
2. Merge after all required checks pass. Wait for the checks on the resulting `main` commit to pass too.
3. Tag that checked commit with the matching stable version, for example:

   ```sh
   git switch main
   git pull --ff-only
   git tag -a v1.0.0 -m 'Unraid Launcher 1.0.0'
   git push origin v1.0.0
   ```

4. Watch the `Publish container` workflow. It requires a tag matching the package version, a commit on `main`, and successful checks on that exact commit. It reruns tests and the dependency audit, builds the image, checks startup/persistence, and scans the exact candidate before pushing it. Only this job receives package publishing permission; no personal registry token is stored in repository secrets.
5. For the first release, set the container package visibility to **Public** in GitHub package settings. Verify an unauthenticated `docker pull` succeeds. Repository visibility alone does not make a new package public.
6. Create a GitHub release for the existing tag, with release notes and the published image digest. Verify the public install instructions before announcing it.

The workflow publishes a version tag such as `1.0.0` and updates `latest`. It refuses to intentionally replace an existing version tag. Preserve previous versions for rollback; a digest pins the exact image bytes. If a run failed before publishing, it can be retried or started manually with its tag. If a version was already pushed, inspect the registry state before recovery; do not delete existing releases just to rerun the workflow.

## Maintenance releases

Weekly scans should include the published image, since rebuilding current source does not establish whether users' installed image remains safe. When dependencies or the base image need a security update, make a reviewed patch release and publish it through the same process. New base-image fixes require a rebuild and publication even when application behaviour has not changed.

`latest` identifies the current stable build. Users still choose when to pull and recreate their container, or configure Unraid's update tooling themselves. Publishing a new image does not force an update on their server.
