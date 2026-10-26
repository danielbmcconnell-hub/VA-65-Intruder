'use strict';
const server=require('../assets/local-server.cjs');
module.exports=server;
if(require.main===module)server.start();
