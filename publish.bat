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
echo === 変更内容 ===
git add -A
if errorlevel 1 goto :error
git status --short

git diff --cached --quiet
if not errorlevel 1 (
  echo.
  echo 変更はありません。公開の必要はありません。
  pause
  exit /b 0
)

echo.
set "MSG="
set /p "MSG=コミットメッセージ ^(空欄なら「アプリ一覧を更新」^): "
if "%MSG%"=="" set "MSG=アプリ一覧を更新"

git commit -m "%MSG%"
if errorlevel 1 goto :error
git push
if errorlevel 1 goto :error

echo.
echo プッシュしました。GitHub Actions のデプロイ完了まで 1 分ほど待ってください。
echo https://bluemistel.github.io/BlueMistAppSite/
echo.
pause
exit /b 0

:error
echo.
echo *** エラーが発生しました ***
pause
exit /b 1
