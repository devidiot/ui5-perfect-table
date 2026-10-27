const cds = require('@sap/cds');
const express = require('express');
const path = require('path');

// app/ 은 CAP 이 기본으로 정적 서빙한다. 라이브러리는 /lib 로 따로 연다.
cds.on('bootstrap', (app) => {
  app.use('/lib', express.static(path.join(__dirname, 'lib')));
});

module.exports = cds.server;
