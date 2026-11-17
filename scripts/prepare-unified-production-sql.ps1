$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$names = @(
  '015_enforce_participant_group_camp.sql',
  '016_prepare_score_integrity.sql',
  '017_unified_teams_rooms_and_results.sql'
)
$parts = foreach ($name in $names) {
  $sql = [IO.File]::ReadAllText((Join-Path $root "supabase\sql\$name"))
  if ($sql -notmatch '\Abegin;\s*' -or $sql -notmatch '(?i)commit;\s*\z' -or
      [regex]::Matches($sql, '(?im)^begin;\s*$').Count -ne 1 -or
      [regex]::Matches($sql, '(?im)^commit;\s*$').Count -ne 1) {
    throw "Estrutura transacional inesperada em $name; pacote nao gerado."
  }
  "-- SOURCE: $name`n" + ($sql -replace '\Abegin;\s*', '' -replace '(?i)commit;\s*\z', '').Trim()
}
$folder = Join-Path $env:LOCALAPPDATA ('AcampGestor\releases\' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $folder | Out-Null
$path = Join-Path $folder '015-017-production.sql'
$bundle = @(
  '-- MANUAL ONLY. Backup atualizado + preflight aprovado + janela sem usuarios.'
  '-- Executar TODO este arquivo no SQL Editor. Nenhum SQL e enviado por este script.'
  'begin;'
  "set local lock_timeout = '5s';"
  "set local statement_timeout = '120s';"
  ($parts -join "`n`n")
  'commit;'
) -join "`n`n"
[IO.File]::WriteAllText($path, $bundle, [Text.UTF8Encoding]::new($false))
Write-Output $path
Get-FileHash -LiteralPath $path -Algorithm SHA256 | Select-Object Algorithm, Hash
