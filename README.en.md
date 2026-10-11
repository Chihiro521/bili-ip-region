<p align="center">
  <img src="docs/assets/logo.png" width="96" height="96" alt="Bilibili IP Region Logo">
</p>

<h1 align="center">Bilibili IP Region</h1>

<p align="center">Display IP regions for comments, nested replies, posts, articles, and creators' profile pages on Bilibili.</p>
<p align="center"><strong>Chrome / Edge · 0.4.4 preview</strong></p>

<p align="center">
  <a href="README.md">简体中文</a> · <strong>English</strong><br>
  <a href="https://github.com/Chihiro521/bili-ip-region/releases/latest">Download the latest release</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="LICENSE">MIT License</a>
</p>

<p align="center">
  <a href="#screenshots">Screenshots</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#authorize-post-and-profile-queries">Authorization</a> ·
  <a href="#if-a-label-does-not-appear">Troubleshooting</a> ·
  <a href="#development">Development</a>
</p>

The extension interface is in Chinese; the instructions below include its exact button labels.

## Features

| Location | Display | Status |
| --- | --- | --- |
| Video and post comments | Region after the timestamp, such as “刚刚 河北 回复” (just now · Hebei · reply) | Implemented |
| Nested replies | Each reply's own region at publication | Implemented |
| Creator profile pages | A white-on-gray “IP属地：地区” (IP region: region) capsule next to the username | Implemented; initial authorization required |
| Post bodies | Region capsules in feeds, detail pages, and creator spaces; reposts and originals are queried separately | Implemented; initial authorization required |
| Article bodies | Region capsule by the timestamp on legacy `cv` and current `opus` pages | Implemented; a nonempty publication region is required |

All four display switches are enabled by default. A label appears when the API returns a nonempty region and the content ID / UID matches. Empty fields, failed requests, or mismatched IDs remove the label. The extension handles scrolling, page navigation, reused nodes, and theme changes.

## Screenshots

These screenshots show real Bilibili pages, with some usernames redacted. Click an image to view it at full size.

### Creator profile

A white-on-gray region capsule appears beside the username. This example shows “IP属地：上海” (IP region: Shanghai).

<p>
  <a href="docs/assets/profile.png"><img src="docs/assets/profile.png" width="694" alt="Real creator profile with an IP region: Shanghai capsule beside the username"></a>
</p>

### Comments and nested replies

Regions appear in the comment timestamp row, with each nested reply using its own publication region. The reply shown here displays “广东” (Guangdong).

<p>
  <a href="docs/assets/comments.png"><img src="docs/assets/comments.png" width="840" alt="Real comments and nested replies with Guangdong after the reply timestamp"></a>
</p>

### Posts and reposts

The repost and its original post each have a separate region label. Both pieces of content in this example show “上海” (Shanghai).

<p>
  <a href="docs/assets/dynamic-repost.png"><img src="docs/assets/dynamic-repost.png" width="840" alt="Real repost showing separate Shanghai region capsules for the repost and original post"></a>
</p>

### Articles

A region capsule appears beside the article timestamp. This example shows “IP属地：北京” (IP region: Beijing).

<p>
  <a href="docs/assets/article.png"><img src="docs/assets/article.png" width="700" alt="Real article with an IP region: Beijing capsule beside its timestamp"></a>
</p>

## Installation

1. Download `bili-ip-region-<version>.zip` from [GitHub Releases](https://github.com/Chihiro521/bili-ip-region/releases/latest) and extract it.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge, then enable **Developer mode**.
3. Click **Load unpacked** and select the extracted **`bili-ip-region/dist`** directory.
4. Refresh any open Bilibili pages and open the comments section.

To update, replace the extracted files, reload the extension on the extensions page, and refresh Bilibili. Pin the extension to the toolbar for convenient access to its settings.

## Authorize post and profile queries

Authorization confirmation sends the existing web login cookies and ignores cookie updates returned by the authorization endpoints. App detail queries use the saved App credential without web cookies.

1. Sign in to Bilibili in the current browser and open a creator's profile page.
2. Open the extension popup, keep **个人主页属地** (Profile region) enabled, and click **授权主页查询** (Authorize profile queries).
3. Allow access to Bilibili's login endpoint. This creates a device login credential for the currently signed-in account and stores it locally in this browser's extension storage.
4. Once **已授权** (Authorized) appears, posts and profiles reuse this authorization. Other creators' profiles are queried by UID. The full diagnostics page can also authorize using your most recently opened Bilibili tab.

Profile labels show the region of **the target account whose profile is open**. Comments, posts, and articles use the region of each piece of content at publication. Different content from the same author may have different regions.

**清除本地授权** (Clear local authorization) removes the extension's credential, post and profile caches, and labels that depend on authorization. You can revoke the corresponding device login in your Bilibili account settings. Click the authorization button again when the credential expires.

## If a label does not appear

- After updating, reload both the extension and the Bilibili page so that the new page scripts load.
- Comment data must contain a nonempty `reply_control.location` field.
- Posts and profiles require authorization and a region returned for the corresponding content or account.
- Articles use their own publication region; when the web field is empty, existing authorization can query App article details.
- The four switches independently control their labels. Check the settings version after updating.

## Data and permissions

The comment module reads component data and API responses already obtained by the page, without making a separate request for each comment. Page scripts read the corresponding post ID, and the background requests App details. Articles map Opus IDs to CV IDs before querying article data. Profile queries run in the background and verify the returned UID.

Switches are stored in `chrome.storage.sync`. Login credentials remain in the current browser's local extension storage, with access restricted to trusted extension contexts. Page scripts receive only content IDs, target UIDs, and regions. Credentials are not inserted into the page DOM or post diagnostic reports.

Post cache entries are keyed by content ID, and profile entries by target UID. Nonempty results last 30 minutes, empty results last 5 minutes, and each cache holds at most 200 entries. Reauthorizing or clearing authorization clears these caches. Posts near the visible area are queried, with at most three post requests running at once in the background.

Access to Bilibili pages enables label injection. API / App host permissions enable data requests. Permission for the login host is requested only when you click the profile authorization button.

## Query diagnostics

Expand **动态与专栏查询诊断** (Post and article query diagnostics), and enter post IDs or an article link to inspect the corresponding result. **复制报告** (Copy report) copies diagnostic output. Older reports prompt you to rerun the query.

## Development

Built with Manifest V3 and TypeScript. Development requires Node.js 24 or newer. On Windows, use PowerShell 7 for packaging.

```powershell
npm ci
npm run check
npm test
npm run build
npm run check:assets
pwsh -NoProfile -File scripts/package.ps1
```

Build output is written to `dist/`; installation packages go to `outputs/`. Edit `static/icons/logo.svg` to change the logo. The build automatically renders all PNG icon sizes.

GitHub Actions checks public files, TypeScript, code tests, the build, icons, and packaging, then uploads the build artifact. Packages built from this source include both README languages.

## License and credits

This project is licensed under [MIT](LICENSE). Comment hooks reference BiliReveal; profile queries reference BiliRevealForSpace; device authorization is adapted from libBilibiliToken. Their corresponding MIT notices are retained.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the full list of sources and dependency notices.
