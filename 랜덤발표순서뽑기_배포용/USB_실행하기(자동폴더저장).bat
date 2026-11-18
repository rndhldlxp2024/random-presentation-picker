@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "뽑기 결과" mkdir "뽑기 결과"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$appDir = (Get-Location).Path; " ^
  "$resultDir = Join-Path $appDir '뽑기 결과'; " ^
  "$rosterPath = Join-Path $appDir 'roster_data.js'; " ^
  "if (!(Test-Path $resultDir)) { New-Item -ItemType Directory -Path $resultDir | Out-Null }; " ^
  "$port = Get-Random -Minimum 18000 -Maximum 28000; " ^
  "$listener = New-Object System.Net.HttpListener; " ^
  "$prefix = \"http://127.0.0.1:$port/\"; " ^
  "$listener.Prefixes.Add($prefix); " ^
  "$listener.Start(); " ^
  "Write-Host '=========================================================' -ForegroundColor Cyan; " ^
  "Write-Host ' [랜덤 발표 순서 뽑기] USB 포터블 자동저장 실행기' -ForegroundColor Yellow; " ^
  "Write-Host \" 이미지 자동 저장 폴더: $resultDir\" -ForegroundColor Green; " ^
  "Write-Host \" 명단 자동 보존 파일: $rosterPath\" -ForegroundColor Green; " ^
  "Write-Host ' (앱 사용을 마치면 이 검은색 창을 닫아주세요)' -ForegroundColor Gray; " ^
  "Write-Host '=========================================================' -ForegroundColor Cyan; " ^
  "Start-Process ($prefix + 'index.html'); " ^
  "while ($listener.IsListening) { " ^
  "  $ctx = $listener.GetContext(); " ^
  "  $req = $ctx.Request; " ^
  "  $res = $ctx.Response; " ^
  "  $path = $req.Url.LocalPath; " ^
  "  try { " ^
  "    if ($path -eq '/api/usb-status') { " ^
  "      if (!(Test-Path $resultDir)) { New-Item -ItemType Directory -Path $resultDir | Out-Null }; " ^
  "      $bytes = [System.Text.Encoding]::UTF8.GetBytes('{\"ok\":true}'); " ^
  "      $res.ContentType = 'application/json; charset=utf-8'; " ^
  "      $res.OutputStream.Write($bytes, 0, $bytes.Length); " ^
  "    } elseif ($path -eq '/api/save-image' -and $req.HttpMethod -eq 'POST') { " ^
  "      $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8); " ^
  "      $body = $reader.ReadToEnd() | ConvertFrom-Json; " ^
  "      $fname = [System.IO.Path]::GetFileName($body.filename); " ^
  "      $b64 = ($body.dataUrl -split ',', 2)[1]; " ^
  "      if (!(Test-Path $resultDir)) { New-Item -ItemType Directory -Path $resultDir | Out-Null }; " ^
  "      $savePath = Join-Path $resultDir $fname; " ^
  "      [System.IO.File]::WriteAllBytes($savePath, [System.Convert]::FromBase64String($b64)); " ^
  "      $bytes = [System.Text.Encoding]::UTF8.GetBytes('{\"ok\":true}'); " ^
  "      $res.ContentType = 'application/json; charset=utf-8'; " ^
  "      $res.OutputStream.Write($bytes, 0, $bytes.Length); " ^
  "    } elseif ($path -eq '/api/save-roster' -and $req.HttpMethod -eq 'POST') { " ^
  "      $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8); " ^
  "      $body = $reader.ReadToEnd() | ConvertFrom-Json; " ^
  "      if ($body.jsContent) { " ^
  "        [System.IO.File]::WriteAllText($rosterPath, $body.jsContent, [System.Text.Encoding]::UTF8); " ^
  "      } " ^
  "      $bytes = [System.Text.Encoding]::UTF8.GetBytes('{\"ok\":true}'); " ^
  "      $res.ContentType = 'application/json; charset=utf-8'; " ^
  "      $res.OutputStream.Write($bytes, 0, $bytes.Length); " ^
  "    } else { " ^
  "      $rel = if ($path -eq '/') { 'index.html' } else { $path.TrimStart('/') }; " ^
  "      $filePath = Join-Path $appDir $rel; " ^
  "      if (Test-Path $filePath -PathType Leaf) { " ^
  "        if ($filePath.EndsWith('.html')) { $res.ContentType = 'text/html; charset=utf-8' } " ^
  "        elseif ($filePath.EndsWith('.css')) { $res.ContentType = 'text/css; charset=utf-8' } " ^
  "        elseif ($filePath.EndsWith('.js')) { $res.ContentType = 'application/javascript; charset=utf-8' } " ^
  "        $fileBytes = [System.IO.File]::ReadAllBytes($filePath); " ^
  "        $res.OutputStream.Write($fileBytes, 0, $fileBytes.Length); " ^
  "      } else { $res.StatusCode = 404 } " ^
  "    } " ^
  "  } catch { $res.StatusCode = 500 } finally { $res.Close() } " ^
  "}"
