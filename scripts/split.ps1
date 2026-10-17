<#
  Splits data/pending.json into small input batches (data/work/in-NN.json)
  so Claude can tag them one batch at a time. Each batch's output goes to
  data/tagged/batch-NN.json (see TAGGING.md).

  Usage:  powershell -ExecutionPolicy Bypass -File scripts\split.ps1 [-Size 40]
#>
param([int]$Size = 40)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Utf8 = New-Object Text.UTF8Encoding $false
$work = Join-Path $Root 'data\work'
$tagged = Join-Path $Root 'data\tagged'
New-Item -ItemType Directory -Force $work, $tagged | Out-Null
Remove-Item (Join-Path $work '*.json') -Confirm:$false -ErrorAction SilentlyContinue

$pending = @(Get-Content (Join-Path $Root 'data\pending.json') -Raw -Encoding UTF8 | ConvertFrom-Json | ForEach-Object { $_ })
$n = 0
for ($i = 0; $i -lt $pending.Count; $i += $Size) {
  $n++
  $chunk = $pending[$i..([Math]::Min($i + $Size, $pending.Count) - 1)] |
    Select-Object id, title, source, sectionHint, snippet
  $name = 'in-{0:D2}.json' -f $n
  [IO.File]::WriteAllText((Join-Path $work $name), (ConvertTo-Json -InputObject @($chunk) -Depth 4), $Utf8)
}
Write-Host "Split $($pending.Count) items into $n batches in data\work\"
