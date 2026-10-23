# Workbench

[English](README.md) | [简体中文](README.zh-CN.md) | **日本語**

[![Release](https://img.shields.io/github/v/release/X33834/workbench?color=22d3ee&label=release)](https://github.com/X33834/workbench/releases/latest)
[![License](https://img.shields.io/github/license/X33834/workbench?color=34d399)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-0078d4)](docs/ARCHITECTURE.ja.md#システム要件)

![Workbench](docs/screenshots/12-brand-hero.png)

ローカルファーストのデスクトップ運用ワークベンチ。プロセス・ポート・開発サーバー・
プロジェクト・タスク・AI セッションコストを 1 画面で把握し、必要なときは高権限
操作（終了できないプロセスを管理者として終了）も行えます。データは端末内にのみ保存。

## スクリーンショット

| 概要 | プロセス |
|------|----------|
| ![概要](docs/screenshots/01-overview.png) | ![プロセス](docs/screenshots/02-processes.png) |
| CPU / メモリ傾向、ディスク、プロセス分類 | 全プロセス snapshot、仮想スクロール、強制終了の確認 |

| サーバー & ポート | AI セッション |
|-------------------|----------------|
| ![サーバー](docs/screenshots/03-servers.png) | ![AI セッション](docs/screenshots/04-ai-sessions.png) |
| netstat 解析、開発フレームワーク判定 | セッションファイル、オンラインセッション、ツール分布 |

| コスト台帳 | タスク |
|------------|--------|
| ![コスト](docs/screenshots/05-costs.png) | ![タスク](docs/screenshots/08-tasks.png) |
| 予算進捗、推移、モデル内訳 | ドラッグ＆ドロップのカンバン |

## 機能

| 機能 | 説明 |
|------|------|
| **リアルタイム監視** | プロセス・ポート（netstat）・開発サーバー検出、フレームワーク判定付き |
| **管理者として終了** | 通常終了が失敗したあとワンクリックで管理者終了——OS の UAC を提示。保護対象システムプロセスはバックエンドが事前拒否 |
| **AI セッションコスト計測** | ローカル Claude / Codex セッションのトークンコストを SQLite 台帳に記録——モデル不要・API キー不要・データは端末外に出ません |
| **価格エディタ** | 40+ モデルの価格を内蔵。UI から変更 / 追加 / 内蔵価格へ復元 |
| **バックアップ & 復元** | タイムスタンプ付きスナップショット、ワンクリック復元、整合性チェック |
| **ログイン時に起動** | 実際の OS 登録（レジストリ / autostart）。トグルは OS から状態を再読込 |
| **ビジュアルシステム** | 7 レイアウト × 8 テーマ × 3 シェル、ドラッグ / 非表示ウィジェット、テーマエディタと共有リンク |
| **三言語 UI** | 简体中文（既定）/ English / 日本語 |
| **クロスプラットフォーム** | Windows（NSIS インストーラー + ポータブル exe）と Linux（deb） |

## ダウンロード

**v0.2.0** —— プラットフォームに合わせて入手:

| プラットフォーム | ファイル |
|------------------|----------|
| Windows 10/11 x64 | `Workbench_0.2.0_x64-setup.exe`（NSIS、約 4 MB）またはポータブル `workbench.exe` |
| Linux | `workbench_0.2.0_amd64.deb` |

> コード署名されていないため、Windows SmartScreen が「不明な発行元」を表示する
> ことがあります。**詳細情報 → 実行** で問題ありません（証明書に費用がかかるためで、
> ファイルが危険なわけではありません）。

ミラーはいずれも同一コードで、それぞれ Release を公開しています:

| ミラー | Release ページ |
|--------|----------------|
| GitHub | [github.com/X33834/workbench/releases](https://github.com/X33834/workbench/releases) |
| Gitee | [gitee.com/badhope/workbench/releases](https://gitee.com/badhope/workbench/releases) |
| GitCode | [gitcode.com/badhope/workbench/releases](https://gitcode.com/badhope/workbench/releases) |

## ビルド

Node.js ≥ 20 と Rust ≥ 1.77 が必要です:

```bash
npm install
npm run tauri dev      # デスクトップ開発モード（ホットリロード付き）
npm run tauri build    # インストーラー → src-tauri/target/release/bundle/
```

技術スタック・プロジェクト構成・FAQ・ロードマップ・スクリーンショット一覧などは
[アーキテクチャ & リファレンス](docs/ARCHITECTURE.ja.md)
（[English](docs/ARCHITECTURE.md) / [简体中文](docs/ARCHITECTURE.zh-CN.md)）へ。

## コントリビュート & ライセンス

- 開発フロー: [CONTRIBUTING.md](CONTRIBUTING.md) · 脆弱性報告:
  [SECURITY.md](SECURITY.md) · 行動規範:
  [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) · 変更履歴:
  [CHANGELOG.md](CHANGELOG.md)
- [MIT](LICENSE) © 2026 x1882
