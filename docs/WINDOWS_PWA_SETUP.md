# Windows setup and PWA

## pnpm is not recognized

The repository pins pnpm 11.25.0. It requires Node 22.13 or newer; the supported
project lines are Node 22 and 24. The Codex terminal can have a bundled pnpm on
its private PATH even when a normal PowerShell cannot find it.

Check in a new PowerShell:

```powershell
node --version
Get-Command pnpm
pnpm --version
```

On this machine, Node 22.23.3 is installed/selected with the existing NVM for
Windows. pnpm 11.25.0 is installed under `%APPDATA%\npm`, which is in User PATH.
Close and reopen the terminal after installation. If Windows Terminal still
inherits an older environment, refresh only this terminal's PATH:

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
pnpm --version
```

For another Windows machine, first install a supported Node release, then install
the pinned pnpm in the user's directory, without editing machine PATH:

```powershell
$taskBin = Join-Path $env:APPDATA 'npm'
npm.cmd install --global --prefix $taskBin pnpm@11.25.0
if ($LASTEXITCODE -ne 0) { throw 'pnpm installation failed' }
$taskUserPath = [Environment]::GetEnvironmentVariable('Path','User')
$taskParts = @($taskUserPath -split ';' | Where-Object { $_ })
if (-not ($taskParts | Where-Object { $_.TrimEnd('\') -ieq $taskBin.TrimEnd('\') })) {
  [Environment]::SetEnvironmentVariable('Path', (($taskParts + $taskBin) -join ';'), 'User')
}
$env:Path = $taskBin + ';' + $env:Path
pnpm --version
```

If execution policy blocks `pnpm.ps1`, use `pnpm.cmd` for the commands below;
do not disable execution policy globally.

## Local production PWA

Stop the development server first. In the project directory, using the existing
ignored `.env.local` configuration:

```powershell
pnpm build
pnpm start --hostname 127.0.0.1 --port 3101
```

Keep the terminal running. Open `http://127.0.0.1:3101/` in external Chrome;
install with the address-bar install button or Chrome's install-page menu.
Service workers only register in production, so `pnpm dev` cannot verify cold
offline recovery. Do not run `build:e2e` to prepare the real app: it deliberately
builds with empty public Supabase configuration.

Loopback can exercise the public install/offline shell. Production authentication
uses Secure cookies; verify the actual two-account flow over HTTPS, particularly
on iOS WebKit. Do not weaken cookies to make HTTP work.

## Phone acceptance

Deploy using [the Vercel guide](DEPLOYMENT.md) first. `127.0.0.1` on a phone is
the phone itself; a plain HTTP LAN address is not a secure PWA origin.

1. Open the stable HTTPS address in iPhone Safari / Android Chrome.
2. iPhone: Share → Add to Home Screen; enable Open as Web App if offered.
   Android: Chrome menu → Install and create shortcut → Install.
3. Launch from the installed icon; sign in and open Home, Board and Whiteboard
   online. Allow the public assets to finish downloading.
4. Enable airplane mode and turn Wi-Fi off. Close and reopen the installed app;
   choose **Mở bản đã lưu**. Recent content should be available; create a note
   and doodle locally.
5. Reconnect. Identity must be confirmed before queued writes sync. The partner
   should see the new content; conflicting versions must be shown explicitly.
6. Test logout/account switch only after drafts have synced or been exported;
   cached content from the previous account must not become visible.

Private media is not cached by the service worker. Photo/voice upload needs the
server Secret key. Background push needs its separate VAPID/dispatcher setup;
installing the PWA alone does not enable it.

References: [Node 22 releases](https://nodejs.org/download/release/latest-v22.x/),
[pnpm installation](https://pnpm.io/installation/),
[Chrome web apps](https://support.google.com/chrome/answer/9658361),
[Apple Home Screen web apps](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios).
