@echo off
setlocal EnableDelayedExpansion

REM === Discord Music Bot Setup Wizard ===
title Discord Music Bot - Setup Wizard
echo ===============================
echo Discord Music Bot - Setup Wizard
echo ===============================
echo.

REM Locate config paths relative to this script
set SCRIPT_DIR=%~dp0
set CONFIG_PATH=%SCRIPT_DIR%config.json
set EXAMPLE_PATH=%SCRIPT_DIR%config.json.example

REM If config.json does not exist, seed from example
if not exist "%CONFIG_PATH%" (
  if exist "%EXAMPLE_PATH%" (
    echo Seeding config.json from config.json.example...
    copy /Y "%EXAMPLE_PATH%" "%CONFIG_PATH%" >nul
  ) else (
    echo {}>"%CONFIG_PATH%"
  )
)

REM Use PowerShell to read/modify JSON interactively
powershell -NoProfile -ExecutionPolicy Bypass -Command "
  $cfgPath = [IO.Path]::Combine($PWD, 'config.json');
  try {
    $cfg = Get-Content -Raw -Path $cfgPath | ConvertFrom-Json
  } catch {
    $cfg = [pscustomobject]@{}
  }

  if (-not $cfg.youtube) { $cfg | Add-Member -NotePropertyName youtube -NotePropertyValue ([pscustomobject]@{ apiKey = '' }) }
  if (-not $cfg.customization) { $cfg | Add-Member -NotePropertyName customization -NotePropertyValue ([pscustomobject]@{ embedTitle='🎵 Music Player'; embedColor='#0099ff'; embedThumbnail=''; embedImage=''; embedFooterText=''; embedFooterIcon='' }) }

  function PromptValue($name, $current, $required=$false) {
    if ($null -ne $current -and $current -ne '' -and $current -notin @('YOUR_BOT_TOKEN','YOUR_CLIENT_ID','YOUR_YOUTUBE_API_KEY')) {
      $ans = Read-Host "Value '$name' is currently '$current'. Change it? (y/N)"
      if ($ans -match '^(y|Y)$') { return Read-Host "Enter new value for '$name'" } else { return $current }
    } else {
      while ($true) {
        $val = Read-Host "Enter value for '$name'"
        if ($required -and [string]::IsNullOrWhiteSpace($val)) { Write-Host "This value is required." -ForegroundColor Red; continue } else { return $val }
      }
    }
  }

  # Required
  $cfg.token     = PromptValue 'token (Discord bot token)' $cfg.token $true
  $cfg.clientId  = PromptValue 'clientId (Application Client ID)' $cfg.clientId $true

  # Optional core
  $cfg.allowedGuildId         = PromptValue 'allowedGuildId (limit bot to one server; empty = disabled)' $cfg.allowedGuildId $false
  $cfg.autoJoinVoiceChannelId = PromptValue 'autoJoinVoiceChannelId (voice channel ID for auto-join; empty = disabled)' $cfg.autoJoinVoiceChannelId $false
  $cfg.autoSendChannelId      = PromptValue 'autoSendChannelId (text channel ID for auto panel; empty = disabled)' $cfg.autoSendChannelId $false

  # Player settings
  $defVol = if ($cfg.defaultVolume) { $cfg.defaultVolume } else { 0.5 }
  $volStr = PromptValue 'defaultVolume (0.0–1.0)' $defVol $false
  try { $cfg.defaultVolume = [double]$volStr } catch { $cfg.defaultVolume = 0.5 }

  $mq = if ($cfg.maxQueueSize) { $cfg.maxQueueSize } else { 100 }
  $mqStr = PromptValue 'maxQueueSize' $mq $false
  try { $cfg.maxQueueSize = [int]$mqStr } catch { $cfg.maxQueueSize = 100 }

  $loEmpty = if ($cfg.leaveOnEmpty -ne $null) { $cfg.leaveOnEmpty } else { $true }
  $loAns = PromptValue 'leaveOnEmpty (true/false)' $loEmpty $false
  try { $cfg.leaveOnEmpty = [bool]::Parse($loAns) } catch { $cfg.leaveOnEmpty = $true }

  $loDelay = if ($cfg.leaveOnEmptyDelay) { $cfg.leaveOnEmptyDelay } else { 600000 }
  $loDelayStr = PromptValue 'leaveOnEmptyDelay (ms)' $loDelay $false
  try { $cfg.leaveOnEmptyDelay = [int]$loDelayStr } catch { $cfg.leaveOnEmptyDelay = 600000 }

  # YouTube API (optional)
  $cfg.youtube.apiKey = PromptValue 'youtube.apiKey (optional)' $cfg.youtube.apiKey $false

  # Embed customization (optional)
  $cfg.customization.embedTitle      = PromptValue 'customization.embedTitle' $cfg.customization.embedTitle $false
  $cfg.customization.embedColor      = PromptValue 'customization.embedColor (hex e.g. #0099ff)' $cfg.customization.embedColor $false
  $cfg.customization.embedThumbnail  = PromptValue 'customization.embedThumbnail (URL)' $cfg.customization.embedThumbnail $false
  $cfg.customization.embedImage      = PromptValue 'customization.embedImage (URL)' $cfg.customization.embedImage $false
  $cfg.customization.embedFooterText = PromptValue 'customization.embedFooterText' $cfg.customization.embedFooterText $false
  $cfg.customization.embedFooterIcon = PromptValue 'customization.embedFooterIcon (URL)' $cfg.customization.embedFooterIcon $false

  # Save
  $json = $cfg | ConvertTo-Json -Depth 6
  Set-Content -Path $cfgPath -Value $json -Encoding UTF8
  Write-Host "\n✅ Configuration saved to $cfgPath" -ForegroundColor Green
"

echo.
echo Done. Start the bot with: start.bat
endlocal