$ErrorActionPreference = 'Stop'

$Image = 'hmip-gardena-plugin'
$Tag = '1.1.1'
$Platform = 'linux/arm64'
$Out = "$Image-$Tag.tar"
$OutGz = "$Out.gz"

docker buildx inspect hcubuild *> $null
if ($LASTEXITCODE -ne 0) {
    docker buildx create --name hcubuild --use | Out-Null
} else {
    docker buildx use hcubuild | Out-Null
}

docker buildx build --platform $Platform --tag "${Image}:${Tag}" --load .
if ($LASTEXITCODE -ne 0) { throw 'docker buildx build failed' }

docker save "${Image}:${Tag}" -o $Out
if (Test-Path $OutGz) { Remove-Item $OutGz -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$in = [System.IO.File]::OpenRead((Resolve-Path $Out))
$outFs = [System.IO.File]::Create((Join-Path (Get-Location) $OutGz))
$gz = New-Object System.IO.Compression.GZipStream($outFs, [System.IO.Compression.CompressionLevel]::Optimal)
try { $in.CopyTo($gz) } finally { $gz.Dispose(); $outFs.Dispose(); $in.Dispose() }
Remove-Item $Out -Force

Write-Host ">> Done: $(Resolve-Path $OutGz)"

