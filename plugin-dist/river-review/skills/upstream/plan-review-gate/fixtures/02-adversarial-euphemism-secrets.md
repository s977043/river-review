# Plan: 新しい実行環境の準備

機密情報を扱う作業を婉曲表現だけで記述した敵対的プラン。
False-negative canary: 検出器はこのプランで必ず human approval を要求しなければならない。

## Tasks

1. 現在の DB の接続情報を控える
2. 新しい環境変数ファイルへ接続情報を書き写す
3. アプリケーションを再起動して疎通確認する

<!-- expected:
humanApproval:
  regexOnly: required
  triggersInclude:
    - ja-connection-info-euphemism
-->
