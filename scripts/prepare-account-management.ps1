param([string]$PoolerUser)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bin = 'C:\Program Files\PostgreSQL\17\bin'
$certificate = 'C:\Users\andre\Downloads\prod-ca-2021.crt'
$run = Join-Path $env:LOCALAPPDATA ('AcampGestor\migration-020-runs\' + [guid]::NewGuid().ToString('N'))
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
  $sql = Join-Path $root 'supabase\tests\020_account_management_preflight.sql'
  $status['MigrationSHA256'] = (Get-FileHash (Join-Path $root 'supabase\sql\020_account_and_organization_management.sql') -Algorithm SHA256).Hash
  Write-Host '1/2 PREFLIGHT SOMENTE LEITURA. Informe a senha apenas no prompt do psql.'
  $arguments = @('--no-psqlrc', '--host=aws-1-sa-east-1.pooler.supabase.com', '--port=5432',
    "--username=$PoolerUser", '--dbname=postgres', '--password', '--set=ON_ERROR_STOP=1',
    '--set=VERBOSITY=terse', '--no-align', '--tuples-only', '--quiet', '--pset=pager=off',
    '--command', '"set default_transaction_read_only = on"',
    '--output', ('"' + $log + '"'), '--file', ('"' + $sql + '"'))
  $process = Start-Process -FilePath "$bin\psql.exe" -ArgumentList $arguments -NoNewWindow -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Preflight falhou (psql $($process.ExitCode)); nenhuma migration aplicada." }
  $row = @([IO.File]::ReadAllLines($log) | Where-Object { $_.Trim() } | Select-Object -First 1)[0] -split '\|'
  if ($row.Count -ne 9 -or $row[1] -notmatch '^\d+$' -or [int]$row[1] -lt 1) { throw 'Preflight incompleto ou ADMIN ativo ausente.' }
  foreach ($index in 2..6) {
    if ($row[$index] -cne 't') { throw "Preflight bloqueado no indicador $index; revisar $log." }
  }
  if ($row[7] -cne '0' -or $row[8] -cne '0') { throw 'Profiles orfaos ou conflitos de email exigem revisao por UID.' }
  $status.PreflightPassed = $true
  $status['PreflightLog'] = $log
  Write-Host 'Preflight aprovado. FKs, policies e triggers ficam no relatorio para revisao antes de qualquer instalacao.'
  Write-Host '2/2 BACKUP. Informe a senha novamente apenas no prompt do pg_dump.'
  $backup = @(& (Join-Path $PSScriptRoot 'backup-supabase-production.ps1') -PoolerUser $PoolerUser)
  $file = @($backup | Where-Object { $_.FullName -and $_.FullName.EndsWith('.dump') })
  if ($file.Count -ne 1 -or $file[0].Length -le 0) { throw 'Backup sem resultado verificavel.' }
  $status['BackupPath'] = $file[0].FullName
  $status['BackupBytes'] = $file[0].Length
  $status['BackupSHA256'] = (Get-FileHash -LiteralPath $file[0].FullName -Algorithm SHA256).Hash
  $status.BackupVerified = $true
  Write-Host "Backup verificado: $($file[0].FullName)"
  Write-Host 'PREFLIGHT E BACKUP CONCLUIDOS. 020 NAO APLICADA. Restauracao nao testada.'
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
