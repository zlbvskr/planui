import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const out=process.env.AUDIT_DIR || '/tmp/planui-audit-before';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});
for(const route of ['today','calendar','directions','me','habits','records','life_areas','inspiration','wishlist','settings']) {
 await page.goto(`http://localhost:3000/planui/#/${route}`);
 await page.waitForTimeout(800);
 await page.screenshot({path:`${out}/${route}.png`,fullPage:true});
}
await browser.close();
