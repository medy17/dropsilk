const i18next = {
    t: (key, options) => {
        if (options) {
            // Simple interpolation for tests
            return `${key} ${JSON.stringify(options)}`;
        }
        return key;
    },
    init: () => Promise.resolve(),
    changeLanguage: jest.fn(),
    on: jest.fn(),
    language: 'en',
};

module.exports = i18next;