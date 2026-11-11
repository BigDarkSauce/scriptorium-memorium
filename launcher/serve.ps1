# Scriptorium Memorialium's local server when no working Python is installed: the app's files, plus the AI relay
# (the same as launcher/serve.py: GET /__relay/info, GET|POST /__relay/fetch?u=<url> forwards LLM API requests that a
# web page may not make itself: FreeLLMAPI on this computer, NVIDIA NIM, GitHub Models, Cloudflare, SambaNova).
# Requests are served in parallel (a runspace pool), so a long AI answer never holds up the app's own files.
param([int]$Port = 8000, [string]$Root = (Split-Path -Parent $PSScriptRoot))
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
try { $l.Start() } catch { Write-Host "Could not start the server on port ${Port}: $($_.Exception.Message)"; exit 1 }
Write-Host "Scriptorium Memorialium is running at http://localhost:$Port  (with the AI relay; close this window to stop)"
$rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar

$handler = {
  param($c, $Root, $rootFull)
  $types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8';
    '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.md'='text/markdown; charset=utf-8';
    '.png'='image/png'; '.ico'='image/x-icon'; '.svg'='image/svg+xml'; '.pdf'='application/pdf'; '.txt'='text/plain; charset=utf-8';
    '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.webp'='image/webp'; '.woff2'='font/woff2'; '.wasm'='application/wasm'; '.mcpb'='application/octet-stream' }
  try {
    $req = $c.Request; $res = $c.Response; $p = [Uri]::UnescapeDataString($req.Url.AbsolutePath); $res.AddHeader('X-Scriptorium-Relay', '1.0.0')   # the page checks this on a HEAD of itself
    if ($p -eq '/__relay/info') {
      $b = [Text.Encoding]::UTF8.GetBytes('{"name":"scriptorium-relay","version":"1.0.0"}'); $res.ContentType = 'application/json'; $res.ContentLength64 = $b.Length; $res.OutputStream.Write($b, 0, $b.Length); return
    }
    if ($p -eq '/__relay/freellmapi') {
      # FreeLLMAPI on this computer: its port (its config.json; desktop app 31415, Docker or npm 3001) and its unified key
      # (freellmapi- + 48 hex in its local database; the one the server accepts is the live one)
      $d = Join-Path $env:APPDATA 'FreeLLMAPI'; $ports = @(); try { $ports += [int]((Get-Content (Join-Path $d 'config.json') -Raw | ConvertFrom-Json).port) } catch { }; $ports += 31415, 3001
      $base = $null; foreach ($pt in ($ports | Where-Object { $_ } | Select-Object -Unique)) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:$pt/v1/models" | Out-Null; $base = "http://127.0.0.1:$pt/v1"; break } catch { if ($_.Exception.Response) { $base = "http://127.0.0.1:$pt/v1"; break } } }
      $o = @{ found = [bool]$base }
      if ($base) { $o.base = $base; $c = @(); foreach ($f in 'freeapi.db-wal', 'freeapi.db') { try { $t = [Text.Encoding]::GetEncoding(28591).GetString([IO.File]::ReadAllBytes((Join-Path $d $f))); $c += ([regex]::Matches($t, 'freellmapi-[0-9a-f]{48}') | ForEach-Object { $_.Value }) } catch { } }
        foreach ($k in ($c | Select-Object -Unique)) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Headers @{ Authorization = "Bearer $k" } "$base/usage" | Out-Null; $o.key = $k; break } catch { } }
        $o.keyFound = [bool]$o.key; try { $o.readyModels = @((Invoke-RestMethod -UseBasicParsing -TimeoutSec 4 -Headers @{ Authorization = "Bearer $($o.key)" } "$base/models?execution_status=ready").data).Count } catch { } }
      $b = [Text.Encoding]::UTF8.GetBytes(($o | ConvertTo-Json -Compress)); $res.ContentType = 'application/json'; $res.ContentLength64 = $b.Length; $res.OutputStream.Write($b, 0, $b.Length); return
    }
    if ($p -eq '/__relay/fetch') {
      $u = [Web.HttpUtility]::ParseQueryString($req.Url.Query)['u']; $x = $null
      $ok = [Uri]::TryCreate($u, [UriKind]::Absolute, [ref]$x) -and ((($x.Host -in 'localhost', '127.0.0.1', '::1') -and $x.Scheme -match '^https?$') -or ($x.Scheme -eq 'https' -and $x.AbsolutePath -match '/(models|chat/completions)/?$'))
      if (-not $ok) { $res.StatusCode = 403; return }
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
      $out = [Net.HttpWebRequest]::Create($x); $out.Method = $req.HttpMethod; $out.Timeout = 600000; $out.ReadWriteTimeout = 600000; $out.AllowReadStreamBuffering = $false
      foreach ($h in 'Authorization', 'HTTP-Referer', 'X-Title') { if ($req.Headers[$h]) { $out.Headers[$h] = $req.Headers[$h] } }
      if ($req.Headers['Accept']) { $out.Accept = $req.Headers['Accept'] }   # Accept and Content-Type are restricted headers: set through their properties
      if ($req.ContentType) { $out.ContentType = $req.ContentType }
      if ($req.HasEntityBody) { $s = $out.GetRequestStream(); $req.InputStream.CopyTo($s); $s.Close() }
      try { $r = $out.GetResponse() } catch [Net.WebException] { $r = $_.Exception.Response; if (-not $r) { $res.StatusCode = 502; return } }
      $res.StatusCode = [int]$r.StatusCode; $res.SendChunked = $true
      if ($r.ContentType) { $res.ContentType = $r.ContentType }
      foreach ($h in 'Retry-After', 'x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens', 'x-ratelimit-reset', 'ratelimit-reset') { if ($r.Headers[$h]) { $res.AddHeader($h, $r.Headers[$h]) } }
      $in = $r.GetResponseStream(); $buf = New-Object byte[] 8192
      while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) { $res.OutputStream.Write($buf, 0, $n); $res.OutputStream.Flush() }
      $r.Close(); return
    }
    if ($p -eq '/') { $p = '/index.html' }
    # the folder check compares against the root WITH its trailing separator (a sibling folder sharing the root's name
    # as a prefix must not pass); Windows paths are case-insensitive, so the comparison is too
    $full = [IO.Path]::GetFullPath((Join-Path $Root ($p.TrimStart('/') -replace '/', '\')))
    if ($full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path $full -PathType Leaf)) {
      $b = [IO.File]::ReadAllBytes($full); $ext = [IO.Path]::GetExtension($full).ToLower()
      $res.ContentType = $(if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }); $res.ContentLength64 = $b.Length
      if ($req.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($b, 0, $b.Length) }
    } else { $res.StatusCode = 404 }
  } catch { } finally { try { $c.Response.Close() } catch { } }
}

Add-Type -AssemblyName System.Web
$pool = [RunspaceFactory]::CreateRunspacePool(1, 16); $pool.Open(); $jobs = New-Object System.Collections.ArrayList
while ($l.IsListening) {
  $c = $l.GetContext()
  $ps = [PowerShell]::Create(); $ps.RunspacePool = $pool; [void]$ps.AddScript($handler).AddArgument($c).AddArgument($Root).AddArgument($rootFull)
  [void]$jobs.Add(@{ ps = $ps; h = $ps.BeginInvoke() })
  for ($i = $jobs.Count - 1; $i -ge 0; $i--) { if ($jobs[$i].h.IsCompleted) { try { $jobs[$i].ps.EndInvoke($jobs[$i].h) } catch { }; $jobs[$i].ps.Dispose(); $jobs.RemoveAt($i) } }
}
