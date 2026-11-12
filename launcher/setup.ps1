# Scriptorium Memorialium: one-time setup on Windows (run "Setup Scriptorium.bat" in the project folder).
# Each step asks first and can be skipped; running it again is harmless (what is done is recognised and skipped).
#   1. shortcuts (Desktop and this folder)
#   2. the Scriptorium free-models extension for Claude Desktop (free AI models inside the Claude app, keys kept on this
#      computer): opens bridge\Scriptorium free models.mcpb, Claude Desktop shows its Install button
#   3. FreeLLMAPI (github.com/tashfeenahmed/freellmapi, MIT): 34 free AI providers behind one key; downloads the latest
#      Windows installer from its GitHub releases and runs it
#   4. the free keys: opens the sign-up pages of the providers with the largest free tiers, and FreeLLMAPI's Keys page
#      (each key is pasted there once; Scriptorium then finds FreeLLMAPI and its key by itself)
#   5. opens Scriptorium (in the Claude app, or on this computer)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$ARTIFACT = 'https://claude.ai/artifact/QpCmKYRujhaHzeq4eY2rie'
function Ask($q) { $a = Read-Host "$q [Y/n]"; return ($a -eq '' -or $a -match '^[yY]') }
function Step($n, $t) { Write-Host ''; Write-Host "== $n. $t ==" -ForegroundColor Yellow }
function Up($port) { try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:$port/v1/models"; return $true } catch { return ($_.Exception.Response -ne $null) } }

Write-Host 'Scriptorium Memorialium - setup' -ForegroundColor Cyan
Write-Host "Folder: $root"

Step 1 'Shortcuts'
try { & (Join-Path $PSScriptRoot 'make-shortcuts.ps1'); Write-Host 'Shortcuts ready (Desktop and this folder).' } catch { Write-Host "Skipped: $($_.Exception.Message)" }

Step 2 'The Scriptorium free-models extension for Claude Desktop'
$mcpb = Join-Path $root 'bridge\Scriptorium free models.mcpb'
$claude = @("$env:LOCALAPPDATA\AnthropicClaude\claude.exe", "$env:LOCALAPPDATA\Programs\Claude\Claude.exe", "$env:LOCALAPPDATA\Programs\claude-desktop\Claude.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
$have = Test-Path (Join-Path $env:USERPROFILE '.scriptorium')
if (-not $claude) { Write-Host 'Claude Desktop was not found. Install it from https://claude.ai/download, then run this setup again (the extension lets the free models work inside the Claude app).' }
elseif (Ask 'Open the extension in Claude Desktop now? (Claude Desktop then shows an Install button: press it)') {
  Start-Process -FilePath $mcpb
  Write-Host 'Opened. In Claude Desktop press Install. (If no window appears: Settings > Extensions, drag this file in:)'
  Write-Host "  $mcpb"
  Read-Host 'Press Enter once it is installed'
}

Step 3 'FreeLLMAPI: 34 free AI providers behind one key'
$fdir = Join-Path $env:APPDATA 'FreeLLMAPI'
if ((Up 31415) -or (Up 3001)) { Write-Host 'FreeLLMAPI is running on this computer.' }
elseif (Test-Path $fdir) { Write-Host 'FreeLLMAPI is installed but not running: start it from the Start menu (it lives in the tray).' }
elseif (Ask 'Download and install FreeLLMAPI (free, open source, from its GitHub releases)?') {
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $rel = Invoke-RestMethod -UseBasicParsing 'https://api.github.com/repos/tashfeenahmed/freellmapi/releases/latest' -Headers @{ 'User-Agent' = 'scriptorium-setup' }
    $asset = $rel.assets | Where-Object { $_.name -match '\.exe$' -and $_.name -notmatch 'blockmap' } | Sort-Object { if ($_.name -match '(?i)setup|win') { 0 } else { 1 } } | Select-Object -First 1
    if (-not $asset) { throw 'no Windows installer in the latest release' }
    $dest = Join-Path ([Environment]::GetFolderPath('UserProfile')) ('Downloads\' + $asset.name)
    Write-Host "Downloading $($asset.name) ($([math]::Round($asset.size / 1MB)) MB) from $($rel.tag_name)..."
    Invoke-WebRequest -UseBasicParsing $asset.browser_download_url -OutFile $dest
    Write-Host 'Running the installer (Windows may ask you to confirm)...'
    Start-Process -FilePath $dest -Wait
    Write-Host 'Installed. Open FreeLLMAPI once from the Start menu if it did not start by itself.'
  } catch { Write-Host "Could not install it from here ($($_.Exception.Message)). Opening its releases page: download the Windows .exe and run it."; Start-Process 'https://github.com/tashfeenahmed/freellmapi/releases/latest' }
}

Step 4 'Free keys (one free account per provider; no card for these)'
$keys = [ordered]@{
  'Google AI Studio (Gemini: the strongest free models)' = 'https://aistudio.google.com/apikey'
  'Groq (very fast)' = 'https://console.groq.com/keys'
  'Cerebras (very fast, ~1M tokens a day)' = 'https://cloud.cerebras.ai/'
  'NVIDIA NIM (many large open models)' = 'https://build.nvidia.com/'
  'Mistral (free Experiment plan)' = 'https://console.mistral.ai/api-keys'
  'OpenRouter (free models)' = 'https://openrouter.ai/keys'
  'Cloudflare Workers AI (account id:token; also images, speech, transcription)' = 'https://dash.cloudflare.com/profile/api-tokens'
  'Speechify (text to speech)' = 'https://speechify.ai/api'
  'Cohere (trial key)' = 'https://dashboard.cohere.com/api-keys'
  'Z.ai (GLM Flash)' = 'https://z.ai/manage-apikey/apikey-list'
  'Hugging Face (router credit)' = 'https://huggingface.co/settings/tokens'
}
$keys.GetEnumerator() | ForEach-Object { Write-Host ("  - {0}: {1}" -f $_.Key, $_.Value) }
Write-Host '  The full list of 34 providers and what each gives: https://freellmapi.co/models.html'
if (Ask 'Open these sign-up pages now (one browser tab each)?') { $keys.Values | ForEach-Object { Start-Process $_; Start-Sleep -Milliseconds 400 } }
$port = $null; foreach ($p in 31415, 3001) { if (Up $p) { $port = $p; break } }
if ($port) { if (Ask "Open FreeLLMAPI's dashboard to paste the keys (Keys page)?") { Start-Process "http://127.0.0.1:$port/" } }
else { Write-Host "When FreeLLMAPI runs, open its dashboard (http://127.0.0.1:31415 for the desktop app) and paste each key on its Keys page." }
Write-Host 'Without FreeLLMAPI, keys can also go straight into Scriptorium: the AI engine button (the sparkle), each provider row.'

Step 5 'Open Scriptorium'
Write-Host '  C = in the Claude app (Claude + free models together; needs the extension from step 2)'
Write-Host '  L = on this computer (free models only; Launch Scriptorium.bat, with the AI relay)'
$c = Read-Host 'Open it now? [C/L/n]'
if ($c -match '^[cC]') { Start-Process $ARTIFACT }
elseif ($c -match '^[lL]') { Start-Process -FilePath (Join-Path $root 'Launch Scriptorium.bat') -WorkingDirectory $root }
Write-Host ''
Write-Host 'Done. The guide: docs\SETUP-GUIDE.md' -ForegroundColor Cyan
Read-Host 'Press Enter to close'
