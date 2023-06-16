# 阿部寛のホームページ 逆RTA専用プロキシ

setumei WIP

# レギュレーション

[阿部寛のホームページ「逆」RTA - もっさんRTA等記録保管所](https://w.atwiki.jp/rsfrta/pages/72.html)より引用

- googleで阿部寛のホームページを検索し、検索結果のリンクにカーソルを合わせる
- 計測は30フレーム
- そのリンクをクリックし、ホームページの文字、画像がすべて表示されたフレームで終了
- 機材の制限は特になし

# 逆RTAの歴史

## 逆RTAの誕生 表示に4分半

偉大なる創始者。Chromeの開発者ツールを利用。

[阿部寛のホームページ「逆」RTA　4:29.25](https://www.youtube.com/watch?v=FKjBw_jEcZk)

## 開発者ツールの限界 超えた30分

開発者ツールを利用した記録としては最遅？

[阿部寛のホームページ逆RTA [世界最遅] 37分57秒32](https://www.youtube.com/watch?v=SGF2MPM-JQI)

## プロキシの使用 6時間の大幅更新

逆RTAにおいて初めてプロキシを利用。回線を8bpsに制限し大幅な記録更新。

レギュレーションのgoogleから移動していないため参考記録になるかも？

[阿部寛のホームページ 逆RTA 6:56:12](https://www.nicovideo.jp/watch/sm38823476)

# 技術仕様

これは阿部寛のホームページを一文字ずつ送信するプロキシです。

言語はNodejsを利用しており、Windows/Linuxで動作を確認しています。

NodejsのTCPライブラリを利用しているので実際にTCPパケットに一文字ずつ載せて送れるかは実装依存になります。

## タイムアウト防止策

従来のプロキシであまりに遅い回線速度を設定するとタイムアウトしてしまいます。

これはTCPレベルで3 Way Handshakeが失敗しサーバーとの接続が確立できないからです。

しかしブラウザで制限をかけた場合はタイムアウトしません。

なぜならブラウザはサーバーとの接続を確立させた後、TCPより上位のレベルで速度を制限するためです。

#### 細かい計算の話

IPレベルの速度制限を設定したとき、限界は何bpsになるのでしょうか

あまりに回線が遅いとTCPのハンドシェイクが失敗しコネクションを確立出来ないため、TCPセグメントがタイムアウトしないギリギリが速度制限の限界です。

実際に計算してみましょう。

TCPのタイムアウト時間は21秒、TCPの最小セグメントサイズは IPヘッダ20Byte + TCPヘッダ20Byte = 40Byte になります。

復路も考えて42秒で40Byteのパケットを送信に必要な速度は、40 * 8 / 42 = 320bit / 42sec ≒ 7.62bps です。

つまり、7.62bpsの回線速度を下回らなければタイムアウトは起こりません。

6時間超えを果たした[先駆者様](https://www.nicovideo.jp/watch/sm38823476)では8bpsの通信回線を利用していましたが、実はこれがほぼ理論値だったというわけです。

## 自動設定

プロキシ自動設定用の`abe.pac`は「阿部寛のホームページ」のみプロキシさせる設定にしてあります。

「阿部寛のホームページ」以外のGoogleやniconicoなどのサイトの速度には影響を与えません。

そのためレギュレーションで必須のGoogleも問題なく開くことが出来ます。

## 排他制御

排他制御を組み込むことでシングルスレッドのように動作します。

つまり、ブラウザが複数のTCPコネクションを確立して並列にダウンロードするのを妨げます。

## キャッシュ無効化

ヘッダを改変してキャッシュを無効にしています。

開発者ツール無しでいつでも最遅プロキシをお楽しみください。


# 起動方法

```bash
npm i
npm run start
```

Windowsの設定→ネットワークとインターネット→プロキシ→セットアップスクリプトを使う→オンにしてスクリプトアドレスを`http://localhost:3002/abe.pac`に設定

以上でプロキシの設定は完了です

Googleで「阿部寛のホームページ」と検索してみましょう

# See also

## 阿部寛のホームページ計測ツール

阿部寛のホームページがどれくらいの時間で開けるのか計測するための拡張機能です。

https://github.com/aaaa777/abehp-rta-tool

# note

阿部寛のHPのリソースサイズ

37,354Byte