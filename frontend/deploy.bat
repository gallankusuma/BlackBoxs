@echo off
REM ============================================
REM  GENJAYA EPC - Deploy Script
REM  3-Tier: Local Git → GitHub → VPS Production
REM ============================================

set VPS_HOST=root@76.13.22.155
set VPS_PATH=/var/www/erp-genjaya/frontend
set PROJECT_DIR=c:\xampp1\htdocs\ERP-Genjaya\frontend

echo.
echo =============================================
echo   GENJAYA EPC - Deployment Pipeline
echo =============================================
echo.

REM Step 1: Build
echo [1/4] Building production bundle...
cd /d %PROJECT_DIR%
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed! Aborting deployment.
    pause
    exit /b 1
)
echo      ✅ Build successful!
echo.

REM Step 2: Git commit (local backup)
echo [2/4] Creating local git backup...
git add -A
git commit -m "deploy: %date% %time%"
echo      ✅ Local git commit created!
echo.

REM Step 3: Push to GitHub (if remote exists)
echo [3/4] Syncing to GitHub...
git push origin main 2>nul
if errorlevel 1 (
    echo      ⚠️  GitHub push skipped (no remote or auth issue)
) else (
    echo      ✅ GitHub sync complete!
)
echo.

REM Step 4: Deploy to VPS
echo [4/4] Deploying to VPS production...
scp -r %PROJECT_DIR%\dist\* %VPS_HOST%:%VPS_PATH%/
if errorlevel 1 (
    echo ERROR: VPS deployment failed!
    pause
    exit /b 1
)
echo      ✅ VPS deployment complete!
echo.

echo =============================================
echo   🎉 ALL DONE! app.genjaya.com is LIVE
echo =============================================
echo.
pause
