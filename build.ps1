$ErrorActionPreference = 'Stop'

$Image = 'hmip-gardena-plugin'
$Tag = '1.3.2'
$Platform = 'linux/arm64'
$Tar = "$Image-$Tag-arm64.tar"
$OutGz = "$Tar.gz"

docker buildx inspect hcubuild *> $null
if ($LASTEXITCODE -ne 0) {
    docker buildx create --name hcubuild --use | Out-Null
} else {
    docker buildx use hcubuild | Out-Null
}

# Emit the Docker/OCI-layout archive the HCU verifiably accepts (design-spec
# §11.1). Do NOT convert to the legacy format and do NOT add provenance/sbom
# attestations (they confuse the HCU validator).
docker buildx build --platform $Platform --provenance=false --sbom=false `
    --build-arg "HMIP_VERSION=$Tag" --tag "${Image}:${Tag}" --output "type=docker,dest=$Tar" .
if ($LASTEXITCODE -ne 0) { throw 'docker buildx build failed' }

if (Test-Path $OutGz) { Remove-Item $OutGz -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$in = [System.IO.File]::OpenRead((Resolve-Path $Tar))
$outFs = [System.IO.File]::Create((Join-Path (Get-Location) $OutGz))
$gz = New-Object System.IO.Compression.GZipStream($outFs, [System.IO.Compression.CompressionLevel]::Optimal)
try { $in.CopyTo($gz) } finally { $gz.Dispose(); $outFs.Dispose(); $in.Dispose() }
Remove-Item $Tar -Force

Write-Host ">> Done: $(Resolve-Path $OutGz)"
Write-Host "   Upload this file in HCUweb -> Plugins -> Install from file."
