<#
  Collects new school-education items from the feeds in config/sources.json
  and writes them to data/pending.json for Claude to tag and summarise.

  Usage:  powershell -ExecutionPolicy Bypass -File scripts\fetch.ps1 [-Days 1]
  -Days 7 is used for the first (backfill) run.
#>
param([int]$Days = 1, [int]$Limit = 0, [switch]$Repair)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Root = Split-Path -Parent $PSScriptRoot
$Utf8 = New-Object Text.UTF8Encoding $false

function Read-Json($path, $default) {
  if (Test-Path $path) { return (Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json) }
  return $default
}
function Write-Json($path, $obj) {
  [IO.File]::WriteAllText($path, (ConvertTo-Json -InputObject $obj -Depth 6), $Utf8)
}
function Normalize-Title([string]$t) {
  return (($t.ToLower() -replace '[^a-z0-9 ]', ' ') -replace '\s+', ' ').Trim()
}
function Get-Id([string]$s) {
  $sha = [Security.Cryptography.SHA1]::Create()
  $b = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($s))
  return (($b | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 12)
}
function Strip-Html([string]$h) {
  if (-not $h) { return '' }
  $t = $h -replace '<[^>]+>', ' '
  $t = [Net.WebUtility]::HtmlDecode($t)
  return ($t -replace '\s+', ' ').Trim()
}

$cfg = Read-Json (Join-Path $Root 'config\sources.json') $null
$seenPath = Join-Path $Root 'data\seen.json'
$seen = @{}
foreach ($s in @(Read-Json $seenPath @())) { $seen[$s] = $true }

$backfill = $Days -gt 1
$perFeed  = if ($backfill) { $cfg.maxPerFeedBackfill } else { $cfg.maxPerFeedDaily }

# Broad filter so obviously unrelated items (sports, markets...) are skipped before tagging.
$eduPattern = '(?i)school|education|student|teacher|pupil|class \d|classroom|exam|board|curriculum|syllabus|textbook|literacy|numeracy|learning|anganwadi|pre-?school|kindergarten|early childhood|ncert|cbse|scert|samagra|nipun|pm shri|nep|udise|parakh|scholarship|midday|mid-day|poshan|edtech|unesco|unicef|pisa'

# Build the list of feeds to read.
$feeds = New-Object System.Collections.ArrayList
foreach ($s in $cfg.sources) {
  $max = $perFeed
  $win = [Math]::Max($Days, [int]$s.windowDays)
  $obj = [ordered]@{ name = $s.name; section = $s.section; max = $max
    cutoff = (Get-Date).ToUniversalTime().AddDays(-$win).AddHours(-6) }
  if ($s.type -eq 'rss') { $obj.url = $s.url }
  else {
    $q = [uri]::EscapeDataString("$($s.query) when:$($Days)d")
    $obj.url = if ($s.intl) { "https://news.google.com/rss/search?q=$q&hl=en-US&gl=US&ceid=US:en" }
               else { "https://news.google.com/rss/search?q=$q&hl=en-IN&gl=IN&ceid=IN:en" }
  }
  [void]$feeds.Add($obj)
}

$candidates = @{}
# Items still waiting from an earlier run are kept, and their links/text are retried if missing.
$pendingAll = @(Read-Json (Join-Path $Root 'data\pending.json') @())
foreach ($p in $pendingAll) {
  $seen[$p.id] = $true
  if ($p.url -like '*news.google.com*' -or -not $p.snippet) { $candidates[$p.id] = $p }
}
if ($pendingAll.Count) { Write-Host "Carrying over $($pendingAll.Count) waiting items ($($candidates.Count) to retry)" }
if ($Repair) { $feeds.Clear() }

