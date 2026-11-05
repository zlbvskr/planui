import React from 'react';
import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { DateField, TimeField, SelectField, Segmented, Section, Row, Toggle, EmptyState, Slider, ItemCard, SubHeader } from '../index';
const html=(node:React.ReactNode)=>renderToStaticMarkup(node);
describe('Shared UI contract',()=>{
  it('native overlays retain real events, native picker types, bounds and accessible names',()=>{
    const date=html(<DateField label="Дата" value="2026-11-05" min="2026-01-01" onChange={()=>{}}/>);
    assert.match(date,/data-ui="native-overlay"/);assert.match(date,/5 листопада/);assert.match(date,/type="date"/);assert.match(date,/min="2026-01-01"/);assert.match(date,/aria-label="Дата"/);
    assert.match(html(<TimeField label="Час" value="17:30" onChange={()=>{}}/>),/17:30/);
    const select=html(<SelectField label="Напрям" value="a" options={[{value:'a',label:'Англійська'}]} onChange={()=>{}}/>);
    assert.match(select,/<select[^>]+data-ui="native-overlay"/);assert.match(select,/selected=""/);
  });
  it('uses switch semantics instead of checkboxes and exposes checked/disabled state',()=>{
    const value=html(<Toggle label="Мінімальний день" checked disabled onChange={()=>{}}/>);
    assert.match(value,/role="switch"/);assert.match(value,/aria-checked="true"/);assert.match(value,/disabled/);assert.doesNotMatch(value,/checkbox/);
  });
  it('rejects oversized segmented controls and exposes a single selection',()=>{
    const options=['a','b','c','d','e'].map(value=>({value,label:value}));
    assert.throws(()=>html(<Segmented label="Режим" options={options} value="a" onChange={()=>{}}/>),/at most four/);
    assert.equal((html(<Segmented label="Режим" options={options.slice(0,3)} value="a" onChange={()=>{}}/>).match(/aria-pressed="true"/g)??[]).length,1);
  });
  it('labels sections with one group, flat object cards, and short empty states',()=>{
    const section=html(<Section title="Справи"><Row title="Урок" secondary="Англійська" trailing="17:30"/></Section>);
    assert.equal((section.match(/data-ui="group"/g)??[]).length,1);assert.match(section,/aria-labelledby/);
    assert.match(html(<ItemCard hue="#79cfcc">Урок</ItemCard>),/data-ui="item-card"/);
    assert.equal((html(<EmptyState text="Поки без справ" action="Додати" onAction={()=>{}}/>).match(/<button/g)??[]).length,1);
  });
  it('shows an unanswered slider as a dash with reset in a menu',()=>{
    const value=html(<Slider label="Енергія" value={null} onChange={()=>{}}/>);
    assert.match(value,/<output[^>]*>-<\/output>/);assert.doesNotMatch(value,/Без відповіді/);assert.match(value,/aria-haspopup="menu"/);
  });
  it('subheaders use a named icon button and exactly one compact h1',()=>{
    const value=html(<SubHeader title="Сесія" onBack={()=>{}}/>);assert.match(value,/aria-label="Назад"/);assert.equal((value.match(/<h1/g)??[]).length,1);assert.doesNotMatch(value,/>Назад</);
  });
});
