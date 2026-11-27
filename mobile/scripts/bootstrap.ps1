$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
  throw "Flutter stable SDK is required. Install Flutter, then rerun this script."
}
flutter create --platforms=android,windows,macos --org ai.mina --project-name mina_companion .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
flutter pub get
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
flutter analyze --fatal-infos
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
flutter test
exit $LASTEXITCODE
