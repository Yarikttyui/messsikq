const fs = require('fs');
const path = 'public/scripts/core/app.js';
let text = fs.readFileSync(path, 'utf8');
text = text.replace(/throw new Error\(data\.message \|\| '[^']*'\);/, "throw new Error(data.message || '\\u041f\\u0440\\u043e\\u0438\\0437\\u043e\\0448\\u043b\\u0430 \\u043e\\u0448\\u0438\\0431\\043a\\u0430');");
const errorMessages = [
  "setFormMessage(error.message || '\\u041d\\u0435 \\u0443\\u0434\\0430\\043b\\043e\\0441\\044c \\u0432\\u043e\\0439\\0442\\0438');",
  "setFormMessage(error.message || '\\u041d\\u0435 \\u0443\\0434\\0430\\043b\\043e\\0441\\044c \\u0441\\u043e\\0437\\0434\\0430\\0442\\044c \\u0430\\u043a\\043a\\0430\\0443\\043d\\0442');"
];
let errorIndex = 0;
text = text.replace(/setFormMessage\(error\.message \|\| '[^']*'\);/g, () => errorMessages[errorIndex++] || errorMessages[errorMessages.length - 1]);
text = text.replace(/setFormMessage\('[^']*', false\);/, "setFormMessage('\\u0410\\u043a\\u043a\\u0430\\0443\\043d\\0442 \\u0441\\u043e\\0437\\0434\\0430\\043d! \\u0414\\u043e\\0431\\u0440\\043e \\u043f\\u043e\\0436\\u0430\\043b\\043e\\0432\\0430\\0442\\044c \\u2764', false);");
text = text.replace(/console\\.warn\(response\?\\.message \|\| '[^']*'\);/, "console.warn(response?.message || '\\u041d\\u0435 \\u0443\\0434\\0430\\043b\\043e\\0441\\044c \\u043e\\0442\\043f\\0440\\0430\\0432\\0438\\0442\\044c \\u0441\\u043e\\043e\\0431\\0449\\0435\\043d\\0438\\0435');");
fs.writeFileSync(path, text, 'utf8');
