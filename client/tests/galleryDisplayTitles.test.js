import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

test("the actual archive Gallery preserves numbered titles from metadata", async () => {
  const vite = await createServer({ configFile:false, plugins:[react()],
    server:{middlewareMode:true}, appType:"custom" });
  try {
    const {default:Gallery} = await vite.ssrLoadModule("/src/components/Gallery.jsx");
    const photos = ["Квитанция","Квитанция (2)","Квитанция (3)"].map((displayTitle,i)=>({
      name:`synthetic-${i}.png`, status:"processed", title:"Квитанция", displayTitle,
      cleanText:"Учебный текст", summary:"Учебная запись", tags:[]
    }));
    const html=renderToStaticMarkup(createElement(Gallery,{photos}));
    const headings=Array.from(html.matchAll(/<h4[^>]*>(.*?)<\/h4>/g),match=>match[1]);
    assert.deepEqual(headings,["Квитанция","Квитанция (2)","Квитанция (3)"]);
    const fallback=renderToStaticMarkup(createElement(Gallery,{photos:[{...photos[0],displayTitle:undefined}]}));
    assert.match(fallback,/<h4[^>]*>Квитанция<\/h4>/);
  } finally { await vite.close(); }
});
