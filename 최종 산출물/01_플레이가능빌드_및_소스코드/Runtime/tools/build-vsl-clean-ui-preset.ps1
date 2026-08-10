param(
  [string]$Source = "C:\NHN Project\NAN_2026_Team_Project\Runtime\assets\ui\clean-v1",
  [string]$Output = "C:\Users\1\Downloads\미지의경매장_V6.4_도시BGM_감정SFX수정_v3.4\tools\clean-ui-preset.js"
)
$items = @(
  @{ id='clean-button-green'; file='buttons/button-green.png'; role='button'; top=32; right=52; bottom=32; left=52 },
  @{ id='clean-button-dark'; file='buttons/button-dark.png'; role='button'; top=32; right=52; bottom=32; left=52 },
  @{ id='clean-button-parchment'; file='buttons/button-parchment.png'; role='button'; top=32; right=52; bottom=32; left=52 },
  @{ id='clean-button-red'; file='buttons/button-red.png'; role='button'; top=32; right=52; bottom=32; left=52 },
  @{ id='clean-button-purple'; file='buttons/button-purple.png'; role='button'; top=32; right=52; bottom=32; left=52 },
  @{ id='clean-save-slot-frame'; file='slots/save-slot-frame.png'; role='frame'; top=24; right=28; bottom=24; left=28 }
)
$records = foreach ($item in $items) {
  $path = Join-Path $Source $item.file
  $data = [Convert]::ToBase64String([IO.File]::ReadAllBytes($path))
  [ordered]@{
    id=$item.id; name=[IO.Path]::GetFileName($path); dataUrl="data:image/png;base64,$data"
    mimeType='image/png'; role=$item.role
    nineSlice=[ordered]@{enabled=$true;top=$item.top;right=$item.right;bottom=$item.bottom;left=$item.left;repeat='stretch'}
  }
}
$json = $records | ConvertTo-Json -Depth 5 -Compress
[IO.File]::WriteAllText($Output, "window.CLEAN_UI_PRESET=$json;", [Text.UTF8Encoding]::new($false))
Write-Host "Wrote $Output ($((Get-Item -LiteralPath $Output).Length) bytes)"
