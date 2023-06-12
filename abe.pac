function FindProxyForURL(url, host)
{
    if (dnsDomainIs(host, "abehiroshi.la.coocan.jp"))
        return "PROXY 127.0.0.1:3003";
    else
        return "DIRECT";
}