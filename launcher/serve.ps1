# Minimal static file server for Scriptorium Memorium (used when no working Python is installed).
param([int]$Port = 8000, [string]$Root = (Split-Path -Parent $PSScriptRoot))
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8';
  '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.md'='text/markdown; charset=utf-8';
  '.png'='image/png'; '.ico'='image/x-icon'; '.svg'='image/svg+xml'; '.pdf'='application/pdf'; '.txt'='text/plain; charset=utf-8';
  '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.webp'='image/webp'; '.woff2'='font/woff2'; '.wasm'='application/wasm' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
try { $l.Start() } catch { Write-Host "Could not start the server on port ${Port}: $($_.Exception.Message)"; exit 1 }
Write-Host "Scriptorium Memorium is running at http://localhost:$Port  (close this window to stop)"
# the folder check compares against the root WITH its trailing separator: without it, a request like
# /../scriptorium-memorium-old/x resolves to a sibling folder sharing the root's name as a prefix and would pass.
# Windows paths are case-insensitive, so the comparison is too.
$rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
while ($l.IsListening) {
  $c = $l.GetContext()
  # one request at a time; a browser that cancels a request must not stop the server
  try {
    $p = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath)
    if ($p -eq '/') { $p = '/index.html' }
    $full = [IO.Path]::GetFullPath((Join-Path $Root ($p.TrimStart('/') -replace '/', '\')))
    if ($full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path $full -PathType Leaf)) {
      $b = [IO.File]::ReadAllBytes($full); $ext = [IO.Path]::GetExtension($full).ToLower()
      $c.Response.ContentType = $(if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' })
      $c.Response.ContentLength64 = $b.Length
      if ($c.Request.HttpMethod -ne 'HEAD') { $c.Response.OutputStream.Write($b, 0, $b.Length) }
    } else { $c.Response.StatusCode = 404 }
  } catch { } finally { try { $c.Response.Close() } catch { } }
}
