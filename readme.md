# 阿部寛のHP逆RTA専用プロキシ（兼 ナローネットワークシミュレータ）

簡単に言うとWebページを一文字ずつ送信する超低速プロキシです。

言語はNodejs、Windows/Linuxで動作を確認しています。

NodejsのTCPライブラリを利用しているので実際にTCPパケットに一文字ずつ載せて送れるかは実装依存になります。

# 機能

## あまりにも低速な回線のエミュレート

普通のプロキシでは超低速な回線速度を設定するとタイムアウトしてしまいます。

これはTCPレベルで3 Way Handshakeが失敗しサーバーとの接続が確立できないためです。

しかしブラウザの開発者ツールで同じくらいの回線速度制限をかけた場合はタイムアウトしません。

ブラウザはサーバーとの接続を確立させた後、TCPより上位のレベルで速度を制限するためです。

このプロキシもTCPより上のレベルで読み込み遅延を行うためタイムアウトを起こしません。

## 任意のサイトのプロキシ

コマンドの引数に任意のサイトのドメインを渡すことでそのサイトのみ低速に設定出来ます。

## シングルスレッド動作

ブラウザは少しでも早くページを読み込もうとリソースを並列に読み込みますが、このプロキシは排他制御によってリソースの転送が終了するまで他のデータの転送をブロックします。

少しでも多くのリソースを転送し時間を稼ぎます。

## サーバサイドのコネクション切断防止

クラウドサービス上に展開されたサービスでは、何時間もコネクションを貼っていると勝手にタイムアウトで切断されることがあります。

このプロキシはリクエストが発火した時点で全てをダウンロードしバッファに保存、その後指定された速度でデータを転送します。

# 阿部寛のHP逆RTAを走るにあたって考えていること

## 録画容量の話

長時間走ろうとした場合、どうしても録画データの保存先に困ります。

以前試しに3日走ったときは録画データが200GBになりました。

## ネットワークの話

ネットワーク断が発生するとコネクションリセットが起きてすべてがパアになります。

このプロキシは予め全てをダウンロードする設計にしてあるため問題ありません。

## ハードの話

RTA中に電源が落ちても全てがパアです。

自宅で安定稼働できるか不安だったのでクラウド上のWindows ServerにOBSとプロキシを入れて録画しようと最初は考えていましたが、OBSがWindows Serverに対応しておらず動作しませんでした。

自分はメインPCしか持っていないため、お金が出来たら逆RTA専用サブPCを購入してもいいかなと考えています。

## 回線速度計算の話

いままでの走者はTCPレベルかそれ以下で回線速度を制限するという手法を取ってきました。

ではIPレベルの速度制限での限界は何bpsになるのでしょうか？

例えば1bpsの速度制限プロキシを利用するとすべての通信がタイムアウトします。

なので速度制限の限界はTCPがタイムアウトしないギリギリだと仮定し、実際に計算してみましょう。

TCPのタイムアウト時間は21秒、TCPの最小セグメントサイズは IPヘッダ20Byte + TCPヘッダ20Byte = 40Byte になります。

40Byteのパケットを送信に必要な速度は、40Byte * 8 / 21sec = 320bit / 21sec ≒ 15.24bps です。

つまり、理論上は15.24bpsの回線速度を下回らなければタイムアウトは起こりません。

阿部寛のホームページ 逆RTAで6時間超えを果たした[先駆者様](https://www.nicovideo.jp/watch/sm38823476)では16bpsの通信回線を利用していましたが、実はこれがほぼ理論値だったと考えられます。

ちなみに[Squidはダウンロードのみの帯域制限しかできないらしい](https://sfujiwara.hatenablog.com/entry/20081020/1224477996)ので往路も制限する場合は倍の回線速度が必要になります。

余談ですがEthernetフレームの最小サイズは64Byteと定義されているためEthernetレベルでのシミュレーションでは64Byte * 8 / 21sec = 512bit / 21sec ≒ 24.38bps（往路も制限するなら倍）の回線速度が必要です。

# 初期設定

デフォルトは「Wikipedia」のみプロキシさせる設定にしてあります。

# 起動方法

```bash
npm i
npm run start <阿部寛のHPのドメイン>
```

Windowsの設定→ネットワークとインターネット→プロキシ→セットアップスクリプトを使う→オンにしてスクリプトアドレスを`http://localhost:3002/abe.pac`に設定

以上でプロキシの設定は完了です

Googleで「阿部寛のホームページ」と検索してみましょう

# 参考情報

## 阿部寛のホームページ計測ツール

阿部寛のホームページがどれくらいの時間で開けるのか計測するための拡張機能です。

https://github.com/aaaa777/abehp-rta-tool

## データ

阿部寛のHP全体のリソースサイズ: 37,354Byte
