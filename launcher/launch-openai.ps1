# Ask for an OpenAI key without echoing it, keep it only in this process tree, then launch Scriptorium.
$ErrorActionPreference = 'Stop'
$secure = Read-Host 'Paste your OpenAI API key (input is hidden)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  $env:OPENAI_MODEL = 'gpt-6.2-astra'
  Write-Host ''
  Write-Host 'Starting Scriptorium. The key remains in this local process environment; it is not written to a file.'
  & (Join-Path $PSScriptRoot '..\Launch Scriptorium.bat')
  exit $LASTEXITCODE
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  Remove-Item Env:\OPENAI_API_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:\OPENAI_MODEL -ErrorAction SilentlyContinue
}
