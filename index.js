const http = require('http');
const url  = require('url');
const net = require('net');


const TOTAL_BYTES = 38471;
const TOTAL_BITS = TOTAL_BYTES * 8;
const TOTAL_BODY_BYTES = 37257;
const TOTAL_HEADER_BYTES = TOTAL_BYTES - TOTAL_BODY_BYTES;

var ESTIMATED_TIME_MSEC = 50;// * 60 * 1000;
var ESTIMATED_TIME_SEC = ESTIMATED_TIME_MSEC / 1000;
const PROXY_BPMS = TOTAL_BITS / ESTIMATED_TIME_MSEC;
const PROXY_MSPB = ESTIMATED_TIME_MSEC / TOTAL_BITS;

const BYTE_MULTIPLIER = 40;

var DELAY_PER_BYTE = PROXY_MSPB * 8;
const pageCache = {};
var mutex = {"global":false};
var mutexQueue = {"global":[]};

// コマンドの引数によって変更する
var proxyTargetDomain = "abehiroshi.la.coocan.jp";
if(process.argv.length >= 3) {
    proxyTargetDomain = process.argv[2];
}

console.info('[Proxy] proxy target domain is: ' + proxyTargetDomain);
console.info('[Proxy] ESTIMATED_TIME_MSEC set: ' + ESTIMATED_TIME_MSEC);
console.info('[Proxy] DELAY_PER_BYTE set: ' + DELAY_PER_BYTE);
console.info('[Proxy] Proxy virtual bps is about: ' + Math.round((TOTAL_BYTES * 41 * 8) / ESTIMATED_TIME_SEC) + ' bits/sec');

/**
 * sleep sec
 * @param {Integer} second 
 * @returns 
 */
const sleep = (second) => sleepMsec(second * 1000);

/**
 * sleep msec
 * @param {Integer} msec 
 * @returns 
 */
const sleepMsec = (msec) => new Promise(resolve => setTimeout(resolve, msec));


/**
 * wait mutex release
 */
const mutexAwait = async (key="global") => {
    const id = Math.random();
    mutexQueue[key].push(id);
    console.debug(`[mutexQueue]: ${mutexQueue}`);
    while(mutex && mutexQueue[key][0] !== id) {
        await sleep(0.1);
    }
    mutexQueue[key].shift();
    mutex[key] = true;
}

/**
 * relearse mutex
 */
const mutexRelease = (key="global") => mutex[key] = false;


/**
 * write buffer into socket slowly
 * @param {net.Socket} socket socket to write
 * @param {Buffer} buffer buffer to write into socket
 * @param {function} isSessionEnded check whe
 */ 
const writeSocketSlowly = async (socket, buffer, isSessionEnded) => {
    // console.log("start writeSocketSlowly");
    let i = 0;
    while(buffer.length > i) {
        //console.debug(`socket write: ${buffer.slice(i, i + BYTE_MULTIPLIER)}`);
        await sleepMsec(DELAY_PER_BYTE);
        if(isSessionEnded()) {
            console.info('[Proxy] session aborted');
            break;
        }
        socket.write(buffer.slice(i, i + BYTE_MULTIPLIER));
        i += BYTE_MULTIPLIER;
    }
    // TOTAL_BYTES += buffer.length;
    // console.debug(`TOTAL_BYTES: ${TOTAL_BYTES}`);
}
    

