const path = require('path');
let i18n = {};
const languages = ['en', 'es', 'fr']; // Add more language codes if needed

languages.forEach(language => {
  try {
    const languagePath = path.join(__dirname, `oasis_${language}.js`);
    const languageData = require(languagePath);
    i18n[language] = languageData[language];
  } catch (error) {
    console.error(`Failed to load language file for ${language}:`, error);
  }
});

module.exports = i18n;
