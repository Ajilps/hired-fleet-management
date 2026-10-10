'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const swaggerDirectory = path.dirname(require.resolve('swagger-ui-dist/package.json'));
const docsDirectory = __dirname;
const port = Number(process.env.DOCS_PORT || 8080);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('DOCS_PORT must be an integer from 1 to 65535');
}

const routes = new Map([
  ['/', [path.join(docsDirectory, 'index.html'), 'text/html; charset=utf-8']],
  ['/index.html', [path.join(docsDirectory, 'index.html'), 'text/html; charset=utf-8']],
  ['/swagger-init.js', [path.join(docsDirectory, 'swagger-init.js'), 'text/javascript; charset=utf-8']],
  ['/docs.css', [path.join(docsDirectory, 'docs.css'), 'text/css; charset=utf-8']],
  ['/openapi.yaml', [path.join(docsDirectory, 'openapi.yaml'), 'application/yaml; charset=utf-8']],
  ['/swagger-ui.css', [path.join(swaggerDirectory, 'swagger-ui.css'), 'text/css; charset=utf-8']],
  ['/swagger-ui-bundle.js', [path.join(swaggerDirectory, 'swagger-ui-bundle.js'), 'text/javascript; charset=utf-8']]
]);

const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try {
    pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  } catch {
    response.writeHead(400).end('Invalid URL');
    return;
  }
  const entry = routes.get(pathname);
  if (!entry) {
    response.writeHead(404).end('Not found');
    return;
  }
  fs.readFile(entry[0], (error, content) => {
    if (error) {
      response.writeHead(500).end('Unable to load documentation asset');
      return;
    }
    response.writeHead(200, {
      'Content-Type': entry[1],
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': content.length
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`HireD Swagger UI: http://127.0.0.1:${port}`);
  console.log('Proposed API contracts only; this server does not implement business endpoints.');
});
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
