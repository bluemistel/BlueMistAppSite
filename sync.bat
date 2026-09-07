@echo off
chcp 65001 > nul
setlocal
cd /d "%~dp0"

echo === GitHub からアプリ一覧を同期 ===
call npm run sync
if errorlevel 1 goto :error

echo.
echo === サイトをビルド ===
call npm run build
if errorlevel 1 goto :error

echo.
echo 完了しました。_site\index.html をブラウザで開くと確認できます。
echo 公開するには publish.bat を実行してください。
echo.
pause
exit /b 0

:error
echo.
echo *** エラーが発生しました ***
pause
exit /b 1