// http proxy server
const proxy = http.createServer(async (req, res) => {

    // Mutex待ち
    await mutexAwait();

    const serverUrl = url.parse(req.url);
    
    console.log('[http://' + serverUrl.hostname + "] http proxy request received");
    const resSocket = res.socket;
    
    // キャッシュがあればそれを返す
    if(pageCache[serverUrl.href]) {
        console.log('[http://' + serverUrl.hostname + '] cache hit');
        await writeSocketSlowly(resSocket, pageCache[serverUrl.href], () => req.socket.destroyed);
        resSocket.end();
        mutexRelease();
        return;
    }

    // TCPでサーバに接続
    const proxySocket = net.connect(80, serverUrl.host, async () => {
        
        console.log('[http://' + serverUrl.hostname + "] proxy conn established");
        let reqSocketStat = false;
        const isReqSocketEnd = () => reqSocketStat;
        req.socket.on('end', () => req.socket.destroyed);

        // proxy -> client
        // proxySocket.pipe(req.socket);
        // req.socket.pipe(proxySocket);
        console.log('[http://' + serverUrl.hostname + "] writing http request header");
        // HPからのレスポンスをawaitで待つ
        const chunks = await new Promise((resolve, reject) => {
            const chunks = []
            proxySocket.on('data', (chunk) => chunks.push(Uint8Array.from(chunk)));
            proxySocket.on('end', () => resolve(chunks));
            proxySocket.on('error', reject);
        });
        console.log("[http://" + serverUrl.hostname + "] data arrived: " + chunks.length + "bytes");

        const buffer = Buffer.concat(chunks);
        pageCache[serverUrl.href] = buffer;
        
        console.log('[http://' + serverUrl.hostname + "] " + buffer.toString());

        // レスポンスボディの先頭にあるヘッダーとボディを分離する
        const rawResponseArray = Uint8Array.from(buffer);

        // HTTPヘッダとボディの境目であるCRLFCRLFを一文字ずつ探す
        let lastCharIsCR = false;
        let lastCharIsLF = false;
        let lastCharIsCRLF = false;
        let lastCharIsCRLFCRLF = false;

        let delimiterCount = 0;        
        rawResponseArray.forEach((c) => {
            
            // CRLFCRLFが見つかったら以後のループ全てreturn
            if (lastCharIsCRLFCRLF) {
                return;
            }

            // CRLFCRLFが見つかるまでの文字数をカウント
            delimiterCount++;

            // CRが見つかった場合
            if (c === 0x0d) {
                // CRの前がCRLFならCRLFCRが見つかったとして、フラグを立てる
                if (lastCharIsLF) {
                    lastCharIsCRLF = true;
                    return;
                }
                // CRLFでなければCRが見つかったとして、フラグを立てる
                lastCharIsCR = true;
                return;
            }

            // CRの後にLFが見つかった場合
            if (c === 0x0a && lastCharIsCR) {
                // LFの前がCRLFCRならCRLFCRLFが見つかったとして、フラグを立てる
                if(lastCharIsCRLF) {
                    lastCharIsCRLFCRLF = true;
                    return;
                }
                // CRLFでなければCRLFが見つかったとして、フラグを立てる
                lastCharIsLF = true;
                return;
            }

            // マッチしなかった場合はフラグをリセット
            lastCharIsCR = false;
            lastCharIsLF = false;
            lastCharIsCRLF = false;
        });

        // ヘッダーを取得
        const abeSiteResponseHead = buffer.toString('latin1').split('\r\n\r\n')[0];

        // ヘッダーを転送
        const headers = {};
        let resCode = 500;
        abeSiteResponseHead.split('\r\n').forEach((line) => {
            // レスポンスコードの行は無視
            if(line.match(/HTTP\/1\.[01] [0-9]{3} .+/)) {
                resCode = line.split(' ')[1];
                return;
            }
            // 空白行は無視
            if(line === '') {
                return;
            }
            // エンコードがshift
            headers[line.split(': ')[0]] = line.split(': ')[1];
        });

        // console.debug(headers);
        console.log('[http://' + serverUrl.hostname + "] writing http response header");
        
        // HTTPレスポンスヘッダ1行目を一文字ずつ転送
        await writeSocketSlowly(resSocket, Buffer.from(`HTTP/1.1 ${resCode} ${headers['Server']}\r\n`), isReqSocketEnd);
        
        // HTTPレスポンスヘッダ2行目以降を一文字ずつ転送
        for (const h in headers) {
            await writeSocketSlowly(resSocket, Buffer.from(`${h}: ${headers[h]}\r\n`), isReqSocketEnd);
        }

        // ヘッダーとボディの境目のCRLFを一文字ずつ転送
        await writeSocketSlowly(resSocket, Buffer.from('\r\n'), isReqSocketEnd);

        // ヘッダーの後ろにあるボディを取得
        const responseBody = buffer.slice(delimiterCount);
        // console.debug(responseBody);
        // console.debug(responseBody.length);
        
        
        // レスポンスボディを一文字ずつ転送
        console.log('[http://' + serverUrl.hostname + "] writing http response body");
        await writeSocketSlowly(resSocket, responseBody, isReqSocketEnd);
        resSocket.end();

        // Mutex解除
        mutexRelease();
        
        // エラーハンドリング
    }).on('error', (err) => {
        console.debug(err);
        mutexRelease();
        // res.end();
        
        // タイムアウトハンドリング
    }).on('timeout', (err) => {
        console.debug(err);
        mutexRelease();
        // res.end();
    });

    // client -> proxy
    // HTTPリクエストの送信
    proxySocket.write(`${req.method} ${serverUrl.path} HTTP/${req.httpVersion}\r\n`);
    console.log(`${req.method} ${serverUrl.path} HTTP/${req.httpVersion}\r\n`);
    for (const h in req.headers) {
        // キャッシュ系のヘッダーは無視
        if(h.startsWith('If-Modified-Since')) {
            continue;
        }
        if(h.startsWith('If-None-Match')) {
            continue;
        }
        if(h.startsWith('Chache-Control')) {
            proxySocket.write(`${h}: ${req.headers[h]}`)
        }
        proxySocket.write(`${h}: ${req.headers[h]}\r\n`);
    }
    proxySocket.write('\r\n');
});


