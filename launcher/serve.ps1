# Minimal static file server for Scriptorium Memorium (used when Python is not installed).
param([int]$Port = 8000, [string]$Root = (Split-Path -Parent $PSScriptRoot))
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8';
  '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.md'='text/markdown; charset=utf-8';
  '.png'='image/png'; '.ico'='image/x-icon'; '.svg'='image/svg+xml'; '.pdf'='application/pdf'; '.txt'='text/plain; charset=utf-8' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Scriptorium Memorium is running at http://localhost:$Port  (close this window to stop)"
while ($l.IsListening) {
  $c = $l.GetContext(); $p = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath)
  if ($p -eq '/') { $p = '/index.html' }
  $f = Join-Path $Root ($p.TrimStart('/') -replace '/', '\')
  $full = [IO.Path]::GetFullPath($f)
  if ($full.StartsWith([IO.Path]::GetFullPath($Root)) -and (Test-Path $full -PathType Leaf)) {
    $b = [IO.File]::ReadAllBytes($full); $ext = [IO.Path]::GetExtension($full).ToLower()
    $c.Response.ContentType = $(if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' })
    $c.Response.ContentLength64 = $b.Length; $c.Response.OutputStream.Write($b, 0, $b.Length)
  } else { $c.Response.StatusCode = 404 }
  $c.Response.Close()
}
