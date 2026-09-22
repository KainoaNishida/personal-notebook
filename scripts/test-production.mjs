import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5175','--strictPort'],{stdio:'pipe',windowsHide:true});
let browser;
try {
  let ready=false;
  for(let i=0;i<80;i++) {if(server.exitCode!==null) throw new Error('Production preview server exited');try{ready=(await fetch('http://127.0.0.1:5175')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}
  assert(ready,'Production preview did not start');
  browser=await chromium.launch();
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:5175');
  await page.getByRole('heading',{name:'Welcome back.'}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Make room for curiosity.'}).count(),0);
  await page.evaluate(()=>localStorage.setItem('commonplace:preview:v1','[]'));
  await page.goto('http://127.0.0.1:5175/papers');
  await page.getByRole('heading',{name:'Welcome back.'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Add a paper'}).count(),0);
  console.log('PASS production build keeps the authentication/setup gate even with preview storage and a deep link');
} finally {await browser?.close();server.kill();}
