# Deploying Custom `qui` on Unraid from GitHub

This fork adds **per-torrent grouped cross-seed selection** and **safe file deletion** to `qui`'s Delete Torrent dialog:

- When deleting one or multiple torrents, click **Check** in the delete dialog (or toggle cross-seed removal) to see each selected torrent grouped as its own card with its cross-seeds listed underneath.
- Each cross-seed displays its **tracker domain**, **status/health badge** (e.g., `Unregistered`, `Tracker Down`, `Tracker Error`, `Seeding`), **instance name**, and **match type**.
- You can check/uncheck individual cross-seeds per torrent, toggle all cross-seeds for a single torrent, or use **Unregistered** quick-select buttons.
- **Data protection:** When *"Also delete files from disk"* is checked, disk files are **only** deleted for torrents where **all** of their cross-seeds are also selected for removal. Any torrent with a kept (unchecked) cross-seed automatically preserves its files on disk.

---

## Option 1: Automated Build via GitHub Actions + GHCR (Recommended)

1. **Create a GitHub repository** (e.g. `https://github.com/<your-username>/qui`) and push this directory as `main`:
   ```bash
   git init -b main
   git add .
   git commit -m "feat: per-torrent selective cross-seed deletion and safe file deletion"
   git remote add origin https://github.com/<your-username>/qui.git
   git push -u origin main
   ```
   *(If you cloned this directory with `git clone`, update the remote URL with `git remote set-url origin https://github.com/<your-username>/qui.git` and push to `main`.)*

2. **Wait for the GitHub Action to finish:**
   - The included workflow [`.github/workflows/docker-unraid.yml`](.github/workflows/docker-unraid.yml) runs Go tests, frontend tests/lint, builds the Docker image using the root [`Dockerfile`](Dockerfile), and publishes:
     `ghcr.io/<your-username>/qui:latest`
   - In GitHub, open **Packages → qui → Package settings** and either set visibility to **Public** (easiest for Unraid) or authenticate Unraid Docker with a GitHub Personal Access Token (`read:packages`).

3. **Deploy on Unraid:**
   - Option A (Edit existing `qui` container in Unraid):
     1. Go to Unraid **Docker** tab → click **qui** → **Edit**.
     2. Change **Repository** to `ghcr.io/<your-username>/qui:latest`.
     3. Keep your existing `/config` (`/mnt/user/appdata/qui`) and data path mappings intact, then click **Apply**.
   - Option B (New container via template):
     1. Copy `unraid/qui-custom.xml` to `/boot/config/plugins/dockerMan/templates-user/my-qui-custom.xml` on your Unraid flash drive, replacing `YOUR_GITHUB_USERNAME` with your GitHub username.
     2. In Unraid **Docker → Add Container**, select `qui-custom` from the template dropdown and click **Apply**.

---

## Option 2: Build Directly on Unraid from GitHub (No Registry Needed)

In the Unraid terminal (SSH or Web Terminal):

```bash
docker build -t qui-custom:latest https://github.com/<your-username>/qui.git#main
```

Then edit your Unraid Docker container's **Repository** field to `qui-custom:latest` and click **Apply**.
