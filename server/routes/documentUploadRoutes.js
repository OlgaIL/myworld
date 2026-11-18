import { Router } from "express";
import multer from "multer";
import { requireAuthenticatedUser } from "../middleware/requireAuthenticatedUser.js";
import { withAccountOperation } from "../services/accountOperationLocks.js";
import { beginDocumentUpload, getDocumentUpload, storeDocumentUploadItem, closeDocumentUpload } from "../services/documentUploadService.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } });
router.use("/api/document-uploads", (req,res,next) => { res.setHeader("Cache-Control","private, no-store"); next(); });
function handle(action) {
  return async (req,res) => {
    try { res.json(await action(req,res)); }
    catch(error) {
      const lock = ["55P03","40P01"].includes(error.code);
      const status = error.status || (error.code === "LIMIT_FILE_SIZE" ? 413 : error instanceof multer.MulterError ? 422 : lock ? 409 : 500);
      if(status===500) console.error("Document upload failed",{code:error.code||"DOCUMENT_UPLOAD_FAILED"});
      res.status(status).json({error:error.status?error.code:lock?"ACCOUNT_BUSY":status===413?"FILE_TOO_LARGE":status===422?"INVALID_UPLOAD_FILE":"DOCUMENT_UPLOAD_FAILED",
        ...(error.available !== undefined ? {available:error.available,selected:error.selected} : {})});
    }
  };
}
router.get("/api/document-uploads/:id",requireAuthenticatedUser,handle(req=>getDocumentUpload(req.user.id,req.params.id)));
const write = action => [requireAuthenticatedUser,withAccountOperation(handle(action),{exclusive:true})];
router.post("/api/document-uploads",...write(req=>beginDocumentUpload(req.user.id,req.body)));
router.put("/api/document-uploads/:id/items/:itemId",...write(async(req,res)=>{
  await new Promise((resolve,reject)=>upload.single("photo")(req,res,error=>error?reject(error):resolve()));
  return storeDocumentUploadItem(req.user.id,req.params.id,req.params.itemId,req.file);
}));
router.post("/api/document-uploads/:id/finish",...write(req=>closeDocumentUpload(req.user.id,req.params.id)));
router.post("/api/document-uploads/:id/cancel",...write(req=>closeDocumentUpload(req.user.id,req.params.id,true)));
export default router;
