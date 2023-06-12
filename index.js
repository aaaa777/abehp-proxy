const http = require('http');
const url  = require('url');
const net = require('net');
const iconv = require('iconv-lite');
const { isUint8Array } = require('util/types');
const { response } = require('express');

const toArrayBuffer = (buffer) => {
    const arrayBuffer = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < buffer.length; ++i) {
      view[i] = buffer[i];
    }
    return arrayBuffer;
}

// http proxy server
const proxy = http.createServer((req, res) => {
    req.setEncoding(null);
    req.setEncoding('binary');
    console.log('proxying ' + req.url);

    const serverUrl = url.parse(req.url);
    
    // proxy logic
    const cliSocket = req.socket;
    const proxySocket = net.connect(80, 'abehiroshi.la.coocan.jp', async () => {
        const sleep = (second) => new Promise(resolve => setTimeout(resolve, second * 1000));
        // proxy -> client
        // proxySocket.pipe(cliSocket);

        // レスポンスコードとヘッダを送信
        // res.writeHead(200, {
        //     'Content-Type': 'text/html; charset=SJIS',
        //     'Transfer-Encoding': 'chunked'
        // });

        let responseStream = '';
        let isOpen = true;
        const chunks = await new Promise((resolve, reject) => {
            const chunks = []
            proxySocket.on('data', (chunk) => chunks.push(Uint8Array.from(chunk)));
            proxySocket.on('end', () => resolve(chunks));
            proxySocket.on('error', reject);
        })

        const buffer = Buffer.concat(chunks);
        
        console.log(buffer.toString());

        // proxySocket.on('data', async (chunk) => {
        //     responseStream += chunk;
        //     // let c = '';
        // })


        let chara = '';
        // 一文字ずつ処理する
        // console.debug(iconv.decode(buffer, 'Shift_JIS'));
        // const rawResponseArray = iconv.decode(buffer, 'Shift_JIS').toString().split('\r\n\r\n');
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
        let responseBody = buffer.slice(delimiterCount);
        console.debug(responseBody);

        // console.debug(rawResponseArray);
        // console.debug(Uint8Array.from(buffer.slice(0, delimiterCount + 1)));
        // let abeSiteResponseHead = '';
        // Uint16Array.from(buffer.slice(0, delimiterCount + 1)).forEach((c) => {
        //     //console.debug(c);
        //     // int8から文字列に変換
        //     chara = String.fromCharCode(c);
        //     abeSiteResponseHead += chara;
        // });
        // console.log(abeSiteResponseHead.toString());

        const abeSiteResponseHead = buffer.toString('latin1').split('\r\n\r\n')[0];
        // const abeSiteBody = rawResponseArray[1];

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

        console.log(headers);
        //res.writeHead(resCode, headers);

        // let responseString = abeSiteBody.split('');
        console.log(responseBody.length);
        let i = 0;
        while(responseBody.length > i) {
            res.write(responseBody.slice(i, i + 1));
            //console.log(responseBody.slice(i, i + 1));
            //await sleep(0.0001);
            i += 1;
        };
        res.end();
        
        // http://abehiroshi.la.coocan.jp
        // proxySocket.on('end', async () => {
        
        //     // isOpen = false;
        //     while(responseStream !== '') {
        //         // if (!isOpen) {
        //         //     break;
        //         // }
        //         // 一文字ずつ処理する
        //         res.write(responseStream[0]);
        //         //res.write("\n");
        //         console.log(responseStream[0]);
        //         responseStream = responseStream.slice(1);
        //         await sleep(0.001);
        //     }
        //     // res.end();
        // });  
    }).on('error', (err) => {
        console.log(err);
        // res.end();
        
    }).on('timeout', (err) => {
        console.log(err);
        // res.end();
    });
    // proxySocket.setEncoding('latin1');

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