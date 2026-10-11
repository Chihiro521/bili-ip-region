<p align="center"><img src="docs/assets/logo.png" width="96" height="96" alt="Bilibili IP Region Logo"></p>

# Bilibili IP Region

[简体中文](README.md) · **English**

Display IP regions for comments, nested replies, and creators' profile pages on the Bilibili website. Supports Chrome / Edge and uses Manifest V3 with TypeScript.

[Download the latest release](https://github.com/Chihiro521/bili-ip-region/releases/latest) · [Changelog](CHANGELOG.md) · [MIT License](LICENSE)

Current version: **0.3.4 preview**. The extension interface is in Chinese; the instructions below include its exact button labels.

## Features

| Location | Display | Status |
| --- | --- | --- |
| Video and post comments | Region after the timestamp, such as “刚刚 河北 回复” (just now · Hebei · reply) | Implemented |
| Nested replies | Each reply's own region at publication | Implemented |
| Creator profile pages | A white-on-gray “IP属地：地区” (IP region: region) capsule next to the username | Implemented; initial authorization required |
| Post bodies | API diagnostics in the extension popup | Experimental |
| Article bodies | Page display has not been implemented | Planned |

The comment and profile switches are enabled by default. A label appears when the API returns a nonempty region and the content ID / UID matches. Empty fields, failed requests, or mismatched IDs remove the label. The extension handles scrolling, page navigation, reused nodes, and theme changes.

Profile capsule style, using synthetic data:

![Profile region capsule example](docs/assets/profile-badge.png)

## Installation

1. Download `bili-ip-region-<version>.zip` from [GitHub Releases](https://github.com/Chihiro521/bili-ip-region/releases/latest) and extract it.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge, then enable **Developer mode**.
3. Click **Load unpacked** and select the extracted **`bili-ip-region/dist`** directory.
4. Refresh any open Bilibili pages and open the comments section.

To update, replace the extracted files, reload the extension on the extensions page, and refresh Bilibili. Pin the extension to the toolbar for convenient access to its settings.

## Enable profile regions

1. Sign in to Bilibili in the current browser and open a creator's profile page.
2. Open the extension popup, keep **个人主页属地** (Profile region) enabled, and click **授权主页查询** (Authorize profile queries).
3. Allow access to Bilibili's login endpoint. This creates a device login credential for the currently signed-in account and stores it locally in this browser's extension storage.
4. Once **已授权** (Authorized) appears, the extension queries the current profile. Other creators' profiles are queried by their respective UIDs when you open them.

The viewer's credential is used to request profile data. The label shows the region of **the target account whose profile is open**. Comments continue to show each comment's own region at publication.

**清除本地授权** (Clear local authorization) removes the extension's credential and profile cache. You can revoke the corresponding device login in your Bilibili account settings. Click the authorization button again when the credential expires.

## If a label does not appear

- After updating, reload both the extension and the Bilibili page so that the new page scripts load.
- Comment data must contain a nonempty `reply_control.location` field.
- Profiles require authorization and a `location` tag returned for the target account.
- The two switches independently control comment and profile labels. Clearing authorization removes profile labels.

## Data and permissions

The comment module reads component data and API responses already obtained by the page, without making a separate request for each comment. Profile queries run in the extension background against Bilibili's App profile endpoint and verify the returned UID.

Switches are stored in `chrome.storage.sync`. Login credentials remain in the current browser's local extension storage, with access restricted to trusted extension contexts. Page scripts receive only the target UID and region. Credentials are not inserted into the page DOM or post diagnostic reports.

Profile cache entries are keyed by target UID: nonempty results last 30 minutes, empty results last 5 minutes, and the cache holds at most 200 entries. Reauthorizing or clearing authorization also clears the cache.

Access to Bilibili pages enables label injection. API / App host permissions enable data requests. Permission for the login host is requested only when you click the profile authorization button.

## Post body regions

The popup currently offers API diagnostics for individual posts. Page labels for post bodies and article authors are still being developed.

## Development

Requires Node.js 24 or newer. On Windows, use PowerShell 7 for packaging.

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


