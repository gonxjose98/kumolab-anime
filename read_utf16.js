import fs from 'fs';
const content = fs.readFileSync('diagnostic_output.txt', 'utf16le');
console.log(content);
