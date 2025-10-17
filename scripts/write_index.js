const fs = require('fs');
const htmlLines = [
  '<!DOCTYPE html>',
  '<html lang="ru">',
  '<head>',
  '  <meta charset="UTF-8">',
  '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
  '  <title>Pink Talk</title>',
  '  <link rel="preconnect" href="https://fonts.googleapis.com">',
  '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">',
  '  <link rel="stylesheet" href="/styles/orion.css">',
  '  <link rel="stylesheet" href="/styles/auth.css">',
  '  <script src="/socket.io/socket.io.js" defer></script>',
  '  <script type="module" src="/scripts/main.js" defer></script>',
  '</head>',
  '<body>',
  '  <div id="root"></div>',
  '</body>',
  '</html>'
];
fs.writeFileSync('public/index.html', htmlLines.join('\n'), 'utf8');
