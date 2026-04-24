Param(
  [string]$ProjectRoot = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$DesktopPath = [Environment]::GetFolderPath('Desktop')
$ShortcutName = 'Flash Castelo - Sistema Interno.lnk'
$ShortcutPath = Join-Path $DesktopPath $ShortcutName
$TargetPath = Join-Path $ProjectRoot 'iniciar_sistema_flashcastelo.bat'
$IconPngPath = Join-Path $ProjectRoot 'logo.png'
$IconIcoPath = Join-Path $ProjectRoot 'logo.ico'

if (!(Test-Path $TargetPath)) {
  throw "Arquivo nao encontrado: $TargetPath"
}

if (!(Test-Path $IconPngPath)) {
  throw "Arquivo nao encontrado: $IconPngPath"
}

if (!(Test-Path $IconIcoPath)) {
  $magick = Get-Command magick -ErrorAction SilentlyContinue
  $convert = Get-Command convert -ErrorAction SilentlyContinue

  if ($magick) {
    & $magick.Source $IconPngPath -define icon:auto-resize=16,24,32,48,64,128,256 $IconIcoPath
  } elseif ($convert) {
    & $convert.Source $IconPngPath -define icon:auto-resize=16,24,32,48,64,128,256 $IconIcoPath
  }
}

if (!(Test-Path $IconIcoPath)) {
  throw "Nao foi possivel gerar o icone .ico a partir da logo.png"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($ShortcutPath)
$shortcut.TargetPath = $TargetPath
$shortcut.WorkingDirectory = $ProjectRoot
$shortcut.WindowStyle = 1
$shortcut.Description = 'Inicia API da maquininha, backend fiscal e abre o sistema local.'
$shortcut.IconLocation = "$IconIcoPath,0"
$shortcut.Save()

Copy-Item -Path $IconPngPath -Destination (Join-Path $DesktopPath 'logo.png') -Force

Write-Output "ATALHO_OK:$ShortcutPath"
