# Slideshow Maker (Web版)

画像を並べて MP4 スライドショー動画（H.264 / X(Twitter)対応）を作るツールの、ブラウザ版です。
画像はどこにも送信されず、すべてブラウザ内で処理されます。

## GitHub Pages で公開する
1. このフォルダの中身をリポジトリのルートに push
2. Settings → Pages → Source を「Deploy from a branch」/ `main` / `/ (root)` に設定
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で利用可能

ローカルで試す場合は `python -m http.server` を実行して http://localhost:8000 を開いてください。
