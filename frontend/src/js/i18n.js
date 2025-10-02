// js/i18n.js

import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
// START-AUTOGEN-IMPORTS
import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import it from '../locales/it.json';
import ja from '../locales/ja.json';
import ms from '../locales/ms.json';
import pt from '../locales/pt.json';
import sw from '../locales/sw.json';
import zh from '../locales/zh.json';
// END-AUTOGEN-IMPORTS

i18next
    .use(LanguageDetector)
    .init({
        debug: import.meta.env?.DEV === true,
        fallbackLng: 'en',
        resources: {
// START-AUTOGEN-RESOURCES
            en: {
                translation: en,
            },
            es: {
                translation: es,
            },
            fr: {
                translation: fr,
            },
            it: {
                translation: it,
            },
            ja: {
                translation: ja,
            },
            ms: {
                translation: ms,
            },
            pt: {
                translation: pt,
            },
            sw: {
                translation: sw,
            },
            zh: {
                translation: zh,
            },
// END-AUTOGEN-RESOURCES
        },
    });

export default i18next;