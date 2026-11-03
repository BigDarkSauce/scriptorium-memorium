# Creates "Scriptorium Memorium.lnk" (with the scroll icon) in the project folder and on the Desktop.
$root = Split-Path -Parent $PSScriptRoot
$ico  = Join-Path $root 'assets\scriptorium.ico'
$bat  = Join-Path $root 'Launch Scriptorium.bat'
$sh = New-Object -ComObject WScript.Shell
foreach ($dir in @($root, [Environment]::GetFolderPath('Desktop'))) {
  $lnk = $sh.CreateShortcut((Join-Path $dir 'Scriptorium Memorium.lnk'))
  $lnk.TargetPath = $bat; $lnk.WorkingDirectory = $root; $lnk.IconLocation = "$ico,0"
  $lnk.WindowStyle = 7; $lnk.Description = 'Open the Scriptorium Memorium library'
  $lnk.Save()
}
Write-Host 'Shortcuts created.'
