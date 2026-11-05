import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','tests/vite.perf.config.ts'],{stdio:'inherit'});
if(build.status!==0)process.exit(build.status??1);
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const url=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','tests/vite.perf.config.ts','--port',String(port)],{stdio:'inherit'});
try {
  let ready=false;
  for(let i=0;i<100;i++){
    if(server.exitCode!==null)throw new Error('Fixture preview exited');
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  if(!ready)throw new Error('Fixture preview did not start');
  const test=spawn(process.execPath,['--import','tsx','tests/stage1.spec.ts'],{stdio:'inherit',env:{...process.env,UI_PERF_ONLY:'1',UI_FUNCTIONAL_ONLY:'',UI_PERF_URL:url,UI_TEST_PORT:'3054'}});
  process.exitCode=await new Promise(resolve=>test.on('exit',code=>resolve(code??1)));
}finally{server.kill();}
