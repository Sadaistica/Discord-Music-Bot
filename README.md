# Discord Music Bot

A modern Discord music bot with YouTube integration and an embed-based control panel with buttons. This version is cleaned of server-specific settings and prepared for easy sharing and running.

## Features
- Play music from YouTube (URL or search)
- Control via embed buttons (play/pause/skip/stop)
- Manage a song queue
- Auto-disconnect when the channel is empty
- Download songs to MP3 via DM (yt-dlp)
  
No commands are used; control via embed buttons only

## Requirements
- Node.js `>=22.12.0` (recommended)
- FFmpeg (audio processing)
- yt-dlp (for MP3 download and reliable audio stream)
- Discord bot token and Client ID

## Installation
1) Clone or copy this folder into your workspace.
2) Install dependencies with your preferred Node.js workflow.
3) Configure settings:
- Use the provided `setup.bat` for an interactive setup or create `config.json` from `config.json.example` and fill in your values.
- Required: `token`, `clientId`
- Optional: `allowedGuildId`, `autoJoinVoiceChannelId`, `autoSendChannelId`, `youtube.apiKey`, `customization.*`, `texts.*`
4) Install FFmpeg and ensure it is available on your system PATH.
5) Install yt-dlp and ensure it is available on your system PATH.

## Run
Start the bot with your standard Node.js run command. On startup:
- If `autoSendChannelId` is set, the control panel message is sent/updated in that channel.
- If `autoJoinVoiceChannelId` is set, the bot joins that voice channel.

## Invite the bot to a server
- Create a URL with scope: `bot`
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
- `texts.*` – localization of all user-facing strings (embed labels, buttons, modals, messages, leaderboard)

## Tips & Troubleshooting
- If yt-dlp reports playback errors, ensure it’s up to date and available in PATH. Alternatively use `python -m yt_dlp` by installing via `pip`.
 
- On Windows, installing `sodium` may rely on Visual Studio Build Tools; alternatively `libsodium-wrappers` is sufficient.

## License
MIT
