# Exercise the real Windows HTTP fallback without making any external API calls.
$ErrorActionPreference = 'Stop'

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw "Assertion failed: $Message" }
}

function Invoke-SmokeRequest {
  param(
    [Parameter(Mandatory)][string]$Path,
    [string]$Method = 'GET',
    [string]$Body,
    [string]$ContentType = 'application/json',
    [hashtable]$Headers = @{}
  )
  $params = @{
    Uri = "$script:BaseUrl$Path"
    Method = $Method
    Headers = $Headers
    TimeoutSec = 8
    SkipHttpErrorCheck = $true
  }
  if ($PSBoundParameters.ContainsKey('Body')) {
    $params.Body = $Body
    $params.ContentType = $ContentType
  }
  Invoke-WebRequest @params
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$serverScript = Join-Path $repoRoot 'launcher/serve.ps1'
$pwsh = (Get-Command pwsh -ErrorAction Stop).Source
$dummyKey = 'sk-scriptorium-offline-smoke-not-a-real-key'
$testModel = 'scriptorium-offline-smoke-model'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('scriptorium-ps-smoke-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
$stdout = Join-Path $tempRoot 'server.stdout.log'
$stderr = Join-Path $tempRoot 'server.stderr.log'

$previousKey = [Environment]::GetEnvironmentVariable('OPENAI_API_KEY', 'Process')
$previousModel = [Environment]::GetEnvironmentVariable('OPENAI_MODEL', 'Process')
$serverProcess = $null
$tcp = $null

try {
  # Reserve an available loopback port, then release it before the child listener binds.
  $tcp = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $tcp.Start()
  $port = ([Net.IPEndPoint]$tcp.LocalEndpoint).Port
  $tcp.Stop()
  $tcp = $null

  $env:OPENAI_API_KEY = $dummyKey
  $env:OPENAI_MODEL = $testModel
  $script:BaseUrl = "http://localhost:$port"

  $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Port {1} -Root "{2}"' -f $serverScript, $port, $repoRoot
  $serverProcess = Start-Process -FilePath $pwsh -ArgumentList $arguments -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr

  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if ($serverProcess.HasExited) {
      $out = if (Test-Path $stdout) { Get-Content $stdout -Raw } else { '' }
      $err = if (Test-Path $stderr) { Get-Content $stderr -Raw } else { '' }
      throw ("The PowerShell server exited before becoming ready." + [Environment]::NewLine + "STDOUT:" + [Environment]::NewLine + $out + [Environment]::NewLine + "STDERR:" + [Environment]::NewLine + $err)
    }
    try {
      $probe = Invoke-SmokeRequest -Path '/'
      if ([int]$probe.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 250
  }
  Assert-True $ready 'the PowerShell fallback server must bind and serve the application on localhost'

  $homeResponse = Invoke-SmokeRequest -Path '/'
  Assert-True ([int]$homeResponse.StatusCode -eq 200) 'GET / must serve index.html'
  Assert-True ($homeResponse.Content -match '<title>Scriptorium Memorialium</title>') 'the root response must be the Scriptorium application document'

  $asset = Invoke-SmokeRequest -Path '/css/app.css'
  Assert-True ([int]$asset.StatusCode -eq 200) 'GET /css/app.css must serve a static asset'
  $assetContentType = [string](@($asset.Headers['Content-Type'])[0])
  Assert-True ($assetContentType -like 'text/css*') 'CSS assets must have a CSS content type'

  $relay = Invoke-SmokeRequest -Path '/__relay/info'
  Assert-True ([int]$relay.StatusCode -eq 200) 'GET /__relay/info must succeed'
  $relayVersion = [string](@($relay.Headers['X-Scriptorium-Relay'])[0])
  Assert-True ($relayVersion -eq '1.0.0') 'the relay discovery header must be present'
  $relayInfo = $relay.Content | ConvertFrom-Json
  Assert-True ($relayInfo.name -eq 'scriptorium-relay') 'the relay discovery endpoint must identify the local relay'

  $info = Invoke-SmokeRequest -Path '/__openai/info'
  Assert-True ([int]$info.StatusCode -eq 200) 'GET /__openai/info must succeed when the server has an environment key'
  $openaiInfo = $info.Content | ConvertFrom-Json
  Assert-True ($openaiInfo.configured -eq $true) 'the info route must report that the server environment is configured'
  Assert-True ($openaiInfo.model -eq $testModel) 'the info route must report the configured model'
  Assert-True ($openaiInfo.keyLocation -eq 'server environment') 'the info route must identify server-side key storage'
  Assert-True (-not $info.Content.Contains($dummyKey)) 'the info route must never disclose the API key'

  $models = Invoke-SmokeRequest -Path '/__openai/v1/models'
  Assert-True ([int]$models.StatusCode -eq 200) 'GET /__openai/v1/models must return the configured model'
  $modelList = $models.Content | ConvertFrom-Json
  Assert-True ($modelList.data.Count -eq 1 -and $modelList.data[0].id -eq $testModel) 'the model route must expose exactly the configured model'
  Assert-True (-not $models.Content.Contains($dummyKey)) 'the model route must never disclose the API key'

  $badOrigin = Invoke-SmokeRequest -Path '/__openai/info' -Headers @{ Origin = 'http://untrusted.example' }
  Assert-True ([int]$badOrigin.StatusCode -eq 403) 'the OpenAI routes must reject a cross-origin browser request'

  $malformed = Invoke-SmokeRequest -Path '/__openai/v1/responses' -Method 'POST' -Body '{}' -ContentType 'application/json'
  Assert-True ([int]$malformed.StatusCode -eq 400) 'a malformed Responses API request must be rejected locally before any upstream request'

  $missing = Invoke-SmokeRequest -Path '/__scriptorium-smoke-file-that-does-not-exist'
  Assert-True ([int]$missing.StatusCode -eq 404) 'unknown static paths must return 404'

  Write-Host 'PASS Windows PowerShell server runtime: static files, MIME, relay discovery, OpenAI info/models, key secrecy, same-origin guard, malformed payload rejection, and 404 handling.'
  Write-Host 'No external AI provider was contacted; the configured key was a disposable dummy value.'
}
finally {
  if ($tcp) { try { $tcp.Stop() } catch { } }
  if ($serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    try { $serverProcess.WaitForExit(5000) | Out-Null } catch { }
  }
  [Environment]::SetEnvironmentVariable('OPENAI_API_KEY', $previousKey, 'Process')
  [Environment]::SetEnvironmentVariable('OPENAI_MODEL', $previousModel, 'Process')
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
