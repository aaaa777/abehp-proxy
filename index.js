const http = require('http');
const url  = require('url');
const net = require('net');


const TOTAL_BYTES = 38471;
const TOTAL_BITS = TOTAL_BYTES * 8;
const TOTAL_BODY_BYTES = 37257;
const TOTAL_HEADER_BYTES = TOTAL_BYTES - TOTAL_BODY_BYTES;

var ESTIMATED_TIME_MSEC = 0.5 * 60 * 1000;
var ESTIMATED_TIME_SEC = ESTIMATED_TIME_MSEC / 1000;
const PROXY_BPMS = TOTAL_BITS / ESTIMATED_TIME_MSEC;
const PROXY_MSPB = ESTIMATED_TIME_MSEC / TOTAL_BITS;

var DELAY_PER_BYTE = PROXY_MSPB * 8;
var mutex = false;

console.info('[Proxy] ESTIMATED_TIME_MSEC set: ' + ESTIMATED_TIME_MSEC);
console.info('[Proxy] DELAY_PER_BYTE set: ' + DELAY_PER_BYTE);
console.info('[Proxy] Proxy virtual bps is about: ' + Math.round((TOTAL_BYTES * 41 * 8) / ESTIMATED_TIME_SEC) + ' bits/sec');


const sleep = (second) => sleepMsec(second * 1000);
const sleepMsec = (msec) => new Promise(resolve => setTimeout(resolve, msec));
const mutexAwait = async () => {
    while(mutex) {
        await sleep(0.1);
    }
    mutex = true;
}

const mutexRelease = () => mutex = false;


const writeSocketSlowly = async (socket, buffer, callback) => {
    let i = 0;
    while(buffer.length > i) {
        console.debug(`socket write: ${buffer.slice(i, i + 1)}`);
        await sleepMsec(DELAY_PER_BYTE);
        if(callback()) {
            console.info('[Proxy] session aborted');
            break;
        }
        socket.write(buffer.slice(i, i + 1));
        i++;
    }
    // TOTAL_BYTES += buffer.length;
    // console.debug(`TOTAL_BYTES: ${TOTAL_BYTES}`);
}
    

// http proxy server
const proxy = http.createServer(async (req, res) => {
    if(req.url === 'http://abehiroshi.la.coocan.jp/menu.htm')
        await sleep(2);
    // if(req.url === 'http://abehiroshi.la.coocan.jp/.htm')
    //     await sleep(1);
        
    await mutexAwait();

    console.info('[Proxy] proxying ' + req.url);

    const serverUrl = url.parse(req.url);
    const resSocket = res.socket;
    
    // proxy logic
    const proxySocket = net.connect(80, 'abehiroshi.la.coocan.jp', async () => {
        
        let reqSocketStat = false;
        const isReqSocketEnd = () => reqSocketStat;
        req.socket.on('end', () => reqSocketStat = true);

        // proxy -> client
        // proxySocket.pipe(cliSocket);

        // HPからのレスポンスをawaitで待つ
        const chunks = await new Promise((resolve, reject) => {
            const chunks = []
            proxySocket.on('data', (chunk) => chunks.push(Uint8Array.from(chunk)));
            proxySocket.on('end', () => resolve(chunks));
            proxySocket.on('error', reject);
        })

        const buffer = Buffer.concat(chunks);
        
        console.debug(buffer.toString());

        // レスポンスボディの先頭にあるヘッダーとボディを分離する
        // 一文字ずつ処理する
        const rawResponseArray = Uint8Array.from(buffer);
        let lastCharIsCR = false;
        let lastCharIsLF = false;
        let lastCharIsCRLF = false;
        let lastCharIsCRLFCRLF = false;

        let delimiterCount = 0;        
        rawResponseArray.forEach((c) => {
            if (lastCharIsCRLFCRLF) {
                return;
            }

            delimiterCount++;
            if (c === 0x0d) {
                if (lastCharIsLF) {
                    lastCharIsCRLF = true;
                    return;
                }
                lastCharIsCR = true;
                return;
            }
            if (c === 0x0a && lastCharIsCR) {
                if(lastCharIsCRLF) {
                    lastCharIsCRLFCRLF = true;
                    return;
                }
                lastCharIsLF = true;
                return;
            }
            lastCharIsCR = false;
            lastCharIsLF = false;
            lastCharIsCRLF = false;
        });

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

        console.debug(headers);
        
        await writeSocketSlowly(resSocket, Buffer.from(`HTTP/1.1 ${resCode} ${headers['Server']}\r\n`), isReqSocketEnd);
        for (const h in headers) {
            await writeSocketSlowly(resSocket, Buffer.from(`${h}: ${headers[h]}\r\n`), isReqSocketEnd);
        }
        await writeSocketSlowly(resSocket, Buffer.from('\r\n'), isReqSocketEnd);

        // ヘッダーの後ろにあるボディを取得
        const responseBody = buffer.slice(delimiterCount);
        console.debug(responseBody);
        console.debug(responseBody.length);
        
        // レスポンスボディを一文字ずつ転送
        await writeSocketSlowly(resSocket, responseBody, isReqSocketEnd);
        resSocket.end();

        mutexRelease();
        
        // http://abehiroshi.la.coocan.jp
    }).on('error', (err) => {
        console.debug(err);
        // res.end();
        
    }).on('timeout', (err) => {
        console.debug(err);
        // res.end();
    });

    // client -> proxy
    proxySocket.write(`${req.method} ${serverUrl.path} HTTP/${req.httpVersion}\r\n`);
    for (const h in req.headers) {
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

const pacServer = http.createServer((req, res) => {
    if(req.url.startsWith("/delay/")) {
        // req.urlから/delay/:numberの:number部分を取り出す
        DELAY_PER_BYTE = Number(req.url.split('/delay/')[1]);
        res.writeHead(200, {});
        res.end(`changing DELAY_PER_BYTE is succeed`);
        console.info('[Proxy] DELAY_PER_BYTE set: ' + DELAY_PER_BYTE);
        return;
    }

    if(req.url === "/abe.pac") {
        res.writeHead(200, {
            'Content-Type': 'application/x-ns-proxy-autoconfig',
            "Content-Disposition": "attachment;filename=\"abe.pac\""
        });
        res.end(`
            function FindProxyForURL(url, host)
            {
                if (dnsDomainIs(host, "abehiroshi.la.coocan.jp"))
                return "PROXY localhost:3003";
                else
                return "DIRECT";
            }
        `);
        return;
    }
});

proxy.listen(3003);
pacServer.listen(3002);