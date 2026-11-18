// Separate dev entry. Only this tab redirects API calls to the disposable
// fixture; the ordinary app and its archive keep their normal API connection.
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import App from "../../src/pages/App";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { Route, Routes } from "react-router-dom";
import "../../src/index.css";

axios.interceptors.request.use(async config=>{const url=new URL(config.url,window.location.origin);if(url.pathname.startsWith("/api/"))config.url=`http://127.0.0.1:4017${url.pathname}${url.search}`;
  const delaySetting=new URLSearchParams(window.location.search).get("processingDelay");
  const delay=Math.min(30000,Math.max(0,Number(delaySetting)||0));
  if(config.method==="post"&&/\/api\/photos\/[^/]+\/process$/.test(url.pathname)){
    if(delaySetting==="manual")await new Promise(resolve=>window.addEventListener("fixture-finish-processing",resolve,{once:true}));
    else if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  }
  return config;});
createRoot(document.getElementById("root")).render(<><p style={{padding:"8px 20px",background:"#fff4db"}}>Учебная проверка: отдельные данные, распознавание заменено тестовым ответом. Рабочий архив не затрагивается.</p>{new URLSearchParams(window.location.search).get("processingDelay")==="manual"&&<button onClick={()=>window.dispatchEvent(new Event("fixture-finish-processing"))}>Завершить учебную обработку</button>}<MemoryRouter><AuthProvider><Routes><Route path="/" element={<App/>}/><Route path="/documents/:documentName" element={<App/>}/></Routes></AuthProvider></MemoryRouter></>);
