import { useEffect, useRef, useState } from "react";
import "./DocumentPageNavigation.css";

export default function DocumentPageNavigation({pages}) {
  const navigation=useRef(null),numbers=useRef(null);
  const [currentId,setCurrentId]=useState(pages[0]?.id);
  const current=Math.max(0,pages.findIndex(page=>page.id===currentId));
  useEffect(()=>{
    let frame;
    function update(){
      frame=undefined;
      if(!navigation.current)return;
      const threshold=navigation.current.getBoundingClientRect().bottom+18;
      let index=0;
      pages.forEach((page,i)=>{if(document.getElementById(page.id)?.getBoundingClientRect().top<=threshold)index=i;});
      if(window.scrollY>0&&window.scrollY+window.innerHeight>=document.documentElement.scrollHeight-2)index=pages.length-1;
      setCurrentId(pages[index]?.id);
    }
    function schedule(){if(frame===undefined)frame=requestAnimationFrame(update);}
    window.addEventListener("scroll",schedule,{passive:true});
    window.addEventListener("resize",schedule);
    const observer=new ResizeObserver(schedule);
    if(navigation.current)observer.observe(navigation.current);
    pages.forEach(page=>{const element=document.getElementById(page.id);if(element)observer.observe(element);});
    schedule();
    return()=>{cancelAnimationFrame(frame);window.removeEventListener("scroll",schedule);window.removeEventListener("resize",schedule);observer.disconnect();};
  },[pages]);
  useEffect(()=>{
    const list=numbers.current,button=list?.querySelector('[aria-current="page"]');
    if(!button||!list.clientWidth)return;
    list.scrollLeft=button.offsetLeft-(list.clientWidth-button.offsetWidth)/2;
  },[current]);
  function go(index){
    const page=pages[index],target=page&&document.getElementById(page.id);
    if(!target)return;
    setCurrentId(page.id);
    const style=getComputedStyle(navigation.current),stickyTop=parseFloat(style.top)||0;
    const obstruction=navigation.current.offsetHeight;
    const top=window.scrollY+target.getBoundingClientRect().top-obstruction-stickyTop-16;
    window.scrollTo({top:Math.max(0,top),behavior:"auto"});
  }
  if(pages.length<2)return null;
  return <nav className="document-navigation" aria-label="Страницы документа" ref={navigation}>
    <button className="document-navigation__arrow" disabled={!current} aria-label="Предыдущая страница" onClick={()=>go(current-1)}>←</button>
    <label className="document-navigation__select"><span><span>Страница {current+1} из {pages.length}</span><svg className="document-navigation__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>
      <select aria-label="Перейти к странице" value={pages[current].id} onChange={event=>go(pages.findIndex(page=>page.id===event.target.value))}>
        {pages.map((page,index)=><option key={page.id} value={page.id}>{index+1}. {page.title}</option>)}
      </select>
    </label>
    <div className="document-navigation__numbers" ref={numbers}>{pages.map((page,index)=><button key={page.id} aria-current={index===current?"page":undefined} aria-label={`Страница ${index+1}: ${page.title}`} title={page.title} onClick={()=>go(index)}>{index+1}</button>)}</div>
    <button className="document-navigation__arrow" disabled={current===pages.length-1} aria-label="Следующая страница" onClick={()=>go(current+1)}>→</button>
  </nav>;
}
