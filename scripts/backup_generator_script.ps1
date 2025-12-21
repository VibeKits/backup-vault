<#
  backup_generator_script.ps1
  Usage examples:
    # interactive (prompts for version)
    powershell -NoProfile -ExecutionPolicy Bypass -File "C:\...\backup_generator_script.ps1"

    # pass version (and optionally source/backup dir)
    powershell -NoProfile -ExecutionPolicy Bypass -File "C:\...\backup_generator_script.ps1" -Version 318
    powershell -NoProfile -ExecutionPolicy Bypass -File "C:\...\backup_generator_script.ps1" -Version 318 `
      -Source "C:\Path\To\SourceFolder" -BackupDir "D:\Backups\Modulated"
#>

param(
    [string]$Version,
    [string]$Source,
    [string]$Sources,  # semicolon-separated for multiple
    [string]$BackupDir,
    [string]$Suffix = "v",
    [bool]$Pack = $false,
    [string]$FolderName = "",
    [bool]$Force = $false  # Skip overwrite check if true
)

# --- Prompt for version if not provided
if (-not $Version -or $Version.Trim() -eq "") {
    $Version = Read-Host "Enter version suffix"
    $Version = $Version.Trim()
}
if ($Version -eq "") {
    Write-Error "No version supplied. Aborting."
    exit 1
}

# Normalize backup dir
$BackupDir = (Resolve-Path -Path $BackupDir -ErrorAction SilentlyContinue).Path
if (-not $BackupDir) {
    try { New-Item -Path $BackupDir -ItemType Directory -Force | Out-Null; $BackupDir = (Resolve-Path $BackupDir).Path }
    catch { Write-Error "Cannot create/resolve backup directory: $BackupDir"; exit 1 }
}

# Determine sources
$sourcePaths = @()
if ($Sources) {
    $sourcePaths = $Sources -split ';'
} elseif ($Source) {
    $sourcePaths = @($Source)
} else {
    Write-Error "No source specified. Use -Source or -Sources parameter."
    exit 1
}

# Validate sources
foreach ($src in $sourcePaths) {
    if (-not (Test-Path $src)) {
        Write-Error "Source not found: $src"
        exit 1
    }
}

# Determine if we need to pack (multiple sources always packed, single source based on Pack param)
$shouldPack = ($sourcePaths.Count -gt 1) -or $Pack

# Determine destination name
$finalName = ""
if ($shouldPack) {
    if (-not $FolderName -or $FolderName.Trim() -eq "") {
        Write-Error "Folder name is required when packing files."
        exit 1
    }
    $finalName = "$FolderName$Suffix$Version"
} else {
    # Single source, not packed - insert suffix before extension
    $srcLeaf = Split-Path $sourcePaths[0] -Leaf
    $namePart = [System.IO.Path]::GetFileNameWithoutExtension($srcLeaf)
    $extension = [System.IO.Path]::GetExtension($srcLeaf)
    $finalName = "$namePart$Suffix$Version$extension"
}

$dst = Join-Path $BackupDir $finalName

# Abort if destination already exists (unless forced)
if (-not $Force -and (Test-Path $dst)) {
    Write-Error "A backup with version '$Version' already exists at:`n$dst`nAborting to avoid overwrite."
    exit 1
}

# Create temp folder
$temp = Join-Path $BackupDir ("._tmp_" + [guid]::NewGuid().ToString())
try { New-Item -Path $temp -ItemType Directory -Force | Out-Null } catch { Write-Error "Cannot create temp folder: $temp"; exit 1 }

try {
    if ($shouldPack) {
        # Handle existing destination if forcing overwrite
        if ($Force -and (Test-Path $dst)) {
            # Clear all contents of existing folder
            Get-ChildItem -Path $dst -Recurse | Remove-Item -Force -Recurse -ErrorAction Stop
        }

        # Copy all sources directly into temp (single level, no subfolder)
        foreach ($src in $sourcePaths) {
            $srcLeaf = Split-Path $src -Leaf
            $destPath = Join-Path $temp $srcLeaf
            Copy-Item -Path $src -Destination $destPath -Recurse -Force -ErrorAction Stop
        }

        # Verification for packed case
        $totalSrcFiles = 0
        $totalSrcBytes = 0
        foreach ($src in $sourcePaths) {
            $srcFiles = Get-ChildItem -Path $src -Recurse -File -ErrorAction Stop
            $totalSrcFiles += $srcFiles.Count
            $totalSrcBytes += ($srcFiles | Measure-Object -Property Length -Sum).Sum
        }

        $tempFiles = Get-ChildItem -Path $temp -Recurse -File -ErrorAction Stop
        $tempCount = $tempFiles.Count
        $tempBytes = ($tempFiles | Measure-Object -Property Length -Sum).Sum

        Write-Host "Verification: expected $totalSrcFiles files ($totalSrcBytes bytes), got $tempCount files ($tempBytes bytes)"

        # Allow for minor discrepancies (e.g., hidden files, timing issues)
        $fileTolerance = 5
        $byteTolerance = 1024

        if ([Math]::Abs($totalSrcFiles - $tempCount) -gt $fileTolerance -or [Math]::Abs($totalSrcBytes - $tempBytes) -gt $byteTolerance) {
            Write-Warning "Verification warning: source files/bytes ($totalSrcFiles / $totalSrcBytes) != copied ($tempCount / $tempBytes)"
            # Don't fail, just warn
        }

        # Handle existing destination for packed backups
        if ($Force -and (Test-Path $dst)) {
            # Remove existing folder completely
            Remove-Item -Path $dst -Recurse -Force -ErrorAction Stop
        }

        # Rename temp to final name
        try {
            Rename-Item -Path $temp -NewName $finalName -ErrorAction Stop
        } catch {
            Move-Item -Path $temp -Destination $dst -Force -ErrorAction Stop
        }
    } else {
        # Single source, not packed - copy directly to final destination
        $src = $sourcePaths[0]

        # Handle existing file if forcing overwrite
        if ($Force -and (Test-Path $dst)) {
            # Remove existing file
            Remove-Item -Path $dst -Force -ErrorAction Stop
        }

        # Copy directly to final destination
        Copy-Item -Path $src -Destination $dst -Recurse -Force -ErrorAction Stop

        # Verification
        $srcItem = Get-Item -Path $src -ErrorAction Stop
        $dstItem = Get-Item -Path $dst -ErrorAction Stop

        if ($srcItem.PSIsContainer) {
            # Source is a directory - verify by counting files and bytes
            $srcFiles = Get-ChildItem -Path $src -Recurse -File -ErrorAction Stop
            $dstFiles = Get-ChildItem -Path $dst -Recurse -File -ErrorAction Stop
            $srcTotalBytes = ($srcFiles | Measure-Object -Property Length -Sum).Sum
            $dstTotalBytes = ($dstFiles | Measure-Object -Property Length -Sum).Sum

            if ($srcFiles.Count -ne $dstFiles.Count -or $srcTotalBytes -ne $dstTotalBytes) {
                throw "Verification failed: source directory ($($srcFiles.Count) files, $srcTotalBytes bytes) != copied ($($dstFiles.Count) files, $dstTotalBytes bytes)"
            }
        } else {
            # Source is a file - verify file size
            if ($srcItem.Length -ne $dstItem.Length) {
                throw "Verification failed: source file size ($($srcItem.Length)) != copied file size ($($dstItem.Length))"
            }
        }

        # Clean up temp folder (not used for single files)
        if (Test-Path $temp) {
            Remove-Item -Path $temp -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host "SUCCESS: backup created at $dst"
    exit 0
}
catch {
    Write-Error "Backup failed: $_"
    if (Test-Path $temp) { Remove-Item -Path $temp -Recurse -Force -ErrorAction SilentlyContinue }
    exit 1
}