Write-Host "Reading $($feeds.Count) feeds (window: $Days day(s))..."
$feedErrors = 0
foreach ($f in $feeds) {
  try {
    $r = Invoke-WebRequest -Uri $f.url -UseBasicParsing -TimeoutSec 30 -UserAgent 'Mozilla/5.0'
    [xml]$x = $Utf8.GetString($r.RawContentStream.ToArray())
  } catch { $feedErrors++; Write-Host "  ! $($f.name): $($_.Exception.Message)"; continue }
  $count = 0
  foreach ($it in @($x.rss.channel.item)) {
    if ($count -ge $f.max) { break }
    if (-not $it) { continue }
    $title = if ($it.title -is [Xml.XmlElement]) { $it.title.InnerText } else { [string]$it.title }
    $srcName = if ($it.source) { if ($it.source -is [Xml.XmlElement]) { $it.source.InnerText } else { [string]$it.source } } else { ($f.name -split ' – ')[0] }
    if ($srcName -and $title.EndsWith(" - $srcName")) { $title = $title.Substring(0, $title.Length - $srcName.Length - 3) }
    $title = Strip-Html $title
    $published = $null
    try { $published = [DateTime]::Parse([string]$it.pubDate).ToUniversalTime() } catch { }
    if ($published -and $published -lt $f.cutoff) { continue }
    if ($title -notmatch $eduPattern) { continue }
    $id = Get-Id (Normalize-Title $title)
    if ($seen.ContainsKey($id) -or $candidates.ContainsKey($id)) { continue }
    $desc = if ($it.description -is [Xml.XmlElement]) { $it.description.InnerText } else { [string]$it.description }
    $snippet = if ($f.url -like '*news.google.com*') { '' } else { Strip-Html $desc }
    $candidates[$id] = [ordered]@{
      id = $id; title = $title; url = [string]$it.link; source = $srcName
      published = if ($published) { $published.ToString('yyyy-MM-ddTHH:mm:ssZ') } else { (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }
      feed = $f.name; sectionHint = $f.section; snippet = $snippet
    }
    $count++
  }
}
Write-Host "Found $($candidates.Count) new candidate items ($feedErrors feed errors)."

# Resolve Google News links to the original article and pull a short text snippet, in parallel.
$worker = {
  param($item)
  $ProgressPreference = 'SilentlyContinue'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $utf8 = New-Object Text.UTF8Encoding $false
  $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
  $url = $item.url
  # Google limits rapid lookups, so retry with a growing pause.
  for ($attempt = 1; $attempt -le 3 -and $url -like '*news.google.com/rss/articles/*'; $attempt++) {
  if ($attempt -gt 1) { Start-Sleep -Seconds (4 * $attempt) }
  try {
    if ($url -like '*news.google.com/rss/articles/*') {
      $gid = ($url -split '/articles/')[1].Split('?')[0]
      $page = (Invoke-WebRequest -Uri "https://news.google.com/rss/articles/$gid" -UseBasicParsing -TimeoutSec 20 -UserAgent $ua).Content
      $sg = [regex]::Match($page, 'data-n-a-sg="([^"]+)"').Groups[1].Value
      $ts = [regex]::Match($page, 'data-n-a-ts="([^"]+)"').Groups[1].Value
      if ($sg -and $ts) {
        $inner = '["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"' + $gid + '",' + $ts + ',"' + $sg + '"]'
        $freq = '[[["Fbv4je","' + $inner.Replace('\', '\\').Replace('"', '\"') + '",null,"generic"]]]'
        $resp = Invoke-WebRequest -Uri 'https://news.google.com/_/DotsSplashUi/data/batchexecute' -Method Post `
          -Body ('f.req=' + [uri]::EscapeDataString($freq)) -ContentType 'application/x-www-form-urlencoded;charset=UTF-8' `
          -UseBasicParsing -TimeoutSec 20 -UserAgent $ua
        $m = [regex]::Match($resp.Content, 'garturlres\\",\\"(.+?)\\"')
        if ($m.Success) {
          $url = [regex]::Replace($m.Groups[1].Value, '\\\\u([0-9a-fA-F]{4})', { param($g) [string][char][Convert]::ToInt32($g.Groups[1].Value, 16) })
        }
      }
    }
  } catch { }
  }
  $snippet = $item.snippet
  if ($url -notlike '*news.google.com*' -and $url -notmatch '\.pdf($|\?)' -and (-not $snippet -or $snippet.Length -lt 120)) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20 -UserAgent $ua
      $html = $utf8.GetString($r.RawContentStream.ToArray())
      $html = [regex]::Replace($html, '<(script|style|noscript)[^>]*>.*?</\1>', ' ', 'Singleline,IgnoreCase')
      $parts = New-Object System.Collections.ArrayList
      foreach ($p in @('property="og:description"', 'name="description"', 'name="twitter:description"')) {
        $mm = [regex]::Match($html, '<meta[^>]+' + $p + '[^>]+content="([^"]*)"', 'IgnoreCase')
        if (-not $mm.Success) { $mm = [regex]::Match($html, '<meta[^>]+content="([^"]*)"[^>]+' + $p, 'IgnoreCase') }
        if ($mm.Success -and $mm.Groups[1].Value.Length -gt 40) { [void]$parts.Add($mm.Groups[1].Value); break }
      }
      foreach ($pm in [regex]::Matches($html, '<p[^>]*>(.*?)</p>', 'Singleline,IgnoreCase')) {
        $t = (([Net.WebUtility]::HtmlDecode(($pm.Groups[1].Value -replace '<[^>]+>', ' '))) -replace '\s+', ' ').Trim()
        if ($t.Length -gt 80) { [void]$parts.Add($t) }
        if ((($parts -join ' ').Length) -gt 1200) { break }
      }
      $joined = (([Net.WebUtility]::HtmlDecode(($parts -join ' '))) -replace '\s+', ' ').Trim()
      if ($joined.Length -gt ($snippet.Length)) { $snippet = $joined }
    } catch { }
  }
  if ($snippet.Length -gt 1200) { $snippet = $snippet.Substring(0, 1200) }
  $item.url = $url
  $item.snippet = $snippet
  return $item
}

