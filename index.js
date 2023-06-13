const http = require('http');
const url  = require('url');
const net = require('net');

var ESTIMATED_TIME = 30 * 60;
const TOTAL_BYTES = 38471;
var PROXY_BPS = 1;
const TOTAL_BODY_BYTES = 37257;
const TOTAL_HEADER_BYTES = TOTAL_BYTES - TOTAL_BODY_BYTES;
const DELAY_PER_BYTE = 0;

var mutex = false;

const sleep = (second) => new Promise(resolve => setTimeout(resolve, second * 1000));
const mutexAwait = async () => {
    while(mutex) {
        await sleep(0.1);
    }
    mutex = true;
}

const mutexRelease = () => mutex = false;

const writeSocketSlowly = async (socket, buffer) => {
    let i = 0;
    while(buffer.length > i) {
        socket.write(buffer.slice(i, i + 1));
        await sleep(DELAY_PER_BYTE);
        i++;
    }
    // TOTAL_BYTES += buffer.length;
    // console.debug(`TOTAL_BYTES: ${TOTAL_BYTES}`);
}
    

// http proxy server
const proxy = http.createServer(async (req, res) => {

    await mutexAwait();

    console.log('proxying ' + req.url);

    const serverUrl = url.parse(req.url);
    const resSocket = res.socket;
    
    // proxy logic
    const proxySocket = net.connect(80, 'abehiroshi.la.coocan.jp', async () => {
        
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
        
        // res.writeHead(resCode, headers);
        // resSocket.write(`HTTP/1.1 ${resCode} ${headers['Server']}\r\n`);
        await writeSocketSlowly(resSocket, Buffer.from(`HTTP/1.1 ${resCode} ${headers['Server']}\r\n`));
        for (const h in headers) {
            // resSocket.write(`${h}: ${headers[h]}\r\n`);
            await writeSocketSlowly(resSocket, Buffer.from(`${h}: ${headers[h]}\r\n`));
        }
        await writeSocketSlowly(resSocket, Buffer.from('\r\n'));
        // resSocket.write('\r\n');

        // ヘッダーの後ろにあるボディを取得
        const responseBody = buffer.slice(delimiterCount);
        console.debug(responseBody);
        console.debug(responseBody.length);
        
        // レスポンスボディを一文字ずつ転送
        await writeSocketSlowly(resSocket, responseBody);
        // let i = 0;
        // while(responseBody.length > i) {
        //     resSocket.write(responseBody.slice(i, i + 1));
        //     // console.debug(responseBody.slice(i, i + 1));
        //     // await sleep(0.0001);
        //     i += 1;
        // };
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
        proxySocket.write(`${h}: ${req.headers[h]}\r\n`);
    }
    proxySocket.write('\r\n');
});

const pacServer = http.createServer((req, res) => {
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
});

proxy.listen(3003);
pacServer.listen(3002);