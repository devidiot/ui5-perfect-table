const cds = require('@sap/cds');
const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');

// S/4HANA 접속 정보: SAP_ENV_FILE 이 가리키는 파일 또는 프로젝트 .env (둘 다 gitignore 대상)
const ENV_FILE = process.env.SAP_ENV_FILE || path.join(__dirname, '.env');
if (fs.existsSync(ENV_FILE)) { process.loadEnvFile(ENV_FILE); }

/**
 * /sap/bc/lrep → S/4HANA LREP 프록시.
 * index-s4.html 의 LrepConnector 가 여기로 변형을 읽고 쓴다. 저장 위치는 S/4HANA 의 USER(개인)·PUBLIC(공유) 레이어다.
 * LREP 는 인증 없는 요청에 HTML 로그온 페이지(200)를 돌려주므로 브라우저 인증 창이 뜨지 않는다. 그래서 프록시가 Basic 인증을 붙인다.
 * 그 계정으로 저장되므로 이 서버에 붙는 요청은 이 PC(loopback)에서 온 것만 받는다.
 */
function lrepProxy() {
  const target = new URL(process.env.SAP_URL);
  const client = process.env.SAP_CLIENT;
  const auth = 'Basic ' + Buffer.from(`${process.env.SAP_USER}:${process.env.SAP_PASSWORD}`).toString('base64');
  const agent = target.protocol === 'https:'
    ? new https.Agent({ keepAlive: true, rejectUnauthorized: process.env.SAP_INSECURE !== 'true' })
    : new http.Agent({ keepAlive: true });
  const isLoopback = (a) => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';

  return (req, res) => {
    if (!isLoopback(req.socket.remoteAddress)) { res.status(403).end(); return; }
    const url = new URL(req.originalUrl, target);
    if (client && !url.searchParams.has('sap-client')) { url.searchParams.set('sap-client', client); }
    const headers = { ...req.headers, host: target.host, authorization: auth };
    delete headers.origin; delete headers.referer;
    const upstream = (target.protocol === 'https:' ? https : http).request(url, { method: req.method, headers, agent }, (r) => {
      // http://localhost 에서도 세션·CSRF 쿠키가 남도록 Secure·Domain·SameSite=None 을 뗀다
      const setCookie = (r.headers['set-cookie'] || []).map((c) => c
        .replace(/;\s*secure/gi, '').replace(/;\s*domain=[^;]*/gi, '').replace(/;\s*samesite=none/gi, '; SameSite=Lax'));
      res.writeHead(r.statusCode, { ...r.headers, 'set-cookie': setCookie });
      r.pipe(res);
    });
    upstream.on('error', (e) => { if (!res.headersSent) { res.status(502).send(String(e.message)); } });
    req.pipe(upstream);
  };
}

// app/ 은 CAP 이 기본으로 정적 서빙한다. 라이브러리는 /lib 로 따로 연다.
cds.on('bootstrap', (app) => {
  app.use('/lib', express.static(path.join(__dirname, 'lib')));
  if (process.env.SAP_URL && process.env.SAP_USER) {
    app.use('/sap/bc/lrep', lrepProxy());
    console.log(`[lrep] /sap/bc/lrep → ${new URL(process.env.SAP_URL).host} (client ${process.env.SAP_CLIENT || '-'})`);
  }
});

module.exports = cds.server;
