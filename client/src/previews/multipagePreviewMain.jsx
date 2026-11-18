import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import MultipagePreview from "./MultipagePreview.jsx";

createRoot(document.getElementById("root")).render(<BrowserRouter><MultipagePreview /></BrowserRouter>);