// HTTPS proxy server
proxy.on('connect', async (cliReq, cliSoc, cliHead) => {
    const x = url.parse('https://' + cliReq.url);
    let svrSoc;

    console.log("[https://" + x.hostname + "] proxy request received");

    if(x.hostname.match(/cdn|ajax|static|font|img/)) {
        console.log("content not cached!");
        const proxySocket = net.connect(443, x.hostname, () => {
            cliSoc.pipe(proxySocket);
        })
        proxySocket.pipe(cliSoc);
        return;
    }
    
    // 読み込みチャンクのキュー
    let chunks = [];

    // 非同期読み込みのロック
    let cliSocLock = false;
    
    // TCP確立まで行う
    svrSoc = net.connect(x.port || 443, x.hostname, function onSvrConn() {
        console.log("[https://" + x.hostname + "] proxy conn established");
        cliSoc.write('HTTP/1.0 200 Connection established\r\n\r\n');
        if (cliHead && cliHead.length) svrSoc.write(cliHead);
        cliSoc.pipe(svrSoc);

    // データがサーバーから来た時、チャンクをキューに追加
    }).on("data", async (chunk) => {
        console.log("[https://" + x.hostname + "] data arrived: " + chunk.length + "bytes");
        chunks.push(chunk);
        if(!cliSocLock) {
            console.log("[https://" + x.hostname + "] writer started");
            cliSocLock = true;
            while(chunks.length >= 1) {
                let c = chunks.shift();
                console.log("[https://" + x.hostname + "] start writing, queue remain: " + chunks.length);
                await writeSocketSlowly(cliSoc, c, _ => _);
            }
            console.log("[https://" + x.hostname + "] done writing")
            cliSocLock = false
        }
    }).on("end", async () => {
        while(!cliSocLock) {}
        console.log("[" + x.hostname + "] server socket closed");
        cliSoc.end();
    });
    //svrSoc.pipe(cliSoc);

    // サーバ側エラーハンドル
    svrSoc.on('error', err => {
        console.log("[" + x.hostname + "] error code" + err.code);
        chunks = [];
    });
    
    // クライアント側エラーハンドル
    cliSoc.on('error', err => {
        chunks = [];
        console.log("[" + x.hostname + "] error code" + err.code);
    });
})


// pacファイル配信用サーバ
const pacServer = http.createServer(async (req, res) => {

    // delayパラメータ
    if(req.url.startsWith("/delay/")) {
        // req.urlから/delay/:numberの:number部分を取り出す
        DELAY_PER_BYTE = Number(req.url.split('/delay/')[1]);
        res.writeHead(200, {});
        res.end(`changing DELAY_PER_BYTE is succeed`);
        console.info('[Proxy] DELAY_PER_BYTE set: ' + DELAY_PER_BYTE);
        return;
    }

    // 設定ファイルの場所
    if(req.url === "/abe.pac") {
        res.writeHead(200, {
            'Content-Type': 'application/x-ns-proxy-autoconfig',
            "Content-Disposition": "attachment;filename=\"abe.pac\""
        });
        res.end(`
            function FindProxyForURL(url, host)
            {
                if (dnsDomainIs(host, "` + proxyTargetDomain + `")){
                    return "PROXY localhost:3003";
                } else {
                    return "DIRECT";
                }
            }
        `);
        return;
    }
});


// サーバの起動
proxy.listen(3003);
pacServer.listen(3002);