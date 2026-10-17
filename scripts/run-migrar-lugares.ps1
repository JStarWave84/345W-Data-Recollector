$ErrorActionPreference = 'Stop'
$svc = supabase projects api-keys --project-ref sgyekoxqbfvhovkiulny 2>&1 | Out-String
$service = ($svc -split "`n" | Where-Object { $_ -match '^\s*service_role' } | Select-Object -First 1) -replace '.*\|\s*','' -replace '\s+$',''

if (-not $service -or $service -notmatch '^ey') { throw "no se pudo leer service_role" }

$env:SB_SERVICE_ROLE = $service.Trim()
"  service_role leida ($($service.Trim().Length) chars)"

$raiz = Split-Path -Parent $PSScriptRoot
Push-Location $raiz
try {
  node "$raiz\scripts\migrar-lugares.mjs" @args
  $codigo = $LASTEXITCODE
} finally {
  Pop-Location
}

Remove-Item Env:\SB_SERVICE_ROLE -ErrorAction SilentlyContinue
"`n  claves retiradas del entorno del proceso"
exit $codigo