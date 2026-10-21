(function(){
  'use strict';

  const layout=document.querySelector('.layout');
  if(!layout)return;
  const groups={
    'Fleet & inspection status':'overview',
    'Management action register':'follow-ups',
    'Action history':'follow-ups',
    'Parts requests':'follow-ups',
    'Inspection records':'inspections',
    'Management review':'inspections',
    'Crane assignment':'assignments',
    'Active assignments':'assignments',
    'User account administration':'administration',
    'Administrator data cleanup':'administration',
    'Fleet administration':'administration'
  };
  const tabs=[
    ['overview','Overview'],
    ['follow-ups','Follow-ups'],
    ['inspections','Inspections'],
    ['assignments','Assignments'],
    ['administration','Administration']
  ];
  const navigation=document.createElement('nav');
  navigation.className='dashboard-tabs';
  navigation.setAttribute('aria-label','Executive dashboard sections');
  const buttons=new Map();
  for(const [key,label] of tabs){
    const button=document.createElement('button');
    button.type='button';
    button.textContent=label;
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>selectTab(key));
    navigation.append(button);
    buttons.set(key,button);
  }
  layout.parentNode.insertBefore(navigation,layout);
  const columns=Array.from(layout.children);
  const cards=Array.from(layout.querySelectorAll('.card'));
  for(const card of cards){
    const title=card.querySelector('h2')?.textContent.trim();
    card.dataset.dashboardTab=groups[title]||'overview';
  }

  function selectTab(selected){
    for(const [key,button] of buttons)button.setAttribute('aria-pressed',String(key===selected));
    for(const card of cards)card.hidden=card.dataset.dashboardTab!==selected;
    for(const column of columns)column.hidden=!Array.from(column.children).some(card=>!card.hidden);
    layout.classList.toggle('single-column',columns.filter(column=>!column.hidden).length===1);
  }

  for(const [key,button] of buttons){
    button.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const keys=Array.from(buttons.keys());
      const current=keys.indexOf(key);
      const next=event.key==='Home'?0:event.key==='End'?keys.length-1:(current+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length;
      buttons.get(keys[next]).focus();
      buttons.get(keys[next]).click();
    });
  }
  selectTab('overview');

  const style=document.createElement('style');
  style.textContent='.dashboard-tabs{display:flex;gap:7px;overflow-x:auto;margin:14px 0 0;padding-bottom:2px}.dashboard-tabs button{flex:0 0 auto;padding:10px 14px;border:1px solid var(--line);border-radius:9px 9px 0 0;background:var(--card);color:var(--ink);font:inherit;font-weight:700;cursor:pointer}.dashboard-tabs button[aria-pressed="true"]{background:var(--steel);border-color:var(--steel);color:#fff}.layout.single-column{grid-template-columns:minmax(0,1fr)}.layout>div[hidden],.layout .card[hidden]{display:none!important}';
  document.head.append(style);
})();
