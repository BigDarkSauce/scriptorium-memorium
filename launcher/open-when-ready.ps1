# Opens Scriptorium Memorium in the default browser as soon as the local server answers.
# Started in the background by "Launch Scriptorium.bat" just before the server itself; probes the address for up to
# -Seconds (default 10). Any HTTP answer, even an error status, means the server is up.
param([string]$Url = 'http://localhost:8000/', [int]$Seconds = 10)
$deadline = [DateTime]::Now.AddSeconds($Seconds)
$ready = $false
while (-not $ready -and [DateTime]::Now -lt $deadline) {
  try {
    $req = [System.Net.HttpWebRequest]::Create($Url)
    $req.Proxy = $null; $req.Timeout = 1500; $req.Method = 'GET'
    $res = $req.GetResponse(); $res.Close(); $ready = $true
  } catch [System.Net.WebException] {
    if ($_.Exception.Response) { $_.Exception.Response.Close(); $ready = $true } else { Start-Sleep -Milliseconds 250 }
  } catch {
    Start-Sleep -Milliseconds 250
  }
}
if (-not $ready) { Write-Host "No answer from $Url after $Seconds s; opening it anyway (reload the page once the server runs)." }
Start-Process $Url
