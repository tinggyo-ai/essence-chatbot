'use strict';
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const psTmp = path.join(os.tmpdir(), 'essence_create_icon.ps1');

// Make-RRP 헬퍼 함수 없이, Draw-Icon 내부에 경로 생성을 직접 인라인
const psScript = `
Add-Type -AssemblyName System.Drawing

function Make-Path([System.Drawing.Graphics]$g, [float]$x,[float]$y,[float]$w,[float]$h,[float]$r,[System.Drawing.Brush]$br) {
    $d  = [float]($r * 2.0)
    $pt = New-Object System.Drawing.Drawing2D.GraphicsPath
    $pt.AddArc([System.Drawing.RectangleF]::new($x,       $y,       $d,$d), [float]180, [float]90)
    $pt.AddArc([System.Drawing.RectangleF]::new($x+$w-$d, $y,       $d,$d), [float]270, [float]90)
    $pt.AddArc([System.Drawing.RectangleF]::new($x+$w-$d, $y+$h-$d, $d,$d), [float]0,  [float]90)
    $pt.AddArc([System.Drawing.RectangleF]::new($x,       $y+$h-$d, $d,$d), [float]90,  [float]90)
    $pt.CloseFigure()
    $g.FillPath($br, $pt)
    $pt.Dispose()
}

function Draw-Icon([int]$sz,[string]$out,[bool]$isOn) {
    [float]$S = [float]$sz
    $bmp = New-Object System.Drawing.Bitmap($sz,$sz,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $cBg1 = [System.Drawing.Color]::FromArgb(255, 26, 16, 64)
    $cBg2 = [System.Drawing.Color]::FromArgb(255, 61, 40,117)
    $cEy1 = [System.Drawing.Color]::FromArgb(255,167,139,250)
    $cEy2 = [System.Drawing.Color]::FromArgb(255,109, 40,217)
    $cAnt = [System.Drawing.Color]::FromArgb(255,139, 92,246)
    $cAn2 = [System.Drawing.Color]::FromArgb(255,221,214,254)
    $cSml = [System.Drawing.Color]::FromArgb(255,124, 58,237)
    $cWht = [System.Drawing.Color]::White
    $cOn  = [System.Drawing.Color]::FromArgb(255, 16,185,129)

    # ── 1. 배경: 딥 퍼플 그라디언트 ──────────────────────────────────
    $bgBr = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0,0)),
        (New-Object System.Drawing.Point([int]$S,[int]$S)),
        $cBg1,$cBg2)
    Make-Path $g 0 0 $S $S ([float]($S*0.21)) $bgBr
    $bgBr.Dispose()

    # ── 2. 안테나 줄기 ──────────────────────────────────────────────
    $aPen = New-Object System.Drawing.Pen($cAnt,[float]($S*0.017))
    $aPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $aPen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($aPen,[float]($S*0.5),[float]($S*0.272),[float]($S*0.5),[float]($S*0.200))
    $aPen.Dispose()

    # ── 3. 안테나 구슬 ──────────────────────────────────────────────
    $oR=[float]($S*0.055); $oX=[float]($S*0.5); $oY=[float]($S*0.155)
    $br=New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(50,139,92,246))
    $g.FillEllipse($br,[float]($oX-$oR*1.7),[float]($oY-$oR*1.7),[float]($oR*3.4),[float]($oR*3.4))
    $br.Dispose()
    $br=New-Object System.Drawing.SolidBrush($cAnt)
    $g.FillEllipse($br,[float]($oX-$oR),[float]($oY-$oR),[float]($oR*2),[float]($oR*2))
    $br.Dispose()
    $br=New-Object System.Drawing.SolidBrush($cAn2)
    $g.FillEllipse($br,[float]($oX-$oR*0.48),[float]($oY-$oR*0.48),[float]($oR*0.96),[float]($oR*0.96))
    $br.Dispose()
    $br=New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(190,255,255,255))
    $g.FillEllipse($br,[float]($oX-$oR*0.62),[float]($oY-$oR*0.62),[float]($oR*0.45),[float]($oR*0.45))
    $br.Dispose()

    # ── 4. 말풍선 몸통 ──────────────────────────────────────────────
    $wBr = New-Object System.Drawing.SolidBrush($cWht)
    Make-Path $g ([float]($S*0.19)) ([float]($S*0.27)) ([float]($S*0.62)) ([float]($S*0.47)) ([float]($S*0.11)) $wBr
    $wBr.Dispose()

    # ── 5. 말풍선 꼬리 ──────────────────────────────────────────────
    $tp = New-Object 'System.Drawing.PointF[]' 3
    $tp[0] = [System.Drawing.PointF]::new([float]($S*0.29),[float]($S*0.740))
    $tp[1] = [System.Drawing.PointF]::new([float]($S*0.20),[float]($S*0.875))
    $tp[2] = [System.Drawing.PointF]::new([float]($S*0.41),[float]($S*0.740))
    $br = New-Object System.Drawing.SolidBrush($cWht)
    $g.FillPolygon($br,$tp)
    $br.Dispose()

    # ── 6. 왼쪽 눈 ──────────────────────────────────────────────────
    $eY=[float]($S*0.395); $eH=[float]($S*0.09); $eRx=[float]($eH*0.5)
    $lx=[float]($S*0.275); $lw=[float]($S*0.17)
    $lEb = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point([int]$lx,[int]$eY)),
        (New-Object System.Drawing.Point([int]($lx+$lw),[int]($eY+$eH))),
        $cEy1,$cEy2)
    Make-Path $g $lx $eY $lw $eH $eRx $lEb
    $lEb.Dispose()
    $shR=[float]($eH*0.22)
    $br=New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(145,255,255,255))
    $g.FillEllipse($br,[float]($lx+$lw*0.17-$shR),[float]($eY+$eH*0.18-$shR*0.6),[float]($shR*2),[float]($shR*1.2))
    $br.Dispose()

    # ── 7. 오른쪽 눈 ────────────────────────────────────────────────
    $rx=[float]($S*0.555); $rw=[float]($S*0.17)
    $rEb = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point([int]$rx,[int]$eY)),
        (New-Object System.Drawing.Point([int]($rx+$rw),[int]($eY+$eH))),
        $cEy1,$cEy2)
    Make-Path $g $rx $eY $rw $eH $eRx $rEb
    $rEb.Dispose()
    $br=New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(145,255,255,255))
    $g.FillEllipse($br,[float]($rx+$rw*0.17-$shR),[float]($eY+$eH*0.18-$shR*0.6),[float]($shR*2),[float]($shR*1.2))
    $br.Dispose()

    # ── 8. 미소 (큐빅 베지어) ────────────────────────────────────────
    $sP = New-Object System.Drawing.Pen($cSml,[float]($S*0.019))
    $sP.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $sP.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawBezier($sP,
        [System.Drawing.PointF]::new([float]($S*0.345),[float]($S*0.597)),
        [System.Drawing.PointF]::new([float]($S*0.388),[float]($S*0.685)),
        [System.Drawing.PointF]::new([float]($S*0.612),[float]($S*0.685)),
        [System.Drawing.PointF]::new([float]($S*0.655),[float]($S*0.597)))
    $sP.Dispose()

    # ── 9. EssenceOn "ON" 뱃지 ──────────────────────────────────────
    if ($isOn) {
        $bx=[float]($S*0.607); $by=[float]($S*0.058)
        $bw=[float]($S*0.275); $bh=[float]($S*0.107)
        $bBr = New-Object System.Drawing.SolidBrush($cOn)
        Make-Path $g $bx $by $bw $bh ([float]($bh*0.5)) $bBr
        $bBr.Dispose()
        if ($sz -ge 48) {
            $fSz = [float]($S*0.071)
            $ft  = New-Object System.Drawing.Font('Segoe UI',$fSz,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
            $sf  = New-Object System.Drawing.StringFormat
            $sf.Alignment     = [System.Drawing.StringAlignment]::Center
            $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
            $br  = New-Object System.Drawing.SolidBrush($cWht)
            $g.DrawString('ON',$ft,$br,
                [System.Drawing.RectangleF]::new([float]$bx,[float]$by,[float]$bw,[float]$bh),$sf)
            $ft.Dispose(); $sf.Dispose(); $br.Dispose()
        }
    }

    $bmp.Save($out,[System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}

Draw-Icon 256 "$env:TEMP\\essence_256.png" $false
Draw-Icon  48 "$env:TEMP\\essence_48.png"  $false
Draw-Icon  32 "$env:TEMP\\essence_32.png"  $false
Draw-Icon  16 "$env:TEMP\\essence_16.png"  $false
Write-Output "done"
`;

