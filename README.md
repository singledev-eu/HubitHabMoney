# HubitHab — Open Financials

A self-contained, static "building in public" financials page for [HubitHab](https://hubihab.com), hosted on GitHub Pages at **money.hubihab.com**.

No build step. No npm. Pure HTML, CSS, and vanilla JavaScript.

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | Public-facing financial dashboard |
| `admin.html` | Password-protected admin panel to edit data |
| `data.json` | Single source of truth for all financial data |
| `styles.css` | Shared styles for both pages |
| `admin.js` | Admin panel logic |
| `CNAME` | Custom domain record for GitHub Pages |

---

## Deploy to GitHub Pages

### 1. Create a new repository

Create a new **public** GitHub repository. The name is up to you — for example:

```
github.com/your-username/HubitHabMoney
```

### 2. Update data.json

Before pushing, open `data.json` and update the `githubUrl` field to point to your new repo:

```json
{
  "githubUrl": "https://github.com/your-username/HubitHabMoney",
  ...
}
```

### 3. Push the files

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/HubitHabMoney.git
git push -u origin main
```

### 4. Enable GitHub Pages

1. Go to your repo on GitHub
2. **Settings → Pages**
3. Under *Source*, choose **Deploy from a branch**
4. Branch: `main`, folder: `/ (root)`
5. Click **Save**

GitHub will give you a URL like `https://your-username.github.io/HubitHabMoney`. The custom domain will replace this.

### 5. Configure the custom domain

The `CNAME` file already contains:

```
money.hubihab.com
```

At your domain registrar (Cloudflare, Namecheap, etc.), add a **CNAME DNS record**:

| Type  | Name  | Value                          |
|-------|-------|--------------------------------|
| CNAME | money | your-username.github.io        |

DNS propagation typically takes a few minutes, but can take up to 48 hours.

### 6. Enable HTTPS

Back in **Settings → Pages**, once the custom domain resolves, check **Enforce HTTPS**. GitHub provisions a Let's Encrypt certificate automatically — no action needed on your side.

---

## Admin panel

The admin panel at `money.hubihab.com/admin.html` lets you edit `data.json` directly from the browser, without cloning the repo.

### Before deploying — IMPORTANT

Open `admin.html` and change the password at the bottom of the file:

```html
<script>
  const ADMIN_PASSWORD = "REPLACE_ME_BEFORE_DEPLOY";
</script>
```

> **Note:** The password is visible in the HTML source to anyone who views it. This is a deliberate trade-off for a static site (no server-side auth is possible). Keep the page's URL low-profile and treat it as a convenience tool, not a hardened security layer.

### Get a GitHub Personal Access Token

The admin panel writes to `data.json` via the [GitHub Contents API](https://docs.github.com/en/rest/repos/contents). It needs a fine-grained Personal Access Token (PAT) with **Contents: read and write**.

1. Go to [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta)
2. Click **Generate new token**
3. Give it a name, e.g. `HubitHab Financials admin`
4. Under *Repository access*, choose **Only select repositories** → pick your repo
5. Under *Repository permissions → Contents*, select **Read and write**
6. Click **Generate token** and copy it immediately (you won't see it again)

In the admin panel, paste the token into the **Personal Access Token** field. It is stored only in `sessionStorage` — it clears automatically when you close the browser tab and is never sent anywhere except directly to the GitHub API.

### Adding a new month

1. Open `admin.html`
2. Select **+ Add new month** from the month dropdown
3. Enter the month in `YYYY-MM` format (e.g. `2025-06`)
4. Optionally tick **Copy expenses from previous month** to pre-populate rows
5. Edit MRR and expense rows as needed
6. Click **Save changes**

---

## Local development

The public page (`index.html`) works by opening it directly in a browser — no server required.

For the admin panel, some browsers block `fetch()` to `file://` URLs. Run a simple local server:

```bash
# Python 3
python3 -m http.server 8080

# Node (if you have npx)
npx serve .
```

Then open `http://localhost:8080`. In local mode the admin panel loads `data.json` from the filesystem (no GitHub API call), which is useful for previewing the UI. Saving still requires valid GitHub credentials.
