const fs = require('fs');

let c1 = fs.readFileSync('src/test/lib/subscription.staff-unlimited.test.ts', 'utf8');
c1 = c1.replace(/2024-02-01T00:00:00\.000Z/g, '2030-01-01T00:00:00.000Z');
c1 = c1.replace(/2025-01-01T00:00:00\.000Z/g, '2030-01-01T00:00:00.000Z');
fs.writeFileSync('src/test/lib/subscription.staff-unlimited.test.ts', c1);

let c2 = fs.readFileSync('src/test/lib/rate-limiting.test.ts', 'utf8');
c2 = c2.replace(/2025-01-01T00:00:00\.000Z/g, '2030-01-01T00:00:00.000Z');
fs.writeFileSync('src/test/lib/rate-limiting.test.ts', c2);

console.log("Done");