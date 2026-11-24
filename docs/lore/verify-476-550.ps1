# verify-476-550.ps1 - verify the assembled final file for 476-550 (75 bottles)
# Same structure as batch 5a (incl. 2b strict URL, 3b per-field quote, 3c corner-quote quote)
$b = "C:\Users\16256\work\.legs\lore-b5b-20261123"
$f = Join-Path $b "lore-batch5-476-550.md"
$t = Get-Content $f -Raw -Encoding UTF8

$allRaw = ""
foreach($p in (Get-ChildItem "$b\search\raw-*.txt")){ $allRaw += (Get-Content $p.FullName -Raw -Encoding UTF8) }

$RE_BODY  = '(?m)^- 文案：[ \t]*(.*?)[ \t]*$'
$RE_SRC   = '(?m)^- 来源链接：[ \t]*(.*?)[ \t]*$'
$RE_TYPE  = '(?m)^- 背书类型：[ \t]*(.*?)[ \t]*$'
$RE_NOTE  = '(?m)^- 备注：(.*?)[ \t]*$'
$RE_NAME  = '(?m)^- 名称：(.*?)[ \t]*$'
$RE_HEAD  = '(?m)^(\d+)\.[ \t]+([a-z0-9\-]+)'

Write-Output "=== 1. 条目数与序号连续性 ==="
$heads = [regex]::Matches($t,'(?m)^###[ \t]+(\d+)\.[ \t]+([a-z0-9\-]+)（排名[ \t]*(\d+)）')
Write-Output "条目数: $($heads.Count)"
$nums = $heads | ForEach-Object { [int]$_.Groups[1].Value }
$diff = Compare-Object $nums (476..550)
if($diff){ Write-Output "!! 序号不一致"; $diff | Format-Table | Out-String } else { Write-Output "序号 476-550 连续齐全 OK" }

$listTxt = Get-Content (Join-Path $b "_list-476-550.md") -Raw -Encoding UTF8
$listMap = @{}
foreach($m in [regex]::Matches($listTxt,'(?m)^###\s+(\d+)\.\s+([a-z0-9\-]+)（排名\s*(\d+)）')){
  $listMap[[int]$m.Groups[1].Value] = @{ id=$m.Groups[2].Value; rank=[int]$m.Groups[3].Value }
}
Write-Output "名单条数: $($listMap.Count)"
$idmiss=@()
foreach($h in $heads){
  $no=[int]$h.Groups[1].Value; $id=$h.Groups[2].Value; $rk=[int]$h.Groups[3].Value
  if(-not $listMap.ContainsKey($no)){ $idmiss += "$no 不在名单"; continue }
  if($listMap[$no].id -ne $id){ $idmiss += "$no id 不符: 稿=$id 名单=$($listMap[$no].id)" }
  if($listMap[$no].rank -ne $rk){ $idmiss += "$no 排名不符: 稿=$rk 名单=$($listMap[$no].rank)" }
}
if($idmiss.Count -eq 0){ Write-Output "$($heads.Count) 条 id 与排名全部与名单一致 OK" } else { $idmiss | ForEach-Object { Write-Output "!! $_" } }

Write-Output ""
Write-Output "=== 2. URL 溯源（宽松：URL 字符串出现在 raw 全文任一位置）==="
$srcLines = [regex]::Matches($t,$RE_SRC) | ForEach-Object { $_.Groups[1].Value }
$allUrls = @()
foreach($l in $srcLines){ $allUrls += ([regex]::Matches($l,'https?://[^\s；;，,）)]+') | ForEach-Object { $_.Value }) }
$uniq = @($allUrls | Sort-Object -Unique)
Write-Output "来源链接总数: $($allUrls.Count) （唯一 $($uniq.Count)）"
$miss=@(); foreach($u in $uniq){ if(-not $allRaw.Contains($u)){ $miss += $u } }
if($miss.Count -eq 0){ Write-Output "全部 URL 在 raw 证据中逐字命中 OK" } else { Write-Output "!! 未命中 $($miss.Count):"; $miss | ForEach-Object { Write-Output "   $_" } }

