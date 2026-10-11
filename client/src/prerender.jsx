import React from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import AppShell from "./AppShell";

export function renderPage(pathname) {
  return renderToString(
    <React.StrictMode><StaticRouter location={pathname}><AppShell /></StaticRouter></React.StrictMode>
  );
}