$pool = [RunspaceFactory]::CreateRunspacePool(1, 6)
$pool.Open()
$toProcess = @($candidates.Values)
if ($Limit -gt 0) { $toProcess = @($toProcess | Select-Object -First $Limit) }
$sw = [Diagnostics.Stopwatch]::StartNew()
$jobs = foreach ($c in $toProcess) {
  $ps = [PowerShell]::Create().AddScript($worker).AddArgument($c)
  $ps.RunspacePool = $pool
  [pscustomobject]@{ ps = $ps; handle = $ps.BeginInvoke() }
}
$results = New-Object System.Collections.ArrayList
$done = 0
foreach ($j in @($jobs)) {
  $out = $j.ps.EndInvoke($j.handle)
  if ($out) { [void]$results.Add($out[0]) }
  $j.ps.Dispose()
  $done++
  if ($done % 50 -eq 0) { Write-Host "  processed $done / $($toProcess.Count) ($([int]$sw.Elapsed.TotalSeconds)s)" }
}
$pool.Close()
Write-Host "Resolved links and snippets in $([int]$sw.Elapsed.TotalSeconds)s"

# Drop duplicates that only became visible once the real URL was known.
$byUrl = @{}
$final = New-Object System.Collections.ArrayList
foreach ($r in $results) {
  $key = ($r.url -replace '[?#].*$', '').TrimEnd('/').ToLower()
  if ($byUrl.ContainsKey($key)) { continue }
  $byUrl[$key] = $true
  [void]$final.Add($r)
}

New-Item -ItemType Directory -Force (Join-Path $Root 'data') | Out-Null
# Waiting items go back in place (retried ones updated), followed by the new ones.
$fixed = @{}
foreach ($r in $results) { $fixed[$r.id] = $r }
$carried = @($pendingAll | ForEach-Object { if ($fixed.ContainsKey($_.id)) { $fixed[$_.id] } else { $_ } })
$carriedIds = @{}
foreach ($c in $carried) { $carriedIds[$c.id] = $true }
$final = @($carried) + @($final | Where-Object { -not $carriedIds.ContainsKey($_.id) })
Write-Host ("Links not yet resolved: " + @($final | Where-Object { $_.url -like '*news.google.com*' }).Count)
Write-Json (Join-Path $Root 'data\pending.json') @($final)
Write-Host "Wrote $($final.Count) items to data\pending.json"
