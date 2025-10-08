const fs = require('fs');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const ioPack = JSON.parse(fs.readFileSync('io-package.json', 'utf8'));

console.log('DEBUG package.json name =', pkg.name);
console.log('DEBUG io-package.json common.name =', ioPack.common.name);
