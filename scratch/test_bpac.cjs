const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, '../code_sandbox_light_git_fe61910d_1781185357');
const bpaAuditCore = require(path.join(basePath, 'js/bpa-audit-core.js'));

// Test parsing BPA-C line
const lineBpaC = '02' + '2460106' + '202606' + '225250' + '001' + '01' + '0301010072' + '030' + '000120' + 'BPA';
const text = '01#BPA#2026060000010000011234\r\n' + lineBpaC + '\r\n';

const parsed = bpaAuditCore.parse(text);
console.log('Parsed record count:', parsed.records.length);
console.log('Record 0:', parsed.records[0]);
