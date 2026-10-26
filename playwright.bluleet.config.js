import config from './playwright.config.js';
export default {...config,use:{...config.use,channel:'msedge'}};