// UTF-8 with BOM (PowerShell 5.1이 확실하게 인식)
const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
fs.writeFileSync(psTmp, Buffer.concat([bom, Buffer.from(psScript, 'utf8')]));

try {
  const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psTmp}" 2>&1`, { stdio: 'pipe' });
  const txt = out.toString().trim();
  if (txt && txt !== 'done') console.log('[PS]', txt);
} catch (e) {
  const err = (e.stderr?.toString() || '') + (e.stdout?.toString() || '');
  console.error('PowerShell 실패:\n', err || e.message);
  process.exit(1);
}

const sizes = [256, 48, 32, 16];
const pngs  = sizes.map(s => fs.readFileSync(path.join(os.tmpdir(), `essence_${s}.png`)));

const COUNT  = sizes.length;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(COUNT, 4);

let dataOffset = 6 + COUNT * 16;
const entries  = [];
for (let i = 0; i < COUNT; i++) {
  const e  = Buffer.alloc(16);
  const sz = sizes[i];
  e[0] = sz === 256 ? 0 : sz;
  e[1] = sz === 256 ? 0 : sz;
  e[2] = 0; e[3] = 0;
  e.writeUInt16LE(1,  4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(dataOffset, 12);
  dataOffset += pngs[i].length;
  entries.push(e);
}

const ico = Buffer.concat([header, ...entries, ...pngs]);
fs.writeFileSync(path.join(__dirname, 'icon.ico'), ico);
fs.copyFileSync(path.join(os.tmpdir(), 'essence_32.png'), path.join(__dirname, 'icon.png'));

[psTmp, ...sizes.map(s => path.join(os.tmpdir(), `essence_${s}.png`))].forEach(f => {
  try { fs.unlinkSync(f); } catch {}
});

console.log('Essence 아이콘 생성 완료 ->', path.join(__dirname, 'icon.ico'));
