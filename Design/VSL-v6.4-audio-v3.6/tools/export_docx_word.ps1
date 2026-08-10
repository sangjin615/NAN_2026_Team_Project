param(
  [Parameter(Mandatory=$true)][string]$InputDocx,
  [Parameter(Mandatory=$true)][string]$OutputPdf
)

$word = $null
$doc = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open((Resolve-Path $InputDocx).Path, $false, $true, $false)
  $doc.ExportAsFixedFormat($OutputPdf, 17, $false, 0, 0, 1, 9999, 0, $true, $true, 1, $true, $true, $false)
  Write-Output $OutputPdf
}
finally {
  if ($doc -ne $null) { $doc.Close(0) }
  if ($word -ne $null) { $word.Quit() }
  if ($doc -ne $null) { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc) }
  if ($word -ne $null) { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

