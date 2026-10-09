const path = require('path');
const i18n = {};
const languages = ['en', 'es', 'ca', 'gl', 'fr', 'eu', 'de', 'it', 'pt', 'zh', 'ar', 'hi', 'ru'];

languages.forEach(language => {
  Object.defineProperty(i18n, language, {
    enumerable: true,
    configurable: true,
    get() {
      let languageData;
      try {
        languageData = require(path.join(__dirname, `oasis_${language}.js`))[language];
      } catch (error) {
        console.error(`Failed to load language file for ${language}:`, error);
      }
      Object.defineProperty(i18n, language, { value: languageData, enumerable: true, configurable: true, writable: true });
      return languageData;
    }
  });
});

module.exports = i18n;
