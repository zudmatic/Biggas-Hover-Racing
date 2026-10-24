import base from './playwright.config.js';
const port=process.env.TEST_PORT??'43183';
export default {...base,metadata:{production:true},testMatch:'production-dialkit.spec.js',
  use:{...base.use,baseURL:`http://127.0.0.1:${port}`},
  webServer:{command:`npm run preview -- --port ${port} --strictPort`,url:`http://127.0.0.1:${port}`,reuseExistingServer:false}};
