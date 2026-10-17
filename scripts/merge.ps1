<#
  Merges Claude's tagged batches (data/tagged/*.json) with data/pending.json
  into data/items.json, which the website reads. Then clears the working files.

  Usage:  powershell -ExecutionPolicy Bypass -File scripts\merge.ps1
#>
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Utf8 = New-Object Text.UTF8Encoding $false
$Data = Join-Path $Root 'data'

function Read-Json($path, $default) {
  if (Test-Path $path) { return (Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json) }
  return $default
}
function Write-Json($path, $obj) {
  [IO.File]::WriteAllText($path, (ConvertTo-Json -InputObject $obj -Depth 6 -Compress), $Utf8)
}

$validSections = @('govt', 'news', 'research', 'global')
$validThemes   = @('ece', 'fln', 'tech_ai', 'secondary', 'assessment', 'budget_governance')

$pending = @{}
foreach ($p in @(Read-Json (Join-Path $Data 'pending.json') @())) { $pending[$p.id] = $p }

$tagged = @{}
$taggedDir = Join-Path $Data 'tagged'
if (Test-Path $taggedDir) {
  foreach ($f in Get-ChildItem $taggedDir -Filter *.json) {
    foreach ($t in @(Read-Json $f.FullName @())) { if ($t.id) { $tagged[$t.id] = $t } }
  }
}

$items = New-Object System.Collections.ArrayList
foreach ($i in @(Read-Json (Join-Path $Data 'items.json') @())) { [void]$items.Add($i) }
$existing = @{}
foreach ($i in $items) { $existing[$i.id] = $true }

$seenPath = Join-Path $Data 'seen.json'
$seen = New-Object System.Collections.Generic.HashSet[string]
foreach ($s in @(Read-Json $seenPath @())) { [void]$seen.Add($s) }

$added = 0; $dropped = 0; $untagged = 0
foreach ($id in $pending.Keys) {
  $p = $pending[$id]
  if (-not $tagged.ContainsKey($id)) { $untagged++; continue }   # stays pending for next run
  $t = $tagged[$id]
  [void]$seen.Add($id)
  if (-not $t.keep) { $dropped++; continue }
  if ($existing.ContainsKey($id)) { continue }
  $section = if ($validSections -contains $t.section) { $t.section } else { $p.sectionHint }
  $themes = @(@($t.themes) | Where-Object { $validThemes -contains $_ } | Select-Object -Unique)
  [void]$items.Add([pscustomobject][ordered]@{
    id = $id; title = $p.title; url = $p.url; source = $p.source; published = $p.published
    section = $section; themes = $themes; priority = if ($t.priority) { [int]$t.priority } else { 3 }
    type = $t.type; blurb = $t.blurb; added = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  })
  $existing[$id] = $true
  $added++
}

# Re-check results for items already in the bulletin: drop or re-file them.
$removed = 0
foreach ($id in @($tagged.Keys | Where-Object { -not $pending.ContainsKey($_) -and $existing.ContainsKey($_) })) {
  $t = $tagged[$id]
  $it = $items | Where-Object { $_.id -eq $id } | Select-Object -First 1
  if (-not $t.keep) { $items.Remove($it); $removed++; continue }
  if ($validSections -contains $t.section) { $it.section = $t.section }
  if ($t.priority) { $it | Add-Member -NotePropertyName priority -NotePropertyValue ([int]$t.priority) -Force }
}

# Global is capped at the 10 highest-priority items per day (IST), so India sections aren't crowded out.
$ist = [TimeZoneInfo]::FindSystemTimeZoneById('India Standard Time')
$capped = 0
foreach ($day in @($items | Where-Object { $_.section -eq 'global' } |
    Group-Object { [TimeZoneInfo]::ConvertTimeFromUtc(([DateTime]::Parse($_.published)).ToUniversalTime(), $ist).ToString('yyyy-MM-dd') })) {
  $extra = @($day.Group | Sort-Object @{ e = { if ($_.priority) { [int]$_.priority } else { 3 } }; Descending = $true }, @{ e = 'published'; Descending = $true } | Select-Object -Skip 10)
  foreach ($x in $extra) { $items.Remove($x); [void]$seen.Add($x.id); $capped++ }
}

# Newest first; keep the archive to the most recent 365 days.
$keepAfter = (Get-Date).ToUniversalTime().AddDays(-365).ToString('yyyy-MM-ddTHH:mm:ssZ')
$sorted = @($items | Where-Object { $_.published -ge $keepAfter } | Sort-Object -Property published -Descending |
  Select-Object id, title, url, source, published, section, themes, type, priority, blurb, added)

Write-Json (Join-Path $Data 'items.json') $sorted
Write-Json $seenPath @($seen)
Write-Json (Join-Path $Data 'meta.json') ([ordered]@{
  lastUpdated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'); total = $sorted.Count; addedLastRun = $added
})

# Leave untagged items in pending so the next run picks them up.
$left = @($pending.Values | Where-Object { -not $tagged.ContainsKey($_.id) })
Write-Json (Join-Path $Data 'pending.json') $left
if (Test-Path $taggedDir) { Remove-Item (Join-Path $taggedDir '*.json') -Confirm:$false }

Write-Host "Added $added, dropped $dropped, removed on re-check $removed, global over daily cap $capped, still untagged $untagged. Total in bulletin: $($sorted.Count)."
