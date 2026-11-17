param([string]$PoolerUser)

$ErrorActionPreference = 'Stop'
$bin = 'C:\Program Files\PostgreSQL\17\bin'
$certificate = 'C:\Users\andre\Downloads\prod-ca-2021.crt'
foreach ($file in @("$bin\pg_dump.exe", "$bin\pg_restore.exe", $certificate)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Arquivo necessario ausente: $file" }
}
if (-not $PoolerUser) { $PoolerUser = Read-Host 'Usuario EXATO do Session Pooler (painel Connect)' }
if ($PoolerUser -cne 'postgres.zuxndxchkeynvjqustxk') {
  throw 'Usuario nao corresponde ao projeto de producao esperado. Confira Connect; nao adivinhe.'
}
$folder = Join-Path $env:LOCALAPPDATA ('AcampGestor\backups\backup-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $folder | Out-Null
$dump = Join-Path $folder ('acampgestor-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
$previousMode = $env:PGSSLMODE
$previousCertificate = $env:PGSSLROOTCERT
try {
  $env:PGSSLMODE = 'verify-full'
  $env:PGSSLROOTCERT = $certificate
  & "$bin\pg_dump.exe" --host=aws-1-sa-east-1.pooler.supabase.com --port=5432 `
    --username=$PoolerUser --dbname=postgres --password --format=custom --file=$dump
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump falhou. Arquivo parcial NAO e backup valido; nao aplicar migrations.' }
  if ((Get-Item -LiteralPath $dump).Length -le 0) { throw 'Backup vazio; interromper.' }
  $toc = & "$bin\pg_restore.exe" --list $dump
  if ($LASTEXITCODE -ne 0) { throw 'Falha na listagem do backup; interromper.' }
  $toc | Set-Content -LiteralPath (Join-Path $folder 'contents.txt') -Encoding UTF8
  # Le/descomprime o arquivo inteiro, sem conexao nem restauracao no banco.
  & "$bin\pg_restore.exe" --file=NUL $dump
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao ler o conteudo completo do arquivo; interromper.' }
  foreach ($schema in @('public', 'auth')) {
    if (-not ($toc | Select-String -Pattern (" TABLE DATA " + $schema + " "))) {
      throw "Backup sem entradas TABLE DATA de $schema; conferir permissoes antes de continuar."
    }
  }
  Get-Item -LiteralPath $dump | Select-Object FullName, Length, LastWriteTime
  Get-FileHash -LiteralPath $dump -Algorithm SHA256 | Select-Object Algorithm, Hash
  Write-Host 'Backup atualizado e leitura do arquivo concluidos. Restauracao NAO foi testada.'
  Write-Host 'Arquivo contem dados sensiveis: mantenha a pasta privada e fora de compartilhamentos.'
} finally {
  $env:PGSSLMODE = $previousMode
  $env:PGSSLROOTCERT = $previousCertificate
}
