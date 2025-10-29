# Discord Music Bot

A modern Discord music bot with YouTube integration and an embed-based control panel with buttons. This version is cleaned of server-specific settings and prepared for easy sharing and running.

## Features
- Play music from YouTube (URL or search)
- Control via embed buttons (play/pause/skip/stop)
- Manage a song queue
- Auto-disconnect when the channel is empty
- Download songs to MP3 via DM (yt-dlp)
  
Removed text command fallback; control only via `/music` and buttons

## Requirements
- Node.js `>=22.12.0` (recommended)
- FFmpeg (audio processing)
- yt-dlp (for MP3 download and reliable audio stream)
- Discord bot token and Client ID

## Installation
1) Clone the repository and go to the `Repo` folder.

```bash
npm install
```

2) Configure settings:
- Run `setup.bat` in the `Repo` folder for interactive configuration, or manually create `config.json` from `config.json.example` and fill in values.
- Required: `token`, `clientId`
- Optional: `allowedGuildId`, `autoJoinVoiceChannelId`, `autoSendChannelId`, `youtube.apiKey`, `customization.*`

3) Install FFmpeg:
- Windows: download from the official site and add to PATH
- Linux: `sudo apt install ffmpeg`
- macOS: `brew install ffmpeg`

4) Install yt-dlp:
- Windows: `winget install yt-dlp` or download the binary from GitHub Releases and add to PATH
- Linux/macOS: `pip install yt-dlp` or use your package manager

## Run
```bash
npm run start
```
On startup:
- If `allowedGuildId` is set, `/music` is registered to that server.
- If not set, `/music` is registered globally (propagation can take up to 1 hour).

## Invite the bot to a server
- Create a URL with scopes: `bot` and `applications.commands`
- Minimum permissions: `Connect`, `Speak`, `Read Messages`, `Send Messages`

## Configuration Overview
- `token` – Discord bot token
- `clientId` – Application Client ID
- `defaultVolume` – default volume 0.0–1.0 (e.g., `0.5`)
- `maxQueueSize` – maximum queue length
- `leaveOnEmpty` – disconnect when the channel is empty
- `leaveOnEmptyDelay` – disconnect delay in ms
- `allowedGuildId` – optional restriction to a specific server
- `autoJoinVoiceChannelId` – optionally auto-join a voice channel
- `autoSendChannelId` – optionally auto-insert the control panel
- `youtube.apiKey` – optional; for metadata via YouTube Data API (otherwise a scraping library is used)

## Tips & Troubleshooting
- If yt-dlp reports playback errors, ensure it’s up to date and available in PATH. Alternatively use `python -m yt_dlp` by installing via `pip`.
- Global slash commands can take time to appear. For immediate availability, set `allowedGuildId` to register `/music` directly to your server.
- On Windows, installing `sodium` may rely on Visual Studio Build Tools; alternatively `libsodium-wrappers` is sufficient.

## License
MIT