Write-Output ""
Write-Output "=== 2b. URL 溯源（加严：必须逐字出现在 raw 的 URL 行上）==="
$rawUrlLines = @()
foreach($p in (Get-ChildItem "$b\search\raw-*.txt")){
  foreach($l in (Get-Content $p.FullName -Encoding UTF8)){
    if($l -match '^URL:\s*(https?://\S+)\s*$'){ $rawUrlLines += $matches[1] }
  }
}
$rawUrlLines = @($rawUrlLines | Sort-Object -Unique)
Write-Output "raw 中 URL: 行唯一数: $($rawUrlLines.Count)"
$miss2=@(); foreach($u in $uniq){ if($rawUrlLines -notcontains $u){ $miss2 += $u } }
if($miss2.Count -eq 0){ Write-Output "全部 $($uniq.Count) 个 URL 均逐字出现在 raw 的 URL: 行，0 缺失 OK" } else { Write-Output "!! 未在 URL: 行找到 $($miss2.Count):"; $miss2 | ForEach-Object { Write-Output "   $_" } }

Write-Output ""
Write-Output "=== 3. 英文引文逐字核验（ASCII 双引号，全文）==="
$total=0;$ok=0;$bad=@()
foreach($m in [regex]::Matches($t,'"([^"\r\n]{15,900})"')){
  $q=$m.Groups[1].Value.Trim()
  if($q -notmatch '[A-Za-z]'){ continue }
  if($q -match '[\u4e00-\u9fff]'){ continue }
  $total++
  if($allRaw.Contains($q)){ $ok++; continue }
  $seg=($q -split '(\u2026|\.\.\.)' | Sort-Object Length -Descending | Select-Object -First 1)
  if($seg -and $seg.Trim().Length -ge 20 -and $allRaw.Contains($seg.Trim())){ $ok++; continue }
  $bad += $q
}
Write-Output "引文数: $total   逐字命中: $ok   未命中: $($bad.Count)"
if($bad.Count -gt 0){ $bad | ForEach-Object { Write-Output "   ?? $_" } } else { Write-Output "无编造引文 OK" }

$blocks = [regex]::Split($t,'(?m)^(?=###\s+\d+\.)') | Where-Object { $_ -match '(?m)^###\s+\d+\.' }

Write-Output ""
Write-Output "=== 3b. 分字段引文核验（文案 / 备注 各自独立扫）==="
foreach($fld in @(@{n='文案';re=$RE_BODY}, @{n='备注';re=$RE_NOTE})){
  $n=0;$o=0;$bd2=@()
  foreach($blk in $blocks){
    $no=[int]([regex]::Match($blk,'(?m)^###\s+(\d+)\.')).Groups[1].Value
    $v=([regex]::Match($blk,$fld.re)).Groups[1].Value
    foreach($m in [regex]::Matches($v,'"([^"\r\n]{15,900})"')){
      $q=$m.Groups[1].Value.Trim()
      if($q -notmatch '[A-Za-z]'){ continue }
      if($q -match '[\u4e00-\u9fff]'){ continue }
      $n++
      if($allRaw.Contains($q)){ $o++; continue }
      $seg=($q -split '(\u2026|\.\.\.)' | Sort-Object Length -Descending | Select-Object -First 1)
      if($seg -and $seg.Trim().Length -ge 20 -and $allRaw.Contains($seg.Trim())){ $o++; continue }
      $bd2 += "$no :: $q"
    }
  }
  Write-Output ("{0}字段: 引文 {1}  命中 {2}  未命中 {3}" -f $fld.n,$n,$o,$bd2.Count)
  $bd2 | ForEach-Object { Write-Output "   ?? $_" }
}

