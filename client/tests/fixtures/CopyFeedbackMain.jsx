import { createRoot } from "react-dom/client";
import { CopyAllButton } from "../../src/components/MultipageDocument";
import { useCopyFeedback } from "../../src/hooks/useCopyFeedback";
import "../../src/index.css";

export default function CopyFeedbackCheck(){
  const {copiedMap,copyText}=useCopyFeedback({durationMs:5000});
  return <main className="page" data-multipage-preview><p>Учебная проверка копирования</p><div style={{display:"flex",gap:24,padding:24}}>
    {[0,1].map(i=><CopyAllButton key={i} copied={Boolean(copiedMap.all)} onClick={()=>copyText("all","Учебный текст для проверки копирования.")}/>)}</div></main>;
}
createRoot(document.getElementById("root")).render(<CopyFeedbackCheck/>);
