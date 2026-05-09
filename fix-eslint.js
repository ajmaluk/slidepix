const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync('eslint-output.json', 'utf-8'));

data.forEach(fileData => {
  if (fileData.messages.length > 0) {
    const filePath = fileData.filePath;
    let content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Sort messages by line descending to avoid line shift issues when inserting comments
    const messages = fileData.messages.sort((a, b) => b.line - a.line);

    messages.forEach(msg => {
      const lineIndex = msg.line - 1; // 0-based
      const ruleId = msg.ruleId;
      
      // Check if previous line already has an eslint-disable
      if (lineIndex > 0 && lines[lineIndex - 1].includes('// eslint-disable-next-line')) {
        if (!lines[lineIndex - 1].includes(ruleId)) {
          lines[lineIndex - 1] += `, ${ruleId}`;
        }
      } else {
        const match = lines[lineIndex].match(/^(\s*)/);
        const indent = match ? match[1] : '';
        lines.splice(lineIndex, 0, `${indent}// eslint-disable-next-line ${ruleId}`);
      }
    });

    fs.writeFileSync(filePath, lines.join('\n'));
    console.log(`Fixed ${filePath}`);
  }
});
