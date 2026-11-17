param([string]$BackupPath, [string]$PoolerUser)

# Compatibility entry point: migrations were committed; never apply them again.
$ErrorActionPreference = 'Stop'
Write-Warning '015/016/017 ja foram aplicadas. Executando SOMENTE verificacoes READ-ONLY.'
& (Join-Path $PSScriptRoot 'verify-unified-production.ps1') -PoolerUser $PoolerUser
exit $LASTEXITCODE