Write-Output ""
Write-Output "=== 3c. 中文角引号「」与弯双引号 内的英文引文核验 ==="
$n3=0;$o3=0;$b3=@()
foreach($blk in $blocks){
  $no=[int]([regex]::Match($blk,'(?m)^###\s+(\d+)\.')).Groups[1].Value
  $v=([regex]::Match($blk,$RE_NOTE)).Groups[1].Value
  $vb=([regex]::Match($blk,$RE_BODY)).Groups[1].Value
  foreach($src in @($v,$vb)){
    foreach($m in [regex]::Matches($src,'「([^」\r\n]{6,900})」')){
      $q=$m.Groups[1].Value.Trim()
      if($q -notmatch '[A-Za-z]{3}'){ continue }
      if($q -match '[\u4e00-\u9fff]'){ continue }
      $n3++; if($allRaw.Contains($q)){$o3++} else {$b3 += "$no [corner] :: $q"}
    }
    foreach($m in [regex]::Matches($src,[char]0x201C + '([^' + [char]0x201D + '\r\n]{6,900})' + [char]0x201D)){
      $q=$m.Groups[1].Value.Trim()
      if($q -notmatch '[A-Za-z]{3}'){ continue }
      if($q -match '[\u4e00-\u9fff]'){ continue }
      $n3++; if($allRaw.Contains($q)){$o3++} else {$b3 += "$no [curly] :: $q"}
    }
  }
}
Write-Output "角引号/弯引号内英文: $n3  命中: $o3  未命中: $($b3.Count)"
$b3 | ForEach-Object { Write-Output "   ?? $_" }

Write-Output ""
Write-Output "=== 4. 留空条目合规 ==="
$parts=[regex]::Split($t,'(?m)^###[ \t]+')
$blank=0;$written=0;$viol=@();$rows=@()
foreach($p in $parts){
  $hm=[regex]::Match($p,$RE_HEAD); if(-not $hm.Success){ continue }
  $no=$hm.Groups[1].Value; $id=$hm.Groups[2].Value
  $ty=([regex]::Match($p,$RE_TYPE)).Groups[1].Value.Trim()
  $bd=([regex]::Match($p,$RE_BODY)).Groups[1].Value.Trim()
  $sr=([regex]::Match($p,$RE_SRC)).Groups[1].Value.Trim()
  $n=([regex]::Matches($sr,'https?://')).Count
  if($ty -eq '无可靠来源'){
    $blank++
    if($bd -ne '' -or $sr -ne ''){ $viol += "$no $id 留空条目文案或来源非空" }
    $rows += [pscustomobject]@{no=[int]$no;id=$id;status='BLANK';type=$ty;src=0;cjk=0}
  } else {
    $written++
    if($bd -eq ''){ $viol += "$no $id 已写但文案为空" }
    if($n -lt 1){ $viol += "$no $id 已写但来源数 0" }
    $cjk = ([regex]::Matches($bd,'[\u4e00-\u9fff]')).Count
    if($cjk -lt 100 -or $cjk -gt 220){ $viol += "$no $id 文案汉字数 $cjk 越界(100-220)" }
    $rows += [pscustomobject]@{no=[int]$no;id=$id;status='WRITTEN';type=$ty;src=$n;cjk=$cjk}
  }
}
Write-Output "已写: $written   留空: $blank   合计: $($written+$blank)"
if($viol.Count -eq 0){ Write-Output "留空条目合规、已写条目均有 >=1 来源、文案汉字数均在 100-220 OK" } else { $viol | ForEach-Object { Write-Output "!! $_" } }

Write-Output ""
Write-Output "=== 5. 逐瓶状态表 ==="
$rows | Sort-Object no | Format-Table no,id,status,type,src,cjk -AutoSize | Out-String -Width 200
$rows | Sort-Object no | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $b "search\final-rows.json") -Encoding UTF8

Write-Output ""
Write-Output "=== 6. 类型分布 ==="
$rows | Where-Object {$_.status -eq 'WRITTEN'} | Group-Object type | ForEach-Object { "$($_.Name): $($_.Count)" }
Write-Output "来源数合计: $(($rows | Measure-Object src -Sum).Sum)"
if($written -gt 0){
  $st = $rows | Where-Object {$_.status -eq 'WRITTEN'} | Measure-Object cjk -Minimum -Maximum -Average
  Write-Output ("文案汉字数: min {0} / max {1} / 均值 {2:N1}" -f $st.Minimum,$st.Maximum,$st.Average)
}
