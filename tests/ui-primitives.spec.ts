import assert from 'node:assert/strict';
import {inspectUiHygiene} from './ui-hygiene.spec';
import {startUiRuntime,UI_CONTEXT} from './ui-runtime';
const runtime=await startUiRuntime();
try{
 const context=await runtime.browser.newContext({...UI_CONTEXT,colorScheme:'dark'});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.setDefaultTimeout(10000);
 await page.route(/\/src\/main\.tsx(?:\?.*)?$/,route=>route.fulfill({contentType:'application/javascript',body:"import {mountUiPrimitiveFixture} from '/src/test/ui-primitives.tsx';mountUiPrimitiveFixture();"}));
 await page.addInitScript({content:'globalThis.__name = value => value;'});
 await page.goto(runtime.url);await page.getByRole('heading',{level:1,name:'Компоненти'}).waitFor();
 await page.getByRole('button',{name:'Інформація: Пояснення'}).click();await page.getByRole('dialog',{name:'Пояснення'}).waitFor();await page.keyboard.press('Escape');
 const toggle=page.getByRole('switch',{name:'Мінімальний день'});await toggle.click();assert.equal(await toggle.getAttribute('aria-checked'),'true');
 await page.locator('input[type=date]').fill('2026-11-06');await page.locator('input[type=time]').fill('18:45');await page.getByRole('combobox',{name:'Напрям'}).selectOption('music');
 assert.match(await page.locator('.ui-native-field').nth(0).innerText(),/6 листопада/);assert.match(await page.locator('.ui-native-field').nth(1).innerText(),/18:45/);assert.match(await page.locator('.ui-native-field').nth(2).innerText(),/Творчість/);
 const energy=page.getByRole('slider',{name:'Енергія'});await energy.focus();await page.keyboard.press('ArrowRight');assert.equal(await energy.inputValue(),'6');
 await page.getByRole('button',{name:'Дії: Енергія'}).click();await page.getByRole('menuitem',{name:'Скинути'}).click();assert.equal(await page.locator('.ui-slider output').innerText(),'-');
 await page.getByRole('button',{name:'Тривалість 30 хв'}).click();await page.getByRole('button',{name:'Збільшити тривалість'}).click();assert.equal(await page.getByRole('dialog').locator('output').innerText(),'45 хв');await page.getByRole('button',{name:'Зберегти',exact:true}).click();assert.match(await page.locator('.ui-disclosure').first().innerText(),/45 хв/);
 await page.getByRole('button',{name:'Обрати режим'}).click();await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Показати завдання');await page.keyboard.press('Enter');assert.equal(await page.getByRole('button',{name:'Завдання',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Інформація: Пояснення'}).focus();await page.keyboard.press('Enter');await page.getByRole('dialog',{name:'Пояснення'}).waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Відкрити аркуш'}).click();await page.getByRole('dialog',{name:'Редагування'}).waitFor();await page.keyboard.press('Shift+Tab');assert.equal(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement)),true);await page.mouse.click(4,4);await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.setContent('<style>button{width:44px;height:44px}</style><a class="sr-only" style="position:absolute;width:1px;height:1px;clip-path:inset(50%)" href="#main">До вмісту</a><h1>Тест</h1><div data-ui="content-start"></div><p>2026-11-05 Europe/Kyiv Назва (0)</p><p>▶ ▼</p><input type="checkbox"><div style="width:500px">Вихід за край</div><div data-ui="group"><div data-ui="group">Вкладена група</div></div><p style="text-transform:uppercase">Заголовок</p><button style="width:20px;height:20px">x</button><p>'+ 'Довге пояснення '.repeat(12)+'</p>');
 await page.evaluate('globalThis.__name = value => value');const findings=await page.evaluate(inspectUiHygiene);const rules=new Set(findings.map(f=>f.rule));for(const rule of ['iso-date','timezone','zero-counter','text-triangle','native-control','right-edge','nested-group','uppercase','small-target','long-text'])assert.ok(rules.has(rule),`Hygiene failed to detect ${rule}`);
 assert.deepEqual(errors,[]);console.log('PASS WebKit 390×844: primitives, keyboard/pointer interactions and hygiene rule detection');await context.close();
}finally{await runtime.close();}
