const crypto = require('crypto');

const cap = crypto.randomBytes(32).toString('base64');
console.log('New SHS cap:', cap);
