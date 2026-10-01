# =====================================================================
# Genera PDFs profesionales a partir de los .md de docs/
# Plataforma de Desempeno - Diagnos S.A.
#
# Requisitos (instalar una sola vez):
#   winget install JohnMacFarlane.Pandoc
#   winget install wkhtmltopdf.wkhtmltopdf
#
# Uso:
#   PS> ./docs/build-pdf.ps1
#
# Salida:
#   docs/dist/AUDITORIA-v5.0.0.pdf
#   docs/dist/GUIA_USO-v5.0.0.pdf
#
# IMPORTANTE: este script se mantiene en ASCII puro a proposito. PowerShell
# 5.1 lee los .ps1 usando el codepage del sistema (cp1252 en Windows espanol)
# salvo que el archivo tenga BOM UTF-8. Los strings con acentos se leen
# desde docs/_template/docs-config.json (que SI se lee como UTF-8 explicito).
# =====================================================================

$ErrorActionPreference = "Stop"

# Forzar UTF-8 en la consola para que los acentos no salgan rotos en pantalla
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$DocsDir     = $ScriptDir
$TemplateDir = Join-Path $DocsDir "_template"
$OutDir      = Join-Path $DocsDir "dist"
$TmpDir      = Join-Path $DocsDir "_tmp"
$ConfigPath  = Join-Path $TemplateDir "docs-config.json"

# Verificar dependencias
foreach ($tool in @("pandoc", "wkhtmltopdf")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: '$tool' no esta en el PATH. Instalalo con winget:" -ForegroundColor Red
    if ($tool -eq "pandoc")      { Write-Host "  winget install JohnMacFarlane.Pandoc" -ForegroundColor Yellow }
    if ($tool -eq "wkhtmltopdf") { Write-Host "  winget install wkhtmltopdf.wkhtmltopdf" -ForegroundColor Yellow }
    exit 1
  }
}

if (-not (Test-Path $ConfigPath)) {
  Write-Host "ERROR: No encuentro $ConfigPath" -ForegroundColor Red
  exit 1
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null

# -----------------------------------------------------------------
# Leer la config (UTF-8 forzado) - aca viven los strings con acentos
# -----------------------------------------------------------------
$configJson = Get-Content -Path $ConfigPath -Raw -Encoding UTF8
$config     = $configJson | ConvertFrom-Json
$Docs       = $config.documents

# -----------------------------------------------------------------
# Leer el template del cover (UTF-8 forzado)
# -----------------------------------------------------------------
$CoverTemplate = Get-Content -Path (Join-Path $TemplateDir "cover.template.html") -Raw -Encoding UTF8

# UTF-8 sin BOM para los archivos intermedios
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# em-dash construido con [char] para no meter caracteres no-ASCII en el script
$emDash = [char]0x2014

foreach ($d in $Docs) {
  Write-Host ""
  Write-Host "==> Generando $($d.output)..." -ForegroundColor Cyan

  # 1) Render del cover con los datos del doc
  $cover = $CoverTemplate
  $cover = $cover.Replace('{{TITLE}}',    $d.title)
  $cover = $cover.Replace('{{DOC_TYPE}}', $d.docType)
  $cover = $cover.Replace('{{VERSION}}',  $d.version)
  $cover = $cover.Replace('{{DATE}}',     $d.dateText)
  $coverPath = Join-Path $TmpDir ("cover_" + [System.IO.Path]::GetFileNameWithoutExtension($d.source) + ".html")
  [System.IO.File]::WriteAllText($coverPath, $cover, $utf8NoBom)

  # 2) Paths absolutos
  $sourcePath = Join-Path $DocsDir $d.source
  $outputPath = Join-Path $OutDir  $d.output
  $cssPath    = Join-Path $TemplateDir "style.css"
  $headerPath = Join-Path $TemplateDir "header.html"
  $footerPath = Join-Path $TemplateDir "footer.html"

  # 3) Metadata YAML escrito como UTF-8 puro
  $metaTitle = "$($d.docType) $emDash $($d.title) $($d.version)"
  $metaYaml  = "---`r`ntitle: `"$metaTitle`"`r`nlang: es-AR`r`n---`r`n"
  $metaPath  = Join-Path $TmpDir ("meta_" + [System.IO.Path]::GetFileNameWithoutExtension($d.source) + ".yaml")
  [System.IO.File]::WriteAllText($metaPath, $metaYaml, $utf8NoBom)

  # 4) Build args para pandoc
  $pandocArgs = @(
    $sourcePath,
    "--pdf-engine=wkhtmltopdf",
    "--pdf-engine-opt=--enable-local-file-access",
    "--pdf-engine-opt=--encoding",
    "--pdf-engine-opt=utf-8",
    "--pdf-engine-opt=--header-html",
    "--pdf-engine-opt=$headerPath",
    "--pdf-engine-opt=--footer-html",
    "--pdf-engine-opt=$footerPath",
    "--pdf-engine-opt=--header-spacing",
    "--pdf-engine-opt=5",
    "--pdf-engine-opt=--footer-spacing",
    "--pdf-engine-opt=5",
    "--pdf-engine-opt=--margin-top",
    "--pdf-engine-opt=25mm",
    "--pdf-engine-opt=--margin-bottom",
    "--pdf-engine-opt=20mm",
    "--pdf-engine-opt=--margin-left",
    "--pdf-engine-opt=18mm",
    "--pdf-engine-opt=--margin-right",
    "--pdf-engine-opt=18mm",
    "--css=$cssPath",
    "--include-before-body=$coverPath",
    "--metadata-file=$metaPath",
    "--toc",
    "--toc-depth=2",
    "--standalone",
    "-o", $outputPath
  )

  & pandoc @pandocArgs

  if ($LASTEXITCODE -eq 0 -and (Test-Path $outputPath)) {
    $size = [math]::Round((Get-Item $outputPath).Length / 1KB, 1)
    Write-Host "    OK  $outputPath  ($size KB)" -ForegroundColor Green
  } else {
    Write-Host "    FAIL  $($d.output)" -ForegroundColor Red
  }
}

# Limpieza
try { Remove-Item -Recurse -Force $TmpDir -ErrorAction Stop } catch {}

Write-Host ""
Write-Host "PDFs generados en: $OutDir" -ForegroundColor Cyan
