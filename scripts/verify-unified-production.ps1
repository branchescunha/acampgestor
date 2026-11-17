param([string]$PoolerUser)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$certificate = 'C:\Users\andre\Downloads\prod-ca-2021.crt'
$directory = Join-Path $env:LOCALAPPDATA ('AcampGestor\verification-runs\' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $directory | Out-Null
$statusPath = Join-Path $directory 'status.json'
$logPath = Join-Path $directory 'postgresql-output.txt'
$sqlPath = Join-Path $directory 'verify-read-only.sql'
$status = [ordered]@{ State = 'preparing'; Verified = $false; ReadOnly = $true; StartedAt = (Get-Date).ToString('o'); Log = $logPath }
$previousMode = $env:PGSSLMODE
$previousCertificate = $env:PGSSLROOTCERT
try {
  foreach ($file in @($psql, $certificate)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Arquivo necessario ausente: $file" }
  }
  $assertions = [IO.File]::ReadAllText((Join-Path $root 'supabase\tests\017_production_assertions.sql'))
  $checks = [IO.File]::ReadAllText((Join-Path $root 'supabase\tests\017_unified_security_checks.sql'))
  $sql = @(
    'begin read only;'
    "set local statement_timeout = '60s';"
    "select current_setting('transaction_read_only') as read_only, current_setting('server_version') as postgres_version;"
    $assertions
    $checks
    'rollback;'
    "select 'V2_READ_ONLY_VERIFICATION_COMPLETE' as result;"
  ) -join "`n`n"
  [IO.File]::WriteAllText($sqlPath, $sql, [Text.UTF8Encoding]::new($false))
  if (-not $PoolerUser) { $PoolerUser = Read-Host 'Usuario EXATO do Session Pooler (Connect)' }
  if ($PoolerUser -cne 'postgres.zuxndxchkeynvjqustxk') { throw 'Usuario nao corresponde ao projeto autorizado.' }
  $env:PGSSLMODE = 'verify-full'
  $env:PGSSLROOTCERT = $certificate
  # Separate argument/value entries avoid PowerShell 5 native-command quoting errors.
  $psqlArguments = @(
    '--no-psqlrc', '--host', 'aws-1-sa-east-1.pooler.supabase.com', '--port', '5432',
    '--username', $PoolerUser, '--dbname', 'postgres', '--password',
    '--set', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=terse', '--file', $sqlPath
  )
  $status.State = 'running'
  $status | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
  Write-Host 'SOMENTE LEITURA: nenhuma migration sera reaplicada. Informe a senha apenas no prompt do psql.'
  & $psql @psqlArguments | Tee-Object -FilePath $logPath
  $exitCode = $LASTEXITCODE
  $output = if (Test-Path -LiteralPath $logPath) { [IO.File]::ReadAllText($logPath) } else { '' }
  $status['PsqlExitCode'] = $exitCode
  $status.Verified = $exitCode -eq 0 -and $output.Contains('V2_READ_ONLY_VERIFICATION_COMPLETE')
  if (-not $status.Verified) { throw 'Verificacao falhou. Nao reaplicar migrations nem publicar antes de revisar o erro.' }
  $status.State = 'verified'
  Write-Host 'Estrutura e permissoes verificadas. Isso nao comprova login ou operacoes reais de usuarios.'
} catch {
  $status.State = 'failed'
  Write-Host ('ERRO: ' + $_.Exception.Message) -ForegroundColor Red
} finally {
  $status['FinishedAt'] = (Get-Date).ToString('o')
  $status | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
  $env:PGSSLMODE = $previousMode
  $env:PGSSLROOTCERT = $previousCertificate
  Write-Host "Resultado local: $statusPath"
}
if (-not $status.Verified) { exit 1 }
