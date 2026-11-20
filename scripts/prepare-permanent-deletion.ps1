param([string]$PoolerUser)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bin = 'C:\Program Files\PostgreSQL\17\bin'
$certificate = 'C:\Users\andre\Downloads\prod-ca-2021.crt'
$run = Join-Path $env:LOCALAPPDATA ('AcampGestor\migration-021-runs\' + [guid]::NewGuid().ToString('N'))
$migration = Join-Path $root 'supabase\sql\021_permanent_deletion.sql'
$status = [ordered]@{ PreflightPassed = $false; BackupVerified = $false; MigrationApplied = $false }
$previous = @{}
foreach ($key in @('PGSSLMODE', 'PGSSLROOTCERT', 'PGCLIENTENCODING', 'PGCONNECT_TIMEOUT')) {
  $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}
try {
  foreach ($file in @("$bin\psql.exe", "$bin\pg_dump.exe", "$bin\pg_restore.exe", $certificate)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Arquivo necessario ausente: $file" }
  }
  if ($env:PGPASSWORD -or $env:PGPASSFILE -or $env:PGSERVICE -or $env:PGSERVICEFILE) {
    throw 'Use terminal sem variaveis alternativas de credenciais/conexao.'
  }
  if (-not $PoolerUser) { $PoolerUser = Read-Host 'Usuario EXATO do Session Pooler (painel Connect)' }
  if ($PoolerUser -cne 'postgres.zuxndxchkeynvjqustxk') { throw 'Projeto incorreto. Confira o usuario no painel Connect.' }
  New-Item -ItemType Directory -Path $run | Out-Null
  $env:PGSSLMODE = 'verify-full'
  $env:PGSSLROOTCERT = $certificate
  $env:PGCLIENTENCODING = 'UTF8'
  $env:PGCONNECT_TIMEOUT = '20'
  $log = Join-Path $run 'preflight.txt'
  $sql = Join-Path $root 'supabase\tests\021_permanent_deletion_preflight.sql'
  $status['MigrationSHA256'] = (Get-FileHash -LiteralPath $migration -Algorithm SHA256).Hash
  $status['PreflightLog'] = $log
  Write-Host '1/2 PREFLIGHT SOMENTE LEITURA. Informe a senha apenas no prompt do psql.'
  $arguments = @('--no-psqlrc', '--host=aws-1-sa-east-1.pooler.supabase.com', '--port=5432',
    "--username=$PoolerUser", '--dbname=postgres', '--password', '--set=ON_ERROR_STOP=1',
    '--set=VERBOSITY=terse', '--no-align', '--tuples-only', '--quiet', '--pset=pager=off',
    '--command', '"set default_transaction_read_only = on"',
    '--output', ('"' + $log + '"'), '--file', ('"' + $sql + '"'))
  $process = Start-Process -FilePath "$bin\psql.exe" -ArgumentList $arguments -NoNewWindow -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Preflight falhou (psql $($process.ExitCode)); nenhuma migration aplicada." }
  $lines = @([IO.File]::ReadAllLines($log) | Where-Object { $_.StartsWith('V2_021_PREFLIGHT_GATES|') })
  if ($lines.Count -ne 1) { throw 'Preflight sem indicadores verificaveis.' }
  $gates = $lines[0].Substring('V2_021_PREFLIGHT_GATES|'.Length) | ConvertFrom-Json
  if (@($gates.PSObject.Properties).Count -ne 12) { throw 'Preflight incompleto.' }
  $failed = @($gates.PSObject.Properties | Where-Object { $_.Value -isnot [bool] -or $_.Value -ne $true })
  $status['Gates'] = $gates
  $status['LegacyInventory'] = @([IO.File]::ReadAllLines($log) | Where-Object { $_.StartsWith('V2_021_LEGACY_INVENTORY|') })
  $status['LegacyAffectedCamps'] = @([IO.File]::ReadAllLines($log) | Where-Object { $_.StartsWith('V2_021_LEGACY_AFFECTED_CAMP|') })
  if ($failed.Count -gt 0) { throw ('Preflight bloqueado: ' + (($failed | ForEach-Object { $_.Name }) -join ', ')) }
  if ($status.LegacyInventory.Count -ne 3) { throw 'Inventario legado incompleto; revisar antes de continuar.' }
  foreach ($line in $status.LegacyInventory) { Write-Host $line }
  if ($status.LegacyAffectedCamps.Count -gt 0) {
    Write-Warning 'Existem registros legados preservados: a exclusao desses acampamentos ficara bloqueada. Revisar o relatorio; este executor nao remove nem reassocia dados.'
  }
  $status.PreflightPassed = $true
  Write-Host 'Indicadores aprovados. O catalogo deve ser revisado antes de autorizar a instalacao.'
  Write-Host '2/2 BACKUP. Informe a senha novamente apenas no prompt do pg_dump.'
  $backup = @(& (Join-Path $PSScriptRoot 'backup-supabase-production.ps1') -PoolerUser $PoolerUser)
  $files = @($backup | Where-Object { $_.FullName -and $_.FullName.EndsWith('.dump') })
  if ($files.Count -ne 1 -or $files[0].Length -le 0) { throw 'Backup sem resultado verificavel.' }
  if ((Get-FileHash -LiteralPath $migration -Algorithm SHA256).Hash -cne $status.MigrationSHA256) {
    throw 'Migration mudou durante a preparacao. Revisar antes de prosseguir.'
  }
  $status['BackupPath'] = $files[0].FullName
  $status['BackupBytes'] = $files[0].Length
  $status['BackupSHA256'] = (Get-FileHash -LiteralPath $files[0].FullName -Algorithm SHA256).Hash
  $status.BackupVerified = $true
  Write-Host 'V2_021_PREFLIGHT_AND_BACKUP_COMPLETED. 021 NAO APLICADA. Restauracao nao testada.'
} catch {
  $status['Error'] = $_.Exception.Message
  throw
} finally {
  if (Test-Path -LiteralPath $run) {
    $status | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $run 'status.json') -Encoding UTF8
    Write-Host "Resultado local: $run"
  }
  foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
}
